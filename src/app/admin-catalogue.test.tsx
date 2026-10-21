import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { form, redirectedTo, resetTestState, revalidated } from "@/test/next-mocks";

vi.mock("next/headers", async () => (await import("@/test/next-mocks")).headersMock);
vi.mock("next/cache", async () => (await import("@/test/next-mocks")).cacheMock);

import ActivityPage from "@/app/(admin)/admin/activity/page";
import CategoriesPage from "@/app/(admin)/admin/categories/page";
import CustomersPage from "@/app/(admin)/admin/customers/page";
import AdminHome from "@/app/(admin)/admin/page";
import EditProductPage from "@/app/(admin)/admin/products/[id]/page";
import NewProductPage from "@/app/(admin)/admin/products/new/page";
import ProductsPage from "@/app/(admin)/admin/products/page";
import SearchPage from "@/app/(shop)/search/page";
import ProductPage from "@/app/(shop)/ovens/[type]/[id]/page";
import { getProduct } from "@/lib/catalogue";
import { searchProducts } from "@/lib/search";
import { createCategory, createProduct, type Actor } from "@/server/catalogue-admin";
import {
  bulkProducts, removeCategory, removeProduct, saveCategory, saveProduct, undo,
} from "@/server/catalogue-actions";
import { resetCatalogueLoader } from "@/server/catalogue-store";
import { db } from "@/server/db";
import { startSession } from "@/server/session";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const params = <T,>(v: T) => Promise.resolve(v);
const staff: Actor = { id: null, name: "Sam", source: "STAFF" };

beforeEach(async () => {
  await resetTestState();
  resetCatalogueLoader();
  await createCategory(staff, { slug: "fryers", label: "Fryers" });
});
afterAll(() => db.$disconnect());

const signIn = async (role: "ADMIN" | "CUSTOMER" = "ADMIN") => {
  const user = await db.user.create({ data: { email: `${role}@example.com`, name: `${role} Person`, passwordHash: "x", role } });
  await startSession(user.id);
  return user;
};

const product = (name: string, over: Record<string, unknown> = {}) =>
  createProduct(staff, { name, categorySlug: "fryers", priceEx: 100, status: "ACTIVE", brand: "Acme", ...over });

const fields = (over: Record<string, string | undefined> = {}) => ({
  name: "Hotpoint Fryer", brand: "Hotpoint", categorySlug: "fryers", image: "", status: "ACTIVE", availability: "IN_STOCK", priceEx: "250", priceInc: "",
  wasEx: "", leaseWeek: "", stockQty: "4", description: "A fryer.", seoTitle: "", seoDescription: "", ...over,
});

describe("access", () => {
  it("only lets staff post the catalogue forms", async () => {
    const attempts: [string, () => Promise<unknown>][] = [
      ["saveProduct", () => saveProduct({}, form(fields()))],
      ["removeProduct", () => removeProduct(form({ id: "x" }))],
      ["bulkProducts", () => bulkProducts(form({ op: "status:ACTIVE" }))],
      ["undo", () => undo(form({ id: "x" }))],
      ["saveCategory", () => saveCategory({}, form({ slug: "a", label: "Aa" }))],
      ["removeCategory", () => removeCategory(form({ slug: "fryers" }))],
    ];
    for (const [name, run] of attempts) expect(await redirectedTo(run), name).toBe("/account/login?next=/admin");
    await signIn("CUSTOMER");
    expect(await redirectedTo(() => saveProduct({}, form(fields())))).toBe("/account/login?next=/admin");
    expect(await db.product.count()).toBe(0);
  });
});

