import { describe, expect, it } from "vitest";
import { bothPrices, cleanDomain, exFromInc, gapOf, incFromEx, isStale, percentLabel, positionOf, SEED_COMPETITORS, slugOf, STALE_DAYS, urlOnDomain } from "@/lib/competitors";

describe("VAT", () => {
  it("converts whole pence both ways", () => {
    expect(incFromEx(143999)).toBe(172799);
    expect(exFromInc(172799)).toBe(143999);
  });
  it("turns a typed price into both figures, or nulls", () => {
    expect(bothPrices(1200, "ex")).toEqual({ ex: 120000, inc: 144000 });
    expect(bothPrices(1440, "inc")).toEqual({ ex: 120000, inc: 144000 });
    expect(bothPrices(null, "ex")).toEqual({ ex: null, inc: null });
  });
});

describe("gap and position", () => {
  it("measures our price against theirs", () => {
    expect(gapOf(110000, 100000)).toEqual({ pence: 10000, percent: 10 });
    expect(gapOf(90000, 100000)?.percent).toBe(-10);
  });
  it("gives no gap when either price is missing", () => {
    expect(gapOf(null, 100)).toBeNull();
    expect(gapOf(100, null)).toBeNull();
    expect(gapOf(100, 0)).toBeNull();
  });
  it("places us against the cheapest competitor", () => {
    expect(positionOf(90000, [100000, 95000])).toBe("cheapest");
    expect(positionOf(95000, [100000, 95000])).toBe("level");
    expect(positionOf(99000, [100000, 95000])).toBe("dearer");
    expect(positionOf(99000, [null])).toBe("untracked");
    expect(positionOf(99000, [])).toBe("untracked");
    expect(positionOf(null, [95000])).toBe("unpriced");
  });
  it("labels movement with an arrow and a sign", () => {
    expect(percentLabel(4.25)).toBe("▲ +4.3%");
    expect(percentLabel(-4.2)).toBe("▼ -4.2%");
    expect(percentLabel(0)).toBe("No difference");
  });
});

describe("staleness", () => {
  it("flags a price older than the limit", () => {
    const now = new Date("2026-10-14T12:00:00Z");
    expect(isStale(new Date(now.getTime() - (STALE_DAYS - 1) * 86_400_000), now)).toBe(false);
    expect(isStale(new Date(now.getTime() - (STALE_DAYS + 1) * 86_400_000), now)).toBe(true);
  });
});

describe("addresses", () => {
  it("accepts a page on the competitor's own domain only", () => {
    expect(urlOnDomain("https://www.nisbets.co.uk/oven/x", "nisbets.co.uk")).toBe(true);
    expect(urlOnDomain("https://shop.nisbets.co.uk/x", "nisbets.co.uk")).toBe(true);
    expect(urlOnDomain("https://evilnisbets.co.uk/x", "nisbets.co.uk")).toBe(false);
    expect(urlOnDomain("https://www.other.com/nisbets.co.uk", "nisbets.co.uk")).toBe(false);
    expect(urlOnDomain("javascript:alert(1)", "nisbets.co.uk")).toBe(false);
    expect(urlOnDomain("not a url", "nisbets.co.uk")).toBe(false);
  });
  it("tidies a typed domain and builds a slug", () => {
    expect(cleanDomain(" HTTPS://www.Nisbets.co.uk/shop ")).toBe("nisbets.co.uk");
    expect(slugOf("Cash & Carry Ltd.")).toBe("cash-and-carry-ltd");
  });
  it("seeds the six sites from the brief, each shop front on its own domain", () => {
    expect(SEED_COMPETITORS.map((c) => c.domain)).toEqual(["catering-appliance.com", "nisbets.co.uk", "cateringhygiene.co.uk", "allianceonline.co.uk", "cs-catering-equipment.co.uk", "nextdaycatering.co.uk"]);
    for (const c of SEED_COMPETITORS) expect(urlOnDomain(c.url, c.domain)).toBe(true);
  });
});
