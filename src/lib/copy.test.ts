import { describe, expect, it } from "vitest";
import { getProduct, getType, products, types } from "@/lib/catalogue";
import { homeFaqs, productFaqs, productOverview, typeFaqs, typeIntro, WHY_CATERKWIK } from "@/lib/copy";

const answer = (faqs: { q: string; a: string }[], q: RegExp) => faqs.find((f) => q.test(f.q))?.a;

describe("typeIntro", () => {
  it("states counts, the price range and what the type runs on, from the data", () => {
    const [counts, audience, supply] = typeIntro(getType("4-burner")!);
    expect(counts).toContain("20 models of 4 burner ovens from 7 makers");
    expect(counts).toContain("17 models are available today");
    expect(counts).toContain("£1,337.99 to £5,637.99 ex VAT");
    expect(audience).toBe(getType("4-burner")!.audience);
    expect(supply).toBe("This type runs on mains natural gas and bottled LPG and suits pans on burners.");
  });

  it("says when nothing is priced, and handles a single price and a single model", () => {
    expect(typeIntro(getType("domestic_ovens")!)[0]).toContain("None is currently priced.");
    const one = { ...getType("4-burner")!, maxPrice: 1337.99, live: 1 };
    expect(typeIntro(one)[0]).toContain("The price is £1,337.99 ex VAT.");
    expect(typeIntro(one)[0]).toContain("1 model is available today");
  });

  it("omits the makers when no product has a known brand", () => {
    expect(typeIntro(getType("tandoori_ovens")!)[0]).not.toContain("maker");
  });
});

describe("typeFaqs", () => {
  it("answers price, brands, fuel and service for every type", () => {
    for (const t of types) {
      const faqs = typeFaqs(t);
      expect(faqs.length).toBeGreaterThanOrEqual(3);
      expect(answer(faqs, /install/)).toContain("01229 480001");
      expect(faqs.every((f) => f.q && f.a)).toBe(true);
    }
  });

  it("names the cheapest model and the top of the range", () => {
    const a = answer(typeFaqs(getType("4-burner")!), /How much/)!;
    expect(a).toContain("start at £1,337.99 ex VAT (£1,605.59 inc VAT) for the Blue Seal Cobra Series CR6D");
    expect(a).toContain("up to £5,637.99 ex VAT");
  });

  it("lists brands with their model counts", () => {
    expect(answer(typeFaqs(getType("4-burner")!), /brands/)).toContain("Blue Seal (5 models)");
  });

  it("covers lease and discontinued models only where the data has them", () => {
    const four = typeFaqs(getType("4-burner")!);
    expect(answer(four, /lease/)).toMatch(/from £\d+\.\d\d a week/);
    expect(answer(four, /without a price/)).toContain("3 models of 4 burner ovens are discontinued");
    const domestic = typeFaqs(getType("domestic_ovens")!);
    expect(answer(domestic, /lease/)).toBeUndefined();
    expect(answer(domestic, /How much/)).toContain("None of the domestic ovens");
  });

  it("explains price on application when that is all a type has", () => {
    const tandoori = typeFaqs(getType("tandoori_ovens")!);
    expect(answer(tandoori, /How much/)).toContain("price on application");
    expect(answer(tandoori, /brands/)).toBeUndefined();
    const single = typeFaqs({ ...getType("4-burner")!, discontinued: 1 });
    expect(answer(single, /without a price/)).toContain("is discontinued. Caterkwik still list it");
    const oneOnly = typeFaqs({ ...getType("tandoori_ovens")!, poa: 1 });
    expect(answer(oneOnly, /How much/)).toContain("1 model is price on application");
  });

  it("does not repeat the top price when a type has one price", () => {
    const flat = typeFaqs({ ...getType("4-burner")!, maxPrice: getType("4-burner")!.fromPrice });
    expect(answer(flat, /How much/)).not.toContain("up to");
  });
});

