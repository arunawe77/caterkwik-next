import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestState } from "@/test/next-mocks";
import { change, dailySales, enquiryPipeline, kpis, ordersByStatus, periodOf, rangeOf, salesByCategory, stockAlerts, topProducts } from "@/server/analytics";
import { db } from "@/server/db";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

beforeEach(resetTestState);
afterAll(() => db.$disconnect());

async function order(daysAgo: number, total: number, status: "PAID" | "AWAITING_PAYMENT" | "CANCELLED" | "SHIPPED" = "PAID", lines: [string, string, number, number][] = []) {
  return db.order.create({
    data: {
      status, createdAt: ago(daysAgo), email: "c@example.com", name: "C", phone: "1", addressLine1: "x", city: "c", postcode: "p", subtotalExPence: total, totalIncPence: total,
      lines: { create: lines.map(([productId, name, qty, unit]) => ({ productId, name, qty, unitExPence: unit, unitIncPence: unit })) },
    },
  });
}

describe("ranges and change", () => {
  it("accepts only the offered ranges", () => {
    expect(rangeOf("7")).toBe(7);
    expect(rangeOf("365")).toBe(30);
    expect(rangeOf("365", [7, 365])).toBe(365);
    expect(rangeOf(undefined)).toBe(30);
    expect(rangeOf("abc")).toBe(30);
  });

  it("measures change, and says nothing when there was nothing before", () => {
    expect(change(150, 100)).toBe(50);
    expect(change(50, 100)).toBe(-50);
    expect(change(10, 0)).toBeNull();
  });

  it("puts the previous period directly before the current one", () => {
    const now = new Date("2026-10-12T12:00:00Z");
    const { current, previous } = periodOf(7, now);
    expect(previous.to).toEqual(current.from);
    expect(current.to).toEqual(now);
  });
});

describe("kpis", () => {
  it("counts only paid orders, and compares with the period before", async () => {
    await order(2, 10000);
    await order(3, 20000, "SHIPPED");
    await order(4, 99900, "AWAITING_PAYMENT");
    await order(5, 99900, "CANCELLED");
    await order(40, 10000); // previous 30 day window
    await db.user.create({ data: { email: "new@example.com", name: "N", passwordHash: "x", createdAt: ago(1) } });
    await db.user.create({ data: { email: "staff@example.com", name: "S", passwordHash: "x", role: "ADMIN", createdAt: ago(1) } });
    await db.enquiry.create({ data: { kind: "QUOTE", name: "A", email: "a@b.co", message: "x", createdAt: ago(2) } });

    const { now, before } = await kpis(30);
    expect(now).toEqual({ revenue: 300, orders: 2, averageOrder: 150, newCustomers: 1, enquiries: 1 });
    expect(before).toMatchObject({ revenue: 100, orders: 1, averageOrder: 100, newCustomers: 0, enquiries: 0 });
  });

  it("has a zero average when nothing sold", async () => {
    expect((await kpis(7)).now).toMatchObject({ revenue: 0, orders: 0, averageOrder: 0 });
  });
});

describe("dailySales", () => {
  it("returns one point per day with zeros for quiet days", async () => {
    await order(0, 5000);
    await order(0, 2500);
    await order(2, 10000);
    const days = await dailySales(5);
    expect(days).toHaveLength(5);
    expect(days.map((d) => d.revenue)).toEqual([0, 0, 100, 0, 75]);
    expect(days.at(-1)).toMatchObject({ orders: 2 });
    expect(days[0].label).toMatch(/^\d{1,2} \w{3}$/);
    expect(new Set(days.map((d) => d.date)).size).toBe(5);
  });
});

describe("breakdowns", () => {
  it("groups orders by status in the period", async () => {
    await order(1, 100);
    await order(1, 100);
    await order(1, 100, "CANCELLED");
    await order(60, 100);
    const rows = await ordersByStatus(30);
    expect(rows.find((r) => r.status === "PAID")?.count).toBe(2);
    expect(rows.find((r) => r.status === "CANCELLED")?.count).toBe(1);
  });

  it("ranks best sellers by revenue and ignores unpaid orders", async () => {
    await order(1, 0, "PAID", [["a", "Oven A", 2, 10000], ["b", "Oven B", 1, 5000]]);
    await order(2, 0, "PAID", [["a", "Oven A", 1, 10000]]);
    await order(2, 0, "AWAITING_PAYMENT", [["c", "Oven C", 9, 99900]]);
    const top = await topProducts(30, 5);
    expect(top).toEqual([
      { id: "a", name: "Oven A", units: 3, revenue: 300 },
      { id: "b", name: "Oven B", units: 1, revenue: 50 },
    ]);
    expect(await topProducts(30, 1)).toHaveLength(1);
  });

  it("totals sales by the category a product sits in now, with deleted products as Other", async () => {
    await db.category.create({ data: { slug: "fryers", label: "Fryers" } });
    await db.product.create({ data: { id: "a", name: "A", categorySlug: "fryers", image: "/x.jpg" } });
    await order(1, 0, "PAID", [["a", "A", 1, 20000], ["gone", "Gone", 1, 5000]]);
    expect(await salesByCategory(30)).toEqual([{ name: "Fryers", revenue: 200 }, { name: "Other", revenue: 50 }]);
  });

  it("counts enquiries by stage and stock alerts for products on sale", async () => {
    await db.enquiry.createMany({ data: [
      { kind: "QUOTE", name: "A", email: "a@b.co", message: "x" },
      { kind: "QUOTE", name: "B", email: "b@b.co", message: "x", status: "DONE" },
    ] });
    expect(await enquiryPipeline()).toEqual({ NEW: 1, IN_PROGRESS: 0, DONE: 1 });

    await db.category.create({ data: { slug: "c", label: "C" } });
    const p = (id: string, stockQty: number | null, status: "ACTIVE" | "DRAFT" = "ACTIVE") => ({ id, name: id, categorySlug: "c", image: "/x", stockQty, status });
    await db.product.createMany({ data: [p("out", 0), p("low", 3), p("fine", 50), p("none", null), p("draft", 0, "DRAFT")] });
    expect(await stockAlerts()).toEqual({ out: 1, low: 1, untracked: 1 });
  });
});
