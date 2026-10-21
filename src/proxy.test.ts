import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const load = async (password: string) => {
  vi.resetModules();
  vi.stubEnv("SITE_PASSWORD", password);
  const [{ proxy, config }, gate] = await Promise.all([import("@/proxy"), import("@/lib/gate")]);
  return { proxy, config, gate };
};
const request = (path: string, cookie?: string) =>
  new NextRequest(`http://staging.test${path}`, cookie ? { headers: { cookie } } : undefined);

afterEach(() => vi.unstubAllEnvs());

describe("proxy: legacy addresses", () => {
  it("301s an old product address to the new page, even behind the gate", async () => {
    const { proxy } = await load("secret");
    const res = await proxy(request("/cgi-bin/trolleyed_public.cgi?action=showprod_CR6D"));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("http://staging.test/ovens/4-burner/cr6d");
  });

  it("301s old category paths", async () => {
    const { proxy } = await load("");
    const res = await proxy(request("/shop/commercial-catering-equipment/commercial-ovens/6-burner-range/"));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("http://staging.test/ovens/6-burner-range");
  });
});

describe("proxy: trailing slashes", () => {
  it("redirects a trailing slash to the clean address, keeping the query", async () => {
    const { proxy } = await load("");
    const res = await proxy(request("/ovens/4-burner/?brand=Lincat"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("http://staging.test/ovens/4-burner?brand=Lincat");
  });
});

describe("proxy: staging gate", () => {
  it("sends visitors without the cookie to the gate, remembering where they were going", async () => {
    const { proxy } = await load("secret");
    const res = await proxy(request("/ovens?brand=Lincat"));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/gate");
    expect(to.searchParams.get("next")).toBe("/ovens?brand=Lincat");
  });

  it("lets a visitor with the right cookie through, and marks the page noindex", async () => {
    const { proxy, gate } = await load("secret");
    const res = await proxy(request("/ovens", `${gate.COOKIE}=${gate.TOKEN}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("rejects a wrong cookie", async () => {
    const { proxy, gate } = await load("secret");
    expect((await proxy(request("/ovens", `${gate.COOKIE}=wrong`))).status).toBe(307);
  });

  it("keeps the gate page, its form target, the health check and robots.txt open", async () => {
    const { proxy } = await load("secret");
    for (const path of ["/gate", "/api/gate", "/api/health", "/robots.txt", "/api/stripe/webhook"]) expect((await proxy(request(path))).status).toBe(200);
  });

  it("is off when no password is set", async () => {
    const { proxy } = await load("");
    const res = await proxy(request("/ovens"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("does not run on built assets", async () => {
    const { config } = await load("");
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    expect(pattern.test("/ovens")).toBe(true);
    expect(pattern.test("/assets/styles.css")).toBe(false);
    expect(pattern.test("/_next/static/chunk.js")).toBe(false);
  });
});
