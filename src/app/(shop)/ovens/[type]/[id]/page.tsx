import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { notFound } from "next/navigation";
import { Faqs, TypeLinks } from "@/components/content-blocks";
import { Crumbs } from "@/components/crumbs";
import { JsonLd } from "@/components/json-ld";
import { CatalogueKit } from "@/components/kit-chat";
import { ProductCard } from "@/components/product-card";
import { isPurchasable } from "@/lib/cart";
import { ProductDossier } from "@/components/product-rich";
import { buildDossier } from "@/lib/dossier";
import { webOf } from "@/lib/web";
import { categoryHref, categoryLabel, getProduct, getType, isOvenType, isShopType, productHref, products, sectionOf, shopTrail, typeHref } from "@/lib/catalogue";
import { ImportedProduct, loadImported } from "@/components/imported-product";
import { ProductGallery } from "@/components/product-gallery";
import { richOf } from "@/lib/rich";
import { productFaqs, productOverview } from "@/lib/copy";
import { money } from "@/lib/format";
import { productJsonLd, specRows } from "@/lib/product-view";
import { alsoListedUnder, relatedProducts, siblingTypes } from "@/lib/related";
import { pageMetadata } from "@/lib/seo";
import { addToCart } from "@/server/cart-actions";
import { addToQuote } from "@/server/quote-actions";
import { COMPANY } from "@/lib/site";

type Props = { params: Promise<{ type: string; id: string }> };

export const generateStaticParams = () => products.map((p) => ({ type: p.type, id: p.id }));

async function load({ params }: Props) {
  const { type, id } = await params;
  const product = getProduct(id);
  return product && product.type === type ? product : undefined;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const p = await load(props);
  if (!p) return {};
  const price = p.stock === "in-stock" && p.priceEx !== null ? ` ${money(p.priceEx)} ex VAT.` : "";
  return pageMetadata({
    title: p.name,
    description: `${p.name}.${price} ${p.stock === "discontinued" ? "Discontinued." : "Supplied and supported by Caterkwik."}`,
    path: productHref(p),
    image: p.image,
  });
}

