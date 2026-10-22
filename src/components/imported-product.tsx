import Link from "next/link";
import { Icon } from "@/components/icons";
import type { GalleryImage } from "@/components/product-gallery";
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

// Shown beside the price and in the downloads, so they are not repeated in the specification table.
const FEATURE_KEYS = ["Key selling points", "Feature bullets"];
const FILE_KEYS = new Set(["Full-size images", "User manual PDF"]);

type Item = Record<string, unknown>;
const items = (v: unknown): Item[] => (Array.isArray(v) ? (v as Item[]) : []);
const gbp = (v: unknown) => (typeof v === "number" ? `£${v.toFixed(2)} ex VAT` : "");
const pipes = (v: string | undefined) => (v ?? "").split("|").map((s) => s.trim()).filter(Boolean);
const isUrl = (v: string) => /^https?:\/\//i.test(v.trim());

export type ImportedDoc = { title: string; url: string; meta: string };
export type ImportedData = {
  description: string | null;
  mpn: string | null;
  images: GalleryImage[];
  features: string[];
  specs: [string, string][];
  options: Item[];
  accessories: Item[];
  documents: ImportedDoc[];
};

export async function loadImported(id: string, name: string, mainImage: string): Promise<ImportedData | null> {
  const row = await db.product.findUnique({ where: { id }, select: { description: true, detail: true } });
  if (!row) return null;
  const d = row.detail;
  const attrs = (d?.attributes ?? {}) as Record<string, string>;

  // Features: the short selling points lead; the longer bullets only fill in when there are none.
  const features: string[] = [];
  for (const key of FEATURE_KEYS) {
    for (const f of pipes(attrs[key]).map((s) => s.replace(/\.$/, ""))) {
      if (!features.some((x) => x.toLowerCase() === f.toLowerCase())) features.push(f);
    }
    if (features.length) break;
  }

  // Photos: the main image first, then the rest of the gallery with duplicates dropped.
  const seen = new Set<string>();
  const images: GalleryImage[] = [];
  const addImage = (url: unknown, alt?: unknown) => {
    if (typeof url !== "string" || !url || seen.has(url)) return;
    seen.add(url);
    images.push({ url, alt: typeof alt === "string" && alt ? alt : name });
  };
  addImage(mainImage);
  for (const i of items(d?.images)) addImage(i.url, i.alt);
  for (const url of pipes(attrs["Full-size images"])) addImage(url);

  // Downloads: the imported documents, plus a manual that only the specification mentions.
  const documents: ImportedDoc[] = [];
  const addDoc = (title: string, url: string, meta: string) => {
    if (!documents.some((x) => x.url === url)) documents.push({ title, url, meta });
  };
  for (const x of items(d?.documents)) {
    if (typeof x.url !== "string") continue;
    const type = typeof x.type === "string" && x.type !== x.title ? x.type : "";
    addDoc(String(x.title ?? x.url), x.url, [type, typeof x.pages === "number" ? `${x.pages} pages` : ""].filter(Boolean).join(" · ") || "PDF");
  }
  for (const url of pipes(attrs["User manual PDF"]).filter(isUrl)) {
    addDoc(decodeURIComponent(url.split("/").at(-1) ?? "User manual").replace(/\.pdf$/i, ""), url, "User manual · PDF");
  }

  const specs = Object.entries(attrs).filter(([k, v]) => v && v !== "0" && !SKIP.has(k) && !FEATURE_KEYS.includes(k) && !FILE_KEYS.has(k) && !isUrl(v) && !v.startsWith("{"));

  return {
    description: row.description, mpn: d?.mpn ?? null, images, features, specs,
    options: items(d?.options), accessories: items(d?.accessories), documents,
  };
}

export function ImportedProduct({ data }: { data: ImportedData }) {
  const { description, mpn, specs, options, accessories, documents } = data;

  return (
    <div className="dossier">
      {description && (
        <section className="rsec">
          <h2><Icon name="info" /> Description</h2>
          <div className="intro">{description.split(/\n+/).map((para) => <p key={para}>{para}</p>)}</div>
        </section>
      )}
      {specs.length > 0 && (
        <section className="rsec">
          <h2><Icon name="list" /> Technical specification <small className="count">{specs.length + (mpn ? 1 : 0)} details</small></h2>
          <div className="specgrid">
            {mpn && <div><span>Manufacturer part number</span><span>{mpn}</span></div>}
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
      {documents.length > 0 && (
        <section className="rsec" id="documents">
          <h2><Icon name="download" /> Documents <small className="count">{documents.length}</small></h2>
          <ul className="docs">
            {documents.map((x) => (
              <li key={x.url}>
                <a href={x.url} rel="noreferrer" target="_blank">
                  <Icon name="file" size={22} />
                  <span><b>{x.title}</b><small>{x.meta}</small></span>
                  <Icon name="download" size={16} />
                </a>
              </li>
            ))}
          </ul>
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
    </div>
  );
}
