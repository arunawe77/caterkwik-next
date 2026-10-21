import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { form, jar, redirectedTo, requestHeaders, resetTestState } from "@/test/next-mocks";

vi.mock("next/headers", async () => (await import("@/test/next-mocks")).headersMock);
vi.mock("next/cache", async () => (await import("@/test/next-mocks")).cacheMock);

import { login, logout, register, requestPasswordReset, resetPassword } from "@/server/auth-actions";
import { digest, hashPassword, newToken, verifyPassword } from "@/server/crypto";
import { db } from "@/server/db";
import { outbox } from "@/server/mail";
import { currentUser, endSession, isAdmin, startSession } from "@/server/session";

let n = 0;
beforeEach(async () => {
  await resetTestState();
  outbox.length = 0;
  requestHeaders.set("x-forwarded-for", `10.0.${Math.floor(++n / 250)}.${n % 250}`); // a fresh visitor per test
});
afterAll(() => db.$disconnect());

const signUp = (over: Record<string, string> = {}) =>
  redirectedTo(() => register({}, form({ name: "Sam Chef", email: "Sam@Example.com", password: "correct horse battery", ...over })));

describe("passwords and tokens", () => {
  it("hashes with a salt and verifies only the right password", async () => {
    const a = await hashPassword("hunter2hunter2");
    const b = await hashPassword("hunter2hunter2");
    expect(a).not.toBe(b);
    expect(await verifyPassword("hunter2hunter2", a)).toBe(true);
    expect(await verifyPassword("hunter3hunter3", a)).toBe(false);
    expect(await verifyPassword("x", "malformed")).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
  });

  it("makes unguessable tokens and stores only their digest", () => {
    expect(newToken()).not.toBe(newToken());
    expect(newToken().length).toBeGreaterThanOrEqual(43);
    expect(digest("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(digest("abc")).toBe(digest("abc"));
  });
});

describe("register", () => {
  it("creates the account, signs them in and sends them to their account", async () => {
    expect(await signUp()).toBe("/account");
    const user = await db.user.findUniqueOrThrow({ where: { email: "sam@example.com" } });
    expect(user).toMatchObject({ name: "Sam Chef", role: "CUSTOMER" });
    expect(user.passwordHash).not.toContain("correct horse");
    expect((await currentUser())?.email).toBe("sam@example.com");
  });

  it("claims earlier guest orders placed with the same email", async () => {
    await db.order.create({
      data: { email: "sam@example.com", name: "Sam", phone: "1", addressLine1: "a", city: "c", postcode: "p", subtotalExPence: 100, totalIncPence: 120 },
    });
    await signUp();
    expect(await db.order.count({ where: { userId: { not: null } } })).toBe(1);
  });

  it("only follows a return path on this site", async () => {
    expect(await signUp({ next: "/basket" })).toBe("/basket");
    await resetTestState();
    expect(await signUp({ next: "//evil.example" })).toBe("/account");
  });

  it("rejects a bad form, a short password and a duplicate email", async () => {
    expect((await register({}, form({ name: "", email: "x", password: "y" }))).error).toBe("Name is required");
    expect((await register({}, form({ name: "S", email: "not-an-email", password: "long enough password" }))).error).toBe("Enter a valid email address");
    expect((await register({}, form({ name: "S", email: "s@example.com", password: "short" }))).error).toBe("Use at least 10 characters");
    await signUp();
    expect((await register({}, form({ name: "S", email: "sam@example.com", password: "another long password" }))).error).toContain("already exists");
  });

  it("limits sign-ups from one visitor", async () => {
    const attempt = () => register({}, form({ name: "", email: "", password: "" }));
    for (let i = 0; i < 5; i++) await attempt();
    expect((await attempt()).error).toBe("Too many attempts. Try again later.");
  });
});

describe("login and logout", () => {
  const credentials = { email: "sam@example.com", password: "correct horse battery" };

  it("signs in with the right password and lands customers on their account", async () => {
    await signUp();
    jar.clear();
    expect(await redirectedTo(() => login({}, form({ ...credentials, next: "/basket" })))).toBe("/basket");
    expect((await currentUser())?.name).toBe("Sam Chef");
    jar.clear();
    expect(await redirectedTo(() => login({}, form(credentials)))).toBe("/account");
  });

  it("sends an admin to the admin by default", async () => {
    await signUp();
    await db.user.update({ where: { email: "sam@example.com" }, data: { role: "ADMIN" } });
    jar.clear();
    expect(await redirectedTo(() => login({}, form(credentials)))).toBe("/admin");
    expect(isAdmin(await currentUser())).toBe(true);
  });

  it("gives one answer for a wrong password and an unknown email", async () => {
    await signUp();
    jar.clear();
    const wrong = await login({}, form({ ...credentials, password: "not the password" }));
    const unknown = await login({}, form({ email: "nobody@example.com", password: "whatever" }));
    expect(wrong.error).toBe("That email and password do not match.");
    expect(unknown).toEqual(wrong);
    expect(await currentUser()).toBeNull();
  });

  it("rejects an empty form and limits repeated attempts", async () => {
    expect((await login({}, form({ email: "x", password: "" }))).error).toBe("Enter a valid email address");
    for (let i = 0; i < 10; i++) await login({}, form({ email: "a@b.co", password: "x" }));
    expect((await login({}, form({ email: "a@b.co", password: "x" }))).error).toContain("Too many attempts");
  });

  it("logs out: the session is deleted and the cookie cleared", async () => {
    await signUp();
    expect(await db.session.count()).toBe(1);
    expect(await redirectedTo(() => logout())).toBe("/");
    expect(await db.session.count()).toBe(0);
    expect(await currentUser()).toBeNull();
  });
});

describe("sessions", () => {
  it("is null with no cookie, an unknown token, or after expiry (which also deletes it)", async () => {
    expect(await currentUser()).toBeNull();
    jar.set("ck_session", "made-up");
    expect(await currentUser()).toBeNull();

    const user = await db.user.create({ data: { email: "a@b.co", name: "A", passwordHash: "x" } });
    await startSession(user.id);
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await currentUser()).toBeNull();
    expect(await db.session.count()).toBe(0);
  });

  it("ending a session with no cookie is harmless, and isAdmin is false for customers and nobody", async () => {
    await endSession();
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin({ role: "CUSTOMER" })).toBe(false);
  });

  it("stores only the digest of the cookie", async () => {
    const user = await db.user.create({ data: { email: "a@b.co", name: "A", passwordHash: "x" } });
    await startSession(user.id);
    const [stored] = await db.session.findMany();
    expect(stored.id).toBe(digest(jar.get("ck_session")!));
    expect(stored.id).not.toBe(jar.get("ck_session"));
  });
});

