import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { form, redirectedTo, resetTestState, revalidated } from "@/test/next-mocks";

vi.mock("next/headers", async () => (await import("@/test/next-mocks")).headersMock);
vi.mock("next/cache", async () => (await import("@/test/next-mocks")).cacheMock);

import { createCategory, createProduct, type Actor } from "@/server/catalogue-admin";
import { removeCompetitor, removePrice, saveCompetitor, savePrice, setCompetitorActive } from "@/server/competitor-actions";
import {
  addCompetitor, clearPrice, comparison, CompetitorError, deleteCompetitor, ensureCompetitors, overview, productPrices, recordPrice, updateCompetitor,
} from "@/server/competitors";
import { db } from "@/server/db";
import { startSession } from "@/server/session";

const staff: Actor = { id: null, name: "Sam", source: "STAFF" };
let oven: string;
let fryer: string;

beforeEach(async () => {
  await resetTestState();
  await createCategory(staff, { slug: "ovens", label: "Ovens" });
  oven = (await createProduct(staff, { name: "Falcon G3101 Oven", categorySlug: "ovens", brand: "Falcon", priceEx: 1000, status: "ACTIVE" })).id;
  fryer = (await createProduct(staff, { name: "Lincat Fryer", categorySlug: "ovens", brand: "Lincat", priceEx: 500, status: "ACTIVE" })).id;
  await ensureCompetitors();
});
afterAll(() => db.$disconnect());

const price = (over: Record<string, unknown> = {}) => ({ productId: oven, competitorId: "nisbets", price: 1100, basis: "ex", url: "", theirName: "", inStock: null, note: "", ...over });

describe("competitors", () => {
  it("seeds the six sites once and leaves staff changes alone", async () => {
    expect(await db.competitor.count()).toBe(6);
    await updateCompetitor(staff, "nisbets", { active: false });
    await ensureCompetitors();
    expect(await db.competitor.count()).toBe(6);
    expect((await db.competitor.findUniqueOrThrow({ where: { id: "nisbets" } })).active).toBe(false);
  });

  it("adds, pauses, renames and removes one, logging each", async () => {
    const added = await addCompetitor(staff, { name: "Cash & Carry", domain: "https://www.cashcarry.co.uk/shop", notes: " cheap " });
    expect(added).toMatchObject({ id: "cash-and-carry", domain: "cashcarry.co.uk", url: "https://www.cashcarry.co.uk/", notes: "cheap" });
    // Same name, different site: the id gets a number rather than colliding.
    expect((await addCompetitor(staff, { name: "Cash and Carry", domain: "cash2.co.uk" })).id).toBe("cash-and-carry-2");
    await updateCompetitor(staff, "cash-and-carry", { active: false, name: "Cash Carry" });
    await deleteCompetitor(staff, "cash-and-carry");
    const log = await db.auditLog.findMany({ where: { entity: "competitor" }, orderBy: { createdAt: "asc" } });
    expect(log.map((l) => l.action)).toEqual(["create", "create", "update", "delete"]);
    expect(log[2].summary).toContain("paused, renamed");
  });

  it("rejects bad input and duplicates", async () => {
    await expect(addCompetitor(staff, { name: "x", domain: "nope" })).rejects.toThrow(CompetitorError);
    await expect(addCompetitor(staff, { name: "Nisbets again", domain: "www.nisbets.co.uk" })).rejects.toThrow("already on the list");
    await expect(addCompetitor(staff, { name: "Fine", domain: "fine.co.uk", url: "ftp://fine" })).rejects.toThrow("http");
    await expect(updateCompetitor(staff, "nope", { active: true })).rejects.toThrow("no competitor");
    await expect(updateCompetitor(staff, "nisbets", { domain: "catering-appliance.com" })).rejects.toThrow("already on the list");
    await expect(updateCompetitor(staff, "nisbets", { name: "" })).rejects.toThrow(CompetitorError);
    await expect(deleteCompetitor(staff, "nope")).rejects.toThrow("no competitor");
  });
});

