import Link from "next/link";
import { notFound } from "next/navigation";
import { SupplierFeedUpload } from "@/components/admin/supplier-feed-upload";
import { ActionForm, Field } from "@/components/forms";
import { pence, shortDate } from "@/lib/format";
import { utilityMetadata } from "@/lib/seo";
import { FEED_FIELDS } from "@/lib/suppliers";
import { editSupplier, fetchUropaFeed, linkSupplierItem, removeSupplier, saveBrands, saveFeedColumns } from "@/server/supplier-actions";
import { supplierDetail } from "@/server/suppliers";
import { uropaConfigured } from "@/server/uropa-ftp";

export const metadata = utilityMetadata("Supplier");
export const dynamic = "force-dynamic";

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ brand?: string; page?: string; fetched?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const d = await supplierDetail(id, { brand: q.brand, page: Number(q.page) || 1 });
  if (!d) notFound();
  const { supplier: s } = d;
  const isFeed = s.kind === "FEED";
  const pages = Math.max(1, Math.ceil(d.unmatchedCount / 50));
  const link = (over: Record<string, string>) => `/admin/suppliers/${s.id}?${new URLSearchParams({ ...(q.brand ? { brand: q.brand } : {}), ...over })}`;
  const ftp = uropaConfigured();

  return (
    <>
      <header className="adm-head">
        <div><h1>{s.name}</h1><p>{isFeed ? "Price feed" : "Direct supplier"} · {s.brands.length} brands · {d.linked} items matched to our products</p></div>
        <div className="adm-actions"><Link className="btn btn-ghost btn-sm" href="/admin/suppliers">Back to suppliers</Link></div>
      </header>
      {q.fetched && <p className="okmsg" role="status">{q.fetched}</p>}

      <div className="adm-two">
        <div>
          {isFeed && (
            <section className="panel">
              <h2>Load prices</h2>
              {s.id === "uropa" && (
                <form action={fetchUropaFeed} className="form">
                  <p className="muted">{ftp ? "Fetches the newest price file from Uropa's FTP server. Their reduced offers change daily, so run it each morning." : "The Uropa FTP login is not set on this server, so only an uploaded file works here."}</p>
                  <button className="btn btn-navy" type="submit" disabled={!ftp}>Fetch from Uropa now</button>
                </form>
              )}
              <h3>Or upload a file</h3>
              <SupplierFeedUpload supplierId={s.id} />
            </section>
          )}

          {isFeed && (
            <section className="panel">
              <h2>Not on our site ({d.unmatchedCount.toLocaleString("en-GB")})</h2>
              <p className="muted">Items in the feed that no product of ours matches by part number. Link one by hand if it is really the same product.</p>
              {d.unmatchedBrands.length > 0 && (
                <p>
                  {d.unmatchedBrands.slice(0, 40).map((b) => <Link key={b.brand} className="btn btn-ghost btn-sm" href={link({ brand: b.brand })}>{b.brand} ({b.count})</Link>)}
                  {q.brand && <Link className="btn btn-ghost btn-sm" href={`/admin/suppliers/${s.id}`}>All brands</Link>}
                </p>
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
            <p className="muted">{isFeed ? "Brands this feed carries." : "Brands we buy from this supplier. If a feed carries the same brand, a cheaper feed cost is flagged against it."}</p>
            <ActionForm action={saveBrands} submit="Save brands" success="Saved.">
              <input type="hidden" name="id" value={s.id} />
              <label className="field"><span>One per line</span><textarea name="brands" rows={10} defaultValue={s.brands.map((b) => b.brand).join("\n")} /></label>
            </ActionForm>
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
