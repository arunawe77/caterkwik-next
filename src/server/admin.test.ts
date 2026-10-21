import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { form, redirectedTo, resetTestState, revalidated } from "@/test/next-mocks";

vi.mock("next/headers", async () => (await import("@/test/next-mocks")).headersMock);
vi.mock("next/cache", async () => (await import("@/test/next-mocks")).cacheMock);

import { canMove, nextStatuses, STATUS_LABEL } from "@/lib/orderflow";
import { addRedirect, deleteRedirect, setEnquiryStatus, setOrderStatus, setUserRole } from "@/server/admin-actions";
import { db } from "@/server/db";
import { outbox } from "@/server/mail";
import { clearRedirectCache, customRedirect } from "@/server/redirects";
import { startSession } from "@/server/session";
import { proxy } from "@/proxy";

beforeEach(async () => {
  await resetTestState();
  outbox.length = 0;
  clearRedirectCache();
});
afterAll(() => db.$disconnect());

const signIn = async (role: "ADMIN" | "CUSTOMER" = "ADMIN") => {
  const user = await db.user.create({ data: { email: `${role}@example.com`, name: role, passwordHash: "x", role } });
  await startSession(user.id);
  return user;
};
const newOrder = (status: "AWAITING_PAYMENT" | "PAID" | "PROCESSING" | "SHIPPED" | "COMPLETED" = "PAID") =>
  db.order.create({ data: { status, email: "sam@example.com", name: "Sam", phone: "1", addressLine1: "x", city: "c", postcode: "p", subtotalExPence: 100, totalIncPence: 120 } });

describe("order flow", () => {
  it("moves forward step by step, can cancel until shipped, and closes at the end", () => {
    expect(nextStatuses("AWAITING_PAYMENT")).toEqual(["PAID", "CANCELLED"]);
    expect(canMove("PAID", "PROCESSING")).toBe(true);
    expect(canMove("PAID", "SHIPPED")).toBe(false);
    expect(canMove("SHIPPED", "CANCELLED")).toBe(false);
    expect(nextStatuses("COMPLETED")).toEqual([]);
    expect(nextStatuses("CANCELLED")).toEqual([]);
    expect(STATUS_LABEL.AWAITING_PAYMENT).toBe("Awaiting payment");
  });
});

describe("access", () => {
  const actions: [string, () => Promise<unknown>][] = [
    ["setOrderStatus", () => setOrderStatus(form({ id: "x", status: "PAID" }))],
    ["setEnquiryStatus", () => setEnquiryStatus(form({ id: "x", status: "DONE" }))],
    ["addRedirect", () => addRedirect({}, form({ fromPath: "/a", toPath: "/b" }))],
    ["deleteRedirect", () => deleteRedirect(form({ id: "x" }))],
    ["setUserRole", () => setUserRole(form({ id: "x", role: "ADMIN" }))],
  ];

  it.each(actions)("%s sends a visitor to sign in and changes nothing", async (_, run) => {
    expect(await redirectedTo(run)).toBe("/account/login?next=/admin");
  });

  it.each(actions)("%s refuses a customer", async (_, run) => {
    await signIn("CUSTOMER");
    expect(await redirectedTo(run)).toBe("/account/login?next=/admin");
  });
});

describe("setOrderStatus", () => {
  it("moves an order on, stamps the payment time, and tells the customer when it ships", async () => {
    await signIn();
    const order = await newOrder("AWAITING_PAYMENT");
    expect(await redirectedTo(() => setOrderStatus(form({ id: order.id, status: "PAID" })))).toBe(`/admin/orders/${order.id}`);
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: "PAID", paidAt: expect.any(Date) });

    await redirectedTo(() => setOrderStatus(form({ id: order.id, status: "PROCESSING" })));
    await redirectedTo(() => setOrderStatus(form({ id: order.id, status: "SHIPPED", trackingNote: " Pallet 7, DPD  " })));
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).trackingNote).toBe("Pallet 7, DPD");
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ to: "sam@example.com", subject: expect.stringContaining("has shipped") });
    expect(outbox[0].text).toContain("Pallet 7, DPD");
    expect(revalidated).toContain("/admin/orders");
  });

  it("keeps an existing tracking note when none is given, and clears nothing by accident", async () => {
    await signIn();
    const order = await db.order.create({ data: { status: "PROCESSING", trackingNote: "Booked", email: "a@b.co", name: "A", phone: "1", addressLine1: "x", city: "c", postcode: "p", subtotalExPence: 1, totalIncPence: 1 } });
    await redirectedTo(() => setOrderStatus(form({ id: order.id, status: "SHIPPED" })));
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).trackingNote).toBe("Booked");
    expect(outbox[0].text).toContain("Booked");
  });

  it("ships without a tracking note too", async () => {
    await signIn();
    const order = await newOrder("PROCESSING");
    await redirectedTo(() => setOrderStatus(form({ id: order.id, status: "SHIPPED" })));
    expect(outbox[0].text).not.toContain("null");
  });

  it("refuses a jump, a closed order, an unknown order and bad input", async () => {
    await signIn();
    const order = await newOrder("PAID");
    expect(await redirectedTo(() => setOrderStatus(form({ id: order.id, status: "COMPLETED" })))).toBeNull();
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
    const done = await newOrder("COMPLETED");
    await setOrderStatus(form({ id: done.id, status: "CANCELLED" }));
    expect((await db.order.findUniqueOrThrow({ where: { id: done.id } })).status).toBe("COMPLETED");
    await setOrderStatus(form({ id: "nope", status: "PAID" }));
    await setOrderStatus(form({ id: order.id, status: "TELEPORTED" }));
    expect(outbox).toHaveLength(0);
  });
});

