import type { Prisma, PrismaClient, ProductDetail } from "@prisma/client";
import type { Plan, PlannedProduct } from "./plan.ts";

export interface ImportOptions {
  /** Overwrite name, price, description and SEO of products that are already in the catalogue. Their category and status are never touched. */
  updateExisting: boolean;
  /** Put the new products straight on the storefront. Off, they arrive as drafts. */
  publish: boolean;
}

export interface ImportSummary {
  categoriesNew: number;
  categoriesAdopted: number;
  categoriesExisting: number;
  productsNew: number;
  productsExisting: number;
  productsUpdated: number;
  availability: Record<string, number>;
  withoutPrice: number;
  withDocuments: number;
  withOptions: number;
  withReviews: number;
  warnings: string[];
}

export type Progress = (phase: string, done: number, total: number) => void;

interface Resolved {
  /** planned category address → slug in the database */
  slugOf: Map<string, string>;
  fresh: Set<string>;
  adopted: Set<string>;
  /** planned product code (lower case) → id of the product already in the database */
  existing: Map<string, string>;
}

// Which planned categories and products are already in the database. A category matches on its Caterkwik address;
// failing that, one of the seeded oven or cooking categories with the same slug is adopted rather than duplicated.
async function resolve(db: PrismaClient, plan: Plan): Promise<Resolved> {
  const cats = await db.category.findMany({ select: { slug: true, sourceUrl: true } });
  const bySource = new Map(cats.filter((c) => c.sourceUrl).map((c) => [c.sourceUrl!, c.slug]));
  const free = new Set(cats.filter((c) => !c.sourceUrl).map((c) => c.slug));
  const taken = new Set(cats.map((c) => c.slug));

  const slugOf = new Map<string, string>();
  const fresh = new Set<string>();
  const adopted = new Set<string>();
  for (const c of plan.categories) {
    const known = bySource.get(c.sourceUrl);
    if (known) { slugOf.set(c.sourceUrl, known); continue; }
    const seed = [c.legacySlug, c.slug].find((s) => free.has(s));
    if (seed) { free.delete(seed); slugOf.set(c.sourceUrl, seed); adopted.add(c.sourceUrl); continue; }
    let slug = c.slug;
    for (let n = 2; taken.has(slug); n++) slug = `${c.slug.slice(0, 76)}-${n}`;
    taken.add(slug);
    slugOf.set(c.sourceUrl, slug);
    fresh.add(c.sourceUrl);
  }

  const rows = await db.product.findMany({ select: { id: true, token: true } });
  const byToken = new Map(rows.map((r) => [(r.token ?? r.id).toLowerCase(), r.id]));
  const ids = new Set(rows.map((r) => r.id));
  const existing = new Map<string, string>();
  for (const p of plan.products) {
    const id = byToken.get(p.code.toLowerCase()) ?? (ids.has(p.id) ? p.id : undefined);
    if (id) existing.set(p.code.toLowerCase(), id);
  }
  return { slugOf, fresh, adopted, existing };
}

const count = (list: unknown[] | null | undefined) => (list?.length ? 1 : 0);

/** What an import would do, from the plan and the current database. Writes nothing. */
export async function summarise(db: PrismaClient, plan: Plan, options: ImportOptions): Promise<ImportSummary> {
  const r = await resolve(db, plan);
  const availability: Record<string, number> = {};
  let existing = 0, withoutPrice = 0, withDocuments = 0, withOptions = 0, withReviews = 0;
  for (const p of plan.products) {
    availability[p.availability] = (availability[p.availability] ?? 0) + 1;
    if (r.existing.has(p.code.toLowerCase())) existing++;
    if (p.priceExPence === null) withoutPrice++;
    withDocuments += count(p.detail.documents);
    withOptions += count(p.detail.options);
    withReviews += count(p.detail.reviews);
  }
  return {
    categoriesNew: r.fresh.size, categoriesAdopted: r.adopted.size, categoriesExisting: plan.categories.length - r.fresh.size - r.adopted.size,
    productsNew: plan.products.length - existing, productsExisting: existing, productsUpdated: options.updateExisting ? existing : 0,
    availability, withoutPrice, withDocuments, withOptions, withReviews, warnings: plan.warnings,
  };
}

const chunks = <T,>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
const json = (v: unknown) => (v === null || v === undefined ? undefined : (v as Prisma.InputJsonValue));
const PLACEHOLDER = "/assets/img/placeholder.svg";

const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined);

