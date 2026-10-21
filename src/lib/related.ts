import { cookingTypes, getType, isOvenType, isShopType, productsOfType, shopChildrenOf, types, type OvenType, type Product } from "@/lib/catalogue";

// Internal links that give a crawler (and a shopper) somewhere to go from every page.

const price = (p: Product) => p.priceEx ?? Infinity;

// Discontinued products point at the cheapest models still available in their type. Everything
// else points at the nearest-priced available models, so "similar" means similar money.
export function relatedProducts(product: Product, count = 4): Product[] {
  const live = productsOfType(product.type).filter((p) => p.stock === "in-stock" && p.id !== product.id);
  if (product.stock !== "in-stock" || product.priceEx === null) return live.sort((a, b) => price(a) - price(b)).slice(0, count);
  return live.sort((a, b) => Math.abs(price(a) - product.priceEx!) - Math.abs(price(b) - product.priceEx!)).slice(0, count);
}

// The other types a product is also listed under on caterkwik.co.uk.
export const alsoListedUnder = (product: Product): OvenType[] =>
  product.alsoIn.flatMap((slug) => getType(slug) ?? []);

// Every other type, nearest in the way they are listed first: the same supply, then the rest.
export function siblingTypes(slug: string): OvenType[] {
  const own = getType(slug);
  if (own && isShopType(slug)) {
    const parent = shopChildrenOf(own.parentSlug ?? "").filter((t) => t.slug !== slug && t.total > 0);
    return (parent.length ? parent : shopChildrenOf(slug).filter((t) => t.total > 0)).slice(0, 14);
  }
  if (!isOvenType(slug) && own) {
    // Same department first, then the rest, so the links stay about the same kind of equipment.
    const inGroup = (t: OvenType) => Number(t.group === own?.group);
    return cookingTypes.filter((t) => t.slug !== slug && t.total > 0).sort((a, b) => inGroup(b) - inGroup(a) || a.label.localeCompare(b.label)).slice(0, 14);
  }
  const shares = (t: OvenType) => (own ? t.supply.filter((s) => own.supply.includes(s)).length : 0);
  return types.filter((t) => t.slug !== slug).sort((a, b) => shares(b) - shares(a) || a.label.localeCompare(b.label));
}
