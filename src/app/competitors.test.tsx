import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTestState } from "@/test/next-mocks";

vi.mock("next/headers", async () => (await import("@/test/next-mocks")).headersMock);
vi.mock("next/cache", async () => (await import("@/test/next-mocks")).cacheMock);
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  notFound: () => { throw new Error("NOT_FOUND"); },
}));

import AdminHome from "@/app/(admin)/admin/page";
import CompetitorsPage from "@/app/(admin)/admin/competitors/page";
import PriceComparisonPage from "@/app/(admin)/admin/competitors/prices/page";
import ProductCompetitorPrices from "@/app/(admin)/admin/competitors/prices/[productId]/page";
import { createCategory, createProduct, type Actor } from "@/server/catalogue-admin";
import { ensureCompetitors, recordPrice } from "@/server/competitors";
import { db } from "@/server/db";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const sp = <T,>(v: T) => Promise.resolve(v);
const staff: Actor = { id: null, name: "Sam", source: "STAFF" };
let oven: string;

beforeEach(async () => {
  await resetTestState();
  await createCategory(staff, { slug: "ovens", label: "Ovens" });
  oven = (await createProduct(staff, { name: "Falcon G3101 Oven", categorySlug: "ovens", brand: "Falcon", priceEx: 1000, status: "ACTIVE" })).id;
  await ensureCompetitors();
});
afterAll(() => db.$disconnect());

describe("competitor pages", () => {
  it("list the six sites with nothing recorded yet", async () => {
    const out = html(await CompetitorsPage({ searchParams: Promise.resolve({}) }));
    for (const name of ["Catering Appliance", "Nisbets", "Catering Hygiene", "Alliance Online", "CS Catering Equipment", "Next Day Catering"]) expect(out).toContain(name);
    expect(out).toContain("None yet");
    expect(out).toContain("Add a competitor");
  });

  it("show prices, positions and out-of-date flags once recorded", async () => {
    await recordPrice(staff, { productId: oven, competitorId: "nisbets", price: 1100, basis: "ex", url: "https://www.nisbets.co.uk/falcon", theirName: "", inStock: false, note: "" });
    const home = html(await CompetitorsPage({ searchParams: Promise.resolve({}) }));
    expect(home).toContain("▼ -9.1%");
    expect(home).toContain("We are cheaper on average");

    const table = html(await PriceComparisonPage({ searchParams: sp({}) }));
    expect(table).toContain("Falcon G3101 Oven");
    expect(table).toContain("£1,100.00");
    expect(table).toContain("We are cheapest");
    expect(table).toContain("out of stock");

    expect(html(await PriceComparisonPage({ searchParams: sp({ show: "dearer" }) }))).toContain("No products here yet");
    expect(html(await PriceComparisonPage({ searchParams: sp({ show: "bogus", q: "zzz" }) }))).toContain("Nothing matches");
  });

  it("let staff record a price for one product", async () => {
    const empty = html(await ProductCompetitorPrices({ params: sp({ productId: oven }) }));
    expect(empty).toContain("Falcon G3101 Oven");
    expect(empty).toContain("Nothing recorded yet.");
    expect(empty).toContain("Save price");

    await recordPrice(staff, { productId: oven, competitorId: "nisbets", price: 1100, basis: "ex", url: "https://www.nisbets.co.uk/falcon", theirName: "", inStock: null, note: "" });
    await recordPrice(staff, { productId: oven, competitorId: "nisbets", price: 1050, basis: "ex", url: "https://www.nisbets.co.uk/falcon", theirName: "", inStock: null, note: "" });
    const filled = html(await ProductCompetitorPrices({ params: sp({ productId: oven }) }));
    expect(filled).toContain("Update price");
    expect(filled).toContain("Open their page");
    expect(filled).toContain("History");
    expect(filled).toContain("Clear Nisbets price");
  });

  it("show a 404 for an unknown product", async () => {
    await expect(ProductCompetitorPrices({ params: sp({ productId: "nope" }) })).rejects.toThrow("NOT_FOUND");
  });

  it("add a market panel to the dashboard", async () => {
    expect(html(await AdminHome({ searchParams: sp({}) }))).toContain("No competitor prices recorded yet.");
    await recordPrice(staff, { productId: oven, competitorId: "nisbets", price: 900, basis: "ex", url: "", theirName: "", inStock: null, note: "" });
    const out = html(await AdminHome({ searchParams: sp({}) }));
    expect(out).toContain("Against competitors");
    expect(out).toContain("Undercut");
    expect(out).toContain("▲ +11.1%");
  });
});
