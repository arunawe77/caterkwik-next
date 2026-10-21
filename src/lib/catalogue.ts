import scrape from "@/data/scrape.json";
import sixBurner from "@/data/six-burner.json";
import hub from "@/data/hub.json";
import cookingSeed from "@/data/cooking-seed.json";

// The 442 oven listings as 413 unique products. Every price and flag is the scrape's;
// a figure that is not published stays null and the page says so.

export type Stock = "in-stock" | "poa" | "discontinued";

export interface Spec {
  fuel: string[];
  width: number | null; depth: number | null; height: number | null; weight: number | null;
  ovenType: string | null; burners: number | null; kwTotal: number | null;
  phase: string | null; castors: string | null; duty: string | null; warrantyYears: number | null;
  source: string;
}

export interface Product {
  id: string;               // legacy token, lower case: the URL segment
  token: string;            // legacy token as Caterkwik write it: the redirect join
  name: string;
  brand: string | null;
  type: string;             // canonical type slug (first category it appears in)
  alsoIn: string[];
  image: string;
  priceEx: number | null; priceInc: number | null; wasEx: number | null; leaseWeek: number | null;
  stock: Stock;
  webExclusive: boolean;
  legacyUrl: string;
  spec: Spec | null;
}

export interface OvenType {
  slug: string; label: string; audience: string;
  /** Cooking categories only: the department heading they sit under on /cooking. */
  group?: string;
  cooking: string[]; supply: string[]; covers: string[];
  total: number; live: number; discontinued: number; poa: number;
  fromPrice: number | null; maxPrice: number | null;
  /** Imported categories only: where the category sits and the address it has always had on caterkwik.co.uk. */
  sourceUrl?: string | null; parentSlug?: string | null; path?: string | null; section?: string | null;
  /** Imported categories only: the banner and the introduction the old page carried. */
  image?: string | null; description?: string | null;
}

// Brands as Caterkwik name them: the leading words of the product name.
const BRANDS = [
  "Blue Seal", "Falcon", "Lincat", "Electrolux", "Imperial", "Parry", "Thor", "Buffalo", "Moffat", "Unox", "Rowlett",
  "Burco", "Roller Grill", "Roller Frill", "Cater-Cook", "Sirman", "Smeg", "King Edward", "Mibrasa", "Merrychef", "Josper",
  "Blodgett", "Convotherm", "Chefsrange", "American Range", "Blizzard", "Spidocook", "Sammic", "Panasonic", "Turbochef",
  "Moduline", "Alto-Shaam", "Alto Shaam", "Designline", "Giorik", "Tecnoinox", "Pujadas", "North", "CB", "AS Term", "Roaster",
].sort((a, b) => b.length - a.length);

