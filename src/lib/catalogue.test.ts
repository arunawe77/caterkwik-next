import { describe, expect, it } from "vitest";
import scrape from "@/data/scrape.json";
import { getProduct, getType, productHref, products, productsOfType, typeHref, types } from "@/lib/catalogue";

describe("catalogue", () => {
  it("collapses 442 listings into 413 unique products", () => {
    expect(scrape.flatMap((c) => c.products)).toHaveLength(442);
    expect(products).toHaveLength(413);
    expect(new Set(products.map((p) => p.id)).size).toBe(413);
  });

  it("knows all 23 oven types, and every product belongs to exactly one", () => {
    expect(types).toHaveLength(23);
    expect(types.reduce((n, t) => n + t.total, 0)).toBe(413);
  });

  it("files a product under the first category it appears in and records the others", () => {
    const g56d = getProduct("g56d")!;
    expect(g56d.type).toBe("6-burner-range");
    expect(g56d.alsoIn).toContain("gas_convection_ovens");
    expect(productsOfType("gas_convection_ovens").some((p) => p.id === "g56d")).toBe(false);
  });

  it("derives stock from the scrape: discontinued, price on application, or available", () => {
    expect(getProduct("gl174")!.stock).toBe("discontinued");
    expect(products.some((p) => p.stock === "poa" && p.priceEx === null)).toBe(true);
    const cr6d = getProduct("cr6d")!;
    expect(cr6d).toMatchObject({ stock: "in-stock", priceEx: 1337.99, priceInc: 1605.59, wasEx: 1439.99, leaseWeek: 7.28 });
  });

  it("never invents a price for a product that has none", () => {
    for (const p of products.filter((x) => x.stock !== "in-stock")) {
      expect(p.priceEx === null || p.stock === "discontinued").toBe(true);
    }
  });

  it("looks products up by id, case-insensitively, and keeps the legacy token for redirects", () => {
    expect(getProduct("CR6D")).toBe(getProduct("cr6d"));
    expect(getProduct("cr6d")!.token).toBe("CR6D");
    expect(getProduct("nope")).toBeUndefined();
  });

  it("attaches sourced specifications to the six-burner ranges only", () => {
    const slr9c = getProduct("slr9c")!;
    expect(slr9c.spec).toMatchObject({ width: 900, burners: 6 });
    expect(slr9c.spec!.source).toContain("caterkwik.co.uk");
    expect(getProduct("cr6d")!.spec).toBeNull();
    expect(products.filter((p) => p.spec).length).toBe(31);
  });

  it("derives a brand from the product name, and leaves it null when unknown", () => {
    expect(getProduct("cr6d")!.brand).toBe("Blue Seal");
    expect(products.filter((p) => !p.brand).map((p) => p.name)).toEqual([
      "Charcoal Fired Shahi Tandoori Oven",
      "Gas Fired Shahi Tandoori Oven",
    ]);
  });

  it("computes each type's counts and price range from its products", () => {
    const t = getType("4-burner")!;
    expect(t).toMatchObject({ total: 20, live: 17, discontinued: 3, fromPrice: 1337.99, maxPrice: 5637.99 });
    const empty = types.find((x) => x.live === 0)!;
    expect(empty.fromPrice).toBeNull();
    expect(empty.maxPrice).toBeNull();
    expect(getType("nope")).toBeUndefined();
  });

  it("builds addresses", () => {
    expect(productHref({ type: "4-burner", id: "cr6d" })).toBe("/ovens/4-burner/cr6d");
    expect(typeHref("4-burner")).toBe("/ovens/4-burner");
  });
});
