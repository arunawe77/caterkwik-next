import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTestState } from "@/test/next-mocks";

vi.mock("next/cache", async () => (await import("@/test/next-mocks")).cacheMock);

import { cookingProducts, getProduct, getType, products, seedCookingMeta, seedCookingProducts } from "@/lib/catalogue";
import {
  adjustPrices, AdminError, bulkUpdateProducts, createCategory, createProduct, deleteCategory, deleteProduct,
  undoChange, updateCategory, updateProduct, type Actor,
} from "@/server/catalogue-admin";
import { ensureCatalogue, resetCatalogueLoader, seedCatalogue } from "@/server/catalogue-store";
import { db } from "@/server/db";

const staff: Actor = { id: null, name: "Sam", source: "STAFF" };
const ai: Actor = { id: null, name: "Assistant", source: "AI" };

beforeEach(async () => {
  await resetTestState();
  resetCatalogueLoader();
  await createCategory(staff, { slug: "fryers", label: "Fryers" });
});
afterAll(() => db.$disconnect());

describe("seeding", () => {
  it("fills an empty database from the scrape, once", async () => {
    await resetTestState();
    await ensureCatalogue();
    expect(await db.product.count()).toBe(413 + seedCookingProducts.length);
    expect(await db.category.count()).toBe(23 + seedCookingMeta.length);
    expect(products).toHaveLength(413);
    expect(cookingProducts).toHaveLength(seedCookingProducts.length);
    expect(getProduct("FALCONG31016BURNERGASOVEN")?.priceEx).toBe(1439.99);

    await seedCatalogue();
    expect(await db.product.count()).toBe(413 + seedCookingProducts.length);
  });
});

describe("products", () => {
  it("creates a draft that the storefront does not show until it is activated", async () => {
    const row = await createProduct(staff, { name: "Test Fryer 5", categorySlug: "fryers", priceEx: 100 });
    expect(row.status).toBe("DRAFT");
    expect(row.priceIncPence).toBe(12000);
    expect(getProduct(row.id)).toBeUndefined();

    await updateProduct(staff, row.id, { status: "ACTIVE" });
    expect(getProduct(row.id)?.priceEx).toBe(100);
    expect(getType("fryers")?.live).toBe(1);
  });

  it("gives colliding names distinct ids", async () => {
    const a = await createProduct(staff, { name: "Same Name", categorySlug: "fryers" });
    const b = await createProduct(staff, { name: "Same Name", categorySlug: "fryers" });
    expect([a.id, b.id]).toEqual(["same-name", "same-name-2"]);
  });

  it("refuses bad input and unknown categories", async () => {
    await expect(createProduct(staff, { name: "x", categorySlug: "fryers" })).rejects.toThrow(AdminError);
    await expect(createProduct(staff, { name: "Okay name", categorySlug: "nope" })).rejects.toThrow(/no category/);
    await expect(createProduct(staff, { name: "Okay name", categorySlug: "fryers", id: "hack" })).rejects.toThrow(AdminError);
    await expect(updateProduct(staff, "missing", { brand: "A" })).rejects.toThrow(/no product/);
    const row = await createProduct(staff, { name: "Fryer Two", categorySlug: "fryers" });
    await expect(updateProduct(staff, row.id, {})).rejects.toThrow(/Nothing/);
  });

  it("will not put an in-stock product on sale without a price", async () => {
    const row = await createProduct(staff, { name: "Fryer Three", categorySlug: "fryers" });
    await expect(updateProduct(staff, row.id, { status: "ACTIVE" })).rejects.toThrow(/needs a price/);
    await expect(createProduct(staff, { name: "Fryer Four", categorySlug: "fryers", status: "ACTIVE" })).rejects.toThrow(/needs a price/);
    await updateProduct(staff, row.id, { status: "ACTIVE", availability: "POA" });
    expect(getProduct(row.id)?.stock).toBe("poa");
  });

  it("keeps a missing figure null and requires a source for specs", async () => {
    const row = await createProduct(staff, { name: "Fryer Five", categorySlug: "fryers", priceEx: 50 });
    await expect(updateProduct(staff, row.id, { spec: { fuel: ["gas"] } })).rejects.toThrow(/source/);
    const done = await updateProduct(staff, row.id, { spec: { fuel: ["gas"], width: 400, source: "Maker data sheet" } });
    expect((done.spec as { depth: number | null }).depth).toBeNull();
    const cleared = await updateProduct(staff, row.id, { spec: null });
    expect(cleared.spec).toBeNull();
  });

  it("logs who changed what, and undo restores it", async () => {
    const row = await createProduct(ai, { name: "Fryer Six", categorySlug: "fryers", priceEx: 200, status: "ACTIVE" });
    await updateProduct(ai, row.id, { priceEx: 150 });
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "update" } });
    expect(log).toMatchObject({ source: "AI", actorName: "Assistant", entityId: row.id });
    expect(log.summary).toContain("£200.00 to £150.00");

    await undoChange(staff, log.id);
    expect((await db.product.findUniqueOrThrow({ where: { id: row.id } })).priceExPence).toBe(20000);
    expect(getProduct(row.id)?.priceEx).toBe(200);
    await expect(undoChange(staff, log.id)).rejects.toThrow(/already/);
  });

  it("undoes a create and a delete", async () => {
    const row = await createProduct(staff, { name: "Fryer Seven", categorySlug: "fryers", priceEx: 10 });
    await deleteProduct(staff, row.id);
    expect(await db.product.count()).toBe(0);
    await undoChange(staff, (await db.auditLog.findFirstOrThrow({ where: { action: "delete" } })).id);
    expect((await db.product.findUniqueOrThrow({ where: { id: row.id } })).name).toBe("Fryer Seven");

    await undoChange(staff, (await db.auditLog.findFirstOrThrow({ where: { action: "create", entity: "product" } })).id);
    expect(await db.product.count()).toBe(0);
    await expect(undoChange(staff, "nope")).rejects.toThrow(/not in the log/);
    const bulk = await db.auditLog.create({ data: { actorName: "x", source: "STAFF", action: "bulk-update", entity: "product", entityId: "a", summary: "s" } });
    await expect(undoChange(staff, bulk.id)).rejects.toThrow(/single product/);
  });
});

