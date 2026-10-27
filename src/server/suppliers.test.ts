import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { form, redirectedTo, resetTestState, revalidated } from "@/test/next-mocks";

vi.mock("next/headers", async () => (await import("@/test/next-mocks")).headersMock);
vi.mock("next/cache", async () => (await import("@/test/next-mocks")).cacheMock);

import { createCategory, createProduct, type Actor } from "@/server/catalogue-admin";
import { db } from "@/server/db";
import { startSession } from "@/server/session";
import { removeCost, removeSupplier, saveBrands, saveCost, saveFeedColumns, saveSupplier, setSupplierActive } from "@/server/supplier-actions";
import {
  addSupplier, clearCost, createDraftsFromFeed, deleteSupplier, ensureSuppliers, feedUndercuts, importFeed, linkItem, overview, productCosts, recordCost, saveMapping,
  setBrands, supplierDetail, SupplierError, updateSupplier,
} from "@/server/suppliers";

const staff: Actor = { id: null, name: "Sam", source: "STAFF" };
let oven: string;
let fryer: string;

beforeEach(async () => {
  await resetTestState();
  await createCategory(staff, { slug: "ovens", label: "Ovens" });
  oven = (await createProduct(staff, { name: "Falcon G3101 Oven", categorySlug: "ovens", brand: "Falcon", priceEx: 1000, status: "ACTIVE" })).id;
  fryer = (await createProduct(staff, { name: "Lincat Fryer", categorySlug: "ovens", brand: "Lincat", priceEx: 500, status: "ACTIVE" })).id;
  await db.productDetail.create({ data: { productId: oven, mpn: "G3101" } });
  await db.productDetail.create({ data: { productId: fryer, mpn: "OG-8109" } });
  await ensureSuppliers();
});
afterAll(() => db.$disconnect());

const csv = (...rows: string[]) => ["Product Code,Manufacturer Code,Description,Brand,Net Price,Stock", ...rows].join("\n");

describe("suppliers", () => {
  it("seeds Uropa and the bracketed suppliers once, and leaves staff changes alone", async () => {
    expect(await db.supplier.count()).toBeGreaterThan(10);
    await updateSupplier(staff, "uropa", { active: false });
    await ensureSuppliers();
    expect((await db.supplier.findUniqueOrThrow({ where: { id: "uropa" } })).active).toBe(false);
    expect(await db.supplierBrand.count({ where: { supplierId: "uropa" } })).toBe(54);
  });

  it("adds, renames, switches type and removes one, logging each", async () => {
    const added = await addSupplier(staff, { name: "Cambro UK", website: "https://cambro.co.uk" });
    expect(added).toMatchObject({ id: "cambro-uk", kind: "DIRECT" });
    expect((await addSupplier(staff, { name: "Cambro UK" })).id).toBe("cambro-uk-2");
    await updateSupplier(staff, "cambro-uk", { name: "Cambro", kind: "FEED", notes: "x" });
    await deleteSupplier(staff, "cambro-uk");
    expect(await db.supplier.findUnique({ where: { id: "cambro-uk" } })).toBeNull();
    const log = await db.auditLog.findMany({ where: { entity: "supplier" }, orderBy: { createdAt: "asc" } });
    expect(log.map((l) => l.action)).toEqual(["create", "create", "update", "delete"]);
  });

  it("rejects bad input and unknown suppliers with a message", async () => {
    await expect(addSupplier(staff, { name: "x" })).rejects.toThrow("Give the supplier a name");
    await expect(addSupplier(staff, {})).rejects.toBeInstanceOf(SupplierError);
    await expect(addSupplier(staff, { name: "Okay", website: "ftp://x" })).rejects.toThrow("http");
    await expect(updateSupplier(staff, "nope", { name: "Nope" })).rejects.toThrow("no supplier");
    await expect(updateSupplier(staff, "uropa", { name: "" })).rejects.toThrow();
    await expect(deleteSupplier(staff, "nope")).rejects.toThrow("no supplier");
    await expect(setBrands(staff, "nope", "a")).rejects.toThrow("no supplier");
    await expect(saveMapping(staff, "nope", {})).rejects.toThrow("no supplier");
  });

  it("replaces a supplier's brands", async () => {
    expect(await setBrands(staff, "jestic", "Antunes\nHenney Penny, Antunes\n")).toBe(2);
    expect((await db.supplierBrand.findMany({ where: { supplierId: "jestic" } })).map((b) => b.brand).sort()).toEqual(["Antunes", "Henney Penny"]);
  });
});

