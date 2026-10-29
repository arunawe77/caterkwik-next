import { Prisma } from "@prisma/client";
import { categoryIndex, draftName, mergeUropa, pickCategory } from "@/lib/uropa-feed";
import { codeKey, marginOf } from "@/lib/suppliers";
import { idOf, PLACEHOLDER_IMAGE, updateProduct } from "@/server/catalogue-admin";
import { db } from "@/server/db";
import { applyFeed, SupplierError, type Actor } from "@/server/suppliers";
import { fetchUropaFiles } from "@/server/uropa-ftp";

// The one-click Uropa sync: download the price, stock and product files, match them to our products by part number, record
// costs and stock, and add what we do not sell as drafts. It never changes a selling price: those go to a review list.
// It runs in the background, since downloading and loading the files takes minutes; the supplier page shows its progress.

const SUPPLIER = "uropa";
const UNSORTED = { slug: "uropa-unsorted", label: "Uropa: unsorted" };
/** Lines selling at less than this margin over Uropa's cost are put in front of staff to price. */
export const MIN_MARGIN = 10;

export interface SyncState { running: boolean; phase: string; done: number; total: number; startedAt: Date | null; finishedAt: Date | null; summary: string | null; error: string | null }
const state: SyncState = { running: false, phase: "", done: 0, total: 0, startedAt: null, finishedAt: null, summary: null, error: null };
export const syncStatus = (): SyncState => ({ ...state });

const step = (phase: string, done = 0, total = 0) => { state.phase = phase; state.done = done; state.total = total; };

export interface DraftSummary { created: number; fallback: number; skipped: number }