// The workbooks overlap but are not the same width (the per-section ones have about 200 columns, the full one 461), so a
// second import adds to a product's details rather than replacing them: what the new file has wins, what it lacks stays.
function detailData(id: string, p: PlannedProduct, sourceFile: string, old?: ProductDetail): Prisma.ProductDetailUncheckedCreateInput {
  const d = p.detail;
  const keep = <T,>(next: T, prev: unknown): T => (filled(next) || !old ? next : (prev as T));
  if (old) {
    return {
      productId: id, mpn: keep(d.mpn, old.mpn), gtin: keep(d.gtin, old.gtin), condition: keep(d.condition, old.condition),
      subTitle: keep(d.subTitle, old.subTitle), productType: keep(d.productType, old.productType),
      shortDescription: keep(d.shortDescription, old.shortDescription), section: keep(d.section, old.section),
      sections: keep(d.sections, old.sections), categoryPaths: keep(d.categoryPaths, old.categoryPaths),
      images: json(keep(d.images, old.images)), documents: json(keep(d.documents, old.documents)), options: json(keep(d.options, old.options)),
      leasePlans: json(keep(d.leasePlans, old.leasePlans)), accessories: json(keep(d.accessories, old.accessories)),
      alsoBought: json(keep(d.alsoBought, old.alsoBought)), reviews: json(keep(d.reviews, old.reviews)), videos: json(keep(d.videos, old.videos)),
      attributes: json({ ...((old.attributes ?? {}) as Record<string, string>), ...d.attributes }),
      dataFlags: [...new Set([...old.dataFlags, ...d.dataFlags])], sourceFile,
    };
  }
  return {
    productId: id, mpn: d.mpn, gtin: d.gtin, condition: d.condition, subTitle: d.subTitle, productType: d.productType,
    shortDescription: d.shortDescription, section: d.section, sections: d.sections, categoryPaths: d.categoryPaths,
    images: json(d.images), documents: json(d.documents), options: json(d.options), leasePlans: json(d.leasePlans),
    accessories: json(d.accessories), alsoBought: json(d.alsoBought), reviews: json(d.reviews), videos: json(d.videos),
    attributes: json(d.attributes), dataFlags: d.dataFlags, sourceFile,
  };
}

// Bytes 0x80-0x9F that Windows-1252 leaves undefined decode to control characters, which are not usable text either.
const WIN1252 = new Set([...new TextDecoder("windows-1252").decode(Uint8Array.from({ length: 256 }, (_, i) => i))].filter((ch) => ch.charCodeAt(0) < 0x80 || ch.charCodeAt(0) > 0x9f));
const DIAMETER = new Set(["⌀", "∅", "Ø"]);

// A database created in a Windows code page (not UTF-8) cannot hold characters such as the diameter signs, which the workbooks use for
// diameters. Rather than fail 19,000 products on a handful of characters, they are swapped for the nearest ones it can.
function fitToLatin(value: unknown): unknown {
  if (typeof value === "string") {
    return [...value].map((ch) => (WIN1252.has(ch) || ch.charCodeAt(0) < 128 ? ch : DIAMETER.has(ch) ? "Ø" : "?")).join("");
  }
  if (Array.isArray(value)) return value.map(fitToLatin);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fitToLatin(v)]));
  return value;
}

async function fitToDatabase(db: PrismaClient, plan: Plan): Promise<Plan> {
  const [{ server_encoding: encoding }] = await db.$queryRaw<{ server_encoding: string }[]>`show server_encoding`;
  if (encoding === "UTF8") return plan;
  const fitted = fitToLatin({ categories: plan.categories, products: plan.products }) as Pick<Plan, "categories" | "products">;
  return { ...plan, ...fitted, warnings: [...plan.warnings, `This database stores text as ${encoding}, not UTF-8, so a few symbols (such as the diameter sign) were replaced. Create the database with UTF-8 to keep them.`] };
}