describe("product forms", () => {
  beforeEach(async () => {
    await signIn();
  });

  it("creates a draft and goes to its page; the storefront shows it once it is on sale", async () => {
    const to = await redirectedTo(() => saveProduct({}, form(fields({ status: "DRAFT" }))));
    expect(to).toBe("/admin/products/hotpoint-fryer?created=1");
    const row = await db.product.findUniqueOrThrow({ where: { id: "hotpoint-fryer" } });
    expect([row.priceExPence, row.priceIncPence, row.stockQty, row.status]).toEqual([25000, 30000, 4, "DRAFT"]);
    expect(getProduct("hotpoint-fryer")).toBeUndefined();

    expect(await saveProduct({}, form({ ...fields(), id: "hotpoint-fryer", status: "ACTIVE", priceEx: "£300.50" }))).toEqual({ ok: true });
    expect(getProduct("hotpoint-fryer")?.priceEx).toBe(300.5);
    expect(html(await ProductPage({ params: params({ type: "fryers", id: "hotpoint-fryer" }) }))).toContain("Hotpoint Fryer");
    expect(searchProducts("hotpoint")[0]?.id).toBe("hotpoint-fryer");
    expect(html(await SearchPage({ searchParams: params({ q: "hotpoint" }) }))).toContain("Hotpoint Fryer");
    expect(revalidated).toContain("/admin/products");
  });

  it("keeps a typed inc VAT price, and clears an unpublished price to null", async () => {
    await redirectedTo(() => saveProduct({}, form(fields({ priceInc: "299" }))));
    expect((await db.product.findUniqueOrThrow({ where: { id: "hotpoint-fryer" } })).priceIncPence).toBe(29900);
    await saveProduct({}, form({ ...fields({ priceEx: "", priceInc: "", status: "DRAFT", availability: "POA" }), id: "hotpoint-fryer" }));
    const row = await db.product.findUniqueOrThrow({ where: { id: "hotpoint-fryer" } });
    expect([row.priceExPence, row.priceIncPence]).toEqual([null, null]);
  });

  it("explains what is wrong instead of saving", async () => {
    expect(await saveProduct({}, form(fields({ priceEx: "lots" })))).toEqual({ error: "Price ex VAT must be a number." });
    expect(await saveProduct({}, form(fields({ stockQty: "2.5" })))).toEqual({ error: expect.stringContaining("whole number") });
    expect(await saveProduct({}, form(fields({ categorySlug: "ghost" })))).toEqual({ error: expect.stringContaining("no category") });
    expect(await saveProduct({}, form(fields({ priceEx: "" })))).toEqual({ error: expect.stringContaining("needs a price") });
    expect(await db.product.count()).toBe(0);
  });

  it("deletes a product", async () => {
    const p = await product("Gone Fryer");
    expect(await redirectedTo(() => removeProduct(form({ id: p.id })))).toBe("/admin/products");
    expect(await db.product.count()).toBe(0);
  });

  it("applies bulk actions to the ticked products and reports a refusal in the address", async () => {
    const a = await product("Bulk One");
    const b = await product("Bulk Two");
    const unpriced = await createProduct(staff, { name: "No Price", categorySlug: "fryers" });
    const bulk = (op: string, ids: string[], back?: string) => {
      const f = form({ op, back });
      ids.forEach((id) => f.append("ids", id));
      return redirectedTo(() => bulkProducts(f));
    };

    expect(await bulk("price:-10", [a.id, b.id])).toBe("/admin/products");
    expect((await db.product.findUniqueOrThrow({ where: { id: a.id } })).priceExPence).toBe(9000);
    expect(await bulk("status:ARCHIVED", [a.id], "/admin/products?q=x")).toBe("/admin/products?q=x");
    expect((await db.product.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("ARCHIVED");
    expect(await bulk("availability:POA", [b.id])).toBe("/admin/products");

    expect(await bulk("status:ACTIVE", [unpriced.id])).toContain("/admin/products?error=An%20in-stock%20product");
    expect(await bulk("status:ACTIVE", [unpriced.id], "/admin/products?q=x")).toContain("/admin/products?q=x&error=");
    expect(await bulk("", [a.id])).toContain("error=Choose%20an%20action");
  });

  it("undoes a change from the activity log", async () => {
    const p = await product("Undo Me");
    await saveProduct({}, form({ ...fields({ name: "Undo Me", priceEx: "50" }), id: p.id }));
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "update" } });
    expect(await redirectedTo(() => undo(form({ id: log.id })))).toBe("/admin/activity");
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).priceExPence).toBe(10000);
    expect(await redirectedTo(() => undo(form({ id: log.id })))).toBe("/admin/activity");
  });
});

