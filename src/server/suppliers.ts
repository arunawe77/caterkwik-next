import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  codeKey, compareCosts, FEED_FIELDS, guessMapping, parseCsv, readFeed, seedSuppliers, slugOf, type CostComparison, type CostLine, type FeedMapping,
} from "@/lib/suppliers";
import { createProduct } from "@/server/catalogue-admin";
import { db } from "@/server/db";

// The supplier module. A feed supplier (Uropa) is loaded from an uploaded price file and matched to our products by
// part number; a direct supplier's cost is typed in. Nothing here changes a selling price: it records what things cost
// and shows where a feed undercuts what we pay direct. Every change is written to the activity log.

export interface Actor {
  id: string | null;
  name: string;
  source: "STAFF" | "AI";
}

export class SupplierError extends Error {}

const issues = (e: z.ZodError) => e.issues.map((i) => i.message).join(" ");

async function audit(actor: Actor, a: { action: string; entity: string; entityId: string; summary: string; before?: unknown; after?: unknown }) {
  const json = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));
  await db.auditLog.create({
    data: { actorId: actor.id, actorName: actor.name, source: actor.source, action: a.action, entity: a.entity, entityId: a.entityId, summary: a.summary, before: json(a.before), after: json(a.after) },
  });
}

// ---- Suppliers -------------------------------------------------------------------------

/** Puts Uropa and the suppliers named alongside its brands into an empty table. Rows already there are never touched. */
export async function ensureSuppliers(): Promise<void> {
  if ((await db.supplier.count()) > 0) return;
  const seed = seedSuppliers();
  await db.supplier.createMany({ data: seed.map((s, i) => ({ id: s.id, name: s.name, kind: s.kind, sortOrder: i })), skipDuplicates: true });
  await db.supplierBrand.createMany({ data: seed.flatMap((s) => s.brands.map((brand) => ({ supplierId: s.id, brand }))), skipDuplicates: true });
}