/** Writes the plan: categories first, then products, then their details. Safe to run again; it never creates a duplicate. */
export async function applyPlan(db: PrismaClient, original: Plan, options: ImportOptions, sourceFile: string, progress: Progress = () => {}): Promise<ImportSummary> {
  // An empty database is seeded with the ovens and cooking catalogue the first time the site runs. Importing first would skip that.
  if ((await db.category.count()) === 0) throw new Error("The catalogue has not been created yet. Open the website once, then import.");
  const plan = await fitToDatabase(db, original);
  const summary = await summarise(db, plan, options);
  const r = await resolve(db, plan);

  progress("Saving categories", 0, plan.categories.length);
  const start = (await db.category.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  const parentSlug = (url: string | null) => (url ? (r.slugOf.get(url) ?? null) : null);
  const fresh = plan.categories.filter((c) => r.fresh.has(c.sourceUrl));
  for (const part of chunks(fresh, 300)) {
    await db.category.createMany({
      data: part.map((c) => ({
        slug: r.slugOf.get(c.sourceUrl)!, label: c.label, audience: "", cooking: [], supply: [], covers: [],
        sortOrder: start + 1 + c.sortOrder, parentSlug: parentSlug(c.parentUrl), section: c.section, path: c.path, sourceUrl: c.sourceUrl,
      })),
      skipDuplicates: true,
    });
  }
  let done = 0;
  for (const part of chunks(plan.categories.filter((c) => !r.fresh.has(c.sourceUrl)), 100)) {
    await db.$transaction(part.map((c) => db.category.update({
      where: { slug: r.slugOf.get(c.sourceUrl)! },
      data: { parentSlug: parentSlug(c.parentUrl), section: c.section, path: c.path, sourceUrl: c.sourceUrl },
    })));
    progress("Saving categories", (done += part.length), plan.categories.length);
  }

  const slug = (url: string) => r.slugOf.get(url)!;
  const isNew = (p: PlannedProduct) => !r.existing.has(p.code.toLowerCase());
  const created = plan.products.filter(isNew);
  const status = options.publish ? "ACTIVE" : "DRAFT";
  const total = plan.products.length;
  done = 0;

  for (const part of chunks(created, 300)) {
    await db.product.createMany({
      data: part.map((p) => ({
        id: p.id, token: p.code, name: p.name, brand: p.brand, categorySlug: slug(p.categoryUrl),
        alsoIn: [...new Set(p.alsoInUrls.map(slug).filter((s) => s !== slug(p.categoryUrl)))],
        image: p.image ?? PLACEHOLDER, priceExPence: p.priceExPence, priceIncPence: p.priceIncPence, leaseWeekPence: p.leaseWeekPence,
        availability: p.availability, status, webExclusive: p.webExclusive, legacyUrl: p.legacyUrl,
        description: p.description, seoTitle: p.seoTitle, seoDescription: p.seoDescription,
      })),
      skipDuplicates: true,
    });
    progress("Saving products", (done += part.length), total);
  }

  if (options.updateExisting) {
    const current = plan.products.filter((p) => !isNew(p));
    const images = new Map((await db.product.findMany({ where: { id: { in: current.map((p) => r.existing.get(p.code.toLowerCase())!) } }, select: { id: true, image: true } })).map((x) => [x.id, x.image]));
    for (const part of chunks(current, 100)) {
      await db.$transaction(part.map((p) => {
        const id = r.existing.get(p.code.toLowerCase())!;
        const keepImage = !p.image || (images.get(id) ?? "").startsWith("/assets/img/products/");
        return db.product.update({
          where: { id },
          data: {
            name: p.name, brand: p.brand, ...(keepImage ? {} : { image: p.image! }),
            priceExPence: p.priceExPence, priceIncPence: p.priceIncPence, leaseWeekPence: p.leaseWeekPence,
            availability: p.availability, webExclusive: p.webExclusive,
            ...(p.description ? { description: p.description } : {}),
            ...(p.seoTitle ? { seoTitle: p.seoTitle } : {}), ...(p.seoDescription ? { seoDescription: p.seoDescription } : {}),
          },
        });
      }));
      progress("Saving products", (done += part.length), total);
    }
  } else {
    done += plan.products.length - created.length;
  }

  // Publishing also takes the products of earlier imports that are still drafts live, so a second pass can finish the job.
  if (options.publish) {
    const earlier = plan.products.flatMap((p) => r.existing.get(p.code.toLowerCase()) ?? []);
    for (const part of chunks(earlier, 1000)) await db.product.updateMany({ where: { id: { in: part }, status: "DRAFT" }, data: { status: "ACTIVE" } });
  }

  done = 0;
  for (const part of chunks(plan.products, 60)) {
    const ids = part.map((p) => r.existing.get(p.code.toLowerCase()) ?? p.id);
    const old = new Map((await db.productDetail.findMany({ where: { productId: { in: ids } } })).map((x) => [x.productId, x]));
    await db.productDetail.deleteMany({ where: { productId: { in: ids } } });
    await db.productDetail.createMany({ data: part.map((p, i) => detailData(ids[i], p, sourceFile, old.get(ids[i]))) });
    progress("Saving product details", (done += part.length), total);
  }
  return summary;
}
