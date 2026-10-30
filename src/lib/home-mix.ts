import { cookingGroups, everyProduct, shopMembersOf, shopRoots, typeHref, type Product } from "@/lib/catalogue";

/** A product worth putting on the home page: on sale, priced and with a photo. */
export const showable = (p: Product): boolean => p.stock === "in-stock" && p.priceEx !== null && !!p.image;

/** The product nearest the middle of the range, so a tile shows a typical item rather than the cheapest part. */
export function typicalOf(list: Product[]): Product | undefined {
  const ok = list.filter(showable).sort((a, b) => a.priceEx! - b.priceEx!);
  return ok[Math.floor(ok.length / 2)];
}

/** Up to `n` products taking one from each group in turn, so no single kind of equipment fills the row. */
export function spread(list: Product[], key: (p: Product) => string, n: number): Product[] {
  const groups = new Map<string, Product[]>();
  for (const p of [...list].sort((a, b) => a.priceEx! - b.priceEx!)) groups.set(key(p), [...(groups.get(key(p)) ?? []), p]);
  const lanes = [...groups.values()];
  const out: Product[] = [];
  for (let round = 0; out.length < n && lanes.some((l) => l.length > round); round++) {
    for (const lane of lanes) if (lane[round] && out.length < n) out.push(lane[round]);
  }
  return out;
}

export interface Department { key: string; label: string; href: string; live: number; fromPrice: number | null; product: Product }

/** The shop departments and cooking groups with something to show, biggest first. Ovens have their own section. */
export function departments(n: number): Department[] {
  const fromShop = shopRoots().map((t) => ({ key: t.slug, label: t.label, href: typeHref(t.slug), live: t.live, fromPrice: t.fromPrice, product: typicalOf(shopMembersOf(t.slug)) }));
  const fromCooking = cookingGroups().map((g) => ({
    key: g.slug, label: g.label, href: `/cooking/${g.slug}`, live: g.live, fromPrice: g.fromPrice,
    product: typicalOf(g.types.flatMap((t) => everyProduct().filter((p) => p.type === t.slug))),
  }));
  return [...fromShop, ...fromCooking]
    .filter((d): d is Department => !!d.product && d.live > 0)
    .sort((a, b) => b.live - a.live)
    .slice(0, n);
}
