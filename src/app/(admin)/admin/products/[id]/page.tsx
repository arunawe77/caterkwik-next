import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";
import { productHref } from "@/lib/catalogue";
import { shortDate } from "@/lib/format";
import { utilityMetadata } from "@/lib/seo";
import { removeProduct } from "@/server/catalogue-actions";
import { db } from "@/server/db";
import { ImportedDetails } from "@/components/admin/imported-details";

export const metadata = utilityMetadata("Edit product");
export const dynamic = "force-dynamic";

const pounds = (p: number | null) => (p === null ? "" : (p / 100).toFixed(2));

const SPEC_LABELS: [string, string][] = [
  ["fuel", "Fuel"], ["width", "Width (mm)"], ["depth", "Depth (mm)"], ["height", "Height (mm)"], ["weight", "Weight (kg)"],
  ["ovenType", "Oven type"], ["burners", "Burners"], ["kwTotal", "Total kW"], ["phase", "Phase"], ["castors", "Castors"], ["duty", "Duty"], ["warrantyYears", "Warranty (years)"],
];

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const [p, categories, history] = await Promise.all([
    db.product.findUnique({ where: { id }, include: { detail: true } }),
    db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, label: true } }),
    db.auditLog.findMany({ where: { entity: "product", entityId: id }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  if (!p) notFound();

  const values: ProductFormValues = {
    id: p.id, name: p.name, brand: p.brand ?? "", categorySlug: p.categorySlug, image: p.image, status: p.status, availability: p.availability,
    priceEx: pounds(p.priceExPence), priceInc: pounds(p.priceIncPence), wasEx: pounds(p.wasExPence), leaseWeek: pounds(p.leaseWeekPence),
    stockQty: p.stockQty === null ? "" : String(p.stockQty), webExclusive: p.webExclusive, description: p.description ?? "",
    seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "",
  };
  const spec = p.spec as Record<string, unknown> | null;

  return (
    <>
      <header className="adm-head">
        <div><h1>{p.name}</h1><p>{p.id}{p.token && p.token.toLowerCase() !== p.id ? ` · legacy ${p.token}` : ""}</p></div>
        <div className="adm-actions">
          {p.status === "ACTIVE" && <Link className="btn btn-ghost btn-sm" href={productHref({ type: p.categorySlug, id: p.id })} target="_blank">View on shop</Link>}
          <Link className="btn btn-ghost btn-sm" href="/admin/products">Back to products</Link>
        </div>
      </header>
      {created && <p className="okmsg" role="status">Product created as a draft.</p>}

      <div className="adm-two">
        <div><ProductForm values={values} categories={categories} /></div>
        <div>
          <section className="panel">
            <h2>Specification</h2>
            {spec ? (
              <>
                <table className="table">
                  <tbody>
                    {SPEC_LABELS.map(([k, label]) => {
                      const v = spec[k];
                      const shown = Array.isArray(v) ? v.join(", ") : v;
                      return <tr key={k}><td>{label}</td><td>{shown === null || shown === undefined || shown === "" ? <span className="muted">Not published</span> : String(shown)}</td></tr>;
                    })}
                  </tbody>
                </table>
                <p className="muted">Source: {String(spec.source)}</p>
              </>
            ) : <p className="muted">None recorded. The assistant can add one from figures you give it; it always asks for the source.</p>}
          </section>
          {p.detail && <ImportedDetails detail={p.detail} />}
          <section className="panel">
            <h2>History</h2>
            {history.length ? (
              <ul className="adm-health">
                {history.map((h) => <li key={h.id}><span>{h.summary}<br /><span className="muted">{h.actorName}, {shortDate(h.createdAt)}</span></span><span className={`tag ${h.source}`}>{h.source === "AI" ? "Assistant" : "Staff"}</span></li>)}
              </ul>
            ) : <p className="muted">No changes recorded since the catalogue moved into the database.</p>}
          </section>
          <section className="panel">
            <h2>Delete</h2>
            <p className="muted">Removes the product for good. To hide it instead, set the status to Archived. Old orders keep their own copy of what was sold.</p>
            <form action={removeProduct}>
              <input type="hidden" name="id" value={p.id} />
              <button className="btn btn-ghost btn-sm adm-danger" type="submit">Delete this product</button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