describe("costs", () => {
  it("records a direct cost ex or inc VAT, replaces it, and clears it", async () => {
    await recordCost(staff, { productId: oven, supplierId: "middleby", cost: 120, basis: "inc", sku: "", note: "" });
    expect((await db.supplierPrice.findFirstOrThrow({ where: { productId: oven } })).costExPence).toBe(10000);
    const again = await recordCost(staff, { productId: oven, supplierId: "middleby", cost: 95.5, basis: "ex", sku: "", note: " trade " });
    expect(again).toMatchObject({ costExPence: 9550, note: "trade", source: "MANUAL" });
    expect(await db.supplierPrice.count()).toBe(1);
    expect(await clearCost(staff, again.id)).toBe(oven);
    expect(await db.supplierPrice.count()).toBe(0);
    expect(await clearCost(staff, "nope")).toBeNull();
  });

  it("rejects a bad cost, an unknown product or an unknown supplier", async () => {
    const base = { productId: oven, supplierId: "middleby", cost: 10, basis: "ex", sku: "", note: "" };
    await expect(recordCost(staff, { ...base, cost: 0 })).rejects.toThrow("more than");
    await expect(recordCost(staff, { ...base, productId: "gone" })).rejects.toThrow("product no longer");
    await expect(recordCost(staff, { ...base, supplierId: "gone" })).rejects.toThrow("supplier no longer");
  });
});