describe("recording prices", () => {
  it("stores ex and inc VAT, keeps a history, and replaces the latest", async () => {
    await recordPrice(staff, price({ price: 1200, basis: "inc" }));
    let row = await db.competitorPrice.findFirstOrThrow({ where: { productId: oven } });
    expect(row).toMatchObject({ priceExPence: 100000, priceIncPence: 120000, competitorId: "nisbets", checkedBy: "Sam" });

    await recordPrice(staff, price({ price: 1100, url: "https://www.nisbets.co.uk/falcon", inStock: false, theirName: "Falcon oven" }));
    expect(await db.competitorPrice.count()).toBe(1);
    row = await db.competitorPrice.findFirstOrThrow({ where: { productId: oven } });
    expect(row).toMatchObject({ priceExPence: 110000, url: "https://www.nisbets.co.uk/falcon", inStock: false });
    const history = await db.competitorPriceLog.findMany({ orderBy: { checkedAt: "asc" } });
    expect(history.map((h) => h.priceExPence)).toEqual([100000, 110000]);
    expect(history[0].ourExPence).toBe(100000);
    const summaries = (await db.auditLog.findMany({ where: { entity: "competitor-price" }, orderBy: { createdAt: "asc" } })).map((l) => l.summary);
    expect(summaries).toEqual(['Nisbets on "Falcon G3101 Oven": £1000.00 ex VAT', 'Nisbets on "Falcon G3101 Oven": £1000.00 ex VAT to £1100.00 ex VAT']);
  });

  it("allows an in-stock note with no price, but not an empty entry", async () => {
    await recordPrice(staff, price({ price: null, inStock: true }));
    expect((await db.competitorPrice.findFirstOrThrow()).priceExPence).toBeNull();
    await expect(recordPrice(staff, price({ price: null }))).rejects.toThrow("Enter a price");
  });

  it("refuses a price of zero, another site's address, and unknown products or sites", async () => {
    await expect(recordPrice(staff, price({ price: 0 }))).rejects.toThrow("more than");
    await expect(recordPrice(staff, price({ url: "https://www.catering-appliance.com/x" }))).rejects.toThrow("must be on nisbets.co.uk");
    await expect(recordPrice(staff, price({ productId: "nope" }))).rejects.toThrow("product no longer");
    await expect(recordPrice(staff, price({ competitorId: "nope" }))).rejects.toThrow("competitor no longer");
    await expect(recordPrice(staff, { productId: oven })).rejects.toThrow(CompetitorError);
  });

  it("clears a price, and removing a competitor takes its prices with it", async () => {
    await recordPrice(staff, price());
    await recordPrice(staff, price({ competitorId: "catering-appliance", price: 900 }));
    await clearPrice(staff, oven, "nisbets");
    await clearPrice(staff, oven, "nisbets"); // already gone: no error
    expect(await db.competitorPrice.count()).toBe(1);
    await deleteCompetitor(staff, "catering-appliance");
    expect(await db.competitorPrice.count()).toBe(0);
    expect(await db.competitorPriceLog.count()).toBe(0);
  });
});

