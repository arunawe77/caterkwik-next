import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { form, redirectedTo, resetTestState } from "@/test/next-mocks";

vi.mock("next/headers", async () => (await import("@/test/next-mocks")).headersMock);
vi.mock("next/cache", async () => (await import("@/test/next-mocks")).cacheMock);

import AnalyticsPage from "@/app/(admin)/admin/analytics/page";
import InventoryPage from "@/app/(admin)/admin/inventory/page";
import AdminHome from "@/app/(admin)/admin/page";
import AdminLayout from "@/app/(admin)/admin/layout";
import { StatTile } from "@/components/admin/stat-tile";
import { RangeTabs } from "@/components/admin/range-tabs";
import { createCategory, createProduct, type Actor } from "@/server/catalogue-admin";
import { setStock } from "@/server/catalogue-actions";
import { db } from "@/server/db";
import { startSession } from "@/server/session";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const params = <T,>(v: T) => Promise.resolve(v);
const staff: Actor = { id: null, name: "Sam", source: "STAFF" };

beforeEach(async () => {
  await resetTestState();
  const user = await db.user.create({ data: { email: "a@example.com", name: "Alex Admin", passwordHash: "x", role: "ADMIN" } });
  await startSession(user.id);
  await createCategory(staff, { slug: "fryers", label: "Fryers" });
});
afterAll(() => db.$disconnect());

const sale = (total: number, status: "PAID" | "AWAITING_PAYMENT" = "PAID") =>
  db.order.create({
    data: {
      status, email: "c@example.com", name: "Cam", phone: "1", addressLine1: "x", city: "c", postcode: "p", subtotalExPence: total, totalIncPence: total,
      lines: { create: [{ productId: "p1", name: "Oven One", unitExPence: total, unitIncPence: total, qty: 1 }] },
    },
  });

describe("stat tile", () => {
  it("shows direction with a sign and an arrow, not just colour", () => {
    expect(html(<StatTile label="Revenue" value="£10" delta={12.34} versus="vs before" />)).toContain("▲ +12.3%");
    expect(html(<StatTile label="Revenue" value="£10" delta={12.34} />)).toContain("delta good");
    const down = html(<StatTile label="Revenue" value="£10" delta={-5} />);
    expect(down).toContain("▼ -5.0%");
    expect(down).toContain("delta bad");
    expect(html(<StatTile label="Returns" value="1" delta={-5} goodWhenUp={false} />)).toContain("delta good");
    expect(html(<StatTile label="R" value="1" delta={null} />)).toContain("No earlier period");
    expect(html(<StatTile label="R" value="1" delta={0} />)).toContain("No change");
    expect(html(<StatTile label="R" value="1" />)).not.toContain("delta");
    expect(html(<StatTile label="R" value="1" href="/admin/orders" />)).toContain('href="/admin/orders"');
  });
});

describe("range tabs", () => {
  it("marks the current range and labels a year as 12 months", () => {
    const out = html(<RangeTabs ranges={[7, 365]} current={365} base="/admin/analytics" />);
    expect(out).toContain('href="/admin/analytics?range=7"');
    expect(out).toContain('aria-current="true"');
    expect(out).toContain("12 months");
  });
});

describe("dashboard", () => {
  it("shows revenue, a chart, best sellers and recent orders", async () => {
    await sale(120000);
    await sale(5000, "AWAITING_PAYMENT");
    await db.order.create({ data: { status: "PAID", createdAt: new Date(Date.now() - 10 * 86_400_000), email: "o@example.com", name: "Old", phone: "1", addressLine1: "x", city: "c", postcode: "p", subtotalExPence: 60000, totalIncPence: 60000 } });
    const out = html(await AdminHome({ searchParams: params({ range: "7" }) }));
    expect(out).toContain("£1,200.00");
    expect(out).toContain("<svg");
    expect(out).toContain("Oven One");
    expect(out).toContain("vs previous 7 days");
    expect(out).toContain("Recent orders");
    expect(out).toContain("Orders awaiting payment");
    expect(out).toContain("View as table");
  });

  it("copes with an empty shop", async () => {
    const out = html(await AdminHome({ searchParams: params({ range: "junk" }) }));
    expect(out).toContain("No sales in this period.");
    expect(out).toContain("No orders yet.");
    expect(out).toContain("No earlier period");
  });
});