describe("feed import", () => {
  it("matches by part number, adds the rest as not on our site, and reports", async () => {
    const r = await importFeed(staff, "uropa", "price.csv", csv("U1,g3101,Falcon Oven,Falcon,£80.00,4", "U2,,Mystery Fryer,Lincat,50,0", "U3,OG 8109,Fryer,Lincat,,"));
    expect(r).toMatchObject({ rows: 3, matched: 2, unmatched: 1, created: 3, changed: 0 });
    expect(r.warnings.join(" ")).toContain("no usable cost");
    const d = await supplierDetail("uropa");
    expect(d?.linked).toBe(2);
    expect(d?.unmatched.map((u) => u.sku)).toEqual(["U2"]);
    expect(d?.unmatchedBrands).toEqual([{ brand: "Lincat", count: 1 }]);
    expect((await supplierDetail("uropa", { brand: "Falcon" }))?.unmatchedCount).toBe(0);
  });

  it("updates on a second load, keeps a cost the new file lacks, and keeps a hand link", async () => {
    await importFeed(staff, "uropa", "a.csv", csv("U1,G3101,Oven,Falcon,80,4", "U2,,Mystery,Lincat,50,1"));
    const mystery = await db.supplierPrice.findFirstOrThrow({ where: { sku: "U2" } });
    await linkItem(staff, mystery.id, fryer);
    const r = await importFeed(staff, "uropa", "b.csv", csv("U1,G3101,Oven,Falcon,75,3", "U2,,Mystery,Lincat,,"));
    expect(r).toMatchObject({ created: 0, changed: 1, matched: 2 });
    expect((await db.supplierPrice.findFirstOrThrow({ where: { sku: "U1" } })).costExPence).toBe(7500);
    expect(await db.supplierPrice.findFirstOrThrow({ where: { sku: "U2" } })).toMatchObject({ costExPence: 5000, productId: fryer });
  });

  it("leaves a part number shared by two of our products unmatched", async () => {
    await db.productDetail.update({ where: { productId: fryer }, data: { mpn: "G3101" } });
    const r = await importFeed(staff, "uropa", "a.csv", csv("U1,G3101,Oven,Falcon,80,4"));
    expect(r.matched).toBe(0);
    expect(r.warnings.join(" ")).toContain("more than one");
  });

  it("explains an empty file, or columns it cannot find, and uses saved columns", async () => {
    await expect(importFeed(staff, "uropa", "a.csv", "a,b")).rejects.toThrow("no rows");
    await expect(importFeed(staff, "nope", "a.csv", "a\n1")).rejects.toThrow("no supplier");
    await expect(importFeed(staff, "uropa", "a.csv", "foo,bar\n1,2")).rejects.toThrow("Set the columns");
    await saveMapping(staff, "uropa", { sku: "foo", cost: "bar", mpn: " " });
    const r = await importFeed(staff, "uropa", "a.csv", "foo,bar\nX1,9.99");
    expect(r).toMatchObject({ rows: 1, created: 1 });
  });

  it("links by hand only to a real product, and only once per supplier", async () => {
    await importFeed(staff, "uropa", "a.csv", csv("U1,G3101,Oven,Falcon,80,4", "U2,,Other,Falcon,70,1"));
    const u2 = await db.supplierPrice.findFirstOrThrow({ where: { sku: "U2" } });
    await expect(linkItem(staff, u2.id, "gone")).rejects.toThrow("no product");
    await expect(linkItem(staff, "gone", oven)).rejects.toThrow("no longer");
    await expect(linkItem(staff, u2.id, oven)).rejects.toThrow("already has a cost");
  });

  it("unlinks, rather than deletes, a feed row when cleared", async () => {
    await importFeed(staff, "uropa", "a.csv", csv("U1,G3101,Oven,Falcon,80,4"));
    const row = await db.supplierPrice.findFirstOrThrow({ where: { sku: "U1" } });
    expect(await clearCost(staff, row.id)).toBe(oven);
    expect((await db.supplierPrice.findUniqueOrThrow({ where: { id: row.id } })).productId).toBeNull();
  });
});

describe("reading", () => {
  beforeEach(async () => {
    await importFeed(staff, "uropa", "a.csv", csv("U1,G3101,Oven,Falcon,80,4", "U9,,Unknown,Lincat,10,1"));
    await recordCost(staff, { productId: oven, supplierId: "middleby", cost: 100, basis: "ex", sku: "", note: "" });
    await recordCost(staff, { productId: fryer, supplierId: "middleby", cost: 40, basis: "ex", sku: "", note: "" });
  });

  it("summarises each supplier", async () => {
    const o = await overview();
    expect(o.find((s) => s.id === "uropa")).toMatchObject({ items: 2, matched: 1, brands: 54 });
    expect(o.find((s) => s.id === "uropa")?.lastFeed).toBeInstanceOf(Date);
    expect(o.find((s) => s.id === "middleby")).toMatchObject({ items: 2, matched: 2, lastFeed: null });
  });

  it("shows a product's costs, margin inputs and where the feed undercuts direct", async () => {
    const c = await productCosts(oven);
    expect(c.rows.map((r) => r.supplier.id)).toEqual(["uropa", "middleby"]);
    expect(c.sellEx).toBe(100000);
    expect(c.comparison.feedSaving).toMatchObject({ pence: 2000 });
    expect((await productCosts("gone")).sellEx).toBeNull();
  });

  it("lists only products where a feed beats direct, biggest saving first, ignoring archived and paused", async () => {
    expect((await feedUndercuts()).map((u) => u.productId)).toEqual([oven]);
    await db.product.update({ where: { id: oven }, data: { status: "ARCHIVED" } });
    expect(await feedUndercuts()).toEqual([]);
    await db.product.update({ where: { id: oven }, data: { status: "ACTIVE" } });
    await updateSupplier(staff, "uropa", { active: false });
    expect(await feedUndercuts()).toEqual([]);
  });

  it("returns null for an unknown supplier", async () => expect(await supplierDetail("gone")).toBeNull());
});

