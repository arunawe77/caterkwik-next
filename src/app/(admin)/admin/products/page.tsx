import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { SelectAll } from "@/components/admin/select-all";
import { utilityMetadata } from "@/lib/seo";
import { CategoryPicker } from "@/components/admin/category-picker";
import { bulkProducts } from "@/server/catalogue-actions";
import { db } from "@/server/db";
import { enrichQueueStatus } from "@/server/product-enrich";

export const metadata = utilityMetadata("Products");
export const dynamic = "force-dynamic";

const PAGE = 25;
const gbp = (p: number | null) => (p === null ? "Not published" : `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`);

type Search = { q?: string; category?: string; status?: string; availability?: string; missing?: string; page?: string; error?: string; notice?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const words = (sp.q ?? "").split(/\s+/).filter(Boolean).slice(0, 6);
  const where: Prisma.ProductWhereInput = {
    ...(sp.category && { categorySlug: sp.category }),
    ...(["DRAFT", "ACTIVE", "ARCHIVED"].includes(sp.status ?? "") && { status: sp.status as "DRAFT" }),
    ...(["IN_STOCK", "POA", "DISCONTINUED"].includes(sp.availability ?? "") && { availability: sp.availability as "POA" }),
    ...(sp.missing === "price" && { status: "ACTIVE", availability: "IN_STOCK", priceExPence: null }),
    ...(sp.missing === "description" && { status: "ACTIVE", description: null }),
    ...(sp.missing === "seo" && { status: "ACTIVE", OR: [{ seoTitle: null }, { seoDescription: null }] }),
    AND: words.map((w) => ({
      OR: [{ name: { contains: w, mode: "insensitive" as const } }, { id: { contains: w, mode: "insensitive" as const } }, { brand: { contains: w, mode: "insensitive" as const } }],
    })),
  };
  const page = Math.max(1, Number(sp.page) || 1);
  const [rows, total, categories] = await Promise.all([
    db.product.findMany({ where, orderBy: [{ updatedAt: "desc" }, { name: "asc" }], skip: (page - 1) * PAGE, take: PAGE }),
    db.product.count({ where }),
    db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, label: true } }),
  ]);
  const q = enrichQueueStatus();
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const link = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page" && k !== "error" && k !== "notice") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    return `/admin/products${q.size ? `?${q}` : ""}`;
  };
  const back = link(page);

  return (
    <>
      <header className="adm-head">
        <div><h1>Products</h1><p>{total} {total === 1 ? "product" : "products"}{sp.missing ? ` missing ${sp.missing}` : ""}</p></div>
        <div className="adm-actions"><Link className="btn btn-navy btn-sm" href="/admin/products/new">Add product</Link></div>
      </header>

      <form className="adm-filters" role="search">
        <label>Search<input type="search" name="q" defaultValue={sp.q} placeholder="Name, brand or code" /></label>
        <label>Category
          <CategoryPicker name="category" categories={categories} defaultValue={sp.category ?? ""} emptyLabel="All" />
        </label>
        <label>Status
          <select name="status" defaultValue={sp.status ?? ""}>
            <option value="">All</option><option value="ACTIVE">On sale</option><option value="DRAFT">Draft</option><option value="ARCHIVED">Archived</option>
          </select>
        </label>
        <label>Availability
          <select name="availability" defaultValue={sp.availability ?? ""}>
            <option value="">All</option><option value="IN_STOCK">In stock</option><option value="POA">Price on application</option><option value="DISCONTINUED">Discontinued</option>
          </select>
        </label>
        <button className="btn btn-ghost btn-sm" type="submit">Filter</button>
        {(sp.q || sp.category || sp.status || sp.availability || sp.missing) && <Link className="btn btn-ghost btn-sm" href="/admin/products">Clear</Link>}
      </form>

      {sp.error && <p className="alert" role="alert">{sp.error}</p>}
      {sp.notice && <p className="okmsg" role="status">{sp.notice}</p>}
      {(q.running || q.finishedAt) && (
        <p className="okmsg" role="status">
          {q.running ? `Enriching from the web: ${q.done} of ${q.total} done${q.current ? ` (now ${q.current})` : ""}.` : `Enrich queue finished: ${q.total} products, ${q.added} specifications added, ${q.nothing} with nothing found, ${q.failed} failed.`}
          {q.running && <> <Link href={back}>Refresh</Link></>}
        </p>
      )}

      <form action={bulkProducts}>
        <input type="hidden" name="back" value={back} />
        <div className="adm-bulk">
          <b>With ticked products:</b>
          <select name="op" aria-label="Bulk action" defaultValue="">
            <option value="" disabled>Choose...</option>
            <optgroup label="Visibility">
              <option value="publish:drafts">Put drafts on sale (skips unpriced)</option><option value="status:ACTIVE">Put on sale</option><option value="status:DRAFT">Make draft</option><option value="status:ARCHIVED">Archive</option>
            </optgroup>
            <optgroup label="Product details">
              <option value="enrich:web">Enrich from web (queue)</option>
            </optgroup>
            <optgroup label="Availability">
              <option value="availability:IN_STOCK">Mark in stock</option><option value="availability:POA">Price on application</option><option value="availability:DISCONTINUED">Mark discontinued</option>
            </optgroup>
            <optgroup label="Price (ex VAT)">
              <option value="price:-10">Reduce by 10%</option><option value="price:-5">Reduce by 5%</option><option value="price:5">Increase by 5%</option><option value="price:10">Increase by 10%</option>
            </optgroup>
          </select>
          <button className="btn btn-navy btn-sm" type="submit">Apply</button>
        </div>

        <table className="table">
          <thead><tr><th><SelectAll /></th><th /><th>Product</th><th>Category</th><th>Status</th><th>Availability</th><th className="num">Ex VAT</th><th className="num">Stock</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td><input type="checkbox" name="ids" value={p.id} aria-label={`Select ${p.name}`} /></td>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <td><img className="thumb" src={p.image} alt="" loading="lazy" /></td>
                <td><Link href={`/admin/products/${p.id}`}>{p.name}</Link><br /><span className="muted">{p.brand ?? "No brand"}</span></td>
                <td>{categories.find((c) => c.slug === p.categorySlug)?.label ?? p.categorySlug}</td>
                <td><span className={`tag ${p.status}`}>{p.status === "ACTIVE" ? "On sale" : p.status === "DRAFT" ? "Draft" : "Archived"}</span></td>
                <td><span className={`tag ${p.availability}`}>{p.availability === "IN_STOCK" ? "In stock" : p.availability === "POA" ? "POA" : "Discontinued"}</span></td>
                <td className="num">{gbp(p.priceExPence)}</td>
                <td className="num">{p.stockQty ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </form>
      {!rows.length && <p className="muted">No products match.</p>}

      <div className="adm-pager">
        <span>Page {page} of {pages}</span>
        <span className="adm-actions">
          {page > 1 && <Link className="btn btn-ghost btn-sm" href={link(page - 1)}>Previous</Link>}
          {page < pages && <Link className="btn btn-ghost btn-sm" href={link(page + 1)}>Next</Link>}
        </span>
      </div>
    </>
  );
}
