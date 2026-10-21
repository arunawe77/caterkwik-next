import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestState } from "@/test/next-mocks";
import { db } from "@/server/db";
import { applyPlan, summarise } from "./apply";
import { createRun, executeRun } from "./run";
import { buildPlan, categorySlugs, normalUrl, productId } from "./plan";
import { parseRow, RowSplitter } from "./xlsx";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const cell = (col: string, r: number, v: string | null) => (v === null ? `<c r="${col}${r}"/>` : `<c r="${col}${r}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`);
const sheet = (rows: (string | null)[][]) =>
  `<worksheet><sheetData>${rows.map((row, i) => `<row r="${i + 1}">${row.map((v, c) => cell(String.fromCharCode(65 + c), i + 1, v)).join("")}</row>`).join("")}</sheetData></worksheet>`;

function workbook(sheets: Record<string, (string | null)[][]>): string {
  const names = Object.keys(sheets);
  const files: Record<string, Uint8Array> = {
    "xl/workbook.xml": strToU8(`<workbook xmlns:r="x"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<Relationships>${names.map((_, i) => `<Relationship Id="rId${i + 1}" Target="/xl/worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`),
  };
  names.forEach((n, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheet(sheets[n]))));
  const file = path.join(mkdtempSync(path.join(tmpdir(), "wb-")), "test.xlsx");
  writeFileSync(file, zipSync(files));
  return file;
}

describe("reading sheet XML", () => {
  it("keeps blanks as gaps, decodes entities and reads numbers", () => {
    const row = parseRow('<row r="2"><c r="A2" t="inlineStr"><is><t>Fish &amp; Chips</t></is></c><c r="B2"/><c r="D2"><v>84.99</v></c></row>');
    expect(row).toEqual(["Fish & Chips", null, undefined, "84.99"]);
  });

  it("completes a row that arrives in two chunks", () => {
    const rows: unknown[] = [];
    const s = new RowSplitter((r) => rows.push(r));
    s.push('<row r="1"><c r="A1" t="inlineStr"><is><t>one</t></is></c></row><row r="2"><c r="A2" t="inl');
    s.push('ineStr"><is><t>two</t></is></c></row>');
    expect(rows).toEqual([["one"], ["two"]]);
  });
});

describe("addresses and codes", () => {
  it("makes a slug from the whole address, and keeps the last segment for the seeded categories", () => {
    expect(categorySlugs("/shop/commercial-catering-equipment/commercial_refrigeration/bar_bottle_fridges")).toEqual({
      slug: "commercial_refrigeration-bar_bottle_fridges", legacySlug: "bar_bottle_fridges",
    });
    expect(categorySlugs(`/shop/commercial-catering-equipment/${"a".repeat(60)}/${"b".repeat(60)}`).slug.length).toBeLessThanOrEqual(80);
  });
  it("normalises addresses and ids", () => {
    expect(normalUrl("http://www.caterkwik.co.uk/shop/X/Y/?a=1")).toBe("/shop/x/y");
    expect(productId("AB 12/c")).toBe("ab-12-c");
  });
});