export default async function ProductPage(props: Props) {
  const p = await load(props);
  if (!p) notFound();
  const type = getType(p.type)!;
  const gone = p.stock === "discontinued";
  const [rich, web] = await Promise.all([richOf(p.id), webOf(p.id)]);
  const dossier = buildDossier(p.id, rich, web, p.legacyUrl || null);
  const oven = isOvenType(p.type);
  const shop = isShopType(p.type);
  const related = relatedProducts(p);
  const alsoIn = alsoListedUnder(p);
  const imported = shop ? await loadImported(p.id, p.name, p.image) : null;

  return (
    <main className="wrap ovenpage">
      <Crumbs trail={shop
        ? [{ label: "Home", href: "/" }, { label: "Shop", href: "/shop/commercial-catering-equipment" }, ...shopTrail(type.slug).map((t) => ({ label: t.label, href: typeHref(t.slug) })), { label: p.name, href: productHref(p) }]
        : [
            { label: "Home", href: "/" }, oven ? { label: "Commercial Ovens", href: "/ovens" } : { label: "Cooking", href: "/cooking" },
            { label: categoryLabel(type.slug), href: categoryHref(type.slug) }, { label: p.name, href: productHref(p) },
          ]} />
      <div className="pdp">
        {imported && imported.images.length > 0 ? (
          <div className="pshot gal"><ProductGallery images={imported.images} /></div>
        ) : (
          <div className="pshot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.image} alt={p.name} />
          </div>
        )}
        <div>
          {p.brand && <p className="eyebrow">{p.brand}</p>}
          <h1>{p.name}</h1>
          <div className="pbuy">
            {p.stock === "in-stock" && p.priceEx !== null && p.priceInc !== null ? (
              <>
                <p className="price">
                  <span className="ex">{money(p.priceEx)}</span>
                  <span className="inc">{money(p.priceInc)}</span>
                  {p.wasEx !== null && <span className="was">{money(p.wasEx)}</span>}
                </p>
                <p className="vatnote">
                  <span className="ex">ex VAT, {money(p.priceInc)} inc VAT</span>
                  <span className="inc">inc VAT, {money(p.priceEx)} ex VAT</span>
                </p>
                {p.leaseWeek !== null && <p className="lease">Lease this item from only {money(p.leaseWeek)} per week</p>}
              </>
            ) : (
              <p className="notice">
                {gone
                  ? "This model is discontinued, so there is no price. See the alternatives below or call the team."
                  : "Price on application. Call the team for a quote."}
              </p>
            )}
            {/* The main action: a quantity stepper beside a full-width button. Without a price, calling is the action. */}
            {isPurchasable(p) ? (
              <form action={addToCart} className="buyrow">
                <input type="hidden" name="id" value={p.id} />
                <label className="qtybox"><span>Qty</span><input type="number" name="qty" defaultValue={1} min={1} max={99} /></label>
                <button className="btn btn-primary buygo" type="submit"><Icon name="addToCart" />Add to basket</button>
                <button className="btn btn-navy buygo" type="submit" formAction={addToQuote}><Icon name="mail" />Add to quote</button>
              </form>
            ) : (
              <>
                <a className="btn btn-navy buygo" href={`tel:${COMPANY.phone.replace(/\s/g, "")}`}><Icon name="phone" />Call {COMPANY.phone}</a>
                <form action={addToQuote} className="buyrow">
                  <input type="hidden" name="id" value={p.id} />
                  <label className="qtybox"><span>Qty</span><input type="number" name="qty" defaultValue={1} min={1} max={99} /></label>
                  <button className="btn btn-primary buygo" type="submit"><Icon name="mail" />Add to quote</button>
                </form>
              </>
            )}
            <ul className="buyassure">
              <li><Icon name="truck" size={16} />Next day delivery on selected lines, order by 4pm</li>
              <li><Icon name="check" size={16} />Price match promise</li>
              <li><Icon name="user" size={16} />Expert advice from our own team</li>
            </ul>
            <div className="buylinks">
              {isPurchasable(p) && <a href={`tel:${COMPANY.phone.replace(/\s/g, "")}`}><Icon name="phone" size={16} />Call {COMPANY.phone}</a>}
              <Link href={categoryHref(type.slug)}>More {categoryLabel(type.slug).toLowerCase()}<Icon name="arrowRight" size={16} /></Link>
            </div>
          </div>
          {imported && imported.features.length > 0 && (
            <section className="keyfeat" aria-label="Key features">
              <h2><Icon name="check" size={18} /> Key features</h2>
              <ul>{imported.features.slice(0, 6).map((f) => <li key={f}>{f}</li>)}</ul>
              {imported.documents.length > 0 && (
                <a className="keydocs" href="#documents"><Icon name="download" size={15} /> {imported.documents.length} {imported.documents.length === 1 ? "document" : "documents"} to download</a>
              )}
            </section>
          )}
          {alsoIn.length > 0 && (
            <p className="alsolisted">
              Also listed under{" "}
              {alsoIn.map((t, i) => (
                <span key={t.slug}>{i > 0 && ", "}<Link href={typeHref(t.slug)}>{t.label}</Link></span>
              ))}
              .
            </p>
          )}

          {!shop && <h2>Overview</h2>}
          {!shop && (rich?.overview.length ? rich.overview : productOverview(p, rich)).map((para) => <p key={para} className="muted" style={{ margin: "0 0 8px" }}>{para}</p>)}
          {!shop && rich && rich.overview.length > 0 && <p className="muted" style={{ margin: "0 0 8px" }}>{productOverview(p, rich)[0]}</p>}

          {!shop && (p.spec || !rich) && <h2>Specification</h2>}
          {shop ? null : p.spec ? (
            <div className="specgrid">
              {specRows(p.spec).map(([label, value]) => (
                <div key={label}><span>{label}</span><span className={value ? undefined : "np"}>{value ?? "Not published"}</span></div>
              ))}
            </div>
          ) : !rich ? (
            <p className="muted">The full specification for this model is not part of this preview.</p>
          ) : null}
        </div>
      </div>

      {imported && <ImportedProduct data={imported} />}

      {(rich || web) && <ProductDossier dossier={dossier} rich={rich} />}

      {related.length > 0 && (
        <section>
          <h2 style={{ margin: "0 0 14px" }}>{gone ? "Available alternatives" : "Similar models"}</h2>
          <div className="ogrid">{related.map((r) => <ProductCard key={r.id} product={r} />)}</div>
        </section>
      )}
      <Faqs heading="Questions about this model" faqs={productFaqs(p, rich)} />
      <TypeLinks heading={oven ? "Other oven types" : shop ? "More from this department" : "Other cooking equipment"} types={siblingTypes(type.slug)} />
      <CatalogueKit />
      <JsonLd data={productJsonLd(p, rich)} />
    </main>
  );
}

// Rendered per request from the catalogue in memory, so an admin change shows at once and a restart never serves a stale build.
export const dynamic = "force-dynamic";
