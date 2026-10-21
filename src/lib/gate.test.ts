import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("safeNext", () => {
  it("keeps same-site paths and refuses anything that could leave the site", async () => {
    const { safeNext } = await import("@/lib/gate");
    expect(safeNext("/ovens?brand=Lincat")).toBe("/ovens?brand=Lincat");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
  });
});

describe("gate configuration", () => {
  it("is off without a password, and derives a stable token from one", async () => {
    const off = await import("@/lib/gate");
    expect(off.PASSWORD).toBe("");

    vi.resetModules();
    vi.stubEnv("SITE_PASSWORD", "secret");
    const a = await import("@/lib/gate");
    vi.resetModules();
    const b = await import("@/lib/gate");
    expect(a.PASSWORD).toBe("secret");
    expect(a.TOKEN).toBe(b.TOKEN);
    expect(a.TOKEN).not.toBe(off.TOKEN);
    expect(a.TOKEN).toMatch(/^[0-9a-f]{64}$/);
  });
});