/** Adds every Uropa line we do not sell as a draft product, in bulk. Drafts have no selling price and stay off the storefront. */
export async function createDraftsBulk(actor: Actor, onProgress?: (done: number, total: number) => void): Promise<DraftSummary> {
  await db.category.upsert({ where: { slug: UNSORTED.slug }, create: { slug: UNSORTED.slug, label: UNSORTED.label }, update: {} });
  const [cats, ids] = await Promise.all([
    db.category.findMany({ select: { slug: true, label: true } }),
    db.product.findMany({ select: { id: true } }),
  ]);
  const idx = categoryIndex(cats.filter((c) => c.slug !== UNSORTED.slug));
  const taken = new Set(ids.map((p) => p.id));
  const where = { supplierId: SUPPLIER, productId: null, source: "FEED" as const, dropped: false, costExPence: { not: null } };
  const total = await db.supplierPrice.count({ where });
  const out: DraftSummary = { created: 0, fallback: 0, skipped: 0 };
  let cursor: string | undefined;
  for (;;) {
    const items = await db.supplierPrice.findMany({ where, orderBy: { id: "asc" }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!items.length) break;
    cursor = items[items.length - 1].id;
    const products: Prisma.ProductCreateManyInput[] = [];
    const details: Prisma.ProductDetailCreateManyInput[] = [];
    const links: { id: string; productId: string }[] = [];
    for (const it of items) {
      const name = draftName((it.name ?? "").trim(), it.brand);
      if (name.length < 2) { out.skipped++; continue; }
      let id = idOf(name);
      if (taken.has(id)) id = `${id.slice(0, 60)}-${codeKey(it.sku).slice(0, 20)}`;
      if (taken.has(id)) { out.skipped++; continue; }
      taken.add(id);
      const categorySlug = pickCategory(idx, it.groupName, UNSORTED.slug);
      if (categorySlug === UNSORTED.slug) out.fallback++;
      products.push({
        id, name: name.slice(0, 200), brand: it.brand?.slice(0, 80) ?? null, categorySlug, image: PLACEHOLDER_IMAGE, alsoIn: [],
        availability: "IN_STOCK", status: "DRAFT", description: it.description, stockQty: it.stockQty,
      });
      // The supplier's code is kept as the part number, which is what the next sync matches on.
      details.push({ productId: id, mpn: it.sku, sourceFile: "Uropa feed" });
      links.push({ id: it.id, productId: id });
    }
    if (products.length) {
      await db.product.createMany({ data: products, skipDuplicates: true });
      await db.productDetail.createMany({ data: details, skipDuplicates: true });
      await db.$executeRaw(Prisma.sql`UPDATE "SupplierPrice" sp SET "productId" = v.pid FROM unnest(${links.map((l) => l.id)}::text[], ${links.map((l) => l.productId)}::text[]) AS v(id, pid) WHERE sp.id = v.id`);
      out.created += products.length;
    }
    onProgress?.(out.created + out.skipped, total);
  }
  await db.auditLog.create({
    data: { actorId: actor.id, actorName: actor.name, source: actor.source, action: "import", entity: "supplier", entityId: SUPPLIER, summary: `Created ${out.created} draft products from the Uropa feed (${out.fallback} in "${UNSORTED.label}")`, after: out as unknown as Prisma.InputJsonValue },
  });
  return out;
}

async function run(actor: Actor) {
  step("Connecting to Uropa");
  const files = await fetchUropaFiles(process.env, (p) => step(p));
  step("Reading the files");
  const merged = mergeUropa(files);
  if (merged.rows.length < 100) throw new SupplierError(`Only ${merged.rows.length} usable lines were found in the Uropa files, which looks wrong, so nothing was changed.`);
  step("Matching and updating prices and stock");
  const r = await applyFeed(actor, { id: SUPPLIER, name: "Uropa" }, files.priceName, merged.rows, 0, (d, t) => step("Matching and updating prices and stock", d, t));
  step("Adding new products as drafts");
  const d = await createDraftsBulk(actor, (done, total) => step("Adding new products as drafts", done, total));
  try {
    const { refreshCatalogue } = await import("@/server/catalogue-store");
    await refreshCatalogue();
  } catch { /* the storefront picks the drafts up on its next load */ }
  return `Loaded ${files.priceName}: ${r.rows.toLocaleString("en-GB")} lines, ${r.matched.toLocaleString("en-GB")} matched to our products, ${r.changed.toLocaleString("en-GB")} costs or stock levels changed, ${d.created.toLocaleString("en-GB")} new draft products added${d.fallback ? ` (${d.fallback.toLocaleString("en-GB")} could not be placed in a category and are in "${UNSORTED.label}")` : ""}.`;
}

/** Starts a sync in the background, one at a time. False if one is already running. */
export function startUropaSync(actor: Actor): boolean {
  if (state.running) return false;
  Object.assign(state, { running: true, phase: "Starting", done: 0, total: 0, startedAt: new Date(), finishedAt: null, summary: null, error: null });
  void run(actor)
    .then((summary) => { state.summary = summary; })
    .catch((err) => { state.error = err instanceof Error ? err.message : "The Uropa sync failed."; console.error("uropa sync failed", err); })
    .finally(() => { state.running = false; state.finishedAt = new Date(); state.phase = ""; });
  return true;
}

// ---- Selling prices: for review, never automatic ----------------------------------------

export interface PriceReviewRow {
  priceId: string; productId: string; name: string; status: string; sellEx: number | null; costEx: number; webEx: number | null;
  margin: number | null; reason: "no price" | "below cost" | "thin margin";
}

/** Matched products with no selling price, or selling below the margin floor over Uropa's cost, lowest margin first. */
export async function priceReview(limit = 100): Promise<{ rows: PriceReviewRow[]; total: number }> {
  const items = await db.supplierPrice.findMany({
    where: { supplierId: SUPPLIER, dropped: false, costExPence: { not: null }, product: { is: { status: { not: "ARCHIVED" } } } },
    select: { id: true, productId: true, costExPence: true, webPence: true, product: { select: { name: true, status: true, priceExPence: true } } },
  });
  const flagged: PriceReviewRow[] = [];
  for (const it of items) {
    if (!it.product || !it.productId || it.costExPence === null) continue;
    const sell = it.product.priceExPence;
    const margin = marginOf(sell, it.costExPence);
    const reason = sell === null ? "no price" : margin! < 0 ? "below cost" : margin! < MIN_MARGIN ? "thin margin" : null;
    if (!reason) continue;
    flagged.push({ priceId: it.id, productId: it.productId, name: it.product.name, status: it.product.status, sellEx: sell, costEx: it.costExPence, webEx: it.webPence, margin, reason });
  }
  // Products already on sale first: a draft without a price is a job for later.
  flagged.sort((a, b) => Number(a.status === "DRAFT") - Number(b.status === "DRAFT") || (a.margin ?? 100) - (b.margin ?? 100));
  return { rows: flagged.slice(0, limit), total: flagged.length };
}

/** Sets a product's selling price (ex VAT) to Uropa's own web price. One product at a time, by staff. */
export async function setToWebPrice(actor: Actor, priceId: string): Promise<string> {
  const it = await db.supplierPrice.findUnique({ where: { id: priceId }, select: { productId: true, webPence: true } });
  if (!it?.productId || !it.webPence) throw new SupplierError("That line has no Uropa web price to use.");
  const product = await updateProduct(actor, it.productId, { priceEx: it.webPence / 100 });
  return product.name;
}
