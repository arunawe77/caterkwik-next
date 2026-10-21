import { describe, expect, it } from "vitest";
import { getProduct } from "@/lib/catalogue";
import { productJsonLd, specRows } from "@/lib/product-view";

describe("specRows", () => {
  it("formats published figures and leaves unpublished ones null", () => {
    const rows = Object.fromEntries(specRows(getProduct("slr9c")!.spec!));
    expect(rows).toMatchObject({ Fuel: "Natural gas or LPG", Width: "900 mm", Burners: "6", Warranty: "2 years", Oven: "Static",
      "Electrical supply": "None required", Castors: "Optional extra", Duty: "Standard" });

    const blank = specRows({
      fuel: [], width: null, depth: null, height: null, weight: null, ovenType: null, burners: null, kwTotal: null,
      phase: null, castors: null, duty: null, warrantyYears: null, source: "",
    });
    expect(blank.every(([, v]) => v === null)).toBe(true);

    const other = Object.fromEntries(specRows({ ...getProduct("slr9c")!.spec!, phase: "single", castors: "fitted", duty: "heavy", ovenType: "convection" }));
    expect(other).toMatchObject({ "Electrical supply": "Single phase", Castors: "Fitted", Duty: "Heavy duty", Oven: "Convection" });
    expect(Object.fromEntries(specRows({ ...getProduct("slr9c")!.spec!, phase: "three" }))["Electrical supply"]).toBe("Three phase");
    expect(Object.fromEntries(specRows({ ...getProduct("slr9c")!.spec!, phase: "dual" }))["Electrical supply"]).toBe("Dual");
  });
});

interface Ld {
  "@type": string;
  brand?: unknown;
  offers?: Record<string, unknown>;
  additionalProperty?: { value: unknown }[];
}
const ldOf = (p: Parameters<typeof productJsonLd>[0]) => productJsonLd(p) as unknown as Ld;

describe("productJsonLd", () => {
  it("describes an available product with its offer and specification", () => {
    const ld = ldOf(getProduct("slr9c")!);
    expect(ld["@type"]).toBe("Product");
    expect(ld.brand).toEqual({ "@type": "Brand", name: "Lincat" });
    expect(ld.offers).toMatchObject({ price: "1132.99", priceCurrency: "GBP", availability: "https://schema.org/InStock" });
    expect(ld.additionalProperty!).toContainEqual({ "@type": "PropertyValue", name: "Width", value: "900 mm" });
    expect(ld.additionalProperty!.every((p) => p.value !== null)).toBe(true);
  });

  it("marks a discontinued product with no price", () => {
    const ld = ldOf(getProduct("gl174")!);
    expect(ld.offers).toEqual({ "@type": "Offer", priceCurrency: "GBP", availability: "https://schema.org/Discontinued", url: expect.any(String) });
    expect(ld.offers!.price).toBeUndefined();
  });

  it("omits the offer for price on application, and the properties and brand when there are none", () => {
    const ld = ldOf(getProduct("shahitandooricharcoal") ?? getProduct("cr6d")!);
    expect(ld.additionalProperty).toBeUndefined();
    expect(ld.offers).toBeDefined();
    const poa = ldOf({ ...getProduct("cr6d")!, stock: "poa", priceEx: null, brand: null });
    expect(poa.offers).toBeUndefined();
    expect(poa.brand).toBeUndefined();
  });
});
