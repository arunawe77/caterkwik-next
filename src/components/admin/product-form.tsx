"use client";

import { useActionState } from "react";
import { saveProduct } from "@/server/catalogue-actions";
import { ImageField } from "./image-field";

export interface ProductFormValues {
  id?: string;
  name: string;
  brand: string;
  categorySlug: string;
  image: string;
  status: string;
  availability: string;
  priceEx: string;
  priceInc: string;
  wasEx: string;
  leaseWeek: string;
  stockQty: string;
  webExclusive: boolean;
  description: string;
  seoTitle: string;
  seoDescription: string;
}

export const EMPTY_PRODUCT: ProductFormValues = {
  name: "", brand: "", categorySlug: "", image: "", status: "DRAFT", availability: "IN_STOCK", priceEx: "", priceInc: "", wasEx: "",
  leaseWeek: "", stockQty: "", webExclusive: false, description: "", seoTitle: "", seoDescription: "",
};

// One form for new and existing products. The server validates; this only shows what comes back.
export function ProductForm({ values, categories }: { values: ProductFormValues; categories: { slug: string; label: string }[] }) {
  const [state, run, pending] = useActionState(saveProduct, {});
  const v = values;

  return (
    <form className="form" action={run}>
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <div className="panel">
        <h2>Details</h2>
        <div className="adm-grid">
          <label className="field wide"><span>Name <i>*</i></span><input name="name" required defaultValue={v.name} maxLength={200} /></label>
          <label className="field"><span>Brand</span><input name="brand" defaultValue={v.brand} maxLength={80} /></label>
          <label className="field"><span>Category <i>*</i></span>
            <select name="categorySlug" required defaultValue={v.categorySlug}>
              <option value="" disabled>Choose...</option>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Status</span>
            <select name="status" defaultValue={v.status}>
              <option value="DRAFT">Draft (hidden from the shop)</option><option value="ACTIVE">On sale</option><option value="ARCHIVED">Archived (hidden)</option>
            </select>
          </label>
          <label className="field"><span>Availability</span>
            <select name="availability" defaultValue={v.availability}>
              <option value="IN_STOCK">In stock</option><option value="POA">Price on application</option><option value="DISCONTINUED">Discontinued</option>
            </select>
          </label>
          <ImageField defaultValue={v.image} />
          <div className="adm-checks wide"><label><input type="checkbox" name="webExclusive" defaultChecked={v.webExclusive} /> Web exclusive</label></div>
        </div>
      </div>

      <div className="panel">
        <h2>Price and stock</h2>
        <p className="muted">Leave a price empty if it is not published. We never guess one.</p>
        <div className="adm-grid">
          <label className="field"><span>Price ex VAT (£)</span><input name="priceEx" inputMode="decimal" defaultValue={v.priceEx} /></label>
          <label className="field"><span>Price inc VAT (£)</span><input name="priceInc" inputMode="decimal" defaultValue={v.priceInc} /><small>Empty works it out at 20%.</small></label>
          <label className="field"><span>Was price ex VAT (£)</span><input name="wasEx" inputMode="decimal" defaultValue={v.wasEx} /><small>Shown struck through.</small></label>
          <label className="field"><span>Lease per week (£)</span><input name="leaseWeek" inputMode="decimal" defaultValue={v.leaseWeek} /></label>
          <label className="field"><span>Units in stock</span><input name="stockQty" inputMode="numeric" defaultValue={v.stockQty} /><small>Empty means stock is not tracked.</small></label>
        </div>
      </div>

      <div className="panel">
        <h2>Content and search</h2>
        <div className="adm-grid">
          <label className="field wide"><span>Description</span><textarea name="description" rows={6} defaultValue={v.description} maxLength={5000} /></label>
          <label className="field wide"><span>Search title</span><input name="seoTitle" defaultValue={v.seoTitle} maxLength={70} /><small>Up to 70 characters.</small></label>
          <label className="field wide"><span>Search description</span><textarea name="seoDescription" rows={2} defaultValue={v.seoDescription} maxLength={170} /><small>Up to 170 characters.</small></label>
        </div>
      </div>

      {state.error && <p className="alert" role="alert">{state.error}</p>}
      {state.ok && <p className="okmsg" role="status">Saved.</p>}
      <div><button className="btn btn-navy" type="submit" disabled={pending}>{pending ? "Saving..." : v.id ? "Save changes" : "Create product"}</button></div>
    </form>
  );
}