describe("analytics", () => {
  it("renders the long ranges with two charts", async () => {
    await sale(50000);
    const out = html(await AnalyticsPage({ searchParams: params({ range: "365" }) }));
    expect(out).toContain("last 12 months");
    expect(out).toContain("Revenue by day");
    expect(out).toContain("Orders by day");
    expect(out).toContain("Quotes and enquiries");
    expect(out).toContain("Oven One");
  });
});

describe("layout", () => {
  it("has the top bar with search, the user and sign out, and the full menu", async () => {
    const out = html(await AdminLayout({ children: <p>inside</p> }));
    for (const label of ["Dashboard", "Analytics", "Products", "Add product", "Categories", "Inventory", "Orders", "Customers", "Redirects", "Activity log"]) expect(out).toContain(label);
    expect(out).toContain('name="q"');
    expect(out).toContain("Alex Admin");
    expect(out).toContain("Sign out");
  });
});

describe("inventory", () => {
  const product = (name: string, stockQty: number | null) => createProduct(staff, { name, categorySlug: "fryers", priceEx: 10, status: "ACTIVE", stockQty });

  it("lists stock, filters by out, low and untracked, and pages", async () => {
    await product("Zero Fryer", 0);
    await product("Few Fryer", 2);
    await product("Many Fryer", 40);
    await product("Blank Fryer", null);
    const show = async (sp: Record<string, string> = {}) => html(await InventoryPage({ searchParams: params(sp) }));

    const all = await show();
    expect(all).toContain("Zero Fryer");
    expect(all).toContain(">Out<");
    expect(all).toContain(">Low<");
    expect(all.indexOf("Zero Fryer")).toBeLessThan(all.indexOf("Many Fryer"));
    expect(all.indexOf("Many Fryer")).toBeLessThan(all.indexOf("Blank Fryer"));

    const out = await show({ show: "out" });
    expect(out).toContain("Zero Fryer");
    expect(out).not.toContain("Few Fryer");
    expect(await show({ show: "low" })).toContain("Few Fryer");
    expect(await show({ show: "untracked" })).toContain("Blank Fryer");
    expect(await show({ show: "bogus" })).toContain("Many Fryer");
    expect(await show({ q: "many" })).not.toContain("Zero Fryer");
    expect(await show({ error: "Oops" })).toContain("Oops");
    expect(await show({ q: "nothing-here" })).toContain("Nothing matches.");

    for (let i = 0; i < 31; i++) await product(`Filler ${i}`, 10);
    const first = await show({ show: "all" });
    expect(first).toContain("Page 1 of 2");
    expect(first).toContain("page=2");
    expect(await show({ page: "2" })).toContain("Previous");
  });

  it("saves a count, clears it to untracked, and refuses nonsense", async () => {
    const p = await product("Edit Fryer", 5);
    const save = (qty: string, back?: string) => redirectedTo(() => setStock(form({ id: p.id, stockQty: qty, back })));
    expect(await save("12")).toBe("/admin/inventory");
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stockQty).toBe(12);
    expect(await save("")).toBe("/admin/inventory");
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stockQty).toBeNull();
    expect(await save("2.5")).toContain("/admin/inventory?error=Stock%20must%20be%20a%20whole%20number");
    expect(await save("-3", "/admin/inventory?show=low")).toContain("/admin/inventory?show=low&error=");
    expect(await save("abc")).toContain("error=");
  });

  it("is staff only", async () => {
    await db.session.deleteMany();
    expect(await redirectedTo(() => setStock(form({ id: "x", stockQty: "1" })))).toBe("/account/login?next=/admin");
  });
});