describe("building a plan", () => {
  const file = workbook({
    Summary: [["Caterkwik Food Prep: page index"]],
    Products: [
      ["Product code", "Product name", "Brand", "Status", "Categories listed in", "Category URLs", "Price ex VAT", "Price inc VAT", "Full description", "Colour"],
      ["AB1", "Mixer", "Sammic", "Active", "Food Prep > Mixers | Food Prep > Blenders", "https://www.caterkwik.co.uk/shop/commercial-catering-equipment/food/mixers/ | https://www.caterkwik.co.uk/shop/commercial-catering-equipment/food/blenders/", "84.98999999999999", null, "A mixer", "Red"],
      ["ab1", "Duplicate", null, "Active", null, null, null, null, null, null],
      ["ZZ9", "Old oven", null, "Discontinued", "Food Prep > Mixers", "https://www.caterkwik.co.uk/shop/commercial-catering-equipment/food/mixers/", null, null, null, null],
      ["PX1", "No price", null, "Active", null, null, null, null, null, null],
      [null, "No code", null, null, null, null, null, null, null, null],
    ],
    "Categories": [["Section", "Category path", "Category name", "URL", "Products listed on page", "HTTP status"], ["Food Prep", "Food Prep", "Food", "https://www.caterkwik.co.uk/shop/commercial-catering-equipment/food/", "0", "200"]],
    Options: [["Product code", "Group", "Option", "SKU", "Price ex VAT"], ["AB1", "Colour", "Please Select -", null, "0"], ["AB1", "Colour", "Red", "AB1R", "10"]],
    "Data flags": [["Product code", "Flags"], ["AB1", "dimensions look like cm | power looks wrong"]],
  });

  it("maps products, categories and details", async () => {
    const plan = await buildPlan(file);
    expect(plan.products.map((p) => p.id)).toEqual(["ab1", "zz9", "px1"]);
    expect(plan.skipped).toBe(2);
    expect(plan.warnings.join()).toMatch(/AB1 appears twice/i);

    const [mixer, oven, noPrice] = plan.products;
    expect(mixer).toMatchObject({ priceExPence: 8499, priceIncPence: 10199, availability: "IN_STOCK", categoryUrl: "/shop/commercial-catering-equipment/food/mixers" });
    expect(mixer.alsoInUrls).toEqual(["/shop/commercial-catering-equipment/food/blenders"]);
    expect(mixer.detail.attributes).toEqual({ Colour: "Red" });
    expect(mixer.detail.options).toEqual([{ group: "Colour", option: "Red", sku: "AB1R", priceEx: 10, addOn: null }]);
    expect(mixer.detail.dataFlags).toEqual(["dimensions look like cm", "power looks wrong"]);
    expect(oven.availability).toBe("DISCONTINUED");
    // In stock with no price can only be price on application.
    expect(noPrice.availability).toBe("POA");
    expect(noPrice.categoryUrl).toBe("/shop/uncategorised");
  });

  it("links categories to their parent and builds their path", async () => {
    const plan = await buildPlan(file);
    const mixers = plan.categories.find((c) => c.label === "Mixers")!;
    expect(mixers.parentUrl).toBe("/shop/commercial-catering-equipment/food");
    expect(mixers.path).toBe("Food Prep > Mixers");
    expect(plan.categories.find((c) => c.label === "Food")!.parentUrl).toBeNull();
  });
});

