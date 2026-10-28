import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTestState } from "@/test/next-mocks";

vi.mock("next/headers", async () => (await import("@/test/next-mocks")).headersMock);
vi.mock("next/cache", async () => (await import("@/test/next-mocks")).cacheMock);

import { createCategory, createProduct, type Actor } from "@/server/catalogue-admin";
import { db } from "@/server/db";
import { deleteSlide, moveSlide, overview, RecommendationError, saveSlide, slidesFor, storefrontSlides } from "@/server/recommendations";

const staff: Actor = { id: null, name: "Sam", source: "STAFF" };
let a: string;
let b: string;
let c: string;

beforeEach(async () => {
  await resetTestState();
  await createCategory(staff, { slug: "ovens", label: "Ovens" });
  await createCategory(staff, { slug: "fryers", label: "Fryers" });
  a = (await createProduct(staff, { name: "Oven A", categorySlug: "ovens", priceEx: 100, status: "ACTIVE" })).id;
  b = (await createProduct(staff, { name: "Oven B", categorySlug: "ovens", priceEx: 200, status: "ACTIVE" })).id;
  c = (await createProduct(staff, { name: "Oven C", categorySlug: "ovens", priceEx: 300, status: "ARCHIVED" })).id;
});
afterAll(() => db.$disconnect());

const pick = (productId: string, over: Record<string, unknown> = {}) => ({ productId, chip: "Best value", heading: "Economy option", why: "The lowest price.", ...over });
const slide = (over: Record<string, unknown> = {}) => ({ categorySlug: "ovens", kicker: "Best for small kitchens", blurb: "Compact models.", recommender: "Melody", picks: [pick(a)], active: true, ...over });

describe("recommendations", () => {
  it("adds a slide, logs it, and puts it on the storefront in order", async () => {
    const one = await saveSlide(staff, null, slide());
    const two = await saveSlide(staff, null, slide({ kicker: "Second slide", recommender: "Kane", picks: [pick(a), pick(b, { chip: "Mid-range" })] }));
    expect([one.sortOrder, two.sortOrder]).toEqual([0, 1]);
    const live = await storefrontSlides("ovens");
    expect(live.map((s) => s.kicker)).toEqual(["Best for small kitchens", "Second slide"]);
    expect(live[1]).toMatchObject({ recommender: "Kane" });
    expect(live[1].picks.map((p) => p.productId)).toEqual([a, b]);
    expect(await db.auditLog.count({ where: { entity: "recommendation", action: "create" } })).toBe(2);
  });

  it("edits a slide in place and hides it without deleting", async () => {
    const row = await saveSlide(staff, null, slide());
    await saveSlide(staff, row.id, slide({ kicker: "Renamed", active: false }));
    expect((await slidesFor("ovens"))[0]).toMatchObject({ kicker: "Renamed", active: false });
    expect(await storefrontSlides("ovens")).toEqual([]);
    expect(await db.auditLog.count({ where: { entity: "recommendation", action: "update" } })).toBe(1);
  });

  it("validates what staff type", async () => {
    const bad = (over: Record<string, unknown>, message: string) => expect(saveSlide(staff, null, slide(over))).rejects.toThrow(message);
    await bad({ kicker: "x" }, "Give the slide a title");
    await bad({ recommender: "Nobody" }, "Choose who recommends it");
    await bad({ picks: [] }, "Add at least one product");
    await bad({ picks: [pick(a), pick(b), pick(a), pick(b)] }, "up to three");
    await bad({ picks: [pick(a, { chip: "" })] }, "short label");
    await bad({ picks: [pick(a), pick(a)] }, "twice");
    await bad({ picks: [pick("missing")] }, 'no product "missing"');
    await bad({ picks: [pick(c)] }, "archived");
    await bad({ categorySlug: "nope" }, "no category");
    await expect(saveSlide(staff, "gone", slide())).rejects.toThrow(RecommendationError);
  });

  it("reorders within a category and removes a slide", async () => {
    const one = await saveSlide(staff, null, slide({ kicker: "One" }));
    const two = await saveSlide(staff, null, slide({ kicker: "Two" }));
    await moveSlide(staff, two.id, "up");
    expect((await slidesFor("ovens")).map((s) => s.kicker)).toEqual(["Two", "One"]);
    await moveSlide(staff, two.id, "up");
    expect((await slidesFor("ovens")).map((s) => s.kicker)).toEqual(["Two", "One"]);
    expect(await deleteSlide(staff, one.id)).toBe("ovens");
    expect(await deleteSlide(staff, one.id)).toBeNull();
    expect((await slidesFor("ovens")).map((s) => s.kicker)).toEqual(["Two"]);
  });

  it("counts active slides per category for the overview", async () => {
    await saveSlide(staff, null, slide());
    await saveSlide(staff, null, slide({ active: false }));
    const o = await overview();
    expect(o.find((x) => x.slug === "ovens")?.slides).toBe(1);
    expect(o.find((x) => x.slug === "fryers")?.slides).toBe(0);
  });
});
