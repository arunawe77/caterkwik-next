import { describe, expect, it } from "vitest";
import { getProduct, getType, types } from "@/lib/catalogue";
import { alsoListedUnder, relatedProducts, siblingTypes } from "@/lib/related";

describe("relatedProducts", () => {
  it("offers the nearest-priced available models of the same type, never itself", () => {
    const p = getProduct("slr6c")!;
    const related = relatedProducts(p);
    expect(related).toHaveLength(4);
    expect(related.map((r) => r.id)).not.toContain(p.id);
    expect(related.every((r) => r.type === p.type && r.stock === "in-stock")).toBe(true);
    const gaps = related.map((r) => Math.abs(r.priceEx! - p.priceEx!));
    expect(gaps).toEqual([...gaps].sort((a, b) => a - b));
  });

  it("offers a discontinued product the cheapest models still available", () => {
    const related = relatedProducts(getProduct("gl174")!, 3);
    expect(related).toHaveLength(3);
    const prices = related.map((r) => r.priceEx!);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(related[0].id).toBe("cr6d");
  });

  it("does the same for price on application", () => {
    const poa = { ...getProduct("cr6d")!, stock: "poa" as const, priceEx: null };
    expect(relatedProducts(poa, 1)[0].id).toBe("slr6c");
  });

  it("returns what exists when a type has few models", () => {
    expect(relatedProducts(getProduct("shahitandooricharcoal") ?? getProduct("cr6d")!, 50).length).toBeLessThan(50);
  });
});

describe("alsoListedUnder", () => {
  it("resolves the other types a product is listed under", () => {
    expect(alsoListedUnder(getProduct("g56d")!).map((t) => t.slug)).toEqual(["gas_convection_ovens"]);
    expect(alsoListedUnder(getProduct("cr6d")!)).toEqual([]);
    expect(alsoListedUnder({ ...getProduct("cr6d")!, alsoIn: ["nope"] })).toEqual([]);
  });
});

describe("siblingTypes", () => {
  it("lists every other type, those sharing a supply first", () => {
    const sibs = siblingTypes("4-burner");
    expect(sibs).toHaveLength(types.length - 1);
    expect(sibs.map((t) => t.slug)).not.toContain("4-burner");
    const own = getType("4-burner")!;
    const shared = (t: { supply: string[] }) => t.supply.filter((s) => own.supply.includes(s)).length;
    expect(shared(sibs[0])).toBeGreaterThanOrEqual(shared(sibs.at(-1)!));
  });

  it("lists every type for an unknown one", () => {
    expect(siblingTypes("nope")).toHaveLength(types.length);
  });
});