describe("category forms", () => {
  beforeEach(async () => {
    await signIn();
  });

  it("adds, edits and deletes a category", async () => {
    expect(await saveCategory({}, form({ existing: "0", slug: "grills", label: "Grills", cooking: "a, b ,", supply: "gas", covers: "" }))).toEqual({ ok: true });
    expect((await db.category.findUniqueOrThrow({ where: { slug: "grills" } })).cooking).toEqual(["a", "b"]);
    expect(await saveCategory({}, form({ existing: "1", slug: "grills", label: "Chargrills", audience: "Steakhouses" }))).toEqual({ ok: true });
    expect((await db.category.findUniqueOrThrow({ where: { slug: "grills" } })).label).toBe("Chargrills");
    expect(await saveCategory({}, form({ existing: "0", slug: "grills", label: "Again" }))).toEqual({ error: expect.stringContaining("already exists") });

    expect(await redirectedTo(() => removeCategory(form({ slug: "grills" })))).toBe("/admin/categories");
    await product("Holds Category");
    expect(await redirectedTo(() => removeCategory(form({ slug: "fryers" })))).toContain("/admin/categories?error=");
  });
});

describe("admin pages", () => {
  beforeEach(async () => {
    await signIn();
  });

  it("lists, filters, searches and pages the products", async () => {
    await product("Alpha Fryer", { brand: "Acme" });
    await product("Beta Fryer", { brand: "Zeta", status: "DRAFT" });
    await createProduct(staff, { name: "Gamma Fryer", categorySlug: "fryers", availability: "POA" });
    const list = async (sp: Record<string, string> = {}) => html(await ProductsPage({ searchParams: params(sp) }));

    const all = await list();
    expect(all).toContain("3 products");
    expect(all).toContain("Not published");
    expect(all).toContain('name="ids"');
    expect(await list({ q: "alpha" })).not.toContain("Beta Fryer");
    expect(await list({ q: "zeta" })).toContain("Beta Fryer");
    expect(await list({ status: "DRAFT" })).toContain("2 products");
    expect(await list({ status: "ARCHIVED" })).toContain("0 products");
    expect(await list({ availability: "POA" })).toContain("Gamma Fryer");
    expect(await list({ category: "nope" })).toContain("No products match.");
    expect(await list({ missing: "price" })).toContain("0 products missing price");
    expect(await list({ missing: "description" })).toContain("missing description");
    expect(await list({ missing: "seo" })).toContain("missing seo");
    expect(await list({ error: "Oops" })).toContain("Oops");
    expect(await list({ page: "9" })).toContain("Page 9 of 1");

    for (let i = 0; i < 26; i++) await product(`Filler ${i}`);
    const first = await list();
    expect(first).toContain("Page 1 of 2");
    expect(first).toContain("page=2");
    expect(await list({ page: "2", q: "" })).toContain("Previous");
  });

  it("renders the new and edit product pages", async () => {
    expect(html(await NewProductPage())).toContain("Create product");
    const p = await product("Edit Fryer", { description: "Nice", stockQty: 3, wasEx: 120, leaseWeek: 4 });
    await db.product.update({ where: { id: p.id }, data: { spec: { fuel: ["gas"], width: 600, depth: null, source: "Data sheet" } } });
    const out = html(await EditProductPage({ params: params({ id: p.id }), searchParams: params({ created: "1" }) }));
    expect(out).toContain("Save changes");
    expect(out).toContain('value="100.00"');
    expect(out).toContain("Product created as a draft.");
    expect(out).toContain("View on shop");
    expect(out).toContain("Source: Data sheet");
    expect(out).toContain("Not published");
    expect(out).toContain("Delete this product");

    const bare = await createProduct(staff, { name: "Bare Fryer", categorySlug: "fryers" });
    const plain = html(await EditProductPage({ params: params({ id: bare.id }), searchParams: params({}) }));
    expect(plain).toContain("None recorded");
    expect(plain).toContain("Created product");
    await expect(EditProductPage({ params: params({ id: "missing" }), searchParams: params({}) })).rejects.toThrow();
  });

  it("shows the legacy reference when it differs from the address", async () => {
    await db.product.create({ data: { id: "cr6d", token: "CR6D-LEGACY", name: "Legacy", categorySlug: "fryers", image: "/x.jpg", priceExPence: 100, priceIncPence: 120 } });
    expect(html(await EditProductPage({ params: params({ id: "cr6d" }), searchParams: params({}) }))).toContain("legacy CR6D-LEGACY");
  });

  it("lists categories with counts and edits one", async () => {
    await product("Counted");
    const out = html(await CategoriesPage({ searchParams: params({ error: "Nope" }) }));
    expect(out).toContain("Fryers");
    expect(out).toContain("/ovens/fryers");
    expect(out).toContain("Add a category");
    expect(out).toContain("Nope");
    const editing = html(await CategoriesPage({ searchParams: params({ edit: "fryers" }) }));
    expect(editing).toContain("Edit Fryers");
    expect(editing).toContain("Save changes");
    expect(editing).not.toContain("Address slug");
  });

  it("lists customers by what they have spent, with guests included", async () => {
    await db.user.create({ data: { email: "reg@example.com", name: "Reg Ular", passwordHash: "x" } });
    const order = (email: string, total: number, status: "PAID" | "AWAITING_PAYMENT" = "PAID") =>
      db.order.create({ data: { status, email, name: "N", phone: "1", addressLine1: "x", city: "c", postcode: "p", subtotalExPence: total, totalIncPence: total } });
    await order("reg@example.com", 5000);
    await order("guest@example.com", 90000);
    await order("unpaid@example.com", 70000, "AWAITING_PAYMENT");

    const out = html(await CustomersPage({ searchParams: params({}) }));
    expect(out.indexOf("guest@example.com")).toBeLessThan(out.indexOf("reg@example.com"));
    expect(out).toContain("Guest checkout");
    expect(out).toContain("£900.00");
    expect(out).not.toContain("unpaid@example.com");
    expect(html(await CustomersPage({ searchParams: params({ q: "reg" }) }))).not.toContain("guest@example.com");
    await db.order.deleteMany();
    expect(html(await CustomersPage({ searchParams: params({}) }))).toContain("Reg Ular");
    await db.user.deleteMany({ where: { role: "CUSTOMER" } });
    expect(html(await CustomersPage({ searchParams: params({}) }))).toContain("No customers yet.");
  });

  it("shows the activity log with undo, filtered by who made the change", async () => {
    await db.auditLog.deleteMany();
    const empty = html(await ActivityPage({ searchParams: params({}) }));
    expect(empty).toContain("Nothing logged yet.");

    const p = await product("Logged Fryer");
    await db.auditLog.create({ data: { actorName: "Bot", source: "AI", action: "bulk-update", entity: "product", entityId: "a,b", summary: "Updated 2 products" } });
    const out = html(await ActivityPage({ searchParams: params({}) }));
    expect(out).toContain(`/admin/products/${p.id}`);
    expect(out).toContain("Undo");
    expect(html(await ActivityPage({ searchParams: params({ source: "AI" }) }))).not.toContain("Logged Fryer");
    expect(html(await ActivityPage({ searchParams: params({ source: "STAFF" }) }))).toContain("Logged Fryer");

    const created = await db.auditLog.findFirstOrThrow({ where: { action: "create" } });
    await redirectedTo(() => undo(form({ id: created.id })));
    expect(html(await ActivityPage({ searchParams: params({}) }))).toContain("Undone");
  });

  it("counts the gaps on the dashboard and lists recent changes", async () => {
    await product("Complete Fryer");
    const out = html(await AdminHome({ searchParams: params({}) }));
    expect(out).toContain("Needs attention");
    expect(out).toContain("1 on sale, 0 drafts");
    expect(out).toContain("Complete Fryer");
    expect(out).toContain("Staff");
  });
});
