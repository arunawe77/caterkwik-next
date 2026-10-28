import type { Metadata } from "next";
import Link from "next/link";
import { Faqs, TypeLinks, WhyCaterkwik } from "@/components/content-blocks";
import { JsonLd } from "@/components/json-ld";
import { CatalogueKit } from "@/components/kit-chat";
import { ProductCard } from "@/components/product-card";
import { products, shopRoots, types, typeHref } from "@/lib/catalogue";
import { homeFaqs } from "@/lib/copy";
import { absolute, pageMetadata } from "@/lib/seo";
import { COMPANY } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Caterkwik | Commercial catering equipment, supplied and serviced",
  description: `Commercial ovens priced and filterable by what decides the purchase: ${types.length} types, ${products.length} models. Internet prices with traditional service since ${COMPANY.established}.`,
  path: "/landing",
});

const FEATURED = ["6-burner-range", "convectionovens", "cook--hold--ovens", "wood-fired-ovens"];
const STRIP = [...FEATURED, "rotisserie-ovens", "charcoal-oven"];

export default function Landing() {
  const picks = products
    .filter((p) => p.stock === "in-stock" && p.leaseWeek !== null && p.spec)
    .sort((a, b) => a.priceEx! - b.priceEx!)
    .slice(0, 4);

  return (
    <main className="wrap ovenpage">
      <header className="hero">
        <div className="herotext">
          <p className="eyebrow">Established {COMPANY.established}</p>
          <h1>Commercial catering equipment, supplied and serviced</h1>
          <p className="sub">
            Internet prices with traditional service. Start with commercial ovens: {types.length} types and {products.length} models,
            filterable by what actually decides the purchase.
          </p>
          <Link className="btn btn-primary" href="/ovens">Browse commercial ovens</Link>
        </div>
        <div className="herostrip" aria-hidden>
          {STRIP.map((s) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={s} src={`/assets/img/ovens-hub/${s}.webp`} alt="" width={370} height={370} />
          ))}
        </div>
      </header>

      <h2 className="tgridhead">Shop ovens by type</h2>
      <div className="tgrid">
        {FEATURED.map((slug) => {
          const t = types.find((x) => x.slug === slug)!;
          return (
            <article key={slug} className="tcard">
              <Link className="tshot" href={typeHref(slug)} tabIndex={-1} aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/assets/img/ovens-hub/${slug}.webp`} alt="" loading="lazy" width={370} height={370} />
              </Link>
              <div className="tbody">
                <h3><Link href={typeHref(slug)}>{t.label}</Link></h3>
                <p className="aud">{t.audience}</p>
                <p className="count">{t.live} available</p>
              </div>
            </article>
          );
        })}
      </div>

      <h2 className="tgridhead">Lease from a few pounds a week</h2>
      <div className="ogrid">{picks.map((p) => <ProductCard key={p.id} product={p} />)}</div>

      {shopRoots().length > 0 && <TypeLinks heading="Shop all departments" types={shopRoots()} />}
      <TypeLinks heading="All oven types" types={types} />
      <WhyCaterkwik />
      <Faqs heading="Questions about buying an oven" faqs={homeFaqs(products, types.length)} />
      <CatalogueKit />

      <JsonLd
        data={[
          {
            "@context": "https://schema.org", "@type": "Organization", name: COMPANY.name, url: absolute("/"),
            telephone: COMPANY.phone, foundingDate: String(COMPANY.established), address: COMPANY.address,
          },
          {
            "@context": "https://schema.org", "@type": "WebSite", name: "Caterkwik", url: absolute("/"),
            potentialAction: { "@type": "SearchAction", target: absolute("/search?q={search_term_string}"), "query-input": "required name=search_term_string" },
          },
        ]}
      />
    </main>
  );
}

// Rendered per request from the catalogue in memory, so an admin change shows at once and a restart never serves a stale build.
export const dynamic = "force-dynamic";