describe("password reset", () => {
  it("emails a one-time link to a real account, and says the same to a stranger", async () => {
    await signUp();
    outbox.length = 0;
    expect((await requestPasswordReset({}, form({ email: "sam@example.com" }))).ok).toBe(true);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].subject).toBe("Reset your Caterkwik password");
    expect(outbox[0].text).toMatch(/\/account\/reset\/[\w-]{40,}/);

    expect((await requestPasswordReset({}, form({ email: "nobody@example.com" }))).ok).toBe(true);
    expect(outbox).toHaveLength(1);
  });

  it("validates the email and limits requests", async () => {
    expect((await requestPasswordReset({}, form({ email: "nope" }))).error).toBe("Enter a valid email address");
    for (let i = 0; i < 5; i++) await requestPasswordReset({}, form({ email: "a@b.co" }));
    expect((await requestPasswordReset({}, form({ email: "a@b.co" }))).error).toContain("Too many attempts");
  });

  const issue = async () => {
    await signUp();
    outbox.length = 0;
    await requestPasswordReset({}, form({ email: "sam@example.com" }));
    return outbox[0].text.match(/\/account\/reset\/([\w-]+)/)![1];
  };

  it("sets the new password once, signs everyone out and refuses the link a second time", async () => {
    const token = await issue();
    expect(await redirectedTo(() => resetPassword({}, form({ token, password: "a brand new password" })))).toBe("/account/login?reset=1");
    expect(await db.session.count()).toBe(0);

    const user = await db.user.findUniqueOrThrow({ where: { email: "sam@example.com" } });
    expect(await verifyPassword("a brand new password", user.passwordHash)).toBe(true);
    expect((await resetPassword({}, form({ token, password: "yet another password" }))).error).toContain("expired");
  });

  it("refuses an expired or invented link and a weak password", async () => {
    const token = await issue();
    expect((await resetPassword({}, form({ token, password: "short" }))).error).toBe("Use at least 10 characters");
    expect((await resetPassword({}, form({ token: "x".repeat(43), password: "a brand new password" }))).error).toContain("expired");
    await db.passwordReset.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await resetPassword({}, form({ token, password: "a brand new password" }))).error).toContain("expired");
  });
});
