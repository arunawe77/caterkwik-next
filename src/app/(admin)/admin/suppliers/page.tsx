import Link from "next/link";
import { StatTile } from "@/components/admin/stat-tile";
import { ActionForm, Field } from "@/components/forms";
import { pence, shortDate } from "@/lib/format";
import { utilityMetadata } from "@/lib/seo";
import { saveSupplier, setSupplierActive } from "@/server/supplier-actions";
import { ensureSuppliers, feedUndercuts, overview } from "@/server/suppliers";

export const metadata = utilityMetadata("Suppliers");
export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  await ensureSuppliers();
  const [suppliers, undercuts] = await Promise.all([overview(), feedUndercuts()]);
  const saving = undercuts.reduce((n, u) => n + u.comparison.feedSaving!.pence, 0);

  return (
    <>
      <header className="adm-head"><div><h1>Suppliers</h1><p>Who we buy from, what they charge us, and where a feed beats buying direct. Costs are ex VAT.</p></div></header>

      <div className="stats-row">
        <StatTile label="Suppliers" value={String(suppliers.filter((s) => s.active).length)} />
        <StatTile label="Items from feeds" value={suppliers.filter((s) => s.kind === "FEED").reduce((n, s) => n + s.items, 0).toLocaleString("en-GB")} />
        <StatTile label="Cheaper on a feed" value={String(undercuts.length)} />
        <StatTile label="Saving per unit across them" value={pence(saving)} />
      </div>

      <div className="adm-two">
        <section className="panel">
          <h2>Suppliers</h2>
          <table className="table">
            <thead><tr><th>Supplier</th><th className="num">Brands</th><th className="num">Items</th><th className="num">On our site</th><th>Last feed</th><th /></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/admin/suppliers/${s.id}`}>{s.name}</Link> <span className={`tag ${s.kind === "FEED" ? "AI" : "STAFF"}`}>{s.kind === "FEED" ? "Feed" : "Direct"}</span>
                    {!s.active && <> <span className="tag ARCHIVED">Paused</span></>}
                  </td>
                  <td className="num">{s.brands}</td>
                  <td className="num">{s.items}</td>
                  <td className="num">{s.matched}</td>
                  <td>{s.kind === "FEED" ? (s.lastFeed ? shortDate(s.lastFeed) : <span className="muted">Never</span>) : <span className="muted">-</span>}</td>
                  <td>
                    <form action={setSupplierActive}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="active" value={String(!s.active)} />
                      <button className="btn btn-ghost btn-sm" type="submit">{s.active ? "Pause" : "Resume"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="panel">
          <h2>Add a supplier</h2>
          <ActionForm action={saveSupplier} submit="Add supplier" success="Added.">
            <Field name="name" label="Name" required />
            <label className="field"><span>Type</span>
              <select name="kind" defaultValue="DIRECT"><option value="DIRECT">Direct (we type in costs)</option><option value="FEED">Feed (price file)</option></select>
            </label>
            <Field name="website" label="Website" />
            <Field name="notes" label="Notes" rows={2} />
          </ActionForm>
        </aside>
      </div>

      <section className="panel">
        <h2>Cheaper on a feed than direct</h2>
        {undercuts.length ? (
          <table className="table">
            <thead><tr><th>Product</th><th className="num">Direct</th><th className="num">Feed</th><th className="num">Saving</th></tr></thead>
            <tbody>
              {undercuts.slice(0, 100).map((u) => {
                const s = u.comparison.feedSaving!;
                return (
                  <tr key={u.productId}>
                    <td><Link href={`/admin/products/${encodeURIComponent(u.productId)}`}>{u.name}</Link></td>
                    <td className="num">{pence(s.direct.costExPence!)}<br /><span className="muted">{s.direct.supplierName}</span></td>
                    <td className="num">{pence(s.feed.costExPence!)}<br /><span className="muted">{s.feed.supplierName}</span></td>
                    <td className="num">▼ {pence(s.pence)} ({s.percent.toFixed(1)}%)</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="muted">Nothing yet. This fills in once a feed is loaded and a direct cost is recorded on the same product.</p>}
      </section>
    </>
  );
}
