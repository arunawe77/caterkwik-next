import Link from "next/link";
import { isStale, percentLabel, POSITION_LABEL } from "@/lib/competitors";
import { money } from "@/lib/format";
import { utilityMetadata } from "@/lib/seo";
import { COMPARISON_FILTERS, comparison, ensureCompetitors, type ComparisonFilter } from "@/server/competitors";
import { db } from "@/server/db";

export const metadata = utilityMetadata("Price comparison");
export const dynamic = "force-dynamic";

const PAGE = 30;
const SHOW: Record<ComparisonFilter, string> = { all: "All products", tracked: "Tracked", cheapest: "We are cheapest", level: "Level", dearer: "Undercut" };
const gbp = (p: number | null) => (p === null ? "-" : money(p / 100));

type Search = { q?: string; show?: string; page?: string };

export default async function PriceComparisonPage({ searchParams }: { searchParams: Promise<Search> }) {
  await ensureCompetitors();
  const sp = await searchParams;
  const show = (COMPARISON_FILTERS as readonly string[]).includes(sp.show ?? "") ? (sp.show as ComparisonFilter) : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ rows, total }, competitors] = await Promise.all([
    comparison({ q: sp.q, filter: show, page, pageSize: PAGE }),
    db.competitor.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const link = (over: Record<string, string>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...over })) if (v && !(k === "page" && v === "1") && !(k === "show" && v === "all")) q.set(k, v);
    return `/admin/competitors/prices${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <header className="adm-head">
        <div><h1>Price comparison</h1><p>Our price against each competitor, ex VAT. Open a product to record what they charge.</p></div>
        <div className="adm-actions"><Link className="btn btn-ghost btn-sm" href="/admin/competitors">Competitors</Link></div>
      </header>

      <p className="admin-nav">
        {COMPARISON_FILTERS.map((f) => <Link key={f} href={link({ show: f, page: "1" })} aria-current={show === f ? "true" : undefined}>{SHOW[f]}</Link>)}
      </p>
      <form className="adm-filters" role="search">
        <input type="hidden" name="show" value={show === "all" ? "" : show} />
        <label>Search<input type="search" name="q" defaultValue={sp.q} placeholder="Name, brand or code" /></label>
        <button className="btn btn-ghost btn-sm" type="submit">Search</button>
      </form>

      <table className="table">
        <thead>
          <tr>
            <th>Product</th><th className="num">Us</th>
            {competitors.map((c) => <th key={c.id} className="num">{c.name}</th>)}
            <th>Position</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Link href={`/admin/competitors/prices/${r.id}`}>{r.name}</Link><br /><span className="muted">{r.brand ?? "No brand"}</span></td>
              <td className="num">{gbp(r.ourEx)}</td>
              {competitors.map((c) => {
                const p = r.prices[c.id];
                return (
                  <td key={c.id} className="num">
                    {p ? gbp(p.ex) : <span className="muted">-</span>}
                    {p && isStale(p.checkedAt) && <><br /><span className="muted">out of date</span></>}
                    {p?.inStock === false && <><br /><span className="muted">out of stock</span></>}
                  </td>
                );
              })}
              <td>
                {r.position === "untracked" ? <span className="muted">{POSITION_LABEL.untracked}</span> : <>
                  <span className={`tag ${r.position === "cheapest" ? "IN_STOCK" : r.position === "dearer" ? "CANCELLED" : "POA"}`}>{POSITION_LABEL[r.position]}</span>
                  {r.gap !== null && <><br /><span className="muted">{percentLabel(r.gap)} vs lowest</span></>}
                </>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="muted">{show === "all" ? "Nothing matches." : "No products here yet. Open a product and record a competitor price."}</p>}

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
