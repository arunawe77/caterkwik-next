import type { Category, Prisma, Product as Row } from "@prisma/client";
import { seedCookingMeta, seedCookingProducts, seedProducts, seedTypeMeta, setCatalogue, type Product, type Spec, type Stock, type TypeMeta } from "@/lib/catalogue";
import { db } from "@/server/db";

// The storefront reads the catalogue from memory (it is a few hundred rows and every page needs it),
// and the database is the source of truth. `ensureCatalogue` loads it once per process,
// `refreshCatalogue` reloads after an admin change. An empty database is seeded from the scrape first,
// so a fresh install needs no extra step. If the database cannot be reached the seed stays in place.

const STOCK: Record<Row["availability"], Stock> = { IN_STOCK: "in-stock", POA: "poa", DISCONTINUED: "discontinued" };
const AVAILABILITY = { "in-stock": "IN_STOCK", poa: "POA", discontinued: "DISCONTINUED" } as const;

const pounds = (p: number | null) => (p === null ? null : p / 100);
const toPence = (n: number | null) => (n === null ? null : Math.round(n * 100));

export const rowToProduct = (r: Row): Product => ({
  id: r.id, token: r.token ?? r.id, name: r.name, brand: r.brand, type: r.categorySlug, alsoIn: r.alsoIn, image: r.image,
  priceEx: pounds(r.priceExPence), priceInc: pounds(r.priceIncPence), wasEx: pounds(r.wasExPence), leaseWeek: pounds(r.leaseWeekPence),
  stock: STOCK[r.availability], webExclusive: r.webExclusive, legacyUrl: r.legacyUrl ?? "", spec: (r.spec as Spec | null) ?? null,
});

export const productToData = (p: Product): Prisma.ProductUncheckedCreateInput => ({
  id: p.id, token: p.token, name: p.name, brand: p.brand, categorySlug: p.type, alsoIn: p.alsoIn, image: p.image,
  priceExPence: toPence(p.priceEx), priceIncPence: toPence(p.priceInc), wasExPence: toPence(p.wasEx), leaseWeekPence: toPence(p.leaseWeek),
  availability: AVAILABILITY[p.stock], status: "ACTIVE", webExclusive: p.webExclusive, legacyUrl: p.legacyUrl || null,
  spec: (p.spec as Prisma.InputJsonValue | null) ?? undefined,
});

const metaOf = (c: Category): TypeMeta => ({
  slug: c.slug, label: c.label, audience: c.audience, cooking: c.cooking, supply: c.supply, covers: c.covers,
  sourceUrl: c.sourceUrl, parentSlug: c.parentSlug, path: c.path, section: c.section, image: c.image, description: c.description,
});

// Postgres caps a statement at 65,535 bind parameters, which 3,000+ products would pass in one createMany.
const chunks = <T,>(list: T[], size = 400): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

export async function seedCatalogue(): Promise<{ products: number; categories: number }> {
  const categories = [...seedTypeMeta, ...seedCookingMeta].map((t, i) => ({ ...t, sortOrder: i }));
  const rows = [...seedProducts, ...seedCookingProducts].map(productToData);
  await db.$transaction([
    db.category.createMany({ data: categories, skipDuplicates: true }),
    ...chunks(rows).map((data) => db.product.createMany({ data, skipDuplicates: true })),
  ]);
  return { products: rows.length, categories: categories.length };
}

// A database seeded before the Cooking department existed gets its categories and products added once.
// Rows already there are left alone, so nothing staff changed is overwritten.
export async function topUpCooking(): Promise<void> {
  const probe = seedCookingMeta[0];
  if (!probe || (await db.category.count({ where: { slug: probe.slug } })) > 0) return;
  const start = await db.category.count();
  await db.$transaction([
    db.category.createMany({ data: seedCookingMeta.map((t, i) => ({ ...t, sortOrder: start + i })), skipDuplicates: true }),
    ...chunks(seedCookingProducts.map(productToData)).map((data) => db.product.createMany({ data, skipDuplicates: true })),
  ]);
}

export async function refreshCatalogue(): Promise<void> {
  const [categories, rows] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: "asc" } }),
    db.product.findMany({ where: { status: "ACTIVE" } }),
  ]);
  setCatalogue(rows.map(rowToProduct), categories.map(metaOf));
}

let loading: Promise<void> | null = null;

export function ensureCatalogue(): Promise<void> {
  loading ??= (async () => {
    try {
      if ((await db.category.count()) === 0) await seedCatalogue();
      else await topUpCooking();
      await refreshCatalogue();
    } catch (err) {
      loading = null; // try again on the next request
      console.error("[catalogue] using the built-in seed:", err instanceof Error ? err.message || err.stack : err);
    }
  })();
  return loading;
}

export const resetCatalogueLoader = () => {
  loading = null;
};