describe("productOverview", () => {
  it("describes an available product with price, was price, lease and published figures", () => {
    const [first, facts] = productOverview(getProduct("cr6d")!);
    expect(first).toContain("The Blue Seal Cobra Series CR6D Gas 4 Burner Oven is a Blue Seal model in Caterkwik's 4 burner ovens range.");
    expect(first).toContain("costs £1,337.99 ex VAT (£1,605.59 inc VAT), down from £1,439.99 ex VAT, or can be leased from £7.28 a week.");
    expect(facts).toContain("not part of this preview");
  });

  it("lists only the published figures of a specified product", () => {
    const [, facts] = productOverview(getProduct("slr9c")!);
    expect(facts).toContain("available for natural gas and LPG, 900 mm wide, 600 mm deep, 956 mm high, 6 burners, 27 kW across the hob, a static oven and a 2-year warranty");
    expect(facts).toContain("Anything not listed here is not published.");
  });

  it("says discontinued and price on application plainly, and copes with no brand and no was or lease price", () => {
    expect(productOverview(getProduct("gl174")!)[0]).toContain("discontinued, so Caterkwik show no price");
    expect(productOverview({ ...getProduct("cr6d")!, stock: "poa", priceEx: null })[0]).toContain("price on application");
    const plain = productOverview({ ...getProduct("cr6d")!, brand: null, wasEx: null, leaseWeek: null })[0];
    expect(plain).toContain("is in Caterkwik's 4 burner ovens range.");
    expect(plain).toContain("(£1,605.59 inc VAT).");
  });

  it("leaves out figures a specification does not publish", () => {
    const bare = { ...getProduct("slr9c")!.spec!, fuel: [], width: null, depth: null, height: null, burners: null, kwTotal: null, ovenType: null, warrantyYears: null };
    expect(productOverview({ ...getProduct("slr9c")!, spec: bare })[1]).toContain("not part of this preview");
  });
});

describe("productFaqs", () => {
  it("answers price, lease, fuel, dimensions and installation for a specified product", () => {
    const faqs = productFaqs(getProduct("slr9c")!);
    expect(answer(faqs, /How much/)).toBe("£1,132.99 excluding VAT, which is £1,359.59 including VAT.");
    expect(answer(faqs, /lease/)).toContain("£6.16 a week");
    expect(answer(faqs, /fuel/)).toContain("natural gas and LPG");
    expect(answer(faqs, /dimensions/)).toBe("900 mm wide, 600 mm deep and 956 mm high.");
    expect(answer(faqs, /install/)).toContain("in house");
  });

  it("says dimensions are not published when the product has no specification", () => {
    const a = answer(productFaqs(getProduct("cr6d")!), /dimensions/)!;
    expect(a).toContain("not published");
    expect(answer(productFaqs(getProduct("cr6d")!), /fuel/)).toBeUndefined();
  });

  it("names the dimensions it does not have", () => {
    const partial = { ...getProduct("slr9c")!, spec: { ...getProduct("slr9c")!.spec!, depth: null } };
    expect(answer(productFaqs(partial), /dimensions/)).toBe("900 mm wide and 956 mm high. The rest are not published.");
  });

  it("gives no price for discontinued, a phone number for price on application, and no lease for either", () => {
    const gone = productFaqs(getProduct("gl174")!);
    expect(answer(gone, /How much/)).toContain("discontinued");
    expect(answer(gone, /lease/)).toBeUndefined();
    const poa = productFaqs({ ...getProduct("cr6d")!, stock: "poa", priceEx: null });
    expect(answer(poa, /How much/)).toContain("01229 480001");
  });
});

describe("homeFaqs and the trust points", () => {
  it("summarises the catalogue from the data", () => {
    const faqs = homeFaqs(products, types.length);
    expect(answer(faqs, /What does/)).toContain("23 types and 413 models");
    expect(answer(faqs, /How much/)).toMatch(/from £\d[\d,]*\.\d\d to £\d[\d,]*\.\d\d ex VAT/);
    expect(answer(faqs, /lease/)).toMatch(/available ovens? show/);
    expect(answer(faqs, /Where/)).toContain("Ulverston");
  });

  it("states four things Caterkwik say about themselves", () => {
    expect(WHY_CATERKWIK).toHaveLength(4);
    expect(WHY_CATERKWIK.map((w) => w.title)).toContain("Established 1994");
  });
});