describe("form actions", () => {
  async function asStaff() {
    await db.user.create({ data: { id: "u1", email: "a@b.co", name: "Sam", passwordHash: "x", role: "ADMIN" } });
    await startSession("u1");
  }

  it("sends a visitor to sign in", async () => {
    expect(await redirectedTo(() => saveSupplier({}, form({ name: "Acme" })))).toBe("/account/login?next=/admin");
  });

  it("adds, edits, pauses, sets brands and columns, then removes", async () => {
    await asStaff();
    expect(await saveSupplier({}, form({ name: "Acme Catering", kind: "FEED" }))).toEqual({ ok: true });
    expect(await saveSupplier({}, form({ name: "A" }))).toEqual({ error: "Give the supplier a name." });
    const { editSupplier } = await import("@/server/supplier-actions");
    expect(await editSupplier({}, form({ id: "acme-catering", name: "Acme", kind: "DIRECT", website: "", notes: "" }))).toEqual({ ok: true });
    await setSupplierActive(form({ id: "acme-catering", active: "false" }));
    expect((await db.supplier.findUniqueOrThrow({ where: { id: "acme-catering" } })).active).toBe(false);
    expect(await saveBrands({}, form({ id: "acme-catering", brands: "Falcon\nLincat" }))).toEqual({ ok: true });
    expect(await saveFeedColumns({}, form({ id: "acme-catering", sku: "Code", cost: "Net" }))).toEqual({ ok: true });
    expect((await db.supplier.findUniqueOrThrow({ where: { id: "acme-catering" } })).feedMapping).toEqual({ sku: "Code", cost: "Net" });
    expect(revalidated.length).toBeGreaterThan(0);
    expect(await redirectedTo(() => removeSupplier(form({ id: "acme-catering" })))).toBe("/admin/suppliers");
  });

  it("saves and clears a cost", async () => {
    await asStaff();
    expect(await saveCost({}, form({ productId: oven, supplierId: "middleby", cost: "£1,200.50" }))).toEqual({ ok: true });
    expect(await saveCost({}, form({ productId: oven, supplierId: "middleby", cost: "abc" }))).toMatchObject({ error: expect.any(String) });
    const row = await db.supplierPrice.findFirstOrThrow({ where: { productId: oven } });
    expect(row.costExPence).toBe(120050);
    expect(await redirectedTo(() => removeCost(form({ id: row.id })))).toBe(`/admin/products/${oven}`);
    expect(await redirectedTo(() => removeCost(form({ id: "gone", back: "/admin/suppliers/uropa" })))).toBe("/admin/suppliers/uropa");
    expect(await redirectedTo(() => removeCost(form({ id: "gone" })))).toBe("/admin/suppliers");
  });

  it("creates draft products from unmatched feed items and links them", async () => {
    await importFeed(staff, "uropa", "p.csv", csv("U1,NEW-1,Big Mixer,Sammic,100.00,3", "U2,G3101,Falcon Oven,Falcon,200.00,1"));
    const r = await createDraftsFromFeed(staff, "uropa", { categorySlug: "ovens" });
    expect(r.created).toBe(1);
    const item = await db.supplierPrice.findFirstOrThrow({ where: { sku: "U1" } });
    const p = await db.product.findUniqueOrThrow({ where: { id: item.productId! } });
    expect(p).toMatchObject({ status: "DRAFT", priceExPence: null, brand: "Sammic" });
    expect((await db.productDetail.findUniqueOrThrow({ where: { productId: p.id } })).mpn).toBe("NEW-1");
    await expect(createDraftsFromFeed(staff, "uropa", { categorySlug: "nope" })).rejects.toThrow(SupplierError);
  });
});
