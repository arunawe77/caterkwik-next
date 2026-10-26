import { ActionForm, Field } from "@/components/forms";
import { pence } from "@/lib/format";
import { marginOf, type CostComparison } from "@/lib/suppliers";
import { removeCost, saveCost } from "@/server/supplier-actions";

type Row = { id: string; sku: string; costExPence: number | null; stockQty: number | null; note: string | null; supplier: { id: string; name: string } };

// What each supplier charges us for a product, the margin at today's selling price, and where a feed beats the direct cost.
export function ProductSuppliers({ productId, rows, suppliers, comparison, sellEx }: {
  productId: string; rows: Row[]; suppliers: { id: string; name: string }[]; comparison: CostComparison; sellEx: number | null;
}) {
  const best = comparison.cheapest;
  const margin = best ? marginOf(sellEx, best.costExPence) : null;
  const saving = comparison.feedSaving;
  return (
    <section className="panel">
      <h2>Suppliers</h2>
      {saving && (
        <p className="alert" role="status">
          {saving.feed.supplierName} is {pence(saving.pence)} ({saving.percent.toFixed(1)}%) cheaper than {saving.direct.supplierName} direct.
        </p>
      )}
      {rows.length ? (
        <table className="table">
          <thead><tr><th>Supplier</th><th className="num">Cost ex VAT</th><th className="num">Stock</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.supplier.name}{best && r.supplier.id === best.supplierId && r.costExPence === best.costExPence && <> <span className="tag ACTIVE">Cheapest</span></>}
                  <br /><span className="muted">{r.sku.startsWith("product:") ? "typed in" : r.sku}{r.note ? ` · ${r.note}` : ""}</span>
                </td>
                <td className="num">{r.costExPence === null ? "-" : pence(r.costExPence)}</td>
                <td className="num">{r.stockQty ?? "-"}</td>
                <td>
                  <form action={removeCost}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn btn-ghost btn-sm adm-danger" type="submit" aria-label={`Clear ${r.supplier.name}`}>Clear</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted">No supplier cost recorded. A feed fills this in when the part number matches; direct costs are typed in below.</p>}
      {margin !== null && sellEx !== null && <p className="muted">At {pence(sellEx)} ex VAT the margin on the cheapest cost is {margin.toFixed(1)}%.</p>}
      <h3>Record a cost</h3>
      <ActionForm action={saveCost} submit="Save cost" success="Saved.">
        <input type="hidden" name="productId" value={productId} />
        <label className="field"><span>Supplier</span>
          <select name="supplierId" required>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <Field name="cost" label="Cost price (£)" required />
        <label className="field"><span>Entered as</span>
          <select name="basis" defaultValue="ex"><option value="ex">Ex VAT</option><option value="inc">Inc VAT</option></select>
        </label>
        <Field name="sku" label="Their code" hint="Optional." />
        <Field name="note" label="Note" />
      </ActionForm>
    </section>
  );
}