describe("writing to the database", () => {
  const file = workbook({
    Summary: [["Caterkwik Food Prep: page index"]],
    Products: [
      ["Product code", "Product name", "Brand", "Status", "Categories listed in", "Category URLs", "Price ex VAT", "Full description", "Main image"],
      ["AB1", "Mixer", "Sammic", "Active", "Food Prep > Mixers", "https://www.caterkwik.co.uk/shop/commercial-catering-equipment/food/mixers/", "100", "A mixer", "/shop/images/ab1.jpg"],
      ["OLD1", "Imported name", null, "Active", "Food Prep > Ovens", "https://www.caterkwik.co.uk/shop/commercial-catering-equipment/ovens/", "250", "New text", null],
    ],
    Reviews: [["Product code", "Date", "Score (+2 to -2)", "Review"], ["AB1", "17-Jun-2026", "2", "works great"]],
  });
  let published = 0;

  beforeEach(async () => {
    await resetTestState();
    // A catalogue that is already live: a seeded oven category with one product, as every real database has.
    await db.category.create({ data: { slug: "ovens", label: "Ovens", audience: "", cooking: [], supply: [], covers: [], sortOrder: 1 } });
    await db.product.create({ data: { id: "old1", token: "OLD1", name: "Our name", categorySlug: "ovens", alsoIn: [], image: "/assets/img/products/old1.jpg", priceExPence: 1, availability: "IN_STOCK", status: "ACTIVE" } });
    published = 0;
  });
  // Leave the database empty: the page tests expect to seed it themselves.
  afterAll(async () => {
    await resetTestState();
    await db.$disconnect();
  });

  const run = async (dryRun: boolean, options = { updateExisting: false, publish: false }) => {
    const r = await createRun(db, { actorName: "Sam", fileName: "test.xlsx", filePath: file, dryRun, options });
    await executeRun(db, r.id, { afterImport: async () => void published++ });
    return db.importRun.findUniqueOrThrow({ where: { id: r.id } });
  };

  it("checks first without writing, and says what would change", async () => {
    const r = await run(true);
    expect(r.status).toBe("DONE");
    expect(r.result).toMatchObject({ productsNew: 1, productsExisting: 1, categoriesNew: 1, categoriesAdopted: 1 });
    expect(await db.product.count()).toBe(1);
    expect(published).toBe(0);
  });

  it("adds new products as drafts, adopts a seeded category and leaves existing products alone", async () => {
    const r = await run(false);
    expect(r.status).toBe("DONE");
    expect(published).toBe(1);

    const mixer = await db.product.findUniqueOrThrow({ where: { id: "ab1" }, include: { detail: true } });
    expect(mixer).toMatchObject({ status: "DRAFT", token: "AB1", priceExPence: 10000, priceIncPence: 12000, categorySlug: "food-mixers", image: "https://www.caterkwik.co.uk/shop/images/ab1.jpg" });
    expect(mixer.detail?.reviews).toEqual([{ date: "17-Jun-2026", score: 2, text: "works great" }]);

    const old = await db.product.findUniqueOrThrow({ where: { id: "old1" }, include: { detail: true } });
    expect(old).toMatchObject({ name: "Our name", priceExPence: 1, categorySlug: "ovens", status: "ACTIVE" });
    expect(old.detail?.sourceFile).toBe("test.xlsx");

    const ovens = await db.category.findUniqueOrThrow({ where: { slug: "ovens" } });
    expect(ovens).toMatchObject({ label: "Ovens", sourceUrl: "/shop/commercial-catering-equipment/ovens", section: "Food Prep" });
    expect(await db.auditLog.count({ where: { action: "import" } })).toBe(1);
  });

  it("can be run again without duplicating anything, and updates only when asked", async () => {
    await run(false);
    await run(false);
    expect(await db.product.count()).toBe(2);
    expect(await db.productDetail.count()).toBe(2);
    expect(await db.category.count()).toBe(2);

    await run(false, { updateExisting: true, publish: false });
    expect(await db.product.findUniqueOrThrow({ where: { id: "old1" } })).toMatchObject({ name: "Imported name", priceExPence: 25000, description: "New text", status: "ACTIVE", categorySlug: "ovens", image: "/assets/img/products/old1.jpg" });
  });

  it("adds to a product's details on a second import instead of replacing them", async () => {
    await run(false);
    await db.productDetail.update({ where: { productId: "ab1" }, data: { attributes: { Wide: "yes" }, mpn: "KEEP", dataFlags: ["old flag"] } });
    await run(false);
    const d = await db.productDetail.findUniqueOrThrow({ where: { productId: "ab1" } });
    expect(d).toMatchObject({ mpn: "KEEP", attributes: { Wide: "yes" }, dataFlags: ["old flag"], reviews: [{ date: "17-Jun-2026", score: 2, text: "works great" }] });
  });

  it("publishes new products when asked", async () => {
    await run(false, { updateExisting: false, publish: true });
    expect((await db.product.findUniqueOrThrow({ where: { id: "ab1" } })).status).toBe("ACTIVE");
  });

  it("records a failure instead of throwing, and refuses an uncreated catalogue", async () => {
    const bad = await createRun(db, { actorName: "Sam", fileName: "nope.xlsx", filePath: "/does/not/exist.xlsx", dryRun: true, options: { updateExisting: false, publish: false } });
    await executeRun(db, bad.id);
    expect((await db.importRun.findUniqueOrThrow({ where: { id: bad.id } })).status).toBe("FAILED");

    await db.product.deleteMany();
    await db.category.deleteMany();
    const plan = await buildPlan(file);
    await expect(applyPlan(db, plan, { updateExisting: false, publish: false }, "test.xlsx")).rejects.toThrow(/not been created/);
    expect((await summarise(db, plan, { updateExisting: false, publish: false })).productsNew).toBe(2);
  });
});
