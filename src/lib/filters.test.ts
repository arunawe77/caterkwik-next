import { describe, expect, it } from "vitest";
import { productsOfType } from "@/lib/catalogue";
import { applySelection, facets, parseSelection } from "@/lib/filters";

const list = productsOfType("4-burner");

describe("parseSelection", () => {
  it("reads repeated and single values, and ignores unknown availability", () => {
    expect(parseSelection({ brand: ["Lincat", "Falcon"], stock: "in-stock" })).toEqual({ brand: ["Lincat", "Falcon"], stock: ["in-stock"] });
    expect(parseSelection({ stock: ["bogus", "poa"] })).toEqual({ brand: [], stock: ["poa"] });
    expect(parseSelection({})).toEqual({ brand: [], stock: [] });
  });
});

describe("applySelection", () => {
  it("returns everything for an empty selection", () => {
    expect(applySelection(list, { brand: [], stock: [] })).toHaveLength(list.length);
  });

  it("ANDs the two facets and ORs values within one", () => {
    const lincat = applySelection(list, { brand: ["Lincat"], stock: [] });
    expect(lincat.length).toBeGreaterThan(0);
    expect(lincat.every((p) => p.brand === "Lincat")).toBe(true);

    const both = applySelection(list, { brand: ["Lincat", "Falcon"], stock: [] });
    expect(both.length).toBeGreaterThan(lincat.length);

    const live = applySelection(list, { brand: ["Lincat"], stock: ["in-stock"] });
    expect(live.every((p) => p.brand === "Lincat" && p.stock === "in-stock")).toBe(true);
  });

  it("excludes products with no brand when a brand is selected", () => {
    const tandoori = productsOfType("tandoori_ovens");
    expect(applySelection(tandoori, { brand: ["Lincat"], stock: [] })).toEqual([]);
  });
});

describe("facets", () => {
  it("counts each option as what the click would show, given the other facet", () => {
    const sel = { brand: [], stock: ["in-stock"] };
    const f = facets(list, sel);
    const lincat = f.brand.find((b) => b.value === "Lincat")!;
    expect(lincat.count).toBe(applySelection(list, { brand: ["Lincat"], stock: ["in-stock"] }).length);
    expect(f.stock.find((s) => s.value === "discontinued")!.count).toBe(list.filter((p) => p.stock === "discontinued").length);
  });

  it("lists brands alphabetically with zero counts kept, and hides availability values the type never has", () => {
    const f = facets(list, { brand: [], stock: ["discontinued"] });
    expect(f.brand.map((b) => b.value)).toEqual([...f.brand.map((b) => b.value)].sort());
    expect(f.brand.some((b) => b.count === 0)).toBe(true);
    expect(f.stock.map((s) => s.value)).not.toContain("poa");
  });
});
