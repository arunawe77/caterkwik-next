import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cookingGroups, getGroup, getType, groupProducts, isOvenType, typeHref, type CookingGroup, type OvenType } from "@/lib/catalogue";
import { money, plural } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { CategoryView } from "@/app/(shop)/ovens/[type]/page";

// One page per Cooking department, with the type as a filter. A bare type address (an old link) goes
// to its department with that type selected, so nothing 404s.
type Props = { params: Promise<{ type: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export const generateStaticParams = () => cookingGroups().map((g) => ({ type: g.slug }));

// The department as a category: the same shape the type page renders.
const asType = (g: CookingGroup): OvenType => ({
  slug: g.slug, label: g.label,
  audience: `${plural(g.types.length, "category")} of ${g.label.toLowerCase()}, filtered by type, brand and availability.`,
  cooking: [], supply: [], covers: [],
  total: g.total, live: g.live, discontinued: 0, poa: 0, fromPrice: g.fromPrice, maxPrice: g.maxPrice,
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = getGroup((await params).type);
  if (!g) return {};
  const from = g.fromPrice === null ? "" : ` from ${money(g.fromPrice)} ex VAT`;
  return pageMetadata({
    title: g.label,
    description: `${plural(g.total, "model")} across ${plural(g.types.length, "type")} of ${g.label.toLowerCase()}${from}, with the specification of every model.`,
    path: `/cooking/${g.slug}`,
    image: groupProducts(g)[0]?.image,
  });
}

export default async function CookingGroupPage({ params, searchParams }: Props) {
  const slug = (await params).type;
  const g = getGroup(slug);
  if (!g) {
    if (!isOvenType(slug) && getType(slug)) permanentRedirect(typeHref(slug));
    notFound();
  }
  const others = cookingGroups().filter((x) => x.slug !== g.slug).slice(0, 14).map(asType);
  return <CategoryView type={asType(g)} all={groupProducts(g)} base={`/cooking/${g.slug}`} query={await searchParams} siblings={others} subtypes={g.types} />;
}

export const dynamic = "force-dynamic";
