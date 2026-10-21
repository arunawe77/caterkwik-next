import { describe, expect, it } from "vitest";
import { products } from "@/lib/catalogue";
import { addItem, cartCount, isPurchasable, MAX_LINES, MAX_QTY, parseCart, priceCart, serializeCart, toPence } from "@/lib/cart";

const raw = (value: unknown) => encodeURIComponent(JSON.stringify(value));

describe("parseCart", () => {
  it("reads ids and quantities, case-insensitively, and merges repeats", () => {
    expect(parseCart(raw([["CR6D", 1], ["cr6d", 2], ["slr6c", 1]]))).toEqual([{ id: "cr6d", qty: 3 }, { id: "slr6c", qty: 1 }]);
  });

  it("is empty for nothing, garbage, or the wrong shape", () => {
    expect(parseCart(undefined)).toEqual([]);
    expect(parseCart(null)).toEqual([]);
    expect(parseCart("")).toEqual([]);
    expect(parseCart("%E0%A4%A")).toEqual([]);
    expect(parseCart("not json")).toEqual([]);
    expect(parseCart(raw({ id: "cr6d" }))).toEqual([]);
    expect(parseCart(raw("cr6d"))).toEqual([]);
  });

  it("drops anything that is not a product that can be bought", () => {
    const gone = products.find((p) => p.stock === "discontinued")!.id;
    const poa = products.find((p) => p.stock === "poa")!.id;
    expect(parseCart(raw([["nope", 1], [gone, 1], [poa, 1], [5, 1], ["cr6d", 1], null, "x"]))).toEqual([{ id: "cr6d", qty: 1 }]);
  });

  it("keeps quantities to whole numbers between 1 and 99", () => {
    expect(parseCart(raw([["cr6d", 0]]))).toEqual([{ id: "cr6d", qty: 1 }]);
    expect(parseCart(raw([["cr6d", -5]]))).toEqual([{ id: "cr6d", qty: 1 }]);
    expect(parseCart(raw([["cr6d", 500]]))).toEqual([{ id: "cr6d", qty: MAX_QTY }]);
    expect(parseCart(raw([["cr6d", 1.5]]))).toEqual([]);
    expect(parseCart(raw([["cr6d", "2"]]))).toEqual([]);
    expect(parseCart(raw([["cr6d", 60], ["cr6d", 60]]))).toEqual([{ id: "cr6d", qty: MAX_QTY }]);
  });

  it("holds at most 30 lines", () => {
    const many = products.filter(isPurchasable).slice(0, 40).map((p) => [p.id, 1]);
    expect(parseCart(raw(many))).toHaveLength(MAX_LINES);
  });
});

describe("addItem, serialize and count", () => {
  it("adds to an existing line or starts a new one, and survives a round trip", () => {
    const one = addItem([], "cr6d", 1);
    const two = addItem(one, "cr6d", 2);
    expect(two).toEqual([{ id: "cr6d", qty: 3 }]);
    expect(parseCart(serializeCart(addItem(two, "slr6c", 1)))).toEqual([{ id: "cr6d", qty: 3 }, { id: "slr6c", qty: 1 }]);
  });

  it("ignores an unbuyable product", () => {
    expect(addItem([], "nope", 1)).toEqual([]);
  });

  it("counts units, not lines", () => {
    expect(cartCount(serializeCart([{ id: "cr6d", qty: 2 }, { id: "slr6c", qty: 3 }]))).toBe(5);
    expect(cartCount(undefined)).toBe(0);
  });
});

describe("priceCart", () => {
  it("prices from the catalogue in whole pence, with VAT as the difference", () => {
    const cart = priceCart([{ id: "cr6d", qty: 2 }, { id: "slr6c", qty: 1 }]);
    expect(cart.lines.map((l) => [l.product.id, l.unitExPence, l.unitIncPence])).toEqual([["cr6d", 133799, 160559], ["slr6c", 150799, 180959]]);
    expect(cart.subtotalExPence).toBe(133799 * 2 + 150799);
    expect(cart.totalIncPence).toBe(160559 * 2 + 180959);
    expect(cart.vatPence).toBe(cart.totalIncPence - cart.subtotalExPence);
  });

  it("is zero for an empty basket and skips lines that can no longer be bought", () => {
    expect(priceCart([])).toEqual({ lines: [], subtotalExPence: 0, vatPence: 0, totalIncPence: 0 });
    expect(priceCart([{ id: "nope", qty: 1 }, { id: products.find((p) => p.stock === "discontinued")!.id, qty: 1 }]).lines).toEqual([]);
  });

  it("converts pounds to pence without float drift", () => {
    expect(toPence(1337.99)).toBe(133799);
    expect(toPence(0.1 + 0.2)).toBe(30);
    expect(toPence(1605.59)).toBe(160559);
  });
});

describe("isPurchasable", () => {
  it("is true only for available products with a price", () => {
    expect(products.filter(isPurchasable).length).toBeGreaterThan(300);
    expect(products.filter(isPurchasable).every((p) => p.stock === "in-stock")).toBe(true);
    expect(isPurchasable({ ...products[0], stock: "in-stock", priceInc: null })).toBe(false);
  });
});
