import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { bothPrices, cleanDomain, gapOf, isStale, positionOf, SEED_COMPETITORS, slugOf, urlOnDomain, type Position } from "@/lib/competitors";
import { db } from "@/server/db";

// The competitor module. Prices are typed in by staff from the competitor's public product page,
// because every one of these sites blocks automated requests. Each entry keeps a history row, and
// every change is written to the activity log.

export interface Actor {
  id: string | null;
  name: string;
  source: "STAFF" | "AI";
}

export class CompetitorError extends Error {}

const issues = (e: z.ZodError) => e.issues.map((i) => i.message).join(" ");

async function audit(actor: Actor, a: { action: string; entity: string; entityId: string; summary: string; before?: unknown; after?: unknown }) {
  const json = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));
  await db.auditLog.create({
    data: { actorId: actor.id, actorName: actor.name, source: actor.source, action: a.action, entity: a.entity, entityId: a.entityId, summary: a.summary, before: json(a.before), after: json(a.after) },
  });
}

// ---- Competitors -----------------------------------------------------------------------

/** Puts the six starting competitors in an empty table. Rows already there are never touched. */
export async function ensureCompetitors(): Promise<void> {
  if ((await db.competitor.count()) > 0) return;
  await db.competitor.createMany({ data: SEED_COMPETITORS.map((c, i) => ({ ...c, sortOrder: i })), skipDuplicates: true });
}

