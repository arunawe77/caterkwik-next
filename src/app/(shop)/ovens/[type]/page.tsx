import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Faqs, TypeLinks, WhyCaterkwik } from "@/components/content-blocks";
import { Crumbs } from "@/components/crumbs";
import { JsonLd } from "@/components/json-ld";
import { CatalogueKit } from "@/components/kit-chat";
import { ProductCard } from "@/components/product-card";
import { getType, isOvenType, productHref, productsOfType, typeHref, types, type OvenType, type Product } from "@/lib/catalogue";
import { richOf, type Rich } from "@/lib/rich";
import { parseSpecSelection, specFacets, specParam } from "@/lib/spec-facets";
import { typeFaqs, typeIntro } from "@/lib/copy";
import { applySelection, facets, parseSelection, type Facet, type SearchParams } from "@/lib/filters";
import { money, plural } from "@/lib/format";
import { siblingTypes } from "@/lib/related";
import { absolute, pageMetadata } from "@/lib/seo";

// The six-burner category has its own approved page at /ovens/6-burner-range.
export const generateStaticParams = () => types.filter((t) => t.slug !== "6-burner-range").map((t) => ({ type: t.slug }));

type Props = { params: Promise<{ type: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const type = getType((await params).type);
  if (!type) return {};
  const from = type.fromPrice === null ? "" : ` from ${money(type.fromPrice)} ex VAT`;
  return pageMetadata({
    title: type.label,
    description: `${plural(type.total, "model")} of ${type.label.toLowerCase()}${from}. ${type.audience}`,
    path: typeHref(type.slug),
    image: isOvenType(type.slug) ? `/assets/img/ovens-hub/${type.slug}.webp` : productsOfType(type.slug)[0]?.image,
  });
}

function FacetGroup({ name, legend, options, selected }: { name: string; legend: string; options: Facet[]; selected: string[] }) {
  if (options.length < 2) return null;
  return (
    <fieldset className="facet">
      <legend>{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className={o.count === 0 && !selected.includes(o.value) ? "zero" : undefined}>
          <input type="checkbox" name={name} value={o.value} defaultChecked={selected.includes(o.value)} />
          {o.label}
          <span className="n">{o.count}</span>
        </label>
      ))}
    </fieldset>
  );
}

export default async function TypePage({ params, searchParams }: Props) {
  const type = getType((await params).type);
  if (!type) notFound();
  return <CategoryView type={type} all={productsOfType(type.slug)} base={typeHref(type.slug)} query={await searchParams} siblings={siblingTypes(type.slug)} />;
}

export interface ViewOptions {
  /** Whether a product belongs under a type filter. Default: it is that type. A shop category also holds everything beneath it. */
  matchType?: (p: Product, slug: string) => boolean;
  /** Type filters that are on when the page is opened and the visitor has not chosen any: a deep category is the master list, pre-filtered. */
  preselect?: string[];
  /** Where the master list is, so a pre-filtered page can offer the whole of it. */
  broaden?: { label: string; href: string };
  /** Page size. Omitted, everything is listed on one page. */
  perPage?: number;
  trail?: { label: string; href: string }[];
  siblingsHeading?: string;
  /** The products the introduction and questions describe, when that is not the whole list (the master list holds the whole department). */
  own?: Product[];
}

const PAGER = new Set(["page"]);

// The banner and introduction an imported category carried on caterkwik.co.uk: the picture and words its old page ranked on.
export function CategoryBanner({ type }: { type: OvenType }) {
  if (!type.sourceUrl) return null;
  const paragraphs = (type.description ?? "").split("\n\n").filter(Boolean);
  return (
    <>
      {type.image ? (
        <figure className="cbanner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={type.image} alt={`${type.label} banner`} width={1200} height={260} />
        </figure>
      ) : (
        <div className="cbanner plain" role="img" aria-label={type.label}><b>{type.section ?? "Commercial catering equipment"}</b></div>
      )}
      {paragraphs.length > 0 && <div className="cintro">{paragraphs.map((t) => <p key={t}>{t}</p>)}</div>}
    </>
  );
}