describe("bulk changes", () => {
  it("updates status for many and checks every row first", async () => {
    const a = await createProduct(staff, { name: "Bulk A", categorySlug: "fryers", priceEx: 10 });
    const b = await createProduct(staff, { name: "Bulk B", categorySlug: "fryers" });
    await expect(bulkUpdateProducts(staff, [a.id, b.id], { status: "ACTIVE" })).rejects.toThrow(/needs a price/);
    expect((await db.product.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("DRAFT");

    expect(await bulkUpdateProducts(staff, [a.id], { status: "ACTIVE" })).toEqual({ changed: 1 });
    await expect(bulkUpdateProducts(staff, [], { status: "ACTIVE" })).rejects.toThrow(/No products/);
    await expect(bulkUpdateProducts(staff, ["ghost"], { status: "ACTIVE" })).rejects.toThrow(/do not exist/);
    await expect(bulkUpdateProducts(staff, [a.id], { name: "x" })).rejects.toThrow(/Bulk edits/);
  });

  it("moves prices by a percentage, leaves unpriced ones alone and drops a stale was price", async () => {
    const a = await createProduct(staff, { name: "Price A", categorySlug: "fryers", priceEx: 100, wasEx: 110 });
    const b = await createProduct(staff, { name: "Price B", categorySlug: "fryers" });
    expect(await adjustPrices(staff, [a.id, b.id], 20)).toEqual({ changed: 1 });
    const moved = await db.product.findUniqueOrThrow({ where: { id: a.id } });
    expect([moved.priceExPence, moved.priceIncPence, moved.wasExPence]).toEqual([12000, 14400, null]);
    expect((await db.product.findUniqueOrThrow({ where: { id: b.id } })).priceExPence).toBeNull();

    await expect(adjustPrices(staff, [a.id], 0)).rejects.toThrow(/between/);
    await expect(adjustPrices(staff, [a.id], -95)).rejects.toThrow(/between/);
    await expect(adjustPrices(staff, [], 5)).rejects.toThrow(/between 1/);
    await expect(adjustPrices(staff, [b.id], 5)).rejects.toThrow(/None/);
  });
});

describe("categories", () => {
  it("creates, edits and deletes, but not while products remain", async () => {
    await expect(createCategory(staff, { slug: "fryers", label: "Again" })).rejects.toThrow(/already exists/);
    await expect(createCategory(staff, { slug: "Bad Slug", label: "x" })).rejects.toThrow(AdminError);
    const renamed = await updateCategory(staff, "fryers", { label: "Deep Fryers" });
    expect(renamed.label).toBe("Deep Fryers");
    await expect(updateCategory(staff, "fryers", {})).rejects.toThrow(/Nothing/);

    const p = await createProduct(staff, { name: "In Cat", categorySlug: "fryers" });
    await expect(deleteCategory(staff, "fryers")).rejects.toThrow(/still has 1 products/);
    await deleteProduct(staff, p.id);
    await deleteCategory(staff, "fryers");
    expect(await db.category.count()).toBe(0);
  });
});
