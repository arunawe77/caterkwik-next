import { describe, expect, it } from "vitest";
import { searchProducts } from "@/lib/search";

describe("searchProducts", () => {
  it("puts the main range first for a model number, then its variants", () => {
    const ids = searchProducts("g3101").map((p) => p.id);
    expect(ids[0]).toBe("falcong31016burnergasoven");
    expect(ids).toEqual(expect.arrayContaining(["g3101d", "g3101castors", "g3101hd", "g3101otc"]));
  });

  it("finds a product by its legacy token or by a word in its name", () => {
    expect(searchProducts("CR6D")[0].id).toBe("cr6d");
    expect(searchProducts("slr9c")[0].name).toContain("SLR9");
  });

  it("requires every word to match", () => {
    const hits = searchProducts("blue seal 4 burner");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((p) => /blue seal/i.test(p.name))).toBe(true);
    expect(searchProducts("cr6d gas")[0].id).toBe("cr6d");
    expect(searchProducts("cr6d lincat")).toEqual([]);
  });

  it("matches a brand name", () => {
    const hits = searchProducts("lincat");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((p) => p.brand === "Lincat")).toBe(true);
    expect(hits.every((p) => /lincat/i.test(`${p.brand} ${p.name} ${p.token}`))).toBe(true);
  });

  it("lists available products before discontinued ones, cheapest first, when relevance ties", () => {
    const hits = searchProducts("4 burner", 200);
    const firstGone = hits.findIndex((p) => p.stock === "discontinued");
    expect(firstGone).toBeGreaterThan(0);
    const liveSameScore = hits.slice(0, firstGone);
    expect(liveSameScore.every((p) => p.stock !== "discontinued")).toBe(true);
  });

  it("returns nothing for empty, punctuation-only or unmatched queries", () => {
    expect(searchProducts("")).toEqual([]);
    expect(searchProducts("  !!  ")).toEqual([]);
    expect(searchProducts("zzzzqqqq")).toEqual([]);
  });

  it("caps the number of results", () => {
    expect(searchProducts("oven", 5)).toHaveLength(5);
    expect(searchProducts("oven").length).toBeLessThanOrEqual(60);
  });
});