describe("setEnquiryStatus", () => {
  const enquiry = () => db.enquiry.create({ data: { kind: "QUOTE", name: "Sam", email: "s@x.co", message: "hi" } });

  it("updates the status and the team's notes", async () => {
    await signIn();
    const e = await enquiry();
    expect(await redirectedTo(() => setEnquiryStatus(form({ id: e.id, status: "IN_PROGRESS", notes: " Rang back " })))).toBe("/admin/enquiries");
    expect(await db.enquiry.findUniqueOrThrow({ where: { id: e.id } })).toMatchObject({ status: "IN_PROGRESS", notes: "Rang back" });
    await redirectedTo(() => setEnquiryStatus(form({ id: e.id, status: "DONE" })));
    expect((await db.enquiry.findUniqueOrThrow({ where: { id: e.id } })).notes).toBe("Rang back");
  });

  it("ignores bad input", async () => {
    await signIn();
    const e = await enquiry();
    expect(await redirectedTo(() => setEnquiryStatus(form({ id: e.id, status: "BOGUS" })))).toBeNull();
    expect((await db.enquiry.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("NEW");
  });
});

describe("custom redirects", () => {
  it("adds, updates and deletes them, and the proxy follows them at once", async () => {
    await signIn();
    expect(await addRedirect({}, form({ fromPath: " /old-oven ", toPath: "/ovens/4-burner/cr6d" }))).toEqual({ ok: true });
    const res = await proxy(new NextRequest("http://staging.test/old-oven"));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("http://staging.test/ovens/4-burner/cr6d");

    await addRedirect({}, form({ fromPath: "/old-oven", toPath: "/ovens" }));
    expect(await db.customRedirect.count()).toBe(1);
    expect((await proxy(new NextRequest("http://staging.test/old-oven"))).headers.get("location")).toBe("http://staging.test/ovens");

    const [row] = await db.customRedirect.findMany();
    await redirectedTo(() => deleteRedirect(form({ id: row.id })));
    expect((await proxy(new NextRequest("http://staging.test/old-oven"))).status).toBe(200);
  });

  it("rejects paths that are not on this site, and a loop", async () => {
    await signIn();
    expect((await addRedirect({}, form({ fromPath: "old", toPath: "/x" }))).error).toBe("Start with a /");
    expect((await addRedirect({}, form({ fromPath: "/a", toPath: "//evil.example" }))).error).toBe("Start with a /");
    expect((await addRedirect({}, form({ fromPath: "/a", toPath: "/a" }))).error).toBe("A redirect cannot point at itself");
    expect(await db.customRedirect.count()).toBe(0);
  });

  it("is cached for 15 seconds, then refreshed", async () => {
    await db.customRedirect.create({ data: { fromPath: "/a", toPath: "/b" } });
    const t0 = 1_000_000;
    expect(await customRedirect("/a", t0)).toBe("/b");
    await db.customRedirect.create({ data: { fromPath: "/c", toPath: "/d" } });
    expect(await customRedirect("/c", t0 + 10_000)).toBeNull();
    expect(await customRedirect("/c", t0 + 16_000)).toBe("/d");
    expect(await customRedirect("/nowhere", t0 + 17_000)).toBeNull();
  });

  it("keeps serving what it knew when the database fails", async () => {
    await db.customRedirect.create({ data: { fromPath: "/a", toPath: "/b" } });
    expect(await customRedirect("/a", 1_000)).toBe("/b");
    const failing = vi.spyOn(db.customRedirect, "findMany").mockRejectedValue(new Error("db down"));
    expect(await customRedirect("/a", 100_000)).toBe("/b");
    failing.mockRestore();
    clearRedirectCache();
    vi.spyOn(db.customRedirect, "findMany").mockRejectedValue(new Error("db down"));
    expect(await customRedirect("/a", 1)).toBeNull();
    vi.restoreAllMocks();
  });
});

describe("setUserRole", () => {
  it("promotes and demotes other users, but never lets an admin demote themselves", async () => {
    const me = await signIn();
    const other = await db.user.create({ data: { email: "c@example.com", name: "C", passwordHash: "x" } });
    expect(await redirectedTo(() => setUserRole(form({ id: other.id, role: "ADMIN" })))).toBe("/admin/users");
    expect((await db.user.findUniqueOrThrow({ where: { id: other.id } })).role).toBe("ADMIN");
    await redirectedTo(() => setUserRole(form({ id: other.id, role: "CUSTOMER" })));
    expect((await db.user.findUniqueOrThrow({ where: { id: other.id } })).role).toBe("CUSTOMER");

    expect(await redirectedTo(() => setUserRole(form({ id: me.id, role: "CUSTOMER" })))).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: me.id } })).role).toBe("ADMIN");
    expect(await redirectedTo(() => setUserRole(form({ id: other.id, role: "SUPERUSER" })))).toBeNull();
  });
});
