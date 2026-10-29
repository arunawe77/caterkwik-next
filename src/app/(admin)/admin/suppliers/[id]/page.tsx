import Link from "next/link";
import { notFound } from "next/navigation";
import { SupplierFeedUpload } from "@/components/admin/supplier-feed-upload";
import { ActionForm, Field } from "@/components/forms";
import { pence, shortDate } from "@/lib/format";
import { utilityMetadata } from "@/lib/seo";
import { FEED_FIELDS } from "@/lib/suppliers";
import { applyWebPrice, editSupplier, syncUropa, importUnmatchedAsDrafts, saveSelectedBrands, linkSupplierItem, removeSupplier, saveBrands, saveFeedColumns } from "@/server/supplier-actions";
import { db } from "@/server/db";
import { supplierDetail } from "@/server/suppliers";
import { MIN_MARGIN, priceReview, syncStatus } from "@/server/uropa-sync";

export const metadata = utilityMetadata("Supplier");
export const dynamic = "force-dynamic";

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ brand?: string; page?: string; fetched?: string; all?: string; syncing?: string; busy?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const d = await supplierDetail(id, { brand: q.brand, page: Number(q.page) || 1, all: q.all === "1" });
  if (!d) notFound();
  const { supplier: s } = d;
  const isFeed = s.kind === "FEED";
  const pages = Math.max(1, Math.ceil(d.unmatchedCount / 50));
  const link = (over: Record<string, string>) => `/admin/suppliers/${s.id}?${new URLSearchParams({ ...(q.brand ? { brand: q.brand } : {}), ...(q.all === "1" ? { all: "1" } : {}), ...over })}`;
  const sync = s.id === "uropa" ? syncStatus() : null;
  const review = s.id === "uropa" ? await priceReview() : null;
  const categories = isFeed ? await db.category.findMany({ orderBy: { label: "asc" }, select: { slug: true, label: true } }) : [];

  return (
    <>
      <header className="adm-head">
        <div><h1>{s.name}</h1><p>{isFeed ? "Price feed" : "Direct supplier"} · {s.brands.length} brands · {d.linked} items matched to our products</p></div>
        <div className="adm-actions"><Link className="btn btn-ghost btn-sm" href="/admin/suppliers">Back to suppliers</Link></div>
      </header>
      {q.fetched && <p className="okmsg" role="status">{q.fetched}</p>}
      {sync?.running && <meta httpEquiv="refresh" content="5" />}

      <div className="adm-two">
        <div>
          {isFeed && (
            <section className="panel">
              <h2>Load prices</h2>
              {s.id === "uropa" && sync && (
                <>
                  <form action={syncUropa} className="form">
                    <p className="muted">One click downloads Uropa&apos;s latest price, stock and product files, matches them to our products by part number, updates costs and stock, and adds anything we don&apos;t sell as a draft product. Selling prices are never changed here. Run it each morning: Uropa&apos;s prices and offers change daily.</p>
                    <button className="btn btn-navy" type="submit" disabled={sync.running}>{sync.running ? "Sync running…" : "Sync from Uropa now"}</button>
                  </form>
                  {q.busy && <p role="status">A sync is already running.</p>}
                  {sync.running && <p role="status">{sync.phase}{sync.total ? `: ${sync.done.toLocaleString("en-GB")} of ${sync.total.toLocaleString("en-GB")}` : "…"} <span className="muted">(this page refreshes itself)</span></p>}
                  {sync.summary && <p className="okmsg" role="status">{sync.summary}</p>}
                  {sync.error && <p className="errmsg" role="alert">The sync failed: {sync.error}</p>}
                </>
              )}
              <h3>Or upload a file</h3>
              <SupplierFeedUpload supplierId={s.id} />
            </section>
          )}

          {review && (
            <section className="panel">
              <h2>Selling prices to review ({review.total.toLocaleString("en-GB")})</h2>
              <p className="muted">Matched products with no selling price, or selling at under {MIN_MARGIN}% margin over what Uropa charges us. Nothing here is changed automatically. Uropa&apos;s web price is assumed to be ex VAT: check one before relying on it.</p>
              {review.rows.length ? (
                <table className="table">
                  <thead><tr><th>Product</th><th className="num">Our price</th><th className="num">Uropa cost</th><th className="num">Margin</th><th className="num">Uropa web price</th><th /></tr></thead>
                  <tbody>
                    {review.rows.map((r) => (
                      <tr key={r.priceId}>
                        <td><Link href={`/admin/products/${encodeURIComponent(r.productId)}`}>{r.name}</Link><br /><span className="muted">{r.reason}{r.status === "DRAFT" ? " · draft" : ""}</span></td>
                        <td className="num">{r.sellEx === null ? "-" : pence(r.sellEx)}</td>
                        <td className="num">{pence(r.costEx)}</td>
                        <td className="num">{r.margin === null ? "-" : `${r.margin.toFixed(1)}%`}</td>
                        <td className="num">{r.webEx === null ? "-" : pence(r.webEx)}</td>
                        <td>
                          {r.webEx !== null && (
                            <form action={applyWebPrice}>
                              <input type="hidden" name="id" value={r.priceId} />
                              <button className="btn btn-ghost btn-sm" type="submit">Use web price</button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="muted">Nothing to review.</p>}
              {review.total > review.rows.length && <p className="muted">Showing the first {review.rows.length}.</p>}
            </section>
          )}

          {isFeed && (
            <section className="panel">
              <h2>Not on our site ({d.unmatchedCount.toLocaleString("en-GB")})</h2>
              <p className="muted">Items in the feed that no product of ours matches by part number. Link one by hand if it is really the same product.</p>
              {d.selectedBrands.length > 0 && (
                <p role="status">
                  {d.showingAll
                    ? <>Showing every brand in the feed. <Link href={`/admin/suppliers/${s.id}`}>Show only the {d.selectedBrands.length} brands we sell</Link></>
                    : <>Showing only the {d.selectedBrands.length} brands we sell. <Link href={`/admin/suppliers/${s.id}?all=1`}>Show all brands</Link></>}
                </p>
              )}
              {d.unmatchedBrands.length > 0 && (
                <p>
                  {d.unmatchedBrands.slice(0, 40).map((b) => <Link key={b.brand} className="btn btn-ghost btn-sm" href={link({ brand: b.brand })}>{b.brand} ({b.count})</Link>)}
                  {q.brand && <Link className="btn btn-ghost btn-sm" href={`/admin/suppliers/${s.id}`}>All brands</Link>}
                </p>
              )}
              {d.unmatchedCount > 0 && (
                <form action={importUnmatchedAsDrafts} className="form">
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="brand" value={q.brand ?? ""} />
                  <label className="field"><span>Create draft products{q.brand ? ` for ${q.brand}` : " (first 200)"} in</span>
                    <select name="categorySlug" required><option value="">Choose a category</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}</select>
                  </label>
                  <button className="btn btn-navy btn-sm" type="submit">Create drafts</button>
                </form>
              )}
              <table className="table">
                <thead><tr><th>Item</th><th className="num">Cost</th><th className="num">Stock</th><th>Link to product</th></tr></thead>
                <tbody>
                  {d.unmatched.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name ?? u.sku}<br /><span className="muted">{[u.brand, u.sku, u.mpn].filter(Boolean).join(" · ")}</span></td>
                      <td className="num">{u.costExPence === null ? "-" : pence(u.costExPence)}</td>
                      <td className="num">{u.stockQty ?? "-"}</td>
                      <td>
                        <form action={linkSupplierItem} className="inline-edit">
                          <input type="hidden" name="id" value={u.id} />
                          <input name="productId" placeholder="product address" aria-label={`Product to link ${u.sku} to`} required />
                          <button className="btn btn-ghost btn-sm" type="submit">Link</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!d.unmatched.length && <p className="muted">Nothing here.</p>}
              {pages > 1 && (
                <p className="muted">
                  Page {d.page} of {pages} {d.page > 1 && <Link href={link({ page: String(d.page - 1) })}>Previous</Link>} {d.page < pages && <Link href={link({ page: String(d.page + 1) })}>Next</Link>}
                </p>
              )}
            </section>
          )}

          <section className="panel">
            <h2>Brands</h2>
            {isFeed ? (
              <>
                <p className="muted">Tick the brands Caterkwik sells. The lists on this page then show only those brands and their products. Leave all unticked to see everything.</p>
                <ActionForm action={saveSelectedBrands} submit="Save selection" success="Saved.">
                  <input type="hidden" name="id" value={s.id} />
                  <div className="brandpick" role="group" aria-label="Brands we sell">
                    {s.brands.map((b) => (
                      <label key={b.id} className="check">
                        <input type="checkbox" name="selected" value={b.brand} defaultChecked={b.selected} />
                        <span>{b.brand}</span> <span className="muted">{d.brandCounts[b.brand.toLowerCase()] ? `(${d.brandCounts[b.brand.toLowerCase()]})` : ""}</span>
                      </label>
                    ))}
                  </div>
                  <label className="field"><span>Add brands not listed (one per line)</span><textarea name="extra" rows={3} /></label>
                </ActionForm>
              </>
            ) : (
              <>
                <p className="muted">Brands we buy from this supplier. If a feed carries the same brand, a cheaper feed cost is flagged against it.</p>
                <ActionForm action={saveBrands} submit="Save brands" success="Saved.">
                  <input type="hidden" name="id" value={s.id} />
                  <label className="field"><span>One per line</span><textarea name="brands" rows={10} defaultValue={s.brands.map((b) => b.brand).join("\n")} /></label>
                </ActionForm>
              </>
            )}
          </section>
        </div>

        <div>
          <section className="panel">
            <h2>Details</h2>
            <ActionForm action={editSupplier} submit="Save" success="Saved.">
              <input type="hidden" name="id" value={s.id} />
              <Field name="name" label="Name" required defaultValue={s.name} />
              <label className="field"><span>Type</span>
                <select name="kind" defaultValue={s.kind}><option value="DIRECT">Direct (we type in costs)</option><option value="FEED">Feed (price file)</option></select>
              </label>
              <Field name="website" label="Website" defaultValue={s.website ?? ""} />
              <Field name="notes" label="Notes" rows={3} defaultValue={s.notes ?? ""} />
            </ActionForm>
          </section>

          {isFeed && (
            <section className="panel">
              <h2>Feed columns</h2>
              <p className="muted">The header of each column in the file. Left blank, they are guessed from the file&apos;s headers.</p>
              <ActionForm action={saveFeedColumns} submit="Save columns" success="Saved.">
                <input type="hidden" name="id" value={s.id} />
                {FEED_FIELDS.map((f) => <Field key={f.key} name={f.key} label={f.label} defaultValue={d.mapping[f.key] ?? ""} />)}
              </ActionForm>
            </section>
          )}

          {isFeed && (
            <section className="panel">
              <h2>Recent loads</h2>
              {d.runs.length ? (
                <ul className="adm-health">
                  {d.runs.map((r) => <li key={r.id}><span>{r.fileName}<br /><span className="muted">{shortDate(r.createdAt)}, {r.actorName} · {r.rows} rows, {r.matched} matched, {r.changed} changed</span></span></li>)}
                </ul>
              ) : <p className="muted">Nothing loaded yet.</p>}
            </section>
          )}

          <section className="panel">
            <h2>Remove</h2>
            <p className="muted">Removes the supplier and every cost recorded against it.</p>
            <form action={removeSupplier}>
              <input type="hidden" name="id" value={s.id} />
              <button className="btn btn-ghost btn-sm adm-danger" type="submit">Remove {s.name}</button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
