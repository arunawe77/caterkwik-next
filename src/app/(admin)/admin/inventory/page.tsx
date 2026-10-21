import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { utilityMetadata } from "@/lib/seo";
import { LOW_STOCK, stockAlerts } from "@/server/analytics";
import { setStock } from "@/server/catalogue-actions";
import { db } from "@/server/db";

export const metadata = utilityMetadata("Inventory");
export const dynamic = "force-dynamic";

const PAGE = 30;
type Search = { show?: string; q?: string; page?: string; error?: string };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const show = ["out", "low", "untracked"].includes(sp.show ?? "") ? sp.show! : "all";
  const words = (sp.q ?? "").split(/\s+/).filter(Boolean).slice(0, 6);
  const where: Prisma.ProductWhereInput = {
    status: { not: "ARCHIVED" },
    ...(show === "out" && { stockQty: 0 }),
    ...(show === "low" && { stockQty: { gt: 0, lte: LOW_STOCK } }),
    ...(show === "untracked" && { stockQty: null }),
    AND: words.map((w) => ({ OR: [{ name: { contains: w, mode: "insensitive" as const } }, { id: { contains: w, mode: "insensitive" as const } }] })),
  };
  const page = Math.max(1, Number(sp.page) || 1);
  const [rows, total, alerts] = await Promise.all([
    db.product.findMany({ where, orderBy: [{ stockQty: { sort: "asc", nulls: "last" } }, { name: "asc" }], skip: (page - 1) * PAGE, take: PAGE }),
    db.product.count({ where }),
    stockAlerts(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const link = (over: Record<string, string>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...over })) if (v && k !== "error" && !(k === "page" && v === "1") && !(k === "show" && v === "all")) q.set(k, v);
    return `/admin/inventory${q.size ? `?${q}` : ""}`;
  };
  const back = link({});

  return (
    <>
      <header className="adm-head"><div><h1>Inventory</h1><p>Units in stock. Leave a product empty if you do not track it. Checkout does not yet stop sales at zero.</p></div></header>

      <p className="admin-nav">
        <Link href={link({ show: "all", page: "1" })} aria-current={show === "all" ? "true" : undefined}>All</Link>
        <Link href={link({ show: "out", page: "1" })} aria-current={show === "out" ? "true" : undefined}>Out of stock ({alerts.out})</Link>
        <Link href={link({ show: "low", page: "1" })} aria-current={show === "low" ? "true" : undefined}>Low, {LOW_STOCK} or fewer ({alerts.low})</Link>
        <Link href={link({ show: "untracked", page: "1" })} aria-current={show === "untracked" ? "true" : undefined}>Not tracked ({alerts.untracked})</Link>
      </p>
      <form className="adm-filters" role="search">
        <input type="hidden" name="show" value={show === "all" ? "" : show} />
        <label>Search<input type="search" name="q" defaultValue={sp.q} placeholder="Name or code" /></label>
        <button className="btn btn-ghost btn-sm" type="submit">Search</button>
      </form>
      {sp.error && <p className="alert" role="alert">{sp.error}</p>}

      <table className="table">
        <thead><tr><th>Product</th><th>Status</th><th>Availability</th><th>Units in stock</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td><Link href={`/admin/products/${p.id}`}>{p.name}</Link></td>
              <td><span className={`tag ${p.status}`}>{p.status === "ACTIVE" ? "On sale" : "Draft"}</span></td>
              <td><span className={`tag ${p.availability}`}>{p.availability === "IN_STOCK" ? "In stock" : p.availability === "POA" ? "POA" : "Discontinued"}</span></td>
              <td>
                <form action={setStock} className="inline-edit">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="back" value={back} />
                  <input type="number" name="stockQty" min={0} step={1} defaultValue={p.stockQty ?? ""} placeholder="Not tracked" aria-label={`Units of ${p.name}`} />
                  <button className="btn btn-ghost btn-sm" type="submit">Save</button>
                  {p.stockQty === 0 && <span className="tag CANCELLED">Out</span>}
                  {p.stockQty !== null && p.stockQty > 0 && p.stockQty <= LOW_STOCK && <span className="tag AWAITING_PAYMENT">Low</span>}
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="muted">Nothing matches.</p>}
      <div className="adm-pager">
        <span>Page {page} of {pages} ({total} products)</span>
        <span className="adm-actions">
          {page > 1 && <Link className="btn btn-ghost btn-sm" href={link({ page: String(page - 1) })}>Previous</Link>}
          {page < pages && <Link className="btn btn-ghost btn-sm" href={link({ page: String(page + 1) })}>Next</Link>}
        </span>
      </div>
    </>
  );
}