describe("reading", () => {
  beforeEach(async () => {
    await recordPrice(staff, price({ price: 1100 })); // oven: we are 1000 against 1100, cheapest
    await recordPrice(staff, price({ competitorId: "catering-appliance", price: 1200 }));
    await recordPrice(staff, price({ productId: fryer, price: 400 })); // fryer: we are 500 against 400, undercut
  });

  it("summarises positions, gaps and each site", async () => {
    const o = await overview();
    expect(o.positions).toMatchObject({ cheapest: 1, dearer: 1, level: 0 });
    expect(o.averageGap).toBeCloseTo((-9.0909 + -16.6667 + 25) / 3, 2);
    const nisbets = o.competitors.find((c) => c.id === "nisbets")!;
    expect(nisbets).toMatchObject({ tracked: 2, priced: 2, stale: 0 });
    expect(nisbets.lastChecked).toBeInstanceOf(Date);
    expect(o.competitors.find((c) => c.id === "alliance-online")).toMatchObject({ tracked: 0, averageGap: null, lastChecked: null });
    const later = await overview(new Date(Date.now() + 40 * 86_400_000));
    expect(later.competitors.find((c) => c.id === "nisbets")!.stale).toBe(2);
  });

  it("ignores paused competitors", async () => {
    await updateCompetitor(staff, "nisbets", { active: false });
    const o = await overview();
    expect(o.positions.dearer).toBe(0);
    expect(o.positions.cheapest).toBe(1);
  });

  it("lists products with their prices, filtered and searched", async () => {
    const all = await comparison({});
    expect(all.total).toBe(2);
    const row = all.rows.find((r) => r.id === oven)!;
    expect(row).toMatchObject({ ourEx: 100000, lowest: 110000, position: "cheapest" });
    expect(row.prices.nisbets?.ex).toBe(110000);
    expect((await comparison({ filter: "dearer" })).rows.map((r) => r.id)).toEqual([fryer]);
    expect((await comparison({ filter: "cheapest" })).rows.map((r) => r.id)).toEqual([oven]);
    expect((await comparison({ filter: "level" })).total).toBe(0);
    expect((await comparison({ filter: "tracked", q: "lincat" })).rows.map((r) => r.id)).toEqual([fryer]);
    expect((await comparison({ q: "falcon", pageSize: 1 })).rows).toHaveLength(1);
    expect((await comparison({ page: 2, pageSize: 1 })).rows).toHaveLength(1);
  });

  it("shows untracked products only when not filtering", async () => {
    await createProduct(staff, { name: "Untracked Grill", categorySlug: "ovens", priceEx: 300, status: "ACTIVE" });
    expect((await comparison({})).total).toBe(3);
    expect((await comparison({ filter: "tracked" })).total).toBe(2);
  });

  it("returns one product with every active site and its history", async () => {
    const data = await productPrices(oven);
    expect(data!.competitors).toHaveLength(6);
    expect(data!.prices.get("nisbets")?.priceExPence).toBe(110000);
    expect(data!.prices.has("alliance-online")).toBe(false);
    expect(await productPrices("nope")).toBeNull();
  });
});

describe("form handlers", () => {
  const signIn = async (role: "ADMIN" | "CUSTOMER" = "ADMIN") => {
    const user = await db.user.create({ data: { email: `${role}@example.com`, name: `${role} Person`, passwordHash: "x", role } });
    await startSession(user.id);
  };

  it("send anyone who is not staff to the login page and change nothing", async () => {
    await signIn("CUSTOMER");
    expect(await redirectedTo(() => saveCompetitor({}, form({ name: "Sneaky", domain: "sneaky.com" })))).toContain("/account/login");
    expect(await redirectedTo(() => removeCompetitor(form({ id: "nisbets" })))).toContain("/account/login");
    expect(await db.competitor.count()).toBe(6);
  });

  it("add, pause and remove a competitor", async () => {
    await signIn();
    expect(await saveCompetitor({}, form({ name: "Cash Carry", domain: "cashcarry.co.uk" }))).toEqual({ ok: true });
    expect(await saveCompetitor({}, form({ name: "x", domain: "bad" }))).toHaveProperty("error");
    expect(revalidated).toContain("/admin/competitors");
    await setCompetitorActive(form({ id: "cash-carry", active: "false" }));
    expect((await db.competitor.findUniqueOrThrow({ where: { id: "cash-carry" } })).active).toBe(false);
    await removeCompetitor(form({ id: "cash-carry" }));
    expect(await db.competitor.findUnique({ where: { id: "cash-carry" } })).toBeNull();
    await removeCompetitor(form({ id: "cash-carry" })); // already gone: no error
  });

  it("save and clear a price, reading the typed figure carefully", async () => {
    await signIn();
    const f = (over: Record<string, string> = {}) => form({ productId: oven, competitorId: "nisbets", price: "£1,100.50", basis: "ex", inStock: "yes", ...over });
    expect(await savePrice({}, f())).toEqual({ ok: true });
    expect(await db.competitorPrice.findFirstOrThrow()).toMatchObject({ priceExPence: 110050, inStock: true });
    expect(await savePrice({}, f({ price: "cheap" }))).toHaveProperty("error"); // not silently treated as blank
    expect((await db.competitorPrice.findFirstOrThrow()).priceExPence).toBe(110050);
    expect(await savePrice({}, f({ price: "", inStock: "no", basis: "" }))).toEqual({ ok: true });
    expect(await savePrice({}, f({ price: "", inStock: "" }))).toHaveProperty("error");
    expect(await redirectedTo(() => removePrice(form({ productId: oven, competitorId: "nisbets" })))).toBe(`/admin/competitors/prices/${oven}`);
    expect(await db.competitorPrice.count()).toBe(0);
  });
});
