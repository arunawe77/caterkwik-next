import { describe, expect, it } from "vitest";
import { codeKey, compareCosts, guessMapping, marginOf, parseCsv, penceOf, readFeed, seedSuppliers, slugOf, stockOf } from "@/lib/suppliers";

describe("seedSuppliers", () => {
  const seed = seedSuppliers();
  it("puts Uropa first with all 54 brands", () => {
    expect(seed[0]).toMatchObject({ id: "uropa", kind: "FEED" });
    expect(seed[0].brands).toHaveLength(54);
  });
  it("makes a direct supplier of each bracketed name, with the brands it shares with Uropa", () => {
    expect(seed.find((s) => s.id === "middleby")?.brands).toEqual(["Bakers Pride", "Blodgett", "Merrychef", "Pitco"]);
    expect(seed.find((s) => s.id === "blue-badge")?.brands).toEqual(["Vestfrost"]);
    expect(seed.find((s) => s.id === "pentland")?.brands).toEqual(["Vestfrost"]);
  });
});

describe("parseCsv", () => {
  it("reads quotes, doubled quotes, embedded newlines, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n"two\nlines",z\n\n')).toEqual([["a", "b"], ["x, y", 'say "hi"'], ["two\nlines", "z"]]);
  });
  it("keeps a last row with no newline", () => expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]));
});

describe("parsing values", () => {
  it("reads money and stock", () => {
    expect(penceOf("£1,234.50")).toBe(123450);
    expect(penceOf("0")).toBeNull();
    expect(penceOf("POA")).toBeNull();
    expect(penceOf(undefined)).toBeNull();
    expect(stockOf("1,200")).toBe(1200);
    expect(stockOf("-3")).toBeNull();
    expect(stockOf("")).toBeNull();
  });
  it("matches codes ignoring case and punctuation", () => {
    expect(codeKey("G3101-A")).toBe(codeKey("g3101 a"));
    expect(codeKey(null)).toBe("");
  });
  it("slugs names", () => expect(slugOf("Blue Badge & Pentland")).toBe("blue-badge-and-pentland"));
});

describe("feed reading", () => {
  const head = ["Product Code", "Manufacturer Code", "Description", "Brand", "Net Price", "Stock"];
  it("guesses columns from common headers", () => {
    expect(guessMapping(head)).toEqual({ sku: "Product Code", mpn: "Manufacturer Code", name: "Description", brand: "Brand", cost: "Net Price", stock: "Stock" });
  });
  it("reads rows, skipping blank and repeated codes", () => {
    const m = guessMapping(head);
    const out = readFeed([head, ["A1", "M-1", "Oven", "Falcon", "£100.00", "5"], ["", "", "", "", "", ""], ["A1", "", "", "", "", ""], ["B2", "", "", "", "x", ""]], m);
    expect(out.skipped).toBe(2);
    expect(out.rows).toEqual([
      { sku: "A1", mpn: "M-1", brand: "Falcon", name: "Oven", costExPence: 10000, stockQty: 5 },
      { sku: "B2", mpn: null, brand: null, name: null, costExPence: null, stockQty: null },
    ]);
  });
  it("names the columns it cannot find", () => {
    expect(readFeed([["foo", "bar"], ["1", "2"]], {}).missing).toEqual(["Supplier code", "Cost price"]);
    expect(readFeed([], {}).rows).toEqual([]);
  });
});

describe("compareCosts", () => {
  const line = (supplierId: string, kind: "FEED" | "DIRECT", costExPence: number | null) => ({ supplierId, supplierName: supplierId, kind, costExPence });
  it("flags a feed cheaper than direct, with the saving", () => {
    const c = compareCosts([line("uropa", "FEED", 9000), line("jestic", "DIRECT", 10000), line("other", "DIRECT", 11000)]);
    expect(c.cheapest?.supplierId).toBe("uropa");
    expect(c.feedSaving).toMatchObject({ pence: 1000, percent: 10 });
  });
  it("says nothing when direct is cheaper, or either side is missing, or nothing is priced", () => {
    expect(compareCosts([line("uropa", "FEED", 11000), line("jestic", "DIRECT", 10000)]).feedSaving).toBeNull();
    expect(compareCosts([line("uropa", "FEED", 9000)]).feedSaving).toBeNull();
    expect(compareCosts([line("a", "FEED", null)])).toEqual({ cheapest: null, feedSaving: null });
  });
  it("works out margin", () => {
    expect(marginOf(10000, 7500)).toBe(25);
    expect(marginOf(null, 100)).toBeNull();
    expect(marginOf(0, 100)).toBeNull();
  });
});