const brandOf = (name: string) => BRANDS.find((b) => name.toLowerCase().startsWith(b.toLowerCase())) ?? null;
const tokenOf = (href: string) => decodeURIComponent(href.split("showprod_")[1].split(/[&#]/)[0]);
const typeSlugOf = (url: string) => url.replace(/\/$/, "").split("/").pop()!;

const enriched = new Map(
  sixBurner.filter((r) => !r.notInCatalogue).map((r) => [tokenOf(r.url), r]),
);

function specOf(token: string): Spec | null {
  const r = enriched.get(token);
  if (!r) return null;
  return {
    fuel: r.fuel, width: r.width, depth: r.depth, height: r.height, weight: r.weight,
    ovenType: r.oven?.type ?? null, burners: r.burners, kwTotal: r.kwTotal,
    phase: r.phase, castors: r.castors, duty: r.duty, warrantyYears: r.warrantyYears, source: r.source,
  };
}

const byId = new Map<string, Product>();
for (const cat of scrape) {
  const type = typeSlugOf(cat.url);
  for (const p of cat.products) {
    const token = tokenOf(p.href);
    const seen = byId.get(token.toLowerCase());
    if (seen) {
      if (seen.type !== type) seen.alsoIn.push(type);
      continue;
    }
    byId.set(token.toLowerCase(), {
      id: token.toLowerCase(), token, name: p.name, brand: brandOf(p.name), type, alsoIn: [],
      image: `/assets/img/products/${token.toLowerCase()}.jpg`,
      priceEx: p.ex, priceInc: p.inc, wasEx: p.was, leaseWeek: p.leaseWeek,
      stock: p.discontinued ? "discontinued" : p.ex === null ? "poa" : "in-stock",
      webExclusive: p.webExclusive, legacyUrl: p.href, spec: specOf(token),
    });
  }
}

// The seed: what the scrape says. The database is seeded from this once, after which it is the
// source of truth and `setCatalogue` swaps its rows in.
export type TypeMeta = Pick<OvenType, "slug" | "label" | "audience" | "cooking" | "supply" | "covers" | "sourceUrl" | "parentSlug" | "path" | "section" | "image" | "description">;

// The oven types keep the /ovens pages Caterkwik approved. Every other Cooking category lives under /cooking.
const OVEN_SLUGS = new Set<string>(hub.types.map((t) => t.slug));
export const isOvenType = (slug: string) => OVEN_SLUGS.has(slug);
const GROUP_OF = new Map<string, string>(cookingSeed.types.map((t) => [t.slug, t.group]));

export const seedProducts: Product[] = [...byId.values()];
export const seedTypeMeta: TypeMeta[] = hub.types.map((t) => ({ ...t }));
export const seedCookingProducts = cookingSeed.products as Product[];
export const seedCookingMeta: TypeMeta[] = cookingSeed.types.map((t) => ({ slug: t.slug, label: t.label, audience: t.audience, cooking: [], supply: [], covers: [] }));

// Held on globalThis because Next bundles the instrumentation hook, the pages and the server actions
// separately: one shared copy is what keeps an admin change visible to the pages. The arrays are
// mutated in place, never reassigned, so every module that imported them sees the change.
const shared = globalThis as unknown as {
  __catalogue?: {
    products: Product[]; types: OvenType[]; cookingProducts: Product[]; cookingTypes: OvenType[]; shopProducts: Product[]; shopTypes: OvenType[];
    shopMembers: Map<string, Product[]>; shopChildren: Map<string, OvenType[]>; shopByUrl: Map<string, OvenType>;
    byId: Map<string, Product>; typeBySlug: Map<string, OvenType>; version: number;
  };
};
shared.__catalogue ??= {
  products: [], types: [], cookingProducts: [], cookingTypes: [], shopProducts: [], shopTypes: [],
  shopMembers: new Map(), shopChildren: new Map(), shopByUrl: new Map(), byId: new Map(), typeBySlug: new Map(), version: 0,
};
const state = shared.__catalogue;

export const products: Product[] = state.products;
export const types: OvenType[] = state.types;
// The rest of the Cooking department. `products` and `types` stay the ovens, so the oven pages and counts do not move.
export const cookingProducts: Product[] = state.cookingProducts;
export const cookingTypes: OvenType[] = state.cookingTypes;
// The categories imported from Caterkwik's own category tree (refrigeration, beverage, hotel and bar...), each at the
// address it has always had, and the products in them. Kept apart from Cooking so neither changes the other's pages.
export const shopProducts: Product[] = state.shopProducts;
export const shopTypes: OvenType[] = state.shopTypes;
const liveById = state.byId;
const typeBySlug = state.typeBySlug;

// Bumped on every swap, so a module holding an index built from the catalogue knows to rebuild it.
export const catalogueVersion = () => state.version;

function typeOf(meta: TypeMeta, all: Product[]): OvenType {
  return statsOf(meta, all.filter((p) => p.type === meta.slug));
}

function statsOf(meta: TypeMeta, own: Product[]): OvenType {
  const prices = own.flatMap((p) => (p.stock === "in-stock" ? [p.priceEx!] : []));
  return {
    ...meta,
    group: GROUP_OF.get(meta.slug),
    total: own.length,
    live: own.filter((p) => p.stock === "in-stock").length,
    discontinued: own.filter((p) => p.stock === "discontinued").length,
    poa: own.filter((p) => p.stock === "poa").length,
    fromPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
  };
}

// A category holds a product if it is the product's own category or one it is also listed in, or sits above either:
// a product in "Back Bar Bottle Coolers" is also in "Commercial Refrigeration". Built once per swap.
function indexShop(next: Product[], metas: TypeMeta[]): void {
  const parent = new Map(metas.map((m) => [m.slug, m.parentSlug ?? null]));
  const members = new Map<string, Map<string, Product>>();
  for (const p of next) {
    for (const slug of [p.type, ...p.alsoIn]) {
      for (let node: string | null | undefined = slug, hops = 0; node && parent.has(node) && hops < 16; node = parent.get(node), hops++) {
        let set = members.get(node);
        if (!set) members.set(node, (set = new Map()));
        set.set(p.id, p);
      }
    }
  }
  state.shopMembers.clear();
  for (const [slug, set] of members) state.shopMembers.set(slug, [...set.values()]);

  const built = metas.map((m) => statsOf(m, state.shopMembers.get(m.slug) ?? []));
  shopTypes.splice(0, shopTypes.length, ...built);
  state.shopChildren.clear();
  state.shopByUrl.clear();
  for (const t of built) {
    if (t.sourceUrl) state.shopByUrl.set(t.sourceUrl, t);
    const up = t.parentSlug ?? "";
    state.shopChildren.set(up, [...(state.shopChildren.get(up) ?? []), t]);
  }
}

export function setCatalogue(next: Product[], metas: TypeMeta[]): void {
  const shopMetas = metas.filter((m) => m.sourceUrl && !OVEN_SLUGS.has(m.slug));
  const shopSlugs = new Set(shopMetas.map((m) => m.slug));
  const ovens = next.filter((p) => OVEN_SLUGS.has(p.type));
  const shop = next.filter((p) => shopSlugs.has(p.type));
  const rest = next.filter((p) => !OVEN_SLUGS.has(p.type) && !shopSlugs.has(p.type));
  // A database without Cooking rows yet falls back to the seed, so /cooking is never empty.
  const cooking = rest.length ? rest : seedCookingProducts;
  const cookingMetas = metas.filter((m) => !OVEN_SLUGS.has(m.slug) && !shopSlugs.has(m.slug));
  const ovenMetas = metas.filter((m) => OVEN_SLUGS.has(m.slug));

  products.splice(0, products.length, ...ovens);
  cookingProducts.splice(0, cookingProducts.length, ...cooking);
  liveById.clear();
  for (const p of [...ovens, ...cooking, ...shop]) liveById.set(p.id.toLowerCase(), p);
  shopProducts.splice(0, shopProducts.length, ...shop);
  indexShop(shop, shopMetas);
  types.splice(0, types.length, ...ovenMetas.map((m) => typeOf(m, ovens)));
  cookingTypes.splice(0, cookingTypes.length, ...(cookingMetas.length ? cookingMetas : seedCookingMeta).map((m) => typeOf(m, cooking)));
  typeBySlug.clear();
  for (const t of [...types, ...cookingTypes, ...shopTypes]) typeBySlug.set(t.slug, t);
  state.version++;
}

// The seed is the starting point; the database replaces it as soon as the server has loaded it.
if (!state.version) setCatalogue(seedProducts, seedTypeMeta);

export const getType = (slug: string) => typeBySlug.get(slug);
export const getProduct = (id: string) => liveById.get(id.toLowerCase());
export const isShopType = (slug: string) => !!getType(slug)?.sourceUrl;
export const productsOfType = (slug: string) =>
  isShopType(slug) ? shopMembersOf(slug) : (isOvenType(slug) ? products : cookingProducts).filter((p) => p.type === slug);
export const sectionOf = (slug: string) => (isOvenType(slug) ? "ovens" : isShopType(slug) ? "equipment" : "cooking");

/** Every product in a category and in the categories under it. */
export const shopMembersOf = (slug: string): Product[] => state.shopMembers.get(slug) ?? [];
export const shopChildrenOf = (slug: string): OvenType[] => state.shopChildren.get(slug) ?? [];
/** The top-level departments: the few categories the home page leads with. */
export const shopRoots = (): OvenType[] => shopChildrenOf("").filter((t) => t.total > 0);
/** The category at an address on the old site, whatever its case or trailing slash. */
export const shopTypeAt = (pathname: string): OvenType | undefined => state.shopByUrl.get(pathname.replace(/\/+$/, "").toLowerCase());
/** From the top-level department down to this category. */
export function shopTrail(slug: string): OvenType[] {
  const trail: OvenType[] = [];
  for (let t = getType(slug), hops = 0; t && hops < 16; t = t.parentSlug ? getType(t.parentSlug) : undefined, hops++) trail.unshift(t);
  return trail;
}
export const productHref = (p: Pick<Product, "type" | "id">) => `/${sectionOf(p.type)}/${p.type}/${p.id}`;
export const everyProduct = (): Product[] => [...products, ...cookingProducts, ...shopProducts];

// Cooking is browsed by department, not by the ~190 narrow types under it: one page per department,
// with the type as a filter. The oven types keep their own approved pages.
const DEFAULT_GROUP = "Other cooking equipment";
export const groupSlug = (label: string) => label.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export interface CookingGroup { slug: string; label: string; types: OvenType[]; total: number; live: number; fromPrice: number | null; maxPrice: number | null }

// Derived on each call, so an admin change to a category shows at once.
export function cookingGroups(): CookingGroup[] {
  const by = new Map<string, OvenType[]>();
  for (const t of cookingTypes) {
    if (!t.total) continue;
    const label = t.group ?? DEFAULT_GROUP;
    by.set(label, [...(by.get(label) ?? []), t]);
  }
  return [...by].map(([label, list]) => {
    const prices = list.flatMap((t) => (t.fromPrice === null ? [] : [t.fromPrice, t.maxPrice!]));
    return {
      slug: groupSlug(label), label, types: list,
      total: list.reduce((n, t) => n + t.total, 0), live: list.reduce((n, t) => n + t.live, 0),
      fromPrice: prices.length ? Math.min(...prices) : null, maxPrice: prices.length ? Math.max(...prices) : null,
    };
  }).sort((a, b) => b.total - a.total);
}

export const getGroup = (slug: string) => cookingGroups().find((g) => g.slug === slug);
export const groupOfType = (slug: string) => cookingGroups().find((g) => g.types.some((t) => t.slug === slug));
export const groupProducts = (g: CookingGroup) => cookingProducts.filter((p) => g.types.some((t) => t.slug === p.type));

/** The category page for a type: the oven type's own page, or its department page with the type pre-selected. */
export function typeHref(slug: string): string {
  if (isOvenType(slug)) return `/ovens/${slug}`;
  const shop = getType(slug)?.sourceUrl;
  if (shop) return shop;
  const g = groupOfType(slug);
  if (!g) return `/cooking/${slug}`;
  return g.types.length === 1 ? `/cooking/${g.slug}` : `/cooking/${g.slug}?type=${encodeURIComponent(slug)}`;
}
/** Where a product's breadcrumb and "more like this" link go: the page that lists it, with no filter. */
export const categoryHref = (slug: string) => (isOvenType(slug) ? `/ovens/${slug}` : isShopType(slug) ? typeHref(slug) : `/cooking/${groupOfType(slug)?.slug ?? slug}`);
export const categoryLabel = (slug: string) => (isOvenType(slug) || isShopType(slug) ? getType(slug)?.label : groupOfType(slug)?.label ?? getType(slug)?.label) ?? slug;
