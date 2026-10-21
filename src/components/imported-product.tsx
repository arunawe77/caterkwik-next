import Link from "next/link";
import { Icon } from "@/components/icons";
import { getProduct, productHref } from "@/lib/catalogue";
import { db } from "@/server/db";

// The product page as Caterkwik published it, for products that came in from the spreadsheet import:
// their own description, specification, purchase options, accessories and downloads.
// Page furniture the crawl recorded about the old site, not about the product, is left out.
const SKIP = new Set([
  "Breadcrumb on product page", "Page tabs", "Image count", "360 view", "Video count", "Number of downloads", "Scraped at", "Page HTTP status",
  "Number of categories", "Review count", "Payment methods", "Lease minimum spend", "Number of purchase options", "Brand page URL", "Brand logo URL",
  "Discontinued", "Web exclusive price", "Product section", "Section",
]);

type Item = Record<string, unknown>;
const items = (v: unknown): Item[] => (Array.isArray(v) ? (v as Item[]) : []);
const gbp = (v: unknown) => (typeof v === "number" ? `£${v.toFixed(2)} ex VAT` : "");

export async function ImportedProduct({ id }: { id: string }) {
  const row = await db.product.findUnique({ where: { id }, select: { description: true, detail: true } });
  if (!row) return null;
  const d = row.detail;
  const specs = Object.entries((d?.attributes ?? {}) as Record<string, string>).filter(([k, v]) => !SKIP.has(k) && v && v !== "0");
  const options = items(d?.options), accessories = items(d?.accessories), documents = items(d?.documents);

  return (
    <div className="dossier">
      {row.description && (
        <section className="rsec">
          <h2><Icon name="info" /> Description</h2>
          <div className="intro">{row.description.split(/\n+/).map((para) => <p key={para}>{para}</p>)}</div>
        </section>
      )}
      {specs.length > 0 && (
        <section className="rsec">
          <h2><Icon name="list" /> Technical specification <small className="count">{specs.length + (d?.mpn ? 1 : 0)} details</small></h2>
          <div className="specgrid">
            {d?.mpn && <div><span>Manufacturer part number</span><span>{d.mpn}</span></div>}
            {specs.map(([label, value]) => <div key={label}><span>{label}</span><span>{value}</span></div>)}
          </div>
        </section>
      )}
      {options.length > 0 && (
        <section className="rsec">
          <h2><Icon name="check" /> Options</h2>
          <ul className="plain related">{options.map((o, i) => <li key={i}><span>{String(o.group ?? "Option")}: {String(o.option ?? "")}</span>{o.priceEx ? <small>{gbp(o.priceEx)}</small> : null}</li>)}</ul>
        </section>
      )}
      {accessories.length > 0 && (
        <section className="rsec">
          <h2><Icon name="basket" /> Accessories</h2>
          <ul className="plain related">
            {accessories.map((a, i) => {
              const linked = typeof a.code === "string" ? getProduct(a.code) : undefined;
              const label = String(a.name ?? a.code ?? "");
              return <li key={i}>{linked ? <Link href={productHref(linked)}>{label}</Link> : <span>{label}</span>}<small>{gbp(a.priceEx)}</small></li>;
            })}
          </ul>
        </section>
      )}
      {documents.length > 0 && (
        <section className="rsec">
          <h2><Icon name="download" /> Downloads</h2>
          <ul className="docs">
            {documents.map((x, i) => (
              <li key={i}>
                {typeof x.url === "string" ? (
                  <a href={x.url} rel="noreferrer" target="_blank"><Icon name="file" size={20} /><span><b>{String(x.title ?? x.url)}</b></span><Icon name="download" size={16} /></a>
                ) : String(x.title ?? "")}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
