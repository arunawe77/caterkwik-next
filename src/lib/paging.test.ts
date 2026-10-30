import { describe, expect, it } from "vitest";
import { pageCount, pageOf } from "@/lib/paging";

describe("paging", () => {
  it("reads the page asked for, and falls back to the first for nonsense", () => {
    expect(pageOf("3", 25)).toEqual({ page: 3, skip: 50, take: 25 });
    for (const bad of [undefined, "", "0", "-4", "abc"]) expect(pageOf(bad, 25)).toEqual({ page: 1, skip: 0, take: 25 });
    expect(pageOf("2.9", 10).page).toBe(2);
  });

  it("counts at least one page", () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
  });
});
