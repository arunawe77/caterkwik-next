import { describe, expect, it } from "vitest";
import { catalogueFacts } from "@/kit/facts";
import { products, types } from "@/lib/catalogue";

const facts = catalogueFacts();
const line = (code: string) => facts.split("\n").find((l) => l.includes(`[code ${code}]`))!;

describe("catalogueFacts", () => {
  it("covers every product exactly once, grouped under its type", () => {
    for (const t of types) expect(facts).toContain(`## ${t.label}:`);
    expect(facts.split("\n").filter((l) => l.includes("[code ")).length).toBe(products.length);
  });

  it("quotes ex and inc VAT prices and lease for an available product", () => {
    expect(line("CR6D")).toContain("£1,337.99 ex VAT (£1,605.59 inc)");
    expect(line("CR6D")).toContain("lease from £7.28 a week");
  });

  it("never gives a price for a discontinued product", () => {
    expect(line("GL174")).toContain("DISCONTINUED, do not quote a price");
    expect(line("GL174")).not.toContain("£");
    expect(line("GL174")).not.toContain("lease");
  });

  it("says price on application where that is what the catalogue says", () => {
    const poa = products.find((p) => p.stock === "poa")!;
    expect(line(poa.token)).toContain("price on application");
  });

  it("adds sourced specifications for the six-burner ranges and says when one is not published", () => {
    expect(line("SLR9C")).toContain("available in Natural gas or LPG");
    expect(line("SLR9C")).toContain("900 mm wide");
    expect(line("SLR9C")).toContain("static oven");
    expect(facts).toMatch(/not published/);
    expect(line("CR6D")).not.toContain("mm wide");
  });

  it("states what the section heading counts, including types with nothing priced", () => {
    expect(facts).toContain("## 4 Burner Ovens: 17 available, from £1,337.99 ex VAT, 3 discontinued");
    expect(facts).toMatch(/none currently priced/);
  });

  it("keeps the worked example apart from the catalogue", () => {
    expect(facts).toContain("## Not in the catalogue");
    expect(facts).toContain("NOT currently listed on caterkwik.co.uk");
    expect(facts).toContain("/falcon/g3101-otc-p");
  });

});