// One category page: an oven type, a Cooking department, or a shop category, whose types are a filter (`subtypes`).
export async function CategoryView({ type, all: every, base, query, siblings, subtypes = [], matchType = (p, s) => p.type === s, preselect = [], broaden, perPage, trail, siblingsHeading, own }: {
  type: OvenType; all: Product[]; base: string; query: SearchParams; siblings: OvenType[]; subtypes?: OvenType[];
} & ViewOptions) {
  // Once the filter form has been submitted (`f`) an empty type choice means "all", not "back to the pre-selected one".
  const chosen = ([] as string[]).concat(query.type ?? []).filter((t) => subtypes.some((s) => s.slug === t));
  const typeSel = chosen.length || query.f !== undefined ? chosen : preselect;
  const all = typeSel.length ? every.filter((p) => typeSel.some((s) => matchType(p, s))) : every;
  const sel = parseSelection(query);
  const specSel = parseSpecSelection(query);
  const rich = new Map<string, Rich>();
  if (!perPage) await Promise.all(all.map(async (p) => { const r = await richOf(p.id); if (r) rich.set(p.id, r); }));
  const spec = specFacets(all, rich, specSel);
  const oven = isOvenType(type.slug);
  const shown = spec.apply(applySelection(all, sel));
  const ordered = [...shown.filter((p) => p.stock !== "discontinued"), ...shown.filter((p) => p.stock === "discontinued")];
  const pages = perPage ? Math.max(1, Math.ceil(ordered.length / perPage)) : 1;
  const page = Math.min(pages, Math.max(1, Number(([] as string[]).concat(query.page ?? [])[0]) || 1));
  const onPage = perPage ? ordered.slice((page - 1) * perPage, page * perPage) : ordered;
  const available = onPage.filter((p) => p.stock !== "discontinued");
  const gone = onPage.filter((p) => p.stock === "discontinued");
  const options = facets(all, sel);
  const atDefault = typeSel.length === preselect.length && typeSel.every((s) => preselect.includes(s));
  const filtered = (atDefault ? 0 : typeSel.length) + sel.brand.length + sel.stock.length + Object.values(specSel).flat().length > 0;
  const faqs = typeFaqs(type, own ?? every);
  const pageHref = (n: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (!PAGER.has(k)) for (const x of ([] as string[]).concat(v ?? [])) q.append(k, x);
    if (n > 1) q.set("page", String(n));
    return q.size ? `${base}?${q}` : base;
  };

  return (
    <main className="wrap ovenpage">
      <Crumbs trail={trail ?? [{ label: "Home", href: "/" }, oven ? { label: "Commercial Ovens", href: "/ovens" } : { label: "Cooking", href: "/cooking" }, { label: type.label, href: base }]} />
      <header className="ohead">
        <h1>{type.label}</h1>
        <p className="sub">{type.audience}</p>
      </header>
      <CategoryBanner type={type} />

      <div className="browse">
        <form className="facets" action={base} aria-label="Filters">
          {preselect.length > 0 && <input type="hidden" name="f" value="1" />}
          <div className="facethead">
            <h2>Filter</h2>
            {filtered && <Link className="linkbtn" href={base}>Clear all</Link>}
          </div>
          {broaden && atDefault && preselect.length > 0 && <p className="broaden"><Link href={`${broaden.href}`}>Show all {broaden.label.toLowerCase()}</Link></p>}
          <FacetGroup name="type" legend="Type" options={subtypes.map((t) => ({ value: t.slug, label: t.label, count: every.filter((p) => matchType(p, t.slug) && applySelection([p], sel).length > 0).length }))} selected={typeSel} />
          <FacetGroup name="stock" legend="Availability" options={options.stock} selected={sel.stock} />
          <FacetGroup name="brand" legend="Brand" options={options.brand} selected={sel.brand} />
          {spec.facets.map((f) => <FacetGroup key={f.key} name={specParam(f.key)} legend={f.label} options={f.options} selected={specSel[f.key] ?? []} />)}
          <button className="btn btn-navy btn-sm" type="submit">Apply</button>
        </form>

        <section>
          <div className="gridbar">
            <p><b>{shown.length}</b> of {plural(all.length, "model")}{type.fromPrice !== null && !filtered && ` · from ${money(type.fromPrice)} ex VAT`}{pages > 1 && ` · page ${page} of ${pages}`}</p>
          </div>
          {available.length > 0 ? (
            <div className="ogrid">{available.map((p) => <ProductCard key={p.id} product={p} />)}</div>
          ) : (
            <p className="noresults">{shown.length ? "Nothing currently available in this selection." : "No model matches that selection."}</p>
          )}
          {gone.length > 0 && (
            <details className="gone" open>
              <summary>Discontinued ({gone.length}): still listed on caterkwik.co.uk, no price shown</summary>
              <div className="ogrid">{gone.map((p) => <ProductCard key={p.id} product={p} />)}</div>
            </details>
          )}
          {pages > 1 && (
            <nav className="pager" aria-label="Pages">
              {page > 1 && <Link rel="prev" href={pageHref(page - 1)}>Previous</Link>}
              <span>Page {page} of {pages}</span>
              {page < pages && <Link rel="next" href={pageHref(page + 1)}>Next</Link>}
            </nav>
          )}
        </section>
      </div>

      <section className="intro" style={{ marginTop: 36 }}>
        <h2>About {type.label.toLowerCase()}</h2>
        {typeIntro(type, own ?? every).map((p) => <p key={p}>{p}</p>)}
      </section>
      <Faqs heading={`${type.label}: common questions`} faqs={faqs} />
      <WhyCaterkwik />
      <TypeLinks heading={siblingsHeading ?? (oven ? "Other oven types" : "Other cooking equipment")} types={siblings} />
      <CatalogueKit />

      <JsonLd
        data={{
          "@context": "https://schema.org", "@type": "CollectionPage", name: type.label, url: absolute(base),
          description: type.audience,
          mainEntity: {
            "@type": "ItemList", numberOfItems: all.length,
            itemListElement: (perPage ? onPage : all).map((p, i) => ({ "@type": "ListItem", position: (perPage ? (page - 1) * perPage : 0) + i + 1, name: p.name, url: absolute(productHref(p)) })),
          },
        }}
      />
    </main>
  );
}

// Rendered per request from the catalogue in memory, so an admin change shows at once and a restart never serves a stale build.
export const dynamic = "force-dynamic";
