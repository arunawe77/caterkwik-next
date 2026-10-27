import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTestState } from "@/test/next-mocks";

vi.mock("next/headers", async () => (await import("@/test/next-mocks")).headersMock);
vi.mock("next/cache", async () => (await import("@/test/next-mocks")).cacheMock);

import { createCategory, createProduct, type Actor } from "@/server/catalogue-admin";
import { checkPrices, discoverListings } from "@/server/competitor-check";
import { ensureCompetitors } from "@/server/competitors";
import { db } from "@/server/db";

const staff: Actor = { id: null, name: "Auto", source: "STAFF" };
const HOST = "https://www.cateringhygiene.co.uk/shop";
const page = (sku: string, price: string, extra = "") =>
  `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: `Item ${sku}`, sku, offers: { price, priceCurrency: "GBP", availability: "InStock" } })}</script>${extra}`;

/** A fake internet: address -> [status, body]. Anything else is a 404. */
const web = (pages: Record<string, [number, string]>) => {
  const calls: string[] = [];
  const fetchFn = (async (url: string) => {
    calls.push(String(url));
    const [status, body] = pages[String(url)] ?? [404, "not found"];
    return new Response(body, { status });
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
};
const noWait = { sleep: async () => {} };

let oven: string;
beforeEach(async () => {
  await resetTestState();
  await createCategory(staff, { slug: "ovens", label: "Ovens" });
  oven = (await createProduct(staff, { name: "Buffalo CK164 Processor", categorySlug: "ovens", brand: "Buffalo", priceEx: 25000, status: "ACTIVE" })).id;
  await db.productDetail.create({ data: { productId: oven, mpn: "CK164" } });
  await ensureCompetitors();
});
afterAll(() => db.$disconnect());

describe("discoverListings", () => {
  it("finds a page by part number, confirms the SKU, and records an inc VAT price", async () => {
    const product = `${HOST}/buffalo-ck164-food-processor.html`;
    const { fetchFn, calls } = web({
      [`${HOST}/catalogsearch/result/?q=CK164`]: [200, `<a href="${product}">x</a><a href="${HOST}/unrelated-thing.html">y</a>`],
      [product]: [200, page("CK164", "322.8")],
    });
    const r = await discoverListings(staff, { fetchFn, ...noWait });
    expect(r).toMatchObject({ found: 1, notListed: 0 });
    expect(calls).toHaveLength(2);
    const row = await db.competitorPrice.findFirstOrThrow({ where: { productId: oven, competitorId: "catering-hygiene" } });
    expect(row).toMatchObject({ priceIncPence: 32280, priceExPence: 26900, url: product, lastError: null, inStock: true });
  });

  it("rejects a page whose SKU is a different product, and does not search again for 30 days", async () => {
    const product = `${HOST}/buffalo-ck164-lookalike.html`;
    const { fetchFn, calls } = web({ [`${HOST}/catalogsearch/result/?q=CK164`]: [200, `<a href="${product}">x</a>`], [product]: [200, page("CK165", "10")] });
    expect(await discoverListings(staff, { fetchFn, ...noWait })).toMatchObject({ found: 0, notListed: 1 });
    const row = await db.competitorPrice.findFirstOrThrow({ where: { productId: oven, competitorId: "catering-hygiene" } });
    expect(row).toMatchObject({ priceExPence: null, url: null, lastError: "Not listed on this site." });
    const again = await discoverListings(staff, { fetchFn, ...noWait });
    expect(again).toMatchObject({ found: 0, notListed: 0 });
    expect(calls).toHaveLength(2);
  });

  it("stops at once when the site refuses, and never touches the blocked sites", async () => {
    const { fetchFn, calls } = web({ [`${HOST}/catalogsearch/result/?q=CK164`]: [403, "Just a moment..."] });
    const r = await discoverListings(staff, { fetchFn, ...noWait });
    expect(r).toMatchObject({ failed: 1, stoppedEarly: true });
    expect(calls.every((u) => u.includes("cateringhygiene.co.uk"))).toBe(true);
  });

  it("waits the crawl delay between requests", async () => {
    const waits: number[] = [];
    const product = `${HOST}/buffalo-ck164-food-processor.html`;
    const { fetchFn } = web({ [`${HOST}/catalogsearch/result/?q=CK164`]: [200, `<a href="${product}">x</a>`], [product]: [200, page("CK164", "100")] });
    await discoverListings(staff, { fetchFn, sleep: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([30_000]);
  });

  it("stops when the time budget cannot fit another request", async () => {
    const { fetchFn } = web({ [`${HOST}/catalogsearch/result/?q=CK164`]: [200, `<a href="${HOST}/buffalo-ck164-x.html">x</a>`] });
    const r = await discoverListings(staff, { fetchFn, ...noWait, budgetMs: 1000 });
    expect(r.stoppedEarly).toBe(true);
  });
});

describe("checkPrices", () => {
  const url = `${HOST}/buffalo-ck164-food-processor.html`;
  const seed = () => db.competitorPrice.create({ data: { productId: oven, competitorId: "catering-hygiene", url, priceIncPence: 30000, priceExPence: 25000, theirName: "Old name", note: "keep me" } });

  it("updates a changed price, keeps the note, and adds a history row", async () => {
    await seed();
    const { fetchFn } = web({ [url]: [200, page("CK164", "336.00")] });
    const r = await checkPrices(staff, { fetchFn, ...noWait });
    expect(r).toMatchObject({ checked: 1, updated: 1, failed: 0 });
    const row = await db.competitorPrice.findFirstOrThrow({ where: { productId: oven }, include: { history: true } });
    expect(row).toMatchObject({ priceIncPence: 33600, priceExPence: 28000, note: "keep me", lastError: null });
    expect(row.history).toHaveLength(1);
  });

  it("records why a page could not be read and keeps the old price", async () => {
    await seed();
    const { fetchFn } = web({ [url]: [200, "<html>no data</html>"] });
    expect(await checkPrices(staff, { fetchFn, ...noWait })).toMatchObject({ failed: 1 });
    const row = await db.competitorPrice.findFirstOrThrow({ where: { productId: oven } });
    expect(row).toMatchObject({ priceIncPence: 30000, lastError: "No price could be read from the page." });
  });

  it("rejects a price in another currency", async () => {
    await seed();
    const body = `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", offers: { price: "10", priceCurrency: "EUR" } })}</script>`;
    await checkPrices(staff, { fetchFn: web({ [url]: [200, body] }).fetchFn, ...noWait });
    expect((await db.competitorPrice.findFirstOrThrow({ where: { productId: oven } })).lastError).toBe("The page prices in EUR, not pounds.");
  });

  it("pauses a site for a week after it blocks us", async () => {
    await seed();
    const blocked = web({ [url]: [403, "denied"] });
    expect(await checkPrices(staff, { fetchFn: blocked.fetchFn, ...noWait })).toMatchObject({ failed: 1, stoppedEarly: true });
    expect((await db.competitorPrice.findFirstOrThrow({ where: { productId: oven } })).lastError).toMatch(/^Blocked/);
    const next = web({ [url]: [200, page("CK164", "1")] });
    expect(await checkPrices(staff, { fetchFn: next.fetchFn, ...noWait })).toMatchObject({ checked: 0, skipped: 1 });
    expect(next.calls).toHaveLength(0);
  });

  it("ignores sites that are not automatic", async () => {
    await db.competitorPrice.create({ data: { productId: oven, competitorId: "nisbets", url: "https://www.nisbets.co.uk/x", priceExPence: 100 } });
    const { fetchFn, calls } = web({});
    expect(await checkPrices(staff, { fetchFn, ...noWait })).toMatchObject({ checked: 0 });
    expect(calls).toHaveLength(0);
  });
});
