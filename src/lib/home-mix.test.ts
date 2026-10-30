import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/catalogue";
import { departments, showable, spread, typicalOf } from "@/lib/home-mix";

const make = (id: string, type: string, priceEx: number | null, extra: Partial<Product> = {}): Product =>
  ({ id, name: id, type, priceEx, image: "x.jpg", stock: "in-stock", alsoIn: [], ...extra }) as Product;

describe("home mix", () => {
  it("shows only priced, photographed, in-stock products", () => {
    expect(showable(make("a", "t", 10))).toBe(true);
    expect(showable(make("a", "t", null))).toBe(false);
    expect(showable(make("a", "t", 10, { image: "" }))).toBe(false);
    expect(showable(make("a", "t", 10, { stock: "poa" }))).toBe(false);
  });

  it("picks the middle priced product, not the cheapest", () => {
    expect(typicalOf([make("a", "t", 30), make("b", "t", 10), make("c", "t", 20)])?.id).toBe("c");
    expect(typicalOf([])).toBeUndefined();
  });

  it("takes one product from each category in turn", () => {
    const list = [make("o1", "oven", 1), make("o2", "oven", 2), make("o3", "oven", 3), make("f1", "fryer", 5), make("c1", "chiller", 9)];
    expect(spread(list, (p) => p.type, 4).map((p) => p.id)).toEqual(["o1", "f1", "c1", "o2"]);
    expect(spread(list, (p) => p.type, 99)).toHaveLength(5);
  });

  it("lists departments that have stock, each with a product to show", () => {
    for (const d of departments(8)) {
      expect(d.live).toBeGreaterThan(0);
      expect(showable(d.product)).toBe(true);
    }
    expect(departments(3).length).toBeLessThanOrEqual(3);
  });
});
