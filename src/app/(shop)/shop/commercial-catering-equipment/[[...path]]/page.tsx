import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Crumbs } from "@/components/crumbs";
import { TypeLinks } from "@/components/content-blocks";
import { CatalogueKit } from "@/components/kit-chat";
import { getType, shopChildrenOf, shopMembersOf, shopRoots, shopTrail, shopTypeAt, typeHref, type OvenType } from "@/lib/catalogue";
import { money, plural } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { CategoryBanner, CategoryView } from "@/app/(shop)/ovens/[type]/page";
import { COMPANY } from "@/lib/site";

// Every category Caterkwik has ever had keeps the address it has, so nothing that ranks is redirected away.
// A category is also a filter on its department: the department page lists everything beneath it, and a deeper
// page is that same list with its own category already ticked. Landing on any of them, a shopper can widen the
// filter and go straight to the product instead of clicking down through each level.
const ROOT = "/shop/commercial-catering-equipment";
const PER_PAGE = 48;

type Props = { params: Promise<{ path?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const addressOf = (path?: string[]) => (path?.length ? `${ROOT}/${path.join("/")}` : ROOT);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const address = addressOf((await params).path);
  const type = shopTypeAt(address);
  if (address === ROOT) {
    return pageMetadata({ title: "Commercial catering equipment", description: "Every department of commercial catering equipment, with prices and specifications.", path: ROOT });
  }
  if (!type) return {};
  const parent = type.parentSlug ? getType(type.parentSlug) : undefined;
  const from = type.fromPrice === null ? "" : ` from ${money(type.fromPrice)} ex VAT`;
  return pageMetadata({
    title: parent ? `${type.label} | ${parent.label}` : type.label,
    description: type.description
      ? type.description.split("\n")[0].slice(0, 300)
      : `${plural(type.total, "product")} in ${type.path ?? type.label}${from}. Filter by type, brand and availability.`,
    path: address,
    image: type.image ?? shopMembersOf(type.slug).find((p) => p.image)?.image,
  });
}

// A category with nothing listed under it keeps its address, banner and words, and points on to the nearest categories that have products.
function EmptyCategory({ type }: { type: OvenType }) {
  const trail = shopTrail(type.slug);
  const parent = trail.at(-2);
  const near = [...shopChildrenOf(type.slug), ...(parent ? shopChildrenOf(parent.slug).filter((c) => c.slug !== type.slug) : shopRoots())].filter((c) => c.total > 0);
  return (
    <main className="wrap ovenpage">
      <Crumbs trail={[{ label: "Home", href: "/" }, { label: "Shop", href: ROOT }, ...trail.map((t) => ({ label: t.label, href: typeHref(t.slug) }))]} />
      <header className="ohead">
        <h1>{type.label}</h1>
        <p className="sub">We have no {type.label.toLowerCase()} listed online at the moment. Call {COMPANY.phone} and we will source them for you.</p>
      </header>
      <CategoryBanner type={type} />
      {near.length > 0 && <TypeLinks heading={parent ? `More in ${parent.label}` : "Departments"} types={near.slice(0, 40)} />}
      <CatalogueKit />
    </main>
  );
}

function Hub() {
  return (
    <main className="wrap ovenpage">
      <Crumbs trail={[{ label: "Home", href: "/" }, { label: "Commercial catering equipment", href: ROOT }]} />
      <header className="ohead">
        <h1>Commercial catering equipment</h1>
        <p className="sub">Choose a department. Every category inside it is a filter, so you can go straight to the product.</p>
      </header>
      <TypeLinks heading="Departments" types={shopRoots()} />
      <CatalogueKit />
    </main>
  );
}

export default async function ShopCategoryPage({ params, searchParams }: Props) {
  const address = addressOf((await params).path);
  if (address === ROOT) return <Hub />;
  const found = shopTypeAt(address);
  if (!found) notFound();
  if (!found.total) return <EmptyCategory type={found} />;

  const trail = shopTrail(found.slug);
  const root = trail[0];
  const master = shopMembersOf(root.slug);

  // The filter lists the categories you could step to from here: the children at every level on the way down.
  const seen = new Set<string>();
  const options: OvenType[] = [];
  for (const level of trail) {
    for (const c of shopChildrenOf(level.slug)) if (c.total > 0 && !seen.has(c.slug)) { seen.add(c.slug); options.push(c); }
  }
  const ids = new Map(options.map((o) => [o.slug, new Set(shopMembersOf(o.slug).map((p) => p.id))]));

  const own = shopMembersOf(found.slug);
  const brands = [...new Set(own.flatMap((p) => (p.brand ? [p.brand] : [])))];
  const type: OvenType = {
    ...found,
    audience: `${plural(found.total, "product")} in ${found.path ?? found.label}${brands.length ? `, from ${plural(brands.length, "brand")}` : ""}. Filter by type, brand and availability, or widen the filter to see all of ${root.label.toLowerCase()}.`,
  };

  const kids = shopChildrenOf(found.slug).filter((c) => c.total > 0);
  const parentKids = shopChildrenOf(found.parentSlug ?? "").filter((c) => c.slug !== found.slug && c.total > 0);
  const links = kids.length ? kids : parentKids;
  const searchParamsValue = await searchParams;

  return (
    <CategoryView
      type={type}
      all={master}
      own={own}
      base={typeHref(found.slug)}
      query={searchParamsValue}
      siblings={links.slice(0, 60)}
      siblingsHeading={kids.length ? `In ${found.label}` : `More in ${getType(found.parentSlug ?? "")?.label ?? "the shop"}`}
      subtypes={options}
      matchType={(p, slug) => ids.get(slug)?.has(p.id) ?? false}
      preselect={trail.length > 1 ? [found.slug] : []}
      broaden={trail.length > 1 ? { label: root.label, href: `${typeHref(root.slug)}?f=1` } : undefined}
      perPage={PER_PAGE}
      trail={[{ label: "Home", href: "/" }, { label: "Shop", href: ROOT }, ...trail.map((t) => ({ label: t.label, href: typeHref(t.slug) }))]}
    />
  );
}

export const dynamic = "force-dynamic";