const competitorFields = z.object({
  name: z.string().trim().min(2, "Give the competitor a name.").max(80),
  domain: z.string().transform(cleanDomain).pipe(z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Enter the site's domain, for example nisbets.co.uk")),
  url: z.string().trim().max(300).refine((v) => /^https?:\/\//.test(v), "The shop front must start with http:// or https://").optional(),
  notes: z.string().trim().max(500).transform((v) => v || null).optional(),
});

export async function addCompetitor(actor: Actor, input: unknown) {
  const parsed = competitorFields.safeParse(input);
  if (!parsed.success) throw new CompetitorError(issues(parsed.error));
  const v = parsed.data;
  if (await db.competitor.findFirst({ where: { domain: v.domain } })) throw new CompetitorError(`${v.domain} is already on the list.`);
  const base = slugOf(v.name) || "competitor";
  let id = base;
  for (let n = 2; await db.competitor.findUnique({ where: { id }, select: { id: true } }); n++) id = `${base}-${n}`;
  const sortOrder = await db.competitor.count();
  const row = await db.competitor.create({ data: { id, name: v.name, domain: v.domain, url: v.url ?? `https://www.${v.domain}/`, notes: v.notes ?? null, sortOrder } });
  await audit(actor, { action: "create", entity: "competitor", entityId: id, summary: `Added competitor "${row.name}" (${row.domain})`, after: row });
  return row;
}

export async function updateCompetitor(actor: Actor, id: string, input: unknown) {
  const parsed = competitorFields.partial().extend({ active: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) throw new CompetitorError(issues(parsed.error));
  const before = await db.competitor.findUnique({ where: { id } });
  if (!before) throw new CompetitorError(`There is no competitor "${id}".`);
  if (parsed.data.domain && parsed.data.domain !== before.domain && (await db.competitor.findFirst({ where: { domain: parsed.data.domain, NOT: { id } } }))) {
    throw new CompetitorError(`${parsed.data.domain} is already on the list.`);
  }
  const after = await db.competitor.update({ where: { id }, data: parsed.data });
  const bits = [
    before.active !== after.active && (after.active ? "resumed" : "paused"),
    before.name !== after.name && "renamed",
    before.domain !== after.domain && "domain changed",
    before.notes !== after.notes && "notes changed",
  ].filter(Boolean);
  await audit(actor, { action: "update", entity: "competitor", entityId: id, summary: `Competitor "${after.name}": ${bits.join(", ") || "saved"}`, before, after });
  return after;
}

export async function deleteCompetitor(actor: Actor, id: string): Promise<void> {
  const before = await db.competitor.findUnique({ where: { id }, include: { _count: { select: { prices: true } } } });
  if (!before) throw new CompetitorError(`There is no competitor "${id}".`);
  await db.competitor.delete({ where: { id } });
  await audit(actor, { action: "delete", entity: "competitor", entityId: id, summary: `Removed competitor "${before.name}" and its ${before._count.prices} recorded prices`, before });
}

// ---- Prices ----------------------------------------------------------------------------

const priceFields = z.object({
  productId: z.string().min(1),
  competitorId: z.string().min(1),
  price: z.number().min(0.01, "The price must be more than £0.").max(1_000_000, "That price is too high.").nullable(),
  basis: z.enum(["ex", "inc"]),
  url: z.string().trim().max(500).transform((v) => v || null),
  theirName: z.string().trim().max(200).transform((v) => v || null),
  inStock: z.boolean().nullable(),
  note: z.string().trim().max(300).transform((v) => v || null),
});

/** Records what a competitor currently charges for one of our products. Replaces the latest price and adds a history row. */
export async function recordPrice(actor: Actor, input: unknown) {
  const parsed = priceFields.safeParse(input);
  if (!parsed.success) throw new CompetitorError(issues(parsed.error));
  const v = parsed.data;
  const [product, competitor] = await Promise.all([
    db.product.findUnique({ where: { id: v.productId }, select: { id: true, name: true, priceExPence: true } }),
    db.competitor.findUnique({ where: { id: v.competitorId } }),
  ]);
  if (!product) throw new CompetitorError("That product no longer exists.");
  if (!competitor) throw new CompetitorError("That competitor no longer exists.");
  if (v.price === null && v.inStock === null && !v.url) throw new CompetitorError("Enter a price, a page address or whether it is in stock.");
  if (v.url && !urlOnDomain(v.url, competitor.domain)) throw new CompetitorError(`The page address must be on ${competitor.domain}.`);

  const { ex, inc } = bothPrices(v.price, v.basis);
  const key = { productId_competitorId: { productId: v.productId, competitorId: v.competitorId } };
  const before = await db.competitorPrice.findUnique({ where: key });
  const data = { url: v.url, theirName: v.theirName, priceExPence: ex, priceIncPence: inc, inStock: v.inStock, note: v.note, checkedAt: new Date(), checkedBy: actor.name };
  const row = await db.competitorPrice.upsert({ where: key, create: { productId: v.productId, competitorId: v.competitorId, ...data }, update: data });
  await db.competitorPriceLog.create({ data: { competitorPriceId: row.id, priceExPence: ex, priceIncPence: inc, inStock: v.inStock, ourExPence: product.priceExPence, checkedBy: actor.name } });
  const gbp = (p: number | null) => (p === null ? "no price" : `£${(p / 100).toFixed(2)} ex VAT`);
  await audit(actor, {
    action: before ? "update" : "create", entity: "competitor-price", entityId: row.id,
    summary: `${competitor.name} on "${product.name}": ${before ? `${gbp(before.priceExPence)} to ` : ""}${gbp(ex)}`,
    before, after: row,
  });
  return row;
}

export async function clearPrice(actor: Actor, productId: string, competitorId: string): Promise<void> {
  const key = { productId_competitorId: { productId, competitorId } };
  const before = await db.competitorPrice.findUnique({ where: key, include: { competitor: true, product: { select: { name: true } } } });
  if (!before) return;
  await db.competitorPrice.delete({ where: key });
  await audit(actor, { action: "delete", entity: "competitor-price", entityId: before.id, summary: `Cleared ${before.competitor.name} on "${before.product.name}"`, before });
}

// ---- Reading ---------------------------------------------------------------------------

export interface CompetitorSummary {
  id: string;
  name: string;
  domain: string;
  url: string;
  notes: string | null;
  active: boolean;
  tracked: number;
  priced: number;
  averageGap: number | null; // percent, positive when we are dearer
  lastChecked: Date | null;
  stale: number;
}

export interface Overview {
  competitors: CompetitorSummary[];
  positions: Record<Position, number>;
  averageGap: number | null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Everything the module's front page shows, from one pass over the recorded prices. */
export async function overview(now = new Date()): Promise<Overview> {
  const [competitors, prices] = await Promise.all([
    db.competitor.findMany({ orderBy: { sortOrder: "asc" } }),
    db.competitorPrice.findMany({
      where: { competitor: { active: true }, product: { status: { not: "ARCHIVED" } } },
      select: { productId: true, competitorId: true, priceExPence: true, checkedAt: true, product: { select: { priceExPence: true } } },
    }),
  ]);

  const byProduct = new Map<string, { ours: number | null; theirs: (number | null)[] }>();
  const byCompetitor = new Map<string, typeof prices>();
  for (const p of prices) {
    const entry = byProduct.get(p.productId) ?? { ours: p.product.priceExPence, theirs: [] };
    entry.theirs.push(p.priceExPence);
    byProduct.set(p.productId, entry);
    byCompetitor.set(p.competitorId, [...(byCompetitor.get(p.competitorId) ?? []), p]);
  }

  const positions: Record<Position, number> = { cheapest: 0, level: 0, dearer: 0, unpriced: 0, untracked: 0 };
  for (const { ours, theirs } of byProduct.values()) positions[positionOf(ours, theirs)]++;

  const gapsOf = (list: typeof prices) => list.flatMap((p) => { const g = gapOf(p.product.priceExPence, p.priceExPence); return g ? [g.percent] : []; });

  return {
    competitors: competitors.map((c) => {
      const list = byCompetitor.get(c.id) ?? [];
      return {
        id: c.id, name: c.name, domain: c.domain, url: c.url, notes: c.notes, active: c.active,
        tracked: list.length, priced: list.filter((p) => p.priceExPence !== null).length, averageGap: mean(gapsOf(list)),
        lastChecked: list.length ? new Date(Math.max(...list.map((p) => p.checkedAt.getTime()))) : null,
        stale: list.filter((p) => isStale(p.checkedAt, now)).length,
      };
    }),
    positions,
    averageGap: mean(gapsOf(prices)),
  };
}

export type ComparisonFilter = "all" | "tracked" | "cheapest" | "level" | "dearer";
export const COMPARISON_FILTERS: readonly ComparisonFilter[] = ["all", "tracked", "cheapest", "level", "dearer"];

export interface ComparisonRow {
  id: string;
  name: string;
  brand: string | null;
  image: string;
  ourEx: number | null;
  prices: Record<string, { ex: number | null; inStock: boolean | null; checkedAt: Date } | undefined>;
  lowest: number | null;
  position: Position;
  gap: number | null; // percent against the lowest competitor price
}

export async function comparison(opts: { q?: string; filter?: ComparisonFilter; page?: number; pageSize?: number }) {
  const { q = "", filter = "all", page = 1, pageSize = 30 } = opts;
  const words = q.split(/\s+/).filter(Boolean).slice(0, 6);
  const where: Prisma.ProductWhereInput = {
    status: { not: "ARCHIVED" },
    ...(filter !== "all" && { competitorPrices: { some: { competitor: { active: true } } } }),
    AND: words.map((w) => ({ OR: [{ name: { contains: w, mode: "insensitive" as const } }, { id: { contains: w, mode: "insensitive" as const } }, { brand: { contains: w, mode: "insensitive" as const } }] })),
  };
  const rows = await db.product.findMany({
    where, orderBy: { name: "asc" },
    select: {
      id: true, name: true, brand: true, image: true, priceExPence: true,
      competitorPrices: { where: { competitor: { active: true } }, select: { competitorId: true, priceExPence: true, inStock: true, checkedAt: true } },
    },
  });

  const built: ComparisonRow[] = rows.map((r) => {
    const known = r.competitorPrices.map((p) => p.priceExPence).filter((p): p is number => p !== null);
    const lowest = known.length ? Math.min(...known) : null;
    return {
      id: r.id, name: r.name, brand: r.brand, image: r.image, ourEx: r.priceExPence,
      prices: Object.fromEntries(r.competitorPrices.map((p) => [p.competitorId, { ex: p.priceExPence, inStock: p.inStock, checkedAt: p.checkedAt }])),
      lowest, position: positionOf(r.priceExPence, r.competitorPrices.map((p) => p.priceExPence)), gap: gapOf(r.priceExPence, lowest)?.percent ?? null,
    };
  });
  const shown = built.filter((r) => (filter === "all" ? true : filter === "tracked" ? r.position !== "untracked" : r.position === filter));
  // Biggest undercuts first when looking at them; otherwise by name.
  if (filter === "dearer") shown.sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0));
  return { total: shown.length, rows: shown.slice((page - 1) * pageSize, page * pageSize) };
}

/** One product with every active competitor, recorded or not, plus the recent price history. */
export async function productPrices(productId: string) {
  const [product, competitors, prices] = await Promise.all([
    db.product.findUnique({ where: { id: productId }, select: { id: true, name: true, brand: true, image: true, priceExPence: true, priceIncPence: true } }),
    db.competitor.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.competitorPrice.findMany({ where: { productId }, include: { history: { orderBy: { checkedAt: "desc" }, take: 8 } } }),
  ]);
  if (!product) return null;
  return { product, competitors, prices: new Map(prices.map((p) => [p.competitorId, p])) };
}