const supplierFields = z.object({
  name: z.string().trim().min(2, "Give the supplier a name.").max(80),
  kind: z.enum(["FEED", "DIRECT"]),
  website: z.string().trim().max(300).refine((v) => v === "" || /^https?:\/\//.test(v), "The website must start with http:// or https://").transform((v) => v || null),
  notes: z.string().trim().max(1000).transform((v) => v || null),
});

export async function addSupplier(actor: Actor, input: unknown) {
  const parsed = supplierFields.partial({ kind: true, website: true, notes: true }).safeParse(input);
  if (!parsed.success) throw new SupplierError(issues(parsed.error));
  const v = parsed.data;
  if (!v.name) throw new SupplierError("Give the supplier a name.");
  const base = slugOf(v.name) || "supplier";
  let id = base;
  for (let n = 2; await db.supplier.findUnique({ where: { id }, select: { id: true } }); n++) id = `${base}-${n}`;
  const row = await db.supplier.create({ data: { id, name: v.name, kind: v.kind ?? "DIRECT", website: v.website ?? null, notes: v.notes ?? null, sortOrder: await db.supplier.count() } });
  await audit(actor, { action: "create", entity: "supplier", entityId: id, summary: `Added supplier "${row.name}"`, after: row });
  return row;
}

export async function updateSupplier(actor: Actor, id: string, input: unknown) {
  const parsed = supplierFields.partial().extend({ active: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) throw new SupplierError(issues(parsed.error));
  const before = await db.supplier.findUnique({ where: { id } });
  if (!before) throw new SupplierError(`There is no supplier "${id}".`);
  const after = await db.supplier.update({ where: { id }, data: parsed.data });
  const bits = [
    before.active !== after.active && (after.active ? "resumed" : "paused"),
    before.name !== after.name && "renamed",
    before.kind !== after.kind && `now ${after.kind === "FEED" ? "a feed" : "direct"}`,
    before.notes !== after.notes && "notes changed",
  ].filter(Boolean);
  await audit(actor, { action: "update", entity: "supplier", entityId: id, summary: `Supplier "${after.name}": ${bits.join(", ") || "saved"}`, before, after });
  return after;
}

export async function deleteSupplier(actor: Actor, id: string): Promise<void> {
  const before = await db.supplier.findUnique({ where: { id }, include: { _count: { select: { prices: true } } } });
  if (!before) throw new SupplierError(`There is no supplier "${id}".`);
  await db.supplier.delete({ where: { id } });
  await audit(actor, { action: "delete", entity: "supplier", entityId: id, summary: `Removed supplier "${before.name}" and its ${before._count.prices} recorded costs`, before });
}

/** Replaces the brands a supplier carries. One per line or comma separated. */
export async function setBrands(actor: Actor, supplierId: string, raw: string): Promise<number> {
  const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw new SupplierError(`There is no supplier "${supplierId}".`);
  const brands = [...new Set(raw.split(/[\n,]/).map((b) => b.trim()).filter(Boolean))].slice(0, 500);
  await db.$transaction([
    db.supplierBrand.deleteMany({ where: { supplierId } }),
    db.supplierBrand.createMany({ data: brands.map((brand) => ({ supplierId, brand })) }),
  ]);
  await audit(actor, { action: "update", entity: "supplier", entityId: supplierId, summary: `${supplier.name} now carries ${brands.length} brands`, after: { brands } });
  return brands.length;
}

/** Marks which of a supplier's brands Caterkwik sells, and adds any new brand names typed in. An empty selection means "show everything". */
export async function setSelectedBrands(actor: Actor, supplierId: string, selected: string[], extra = ""): Promise<number> {
  const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw new SupplierError(`There is no supplier "${supplierId}".`);
  const added = extra.split(/[\n,]/).map((b) => b.trim()).filter(Boolean);
  const chosen = new Set([...selected, ...added].map((b) => b.trim().toLowerCase()).filter(Boolean));
  const existing = await db.supplierBrand.findMany({ where: { supplierId } });
  const have = new Set(existing.map((b) => b.brand.toLowerCase()));
  const news = [...new Map(added.map((b) => [b.toLowerCase(), b])).values()].filter((b) => !have.has(b.toLowerCase()));
  await db.$transaction([
    ...(news.length ? [db.supplierBrand.createMany({ data: news.map((brand) => ({ supplierId, brand })), skipDuplicates: true })] : []),
    db.supplierBrand.updateMany({ where: { supplierId }, data: { selected: false } }),
    ...(chosen.size ? [db.supplierBrand.updateMany({ where: { supplierId, OR: [...chosen].map((b) => ({ brand: { equals: b, mode: "insensitive" as const } })) }, data: { selected: true } })] : []),
  ]);
  await audit(actor, { action: "update", entity: "supplier", entityId: supplierId, summary: `${supplier.name}: ${chosen.size ? `showing ${chosen.size} selected brands` : "showing all brands"}`, after: { selected: [...chosen] } });
  return chosen.size;
}

export async function saveMapping(actor: Actor, supplierId: string, mapping: FeedMapping): Promise<void> {
  const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw new SupplierError(`There is no supplier "${supplierId}".`);
  const clean: FeedMapping = {};
  for (const f of FEED_FIELDS) if (mapping[f.key]?.trim()) clean[f.key] = mapping[f.key]!.trim();
  await db.supplier.update({ where: { id: supplierId }, data: { feedMapping: clean } });
  await audit(actor, { action: "update", entity: "supplier", entityId: supplierId, summary: `Saved the feed columns for ${supplier.name}`, before: supplier.feedMapping, after: clean });
}

// ---- Costs -----------------------------------------------------------------------------

const costFields = z.object({
  productId: z.string().min(1),
  supplierId: z.string().min(1),
  cost: z.number().min(0.01, "The cost must be more than £0.").max(1_000_000, "That cost is too high."),
  basis: z.enum(["ex", "inc"]),
  sku: z.string().trim().max(80).transform((v) => v || null),
  note: z.string().trim().max(300).transform((v) => v || null),
});

/** Records what a supplier charges us for one of our products, typed in by staff. Replaces the previous cost. */
export async function recordCost(actor: Actor, input: unknown) {
  const parsed = costFields.safeParse(input);
  if (!parsed.success) throw new SupplierError(issues(parsed.error));
  const v = parsed.data;
  const [product, supplier] = await Promise.all([
    db.product.findUnique({ where: { id: v.productId }, select: { id: true, name: true } }),
    db.supplier.findUnique({ where: { id: v.supplierId } }),
  ]);
  if (!product) throw new SupplierError("That product no longer exists.");
  if (!supplier) throw new SupplierError("That supplier no longer exists.");
  const costExPence = Math.round((v.basis === "inc" ? v.cost / 1.2 : v.cost) * 100);
  const sku = v.sku ?? `product:${product.id}`;
  const key = { supplierId_sku: { supplierId: supplier.id, sku } };
  const before = await db.supplierPrice.findUnique({ where: key });
  const data = { productId: product.id, costExPence, source: "MANUAL" as const, note: v.note, updatedBy: actor.name, seenAt: new Date() };
  const row = await db.supplierPrice.upsert({ where: key, create: { supplierId: supplier.id, sku, name: product.name, ...data }, update: data });
  const gbp = (p: number | null) => (p === null ? "no cost" : `£${(p / 100).toFixed(2)} ex VAT`);
  await audit(actor, {
    action: before ? "update" : "create", entity: "supplier-cost", entityId: row.id,
    summary: `${supplier.name} on "${product.name}": ${before ? `${gbp(before.costExPence)} to ` : ""}${gbp(costExPence)}`, before, after: row,
  });
  return row;
}

export async function clearCost(actor: Actor, id: string): Promise<string | null> {
  const before = await db.supplierPrice.findUnique({ where: { id }, include: { supplier: true, product: { select: { name: true } } } });
  if (!before) return null;
  // A feed row stays (it is the supplier's listing); only unlink it. A typed-in cost is deleted.
  if (before.source === "FEED") await db.supplierPrice.update({ where: { id }, data: { productId: null } });
  else await db.supplierPrice.delete({ where: { id } });
  await audit(actor, { action: "delete", entity: "supplier-cost", entityId: id, summary: `Cleared ${before.supplier.name} on "${before.product?.name ?? before.sku}"`, before });
  return before.productId;
}

/** Matches an unmatched supplier item to one of our products by hand. */
export async function linkItem(actor: Actor, priceId: string, productId: string): Promise<void> {
  const [item, product] = await Promise.all([
    db.supplierPrice.findUnique({ where: { id: priceId }, include: { supplier: true } }),
    db.product.findUnique({ where: { id: productId.trim() }, select: { id: true, name: true } }),
  ]);
  if (!item) throw new SupplierError("That supplier item no longer exists.");
  if (!product) throw new SupplierError(`There is no product with the address "${productId.trim()}".`);
  if (await db.supplierPrice.findFirst({ where: { supplierId: item.supplierId, productId: product.id, NOT: { id: item.id } } })) {
    throw new SupplierError(`${item.supplier.name} already has a cost for that product. Clear it first.`);
  }
  await db.supplierPrice.update({ where: { id: item.id }, data: { productId: product.id } });
  await audit(actor, { action: "update", entity: "supplier-cost", entityId: item.id, summary: `Linked ${item.supplier.name} ${item.sku} to "${product.name}"`, after: { productId: product.id } });
}

// ---- Feed import -----------------------------------------------------------------------

export interface FeedResult { runId: string; rows: number; matched: number; unmatched: number; created: number; changed: number; skipped: number; warnings: string[] }

/** Loads a supplier's price file: updates costs and stock for items already known, adds new ones, and matches by part number. */
export async function importFeed(actor: Actor, supplierId: string, fileName: string, csvText: string): Promise<FeedResult> {
  const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw new SupplierError(`There is no supplier "${supplierId}".`);
  const table = parseCsv(csvText);
  if (table.length < 2) throw new SupplierError("The file has no rows. It must be a CSV with a header line.");
  const mapping = { ...guessMapping(table[0]), ...((supplier.feedMapping as FeedMapping | null) ?? {}) };
  const { rows, skipped, missing } = readFeed(table, mapping);
  if (missing.length) throw new SupplierError(`Could not find a column for: ${missing.join(", ")}. Set the columns on the supplier page. The file's columns are: ${table[0].join(", ")}.`);

  // Our products by part number. A code shared by two products is ambiguous and left unmatched rather than guessed.
  const [details, existing, products] = await Promise.all([
    db.productDetail.findMany({ where: { mpn: { not: null } }, select: { productId: true, mpn: true } }),
    db.supplierPrice.findMany({ where: { supplierId }, select: { id: true, sku: true, productId: true, costExPence: true, stockQty: true, source: true } }),
    db.product.findMany({ select: { id: true } }),
  ]);
  const productIds = new Set(products.map((p) => p.id));
  const byCode = new Map<string, string | null>();
  for (const d of details) {
    const k = codeKey(d.mpn);
    if (!k) continue;
    byCode.set(k, byCode.has(k) && byCode.get(k) !== d.productId ? null : d.productId);
  }
  const known = new Map(existing.map((e) => [e.sku, e]));
  const warnings: string[] = [];
  let matched = 0, unmatched = 0, created = 0, changed = 0, ambiguous = 0, noCost = 0;
  const now = new Date();

  const creates: Prisma.SupplierPriceCreateManyInput[] = [];
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  for (const r of rows) {
    const old = known.get(r.sku);
    // A hand-made link is kept; otherwise match by the manufacturer number, then by the supplier's own code.
    const k = codeKey(r.mpn) || codeKey(r.sku);
    const fromCode = (k && byCode.get(k)) || (codeKey(r.sku) && byCode.get(codeKey(r.sku))) || null;
    if (k && byCode.get(k) === null) ambiguous++;
    const productId = old?.productId && productIds.has(old.productId) ? old.productId : fromCode;
    if (productId) matched++; else unmatched++;
    if (r.costExPence === null) noCost++;
    if (!old) {
      created++;
      creates.push({ supplierId, productId, sku: r.sku, mpn: r.mpn, brand: r.brand, name: r.name, costExPence: r.costExPence, stockQty: r.stockQty, source: "FEED", seenAt: now, updatedBy: actor.name });
    } else {
      if (old.costExPence !== (r.costExPence ?? old.costExPence) || old.stockQty !== (r.stockQty ?? old.stockQty) || old.productId !== productId) changed++;
      updates.push(db.supplierPrice.update({
        where: { id: old.id },
        data: { productId, mpn: r.mpn, brand: r.brand, name: r.name, costExPence: r.costExPence ?? old.costExPence, stockQty: r.stockQty ?? old.stockQty, seenAt: now, updatedBy: actor.name },
      }));
    }
  }
  for (let i = 0; i < creates.length; i += 1000) await db.supplierPrice.createMany({ data: creates.slice(i, i + 1000), skipDuplicates: true });
  for (let i = 0; i < updates.length; i += 200) await db.$transaction(updates.slice(i, i + 200));

  if (skipped) warnings.push(`${skipped} rows had no supplier code (or repeated one) and were skipped.`);
  if (noCost) warnings.push(`${noCost} rows had no usable cost price.`);
  if (ambiguous) warnings.push(`${ambiguous} rows share a part number with more than one of our products, so were left unmatched.`);
  const run = await db.supplierFeedRun.create({
    data: { supplierId, actorName: actor.name, fileName, rows: rows.length, matched, unmatched, created, changed, skipped, warnings },
  });
  await audit(actor, {
    action: "import", entity: "supplier", entityId: supplierId,
    summary: `Loaded ${fileName} for ${supplier.name}: ${rows.length} rows, ${matched} matched, ${created} new, ${changed} changed`, after: run,
  });
  return { runId: run.id, rows: rows.length, matched, unmatched, created, changed, skipped, warnings };
}

/** A where-clause limiting feed items to the brands marked as sold; empty (no limit) when none are marked. */
async function selectedFilter(supplierId: string): Promise<Prisma.SupplierPriceWhereInput> {
  const sel = await db.supplierBrand.findMany({ where: { supplierId, selected: true }, select: { brand: true } });
  return sel.length ? { OR: sel.map((b) => ({ brand: { equals: b.brand, mode: "insensitive" as const } })) } : {};
}

// ---- Importing new products from a feed ------------------------------------------------

export interface DraftResult { created: number; failed: number; skippedNoName: number; messages: string[] }

/** Creates a draft product for each unmatched feed item (optionally one brand), under the chosen category, and links the item to it.
 *  Drafts have no selling price and stay off the storefront until staff price and publish them. */
export async function createDraftsFromFeed(actor: Actor, supplierId: string, input: { categorySlug: string; brand?: string; limit?: number }): Promise<DraftResult> {
  if (!(await db.supplier.findUnique({ where: { id: supplierId }, select: { id: true } }))) throw new SupplierError(`There is no supplier "${supplierId}".`);
  if (!input.categorySlug) throw new SupplierError("Choose a category for the new products.");
  if (!(await db.category.findUnique({ where: { slug: input.categorySlug }, select: { slug: true } }))) throw new SupplierError(`There is no category "${input.categorySlug}".`);
  const only = input.brand ? { brand: input.brand } : await selectedFilter(supplierId);
  const items = await db.supplierPrice.findMany({
    where: { supplierId, productId: null, source: "FEED", ...only },
    orderBy: [{ brand: "asc" }, { sku: "asc" }], take: Math.min(Math.max(input.limit ?? 200, 1), 500),
  });
  const out: DraftResult = { created: 0, failed: 0, skippedNoName: 0, messages: [] };
  for (const item of items) {
    const name = (item.name ?? "").trim();
    if (name.length < 2) { out.skippedNoName++; continue; }
    try {
      const product = await createProduct(actor, { name: item.brand && !name.toLowerCase().includes(item.brand.toLowerCase()) ? `${item.brand} ${name}` : name, categorySlug: input.categorySlug, brand: item.brand, status: "DRAFT", stockQty: item.stockQty });
      if (item.mpn) await db.productDetail.upsert({ where: { productId: product.id }, create: { productId: product.id, mpn: item.mpn }, update: { mpn: item.mpn } });
      await db.supplierPrice.update({ where: { id: item.id }, data: { productId: product.id } });
      out.created++;
    } catch (err) {
      out.failed++;
      if (out.messages.length < 5) out.messages.push(`${item.sku}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  await audit(actor, { action: "import", entity: "supplier", entityId: supplierId, summary: `Created ${out.created} draft products from the feed${input.brand ? ` (${input.brand})` : ""}`, after: out });
  return out;
}

// ---- Reading ---------------------------------------------------------------------------

export async function overview() {
  const [suppliers, counts, matched, runs] = await Promise.all([
    db.supplier.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { brands: true } } } }),
    db.supplierPrice.groupBy({ by: ["supplierId"], _count: { _all: true } }),
    db.supplierPrice.groupBy({ by: ["supplierId"], where: { productId: { not: null } }, _count: { _all: true } }),
    db.supplierFeedRun.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { supplierId: true, createdAt: true } }),
  ]);
  const total = new Map(counts.map((c) => [c.supplierId, c._count._all]));
  const linked = new Map(matched.map((c) => [c.supplierId, c._count._all]));
  const last = new Map<string, Date>();
  for (const r of runs) if (!last.has(r.supplierId)) last.set(r.supplierId, r.createdAt);
  return suppliers.map((s) => ({
    id: s.id, name: s.name, kind: s.kind, website: s.website, notes: s.notes, active: s.active, brands: s._count.brands,
    items: total.get(s.id) ?? 0, matched: linked.get(s.id) ?? 0, lastFeed: last.get(s.id) ?? null,
  }));
}

export async function supplierDetail(id: string, filter: { brand?: string; page?: number; all?: boolean } = {}) {
  const supplier = await db.supplier.findUnique({ where: { id }, include: { brands: { orderBy: { brand: "asc" } } } });
  if (!supplier) return null;
  const page = Math.max(1, filter.page ?? 1);
  const limit = filter.all ? {} : await selectedFilter(id);
  const where: Prisma.SupplierPriceWhereInput = { supplierId: id, productId: null, ...(filter.brand ? { brand: filter.brand } : limit) };
  const [runs, unmatched, unmatchedCount, brandRows, linked] = await Promise.all([
    db.supplierFeedRun.findMany({ where: { supplierId: id }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.supplierPrice.findMany({ where, orderBy: [{ brand: "asc" }, { sku: "asc" }], skip: (page - 1) * 50, take: 50 }),
    db.supplierPrice.count({ where }),
    db.supplierPrice.groupBy({ by: ["brand"], where: { supplierId: id, productId: null }, _count: { _all: true }, orderBy: { brand: "asc" } }),
    // (chips below are narrowed to the selection in JS, so a brand's count stays visible when you switch the filter off)
    db.supplierPrice.count({ where: { supplierId: id, productId: { not: null } } }),
  ]);
  const mapping = { ...((supplier.feedMapping as FeedMapping | null) ?? {}) };
  const selectedBrands = supplier.brands.filter((b) => b.selected).map((b) => b.brand);
  const wanted = new Set(selectedBrands.map((b) => b.toLowerCase()));
  const chips = brandRows.filter((b) => b.brand && (filter.all || !wanted.size || wanted.has(b.brand.toLowerCase())));
  const brandCounts = Object.fromEntries(brandRows.filter((b) => b.brand).map((b) => [b.brand!.toLowerCase(), b._count._all]));
  return { supplier, mapping, selectedBrands, brandCounts, showingAll: !!filter.all || !selectedBrands.length, runs, unmatched, unmatchedCount, unmatchedBrands: chips.map((b) => ({ brand: b.brand!, count: b._count._all })), linked, page };
}

export async function productCosts(productId: string) {
  const [rows, suppliers, product] = await Promise.all([
    db.supplierPrice.findMany({ where: { productId }, include: { supplier: true }, orderBy: { costExPence: "asc" } }),
    db.supplier.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.product.findUnique({ where: { id: productId }, select: { priceExPence: true } }),
  ]);
  const comparison = compareCosts(rows.map((r) => ({ supplierId: r.supplierId, supplierName: r.supplier.name, kind: r.supplier.kind, costExPence: r.costExPence })));
  return { rows, suppliers, comparison, sellEx: product?.priceExPence ?? null };
}

export interface UndercutRow { productId: string; name: string; sellEx: number | null; comparison: CostComparison }

/** Products that cost less from a feed supplier than the cheapest direct supplier, biggest saving first. */
export async function feedUndercuts(): Promise<UndercutRow[]> {
  const rows = await db.supplierPrice.findMany({
    where: { productId: { not: null }, costExPence: { not: null }, supplier: { active: true } },
    select: { productId: true, supplierId: true, costExPence: true, supplier: { select: { name: true, kind: true } }, product: { select: { name: true, priceExPence: true, status: true } } },
  });
  const by = new Map<string, { name: string; sellEx: number | null; lines: CostLine[] }>();
  for (const r of rows) {
    if (!r.product || r.product.status === "ARCHIVED") continue;
    const e = by.get(r.productId!) ?? { name: r.product.name, sellEx: r.product.priceExPence, lines: [] };
    e.lines.push({ supplierId: r.supplierId, supplierName: r.supplier.name, kind: r.supplier.kind, costExPence: r.costExPence });
    by.set(r.productId!, e);
  }
  return [...by.entries()]
    .map(([productId, e]) => ({ productId, name: e.name, sellEx: e.sellEx, comparison: compareCosts(e.lines) }))
    .filter((r) => r.comparison.feedSaving)
    .sort((a, b) => b.comparison.feedSaving!.pence - a.comparison.feedSaving!.pence);
}
