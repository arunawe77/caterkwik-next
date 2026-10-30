import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTestState } from "@/test/next-mocks";

vi.mock("next/headers", async () => (await import("@/test/next-mocks")).headersMock);
vi.mock("next/cache", async () => (await import("@/test/next-mocks")).cacheMock);

import type { FeedRow } from "@/lib/suppliers";
import { createCategory, createProduct, type Actor } from "@/server/catalogue-admin";
import { db } from "@/server/db";
import { applyFeed, ensureSuppliers } from "@/server/suppliers";
import { applyFeedPrices, createDraftsBulk, priceReview, setToWebPrice } from "@/server/uropa-sync";

const staff: Actor = { id: null, name: "Sam", source: "STAFF" };
const uropa = { id: "uropa", name: "Uropa" };
const row = (o: Partial<FeedRow> & { sku: string }): FeedRow => ({ mpn: null, brand: "Whites", name: "Bib Apron", costExPence: 1000, stockQty: 5, rrpPence: 1599, webPence: 1400, dropped: false, description: "An apron", groupName: "Clothing > Aprons", ...o });

let apron: string;
beforeEach(async () => {
  await resetTestState();
  await createCategory(staff, { slug: "aprons", label: "Aprons" });
  apron = (await createProduct(staff, { name: "Whites Chefs Apron", categorySlug: "aprons", brand: "Whites", priceEx: 10.5, status: "ACTIVE" })).id;
  await db.productDetail.create({ data: { productId: apron, mpn: "A279" } });
  await ensureSuppliers();
});
afterAll(() => db.$disconnect());

