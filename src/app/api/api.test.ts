import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const post = (fields: Record<string, string>, headers: Record<string, string> = {}) => {
  const body = new URLSearchParams(fields);
  return new NextRequest("http://staging.test/api/gate", {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
  });
};

const load = async (password: string) => {
  vi.resetModules();
  vi.stubEnv("SITE_PASSWORD", password);
  const [{ POST }, gate] = await Promise.all([import("@/app/api/gate/route"), import("@/lib/gate")]);
  return { POST, gate };
};

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/gate", () => {
  it("sets the access cookie and sends the visitor on when the password is right", async () => {
    const { POST, gate } = await load("secret");
    const res = await POST(post({ password: " secret ", next: "/ovens/4-burner" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://staging.test/ovens/4-burner");
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain(`${gate.COOKIE}=${gate.TOKEN}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).not.toMatch(/Secure/i);
  });

  it("marks the cookie Secure behind an HTTPS proxy", async () => {
    const { POST } = await load("secret");
    const res = await POST(post({ password: "secret" }, { "x-forwarded-proto": "https" }));
    expect(res.headers.get("set-cookie")).toMatch(/Secure/i);
  });

  it("never redirects off the site, whatever next says", async () => {
    const { POST } = await load("secret");
    const res = await POST(post({ password: "secret", next: "//evil.example" }));
    expect(res.headers.get("location")).toBe("http://staging.test/");
  });

  it("sends a wrong or missing password back to the gate with an error", async () => {
    const { POST } = await load("secret");
    const wrong: Record<string, string>[] = [{ password: "nope", next: "/ovens" }, { next: "/ovens" }];
    for (const fields of wrong) {
      const res = await POST(post(fields));
      expect(res.status).toBe(303);
      expect(res.headers.get("set-cookie")).toBeNull();
      const to = new URL(res.headers.get("location")!);
      expect(to.pathname).toBe("/gate");
      expect(to.searchParams.get("error")).toBe("1");
      expect(to.searchParams.get("next")).toBe("/ovens");
    }
  });

  it("refuses everything when no password is configured", async () => {
    const { POST } = await load("");
    const res = await POST(post({ password: "" }));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/gate");
  });
});

describe("GET /api/health", () => {
  const get = async (query = "") => (await import("@/app/api/health/route")).GET(new Request(`http://staging.test/api/health${query}`));

  it("answers ok as soon as the server is up, and is never cached", async () => {
    const res = await get();
    expect(await res.text()).toBe("ok");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("checks the database when asked", async () => {
    expect(await (await get("?db=1")).text()).toBe("ok");
  });

  it("answers 503 when the database is down, so a deploy does not call the release good", async () => {
    const { db } = await import("@/server/db");
    const down = vi.spyOn(db, "$queryRaw").mockRejectedValue(new Error("down"));
    const res = await get("?db=1");
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("database unavailable");
    down.mockRestore();
    expect((await get()).status).toBe(200);
  });
});
