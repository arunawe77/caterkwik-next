import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/kit/rate-limit";

describe("createRateLimiter", () => {
  it("allows `limit` hits per key per window, then limits", () => {
    const limited = createRateLimiter(3, 1000, () => 0);
    expect([1, 2, 3, 4, 5].map(() => limited("a"))).toEqual([false, false, false, true, true]);
    expect(limited("b")).toBe(false);
  });

  it("opens a fresh window once the old one has expired, and forgets expired keys", () => {
    let t = 0;
    const limited = createRateLimiter(1, 1000, () => t);
    limited("a"); limited("a");
    expect(limited("a")).toBe(true);
    t = 1000;
    expect(limited("a")).toBe(false);
    limited("old");
    t = 5000;
    expect(limited("new")).toBe(false);
    expect(limited("old")).toBe(false);
  });

  it("uses the real clock by default", () => {
    const limited = createRateLimiter(1, 60_000);
    expect(limited("x")).toBe(false);
    expect(limited("x")).toBe(true);
  });
});