describe("uropa sync", () => {
  it("matches by the supplier code, then the part number, and records cost, stock and the extra price columns", async () => {
    const r = await applyFeed(staff, uropa, "Price.csv", [row({ sku: "A279" }), row({ sku: "ZZ1", mpn: "a-279", name: "Same by ref" }), row({ sku: "NEW1", name: "Not ours" })]);
    expect(r).toMatchObject({ rows: 3, matched: 2, unmatched: 1, created: 3 });
    const hit = await db.supplierPrice.findFirstOrThrow({ where: { supplierId: "uropa", sku: "A279" } });
    expect(hit).toMatchObject({ productId: apron, costExPence: 1000, stockQty: 5, rrpPence: 1599, webPence: 1400, dropped: false, groupName: "Clothing > Aprons" });
    expect((await db.supplierPrice.findFirstOrThrow({ where: { supplierId: "uropa", sku: "ZZ1" } })).productId).toBe(apron);
  });

  it("changes only what changed on a second load", async () => {
    await applyFeed(staff, uropa, "a.csv", [row({ sku: "A279" }), row({ sku: "NEW1" })]);
    const again = await applyFeed(staff, uropa, "b.csv", [row({ sku: "A279", costExPence: 900 }), row({ sku: "NEW1" })]);
    expect(again).toMatchObject({ created: 0, changed: 1, matched: 1, unmatched: 1 });
    expect((await db.supplierPrice.findFirstOrThrow({ where: { sku: "A279" } })).costExPence).toBe(900);
  });

  it("adds the unmatched lines whose category we have as drafts, and links them so the next sync matches", async () => {
    await applyFeed(staff, uropa, "a.csv", [
      row({ sku: "A279" }),
      row({ sku: "NEW1", name: "Cotton Apron", groupName: "Clothing > Aprons" }),
      row({ sku: "NEW2", name: "Mystery Item", brand: null, groupName: "Weird > Nowhere" }),
      row({ sku: "DROP1", name: "Dropped Item", dropped: true }),
      row({ sku: "NOCOST", name: "No Cost Item", costExPence: null }),
    ]);
    const made = await createDraftsBulk(staff);
    expect(made).toMatchObject({ created: 1, unplaced: 1 });
    const apronDraft = await db.product.findFirstOrThrow({ where: { name: "Whites Cotton Apron" }, include: { detail: true } });
    expect(apronDraft).toMatchObject({ status: "DRAFT", categorySlug: "aprons", priceExPence: null, brand: "Whites", stockQty: 5, description: "An apron" });
    expect(apronDraft.detail?.mpn).toBe("NEW1");
    expect(await db.product.count({ where: { name: "Mystery Item" } })).toBe(0);
    expect(await db.product.count({ where: { name: { in: ["Dropped Item", "No Cost Item"] } } })).toBe(0);
    expect((await db.supplierPrice.findFirstOrThrow({ where: { sku: "NEW1" } })).productId).toBe(apronDraft.id);
    // The next load matches the drafts rather than adding them again.
    const next = await applyFeed(staff, uropa, "b.csv", [row({ sku: "NEW1", name: "Cotton Apron" })]);
    expect(next).toMatchObject({ matched: 1, unmatched: 0, created: 0 });
    expect((await createDraftsBulk(staff)).created).toBe(0);
  });

  it("lists thin or missing selling prices, and applies Uropa's web price on request", async () => {
    await applyFeed(staff, uropa, "a.csv", [row({ sku: "A279", costExPence: 1040, webPence: 1300 }), row({ sku: "NEW1" })]);
    await createDraftsBulk(staff);
    expect((await db.product.findUniqueOrThrow({ where: { id: apron } })).priceExPence).toBe(1050);
    const review = await priceReview();
    expect(review.rows.map((r) => [r.name, r.reason])).toEqual([["Whites Chefs Apron", "thin margin"], ["Whites Bib Apron", "no price"]]);
    await setToWebPrice(staff, review.rows[0].priceId);
    expect((await db.product.findUniqueOrThrow({ where: { id: apron } })).priceExPence).toBe(1300);
    expect((await priceReview()).rows.map((r) => r.reason)).toEqual(["no price"]);
  });

  it("only adds brands marked as sold, when any are marked", async () => {
    await db.supplierBrand.create({ data: { supplierId: "uropa", brand: "Whites", selected: true } });
    await applyFeed(staff, uropa, "a.csv", [row({ sku: "NEW1", name: "Cotton Apron" }), row({ sku: "NEW2", name: "Other Apron", brand: "Elsewhere" })]);
    expect(await createDraftsBulk(staff)).toMatchObject({ created: 1, unplaced: 0 });
    expect(await db.product.count({ where: { name: "Elsewhere Other Apron" } })).toBe(0);
  });

  it("sets selling prices to Uropa's web price, including on new drafts, but never at or below cost, and keeps the old ones", async () => {
    await applyFeed(staff, uropa, "a.csv", [
      row({ sku: "A279", costExPence: 1040, webPence: 1300 }),
      row({ sku: "NEW1", name: "Cotton Apron", costExPence: 500, webPence: 900 }),
      row({ sku: "NEW2", name: "Loss Apron", costExPence: 800, webPence: 800 }),
    ]);
    await createDraftsBulk(staff);
    const r = await applyFeedPrices(staff);
    expect(r).toEqual({ updated: 2, belowCost: 1 });
    expect(await db.product.findUniqueOrThrow({ where: { id: apron } })).toMatchObject({ priceExPence: 1300, priceIncPence: 1560 });
    expect(await db.product.findFirstOrThrow({ where: { name: "Whites Cotton Apron" } })).toMatchObject({ status: "DRAFT", priceExPence: 900 });
    expect((await db.product.findFirstOrThrow({ where: { name: "Whites Loss Apron" } })).priceExPence).toBeNull();
    const log = await db.auditLog.findFirstOrThrow({ where: { summary: { startsWith: "Set 2 selling prices" } } });
    expect(log.before).toEqual([{ id: apron, priceExPence: 1050 }]);
    expect(await applyFeedPrices(staff)).toEqual({ updated: 0, belowCost: 1 });
  });
});
