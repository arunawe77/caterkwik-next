import { db } from "@/server/db";

// Numbers for the dashboard and analytics pages. A sale is an order that has been paid:
// paid, processing, shipped or completed. Everything is read from orders as they were placed,
// so changing a product's price later never rewrites history.

export const SOLD = ["PAID", "PROCESSING", "SHIPPED", "COMPLETED"] as const;
export const LOW_STOCK = 5;

export const RANGES = [7, 30, 90] as const;
export const LONG_RANGES = [7, 30, 90, 365] as const;
export const rangeOf = (raw: string | undefined, allowed: readonly number[] = RANGES) => (allowed.includes(Number(raw)) ? Number(raw) : 30);

const DAY = 86_400_000;
const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/London" }); // 2026-10-12

export interface Period {
  from: Date;
  to: Date;
}

export const periodOf = (days: number, now = new Date()): { current: Period; previous: Period } => ({
  current: { from: new Date(now.getTime() - days * DAY), to: now },
  previous: { from: new Date(now.getTime() - 2 * days * DAY), to: new Date(now.getTime() - days * DAY) },
});

export interface Kpis {
  revenue: number; // pounds inc VAT
  orders: number;
  averageOrder: number;
  newCustomers: number;
  enquiries: number;
}

async function kpisFor(p: Period): Promise<Kpis> {
  const range = { gte: p.from, lt: p.to };
  const [agg, customers, enquiries] = await Promise.all([
    db.order.aggregate({ where: { createdAt: range, status: { in: [...SOLD] } }, _sum: { totalIncPence: true }, _count: true }),
    db.user.count({ where: { createdAt: range, role: "CUSTOMER" } }),
    db.enquiry.count({ where: { createdAt: range } }),
  ]);
  const revenue = (agg._sum.totalIncPence ?? 0) / 100;
  return { revenue, orders: agg._count, averageOrder: agg._count ? revenue / agg._count : 0, newCustomers: customers, enquiries };
}

// Percentage change, or null when there was nothing before to compare with.
export const change = (now: number, before: number): number | null => (before === 0 ? null : ((now - before) / before) * 100);

export async function kpis(days: number) {
  const { current, previous } = periodOf(days);
  const [now, before] = await Promise.all([kpisFor(current), kpisFor(previous)]);
  return { now, before };
}

export interface DayPoint {
  date: string;
  label: string;
  revenue: number;
  orders: number;
}

// One point per day, zero where nothing sold, so a quiet day shows as a dip rather than a gap.
// Days are London calendar days whatever timezone the server runs in: the keys are built from the
// London date of `ending` by plain date arithmetic, never from the server's own midnight.
export async function dailySales(days: number, ending = new Date()): Promise<DayPoint[]> {
  const [y, m, d] = day(ending).split("-").map(Number);
  const dates = Array.from({ length: days }, (_, i) => new Date(Date.UTC(y, m - 1, d - (days - 1 - i))));
  const keys = dates.map((x) => x.toISOString().slice(0, 10));

  // Fetch a day early, so an order late on the first day is never missed to a timezone offset.
  const from = new Date(dates[0].getTime() - DAY);
  const orders = await db.order.findMany({
    where: { createdAt: { gte: from, lt: new Date(ending.getTime() + DAY) }, status: { in: [...SOLD] } },
    select: { createdAt: true, totalIncPence: true },
  });
  const by = new Map<string, { revenue: number; orders: number }>();
  for (const o of orders) {
    const k = day(o.createdAt);
    const cur = by.get(k) ?? { revenue: 0, orders: 0 };
    by.set(k, { revenue: cur.revenue + o.totalIncPence / 100, orders: cur.orders + 1 });
  }
  return dates.map((x, i) => ({
    date: keys[i],
    label: x.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
    ...(by.get(keys[i]) ?? { revenue: 0, orders: 0 }),
  }));
}

export async function ordersByStatus(days: number) {
  const rows = await db.order.groupBy({ by: ["status"], _count: true, where: { createdAt: { gte: periodOf(days).current.from } } });
  return rows.map((r) => ({ status: r.status, count: r._count }));
}

export async function topProducts(days: number, take = 6) {
  const lines = await db.orderLine.findMany({
    where: { order: { createdAt: { gte: periodOf(days).current.from }, status: { in: [...SOLD] } } },
    select: { productId: true, name: true, qty: true, unitIncPence: true },
  });
  const by = new Map<string, { id: string; name: string; units: number; revenue: number }>();
  for (const l of lines) {
    const cur = by.get(l.productId) ?? { id: l.productId, name: l.name, units: 0, revenue: 0 };
    by.set(l.productId, { ...cur, units: cur.units + l.qty, revenue: cur.revenue + (l.unitIncPence * l.qty) / 100 });
  }
  return [...by.values()].sort((a, b) => b.revenue - a.revenue).slice(0, take);
}

// Revenue by the category a product sits in now. A product that has since been deleted is "Other".
export async function salesByCategory(days: number, take = 6) {
  const [lines, products, categories] = await Promise.all([
    db.orderLine.findMany({
      where: { order: { createdAt: { gte: periodOf(days).current.from }, status: { in: [...SOLD] } } },
      select: { productId: true, qty: true, unitIncPence: true },
    }),
    db.product.findMany({ select: { id: true, categorySlug: true } }),
    db.category.findMany({ select: { slug: true, label: true } }),
  ]);
  const cat = new Map(products.map((p) => [p.id, p.categorySlug]));
  const label = new Map(categories.map((c) => [c.slug, c.label]));
  const by = new Map<string, number>();
  for (const l of lines) {
    const name = label.get(cat.get(l.productId) ?? "") ?? "Other";
    by.set(name, (by.get(name) ?? 0) + (l.unitIncPence * l.qty) / 100);
  }
  return [...by].map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, take);
}

export async function enquiryPipeline() {
  const rows = await db.enquiry.groupBy({ by: ["status"], _count: true });
  const n = (s: string) => rows.find((r) => r.status === s)?._count ?? 0;
  return { NEW: n("NEW"), IN_PROGRESS: n("IN_PROGRESS"), DONE: n("DONE") };
}

export async function stockAlerts() {
  const [out, low, untracked] = await Promise.all([
    db.product.count({ where: { status: "ACTIVE", stockQty: 0 } }),
    db.product.count({ where: { status: "ACTIVE", stockQty: { gt: 0, lte: LOW_STOCK } } }),
    db.product.count({ where: { status: "ACTIVE", stockQty: null } }),
  ]);
  return { out, low, untracked };
}
