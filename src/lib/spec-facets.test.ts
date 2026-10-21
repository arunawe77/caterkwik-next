import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/catalogue";
import type { Rich } from "@/lib/rich";
import { parseSpecSelection, specFacets } from "@/lib/spec-facets";

const product = (id: string): Product => ({
  id, token: id, name: id, brand: null, type: "t", alsoIn: [], image: "", priceEx: 1, priceInc: 1.2, wasEx: null, leaseWeek: null,
  stock: "in-stock", webExclusive: false, legacyUrl: "", spec: null,
});
const rich = (specs: Record<string, { label: string; value: string | number | boolean; unit?: string }>): Rich => ({
  family: "fryer", overview: [], features: [], extra: [], dimensions: [], power: [], special: [], icons: [], downloads: [], checklists: [], related: [],
  mpn: null, brand: null, keywords: null, summary: [], pdf: [],
  specs: Object.fromEntries(Object.entries(specs).map(([k, s]) => [k, { group: "Capacity", filter: true, from: "", source: "page" as const, ...s }])),
});

const list = ["a", "b", "c", "d", "e"].map(product);
const data = new Map<string, Rich>([
  ["a", rich({ fuel: { label: "Fuel", value: "gas" } })],
  ["b", rich({ fuel: { label: "Fuel", value: "gas" } })],
  ["c", rich({ fuel: { label: "Fuel", value: "electric" } })],
  ["d", rich({ fuel: { label: "Fuel", value: "electric" } })],
  ["e", rich({})],
]);

describe("specFacets", () => {
  it("offers the schema fields that products publish, with counts", () => {
    const { facets } = specFacets(list, data, {});
    expect(facets).toHaveLength(1);
    expect(facets[0].options.map((o) => [o.label, o.count])).toEqual([["Electric", 2], ["Gas", 2]]);
  });

  it("filters, and a product that does not publish the figure never matches", () => {
    const { apply, facets } = specFacets(list, data, { fuel: ["Gas"] });
    expect(apply(list).map((p) => p.id)).toEqual(["a", "b"]);
    expect(facets[0].options.find((o) => o.label === "Electric")?.count).toBe(2);
  });

  it("offers nothing when too few products carry a record to filter on", () => {
    expect(specFacets(list, new Map(), {}).facets).toEqual([]);
  });

  it("buckets many distinct numbers into ranges", () => {
    const nums = Array.from({ length: 12 }, (_, i) => `n${i}`);
    const rows = new Map(nums.map((id, i) => [id, rich({ oil: { label: "Oil capacity", value: 10 + i * 3, unit: "litres" } })]));
    const { facets, apply } = specFacets(nums.map(product), rows, {});
    expect(facets[0].options.length).toBeGreaterThanOrEqual(2);
    expect(facets[0].options.length).toBeLessThanOrEqual(5);
    expect(facets[0].options.reduce((n, o) => n + o.count, 0)).toBe(12);
    expect(apply(nums.map(product))).toHaveLength(12);
  });
});

describe("parseSpecSelection", () => {
  it("reads s.<field> parameters only", () => {
    expect(parseSpecSelection({ "s.fuel": ["Gas", "Electric"], brand: "x", "s.tanks": "1" })).toEqual({ fuel: ["Gas", "Electric"], tanks: ["1"] });
  });
});
