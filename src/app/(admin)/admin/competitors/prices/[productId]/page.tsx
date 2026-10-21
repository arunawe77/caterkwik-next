import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms";
import { gapOf, isStale, percentLabel } from "@/lib/competitors";
import { money, shortDate } from "@/lib/format";
import { utilityMetadata } from "@/lib/seo";
import { removePrice, savePrice } from "@/server/competitor-actions";
import { ensureCompetitors, productPrices } from "@/server/competitors";

export const metadata = utilityMetadata("Competitor prices");
export const dynamic = "force-dynamic";

const gbp = (p: number | null) => (p === null ? "Not recorded" : money(p / 100));
const stockValue = (v: boolean | null | undefined) => (v === true ? "yes" : v === false ? "no" : "");

export default async function ProductCompetitorPrices({ params }: { params: Promise<{ productId: string }> }) {
  await ensureCompetitors();
  const data = await productPrices(decodeURIComponent((await params).productId));
  if (!data) notFound();
  const { product, competitors, prices } = data;

  return (
    <>
      <header className="adm-head">
        <div><h1>{product.name}</h1><p>{product.brand ?? "No brand"} · Our price {gbp(product.priceExPence)} ex VAT ({gbp(product.priceIncPence)} inc VAT)</p></div>
        <div className="adm-actions">
          <Link className="btn btn-ghost btn-sm" href="/admin/competitors/prices">All comparisons</Link>
          <Link className="btn btn-ghost btn-sm" href={`/admin/products/${product.id}`}>Edit product</Link>
        </div>
      </header>

      {!competitors.length && <p className="muted">No active competitors. <Link href="/admin/competitors">Add one first.</Link></p>}

      <div className="adm-two even" style={{ alignItems: "start" }}>
        {competitors.map((c) => {
          const p = prices.get(c.id);
          const gap = gapOf(product.priceExPence, p?.priceExPence ?? null);
          return (
            <section key={c.id} className="panel">
              <h2>{c.name}</h2>
              <p className="muted">
                {p
                  ? <>Recorded {shortDate(p.checkedAt)}{p.checkedBy ? ` by ${p.checkedBy}` : ""}: <b>{gbp(p.priceExPence)}</b> ex VAT ({gbp(p.priceIncPence)} inc VAT){gap && <> · {percentLabel(gap.percent)} for us</>}{isStale(p.checkedAt) && " · out of date"}</>
                  : "Nothing recorded yet."}
                {" "}<a href={p?.url ?? c.url} target="_blank" rel="noopener noreferrer">{p?.url ? "Open their page" : `Visit ${c.domain}`}</a>
              </p>
              <ActionForm action={savePrice} submit={p ? "Update price" : "Save price"} success="Saved.">
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="competitorId" value={c.id} />
                <div className="adm-grid">
                  <label className="field"><span>Price (£)</span><input name="price" inputMode="decimal" defaultValue={p?.priceExPence != null ? (p.priceExPence / 100).toFixed(2) : ""} placeholder="Leave empty if not shown" /></label>
                  <label className="field"><span>That price is</span>
                    <select name="basis" defaultValue="ex"><option value="ex">Ex VAT</option><option value="inc">Inc VAT</option></select>
                  </label>
                  <label className="field wide"><span>Their page address</span><input name="url" type="url" defaultValue={p?.url ?? ""} placeholder={`https://www.${c.domain}/...`} /></label>
                  <label className="field wide"><span>What they call it</span><input name="theirName" defaultValue={p?.theirName ?? ""} /></label>
                  <label className="field"><span>In stock?</span>
                    <select name="inStock" defaultValue={stockValue(p?.inStock)}><option value="">Not known</option><option value="yes">In stock</option><option value="no">Out of stock</option></select>
                  </label>
                  <label className="field"><span>Note</span><input name="note" defaultValue={p?.note ?? ""} placeholder="e.g. delivery included" /></label>
                </div>
              </ActionForm>
              {p && (
                <form action={removePrice} style={{ marginTop: 10 }}>
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="competitorId" value={c.id} />
                  <button className="btn btn-ghost btn-sm adm-danger" type="submit">Clear {c.name} price</button>
                </form>
              )}
              {p && p.history.length > 1 && (
                <details style={{ marginTop: 10 }}>
                  <summary>History</summary>
                  <table className="table">
                    <thead><tr><th>Date</th><th className="num">Them ex VAT</th><th className="num">Us then</th></tr></thead>
                    <tbody>{p.history.map((h) => <tr key={h.id}><td>{shortDate(h.checkedAt)}</td><td className="num">{gbp(h.priceExPence)}</td><td className="num">{gbp(h.ourExPence)}</td></tr>)}</tbody>
                  </table>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
