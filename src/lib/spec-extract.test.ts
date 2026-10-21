import { describe, expect, it } from "vitest";
import { enrich, type RawDetails } from "@/lib/spec-extract";
import { familyFor } from "@/lib/spec-schema";

const base: RawDetails = { title: "", sellingPoints: [], details: [], dimensions: [], power: [], special: [], requirementIcons: [] };
const cat = (slug: string) => [`/shop/commercial-catering-equipment/${slug}/`];

describe("familyFor", () => {
  it("groups categories by what decides the purchase", () => {
    expect(familyFor(cat("commercialfryers/gas-freestanding-fryers")).id).toBe("fryer");
    expect(familyFor(cat("pizzaovens/twin_deck_pizza_ovens")).id).toBe("pizza");
    expect(familyFor(cat("bainmaries/bain-maries-gastronorm-pots")).id).toBe("hot-holding");
    expect(familyFor(cat("commercial_griddles/gasgriddles")).id).toBe("grill");
    expect(familyFor(cat("commercial-ovens/6-burner-range")).id).toBe("range");
    expect(familyFor(cat("smokers")).id).toBe("specialist");
  });
});

describe("enrich", () => {
  const fryer = enrich(cat("commercialfryers/gas-freestanding-fryers"), {
    ...base,
    title: "Imperial IFS-40-OP 22 Litre Single Tank Gas Fryer",
    details: [
      "Imperial single tank gas fryer, built for busy kitchens with a large cool zone and a full port drain valve for quick oil changes.",
      "Features:",
      "Stainless Steel Frypot with 22 litre oil capacity.",
      "Snap acting thermostat has a range from 93°C to 204°C",
      "Weight: 100kg",
      "1 YEAR PARTS & LABOUR WARRANTY!",
    ],
    dimensions: ["W394 x D775 x H1162mm", "Tank dimensions: W356 x D356mm"],
    power: ["31kW (105,000 BTU)", "Inlet: 3/4\" BSP."],
  });

  it("reads only what the page states, and keeps the line it came from", () => {
    expect(fryer.family).toBe("fryer");
    expect(fryer.specs.oilCapacity).toMatchObject({ value: 22, unit: "litres", source: "page" });
    expect(fryer.specs.oilCapacity.from).toMatch(/22 litre/i);
    expect(fryer.specs.width.value).toBe(394);
    expect(fryer.specs.depth.value).toBe(775);
    expect(fryer.specs.height.value).toBe(1162);
    expect(fryer.specs.weight.value).toBe(100);
    expect(fryer.specs.warranty.value).toBe("1 year");
  });

  it("reads a rating from a block the page splits across lines", () => {
    const e = enrich(cat("commercialfryers/electric-fryers"), { ...base, power: ["8.4kW", "230V, 50Hz, Single Phase - Requires hard wiring."] });
    expect(e.specs.electricKw.value).toBe(8.4);
    expect(e.specs.hardWired.value).toBe(true);
    expect(e.specs.phase.value).toBe("single");
  });

  it("does not take a gas rating for an electrical one", () => {
    const e = enrich(cat("commercial-ovens/4-burner"), { ...base, power: ["NAT gas power: 29kW, 99,000Btu/hr.", "LPG gas power: 26.5kW"] });
    expect(e.specs.gasKw.value).toBe(29);
    expect(e.specs.electricKw).toBeUndefined();
  });

  it("leaves a field out when nothing states it", () => {
    const e = enrich(cat("commercialfryers/gas-freestanding-fryers"), { ...base, title: "A fryer" });
    expect(Object.keys(e.specs)).toEqual([]);
  });

  it("splits prose, features and labelled specs, and drops section headers", () => {
    expect(fryer.overview).toHaveLength(1);
    expect(fryer.features).toContain("Stainless Steel Frypot with 22 litre oil capacity.");
    expect(fryer.features).not.toContain("Features:");
    expect(fryer.extra).toContainEqual(["Weight", "100kg"]);
  });

  it("lets a spec sheet fill what the page leaves blank, never overwrite it", () => {
    const e = enrich(cat("commercialfryers/gas-freestanding-fryers"), {
      ...base, details: ["Weight: 100kg"],
      pdf: [{ label: "Spec sheet", url: "u", text: "Oil capacity 20 litres\nWeight: 90kg" }],
    });
    expect(e.specs.weight).toMatchObject({ value: 100, source: "page" });
  });
});
