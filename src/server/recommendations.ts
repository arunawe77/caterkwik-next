import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { TEAM } from "@/lib/team";
import { db } from "@/server/db";

// Staff-set slides for the "Recommended by" banner on a category page. A category with no active slides keeps the automatic
// banner. Every change is written to the activity log.

export interface Actor {
  id: string | null;
  name: string;
  source: "STAFF" | "AI";
}

export class RecommendationError extends Error {}

export interface StoredPick { productId: string; chip: string; heading: string; why: string }

const issues = (e: z.ZodError) => e.issues.map((i) => i.message).join(" ");

async function audit(actor: Actor, a: { action: string; entity: string; entityId: string; summary: string; before?: unknown; after?: unknown }) {
  const json = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));
  await db.auditLog.create({
    data: { actorId: actor.id, actorName: actor.name, source: actor.source, action: a.action, entity: a.entity, entityId: a.entityId, summary: a.summary, before: json(a.before), after: json(a.after) },
  });
}

const pick = z.object({
  productId: z.string().trim().min(1, "Choose a product for every card."),
  chip: z.string().trim().min(1, "Give each card a short label, such as Best value.").max(24, "A card label can be 24 characters at most."),
  heading: z.string().trim().min(1, "Give each card a heading.").max(60, "A card heading can be 60 characters at most."),
  why: z.string().trim().min(1, "Say why each product is recommended.").max(160, "A reason can be 160 characters at most."),
});

const slideFields = z.object({
  categorySlug: z.string().min(1),
  kicker: z.string().trim().min(2, "Give the slide a title.").max(60, "A slide title can be 60 characters at most."),
  blurb: z.string().trim().min(2, "Write a sentence for the slide.").max(240, "The sentence can be 240 characters at most."),
  recommender: z.enum(TEAM.map((t) => t.name) as [string, ...string[]], { message: "Choose who recommends it." }),
  picks: z.array(pick).min(1, "Add at least one product.").max(3, "A slide shows up to three products."),
  active: z.boolean().default(true),
});

async function checkTargets(categorySlug: string, productIds: string[]) {
  if (!(await db.category.findUnique({ where: { slug: categorySlug }, select: { slug: true } }))) throw new RecommendationError(`There is no category "${categorySlug}".`);
  if (new Set(productIds).size !== productIds.length) throw new RecommendationError("The same product is on the slide twice.");
  const found = await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, status: true } });
  for (const id of productIds) {
    const p = found.find((f) => f.id === id);
    if (!p) throw new RecommendationError(`There is no product "${id}".`);
    if (p.status === "ARCHIVED") throw new RecommendationError(`"${id}" is archived, so it cannot be recommended.`);
  }
}

export async function saveSlide(actor: Actor, id: string | null, input: unknown) {
  const parsed = slideFields.safeParse(input);
  if (!parsed.success) throw new RecommendationError(issues(parsed.error));
  const v = parsed.data;
  await checkTargets(v.categorySlug, v.picks.map((p) => p.productId));
  const before = id ? await db.recommendation.findUnique({ where: { id } }) : null;
  if (id && !before) throw new RecommendationError("That slide no longer exists.");
  const data = { categorySlug: v.categorySlug, kicker: v.kicker, blurb: v.blurb, recommender: v.recommender, picks: v.picks as unknown as Prisma.InputJsonValue, active: v.active };
  const row = before
    ? await db.recommendation.update({ where: { id: before.id }, data })
    : await db.recommendation.create({ data: { ...data, sortOrder: await db.recommendation.count({ where: { categorySlug: v.categorySlug } }) } });
  await audit(actor, {
    action: before ? "update" : "create", entity: "recommendation", entityId: row.id,
    summary: `${before ? "Changed" : "Added"} the "${row.kicker}" recommendation on ${v.categorySlug} (by ${v.recommender})`, before, after: row,
  });
  return row;
}

export async function deleteSlide(actor: Actor, id: string): Promise<string | null> {
  const before = await db.recommendation.findUnique({ where: { id } });
  if (!before) return null;
  await db.recommendation.delete({ where: { id } });
  await audit(actor, { action: "delete", entity: "recommendation", entityId: id, summary: `Removed the "${before.kicker}" recommendation on ${before.categorySlug}`, before });
  return before.categorySlug;
}

/** Puts a slide one place earlier or later within its category. */
export async function moveSlide(actor: Actor, id: string, direction: "up" | "down"): Promise<void> {
  const row = await db.recommendation.findUnique({ where: { id } });
  if (!row) return;
  const all = await db.recommendation.findMany({ where: { categorySlug: row.categorySlug }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const i = all.findIndex((r) => r.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await db.$transaction(all.map((r, n) => db.recommendation.update({ where: { id: r.id }, data: { sortOrder: n } })));
  await audit(actor, { action: "update", entity: "recommendation", entityId: id, summary: `Moved the "${row.kicker}" recommendation ${direction} on ${row.categorySlug}` });
}

/** Every slide for one category, active or not, in order, for the admin. */
export async function slidesFor(categorySlug: string) {
  const rows = await db.recommendation.findMany({ where: { categorySlug }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  return rows.map((r) => ({ ...r, picks: r.picks as unknown as StoredPick[] }));
}

/** Every category with how many active slides staff have set for it. */
export async function overview() {
  const [categories, counts] = await Promise.all([
    db.category.findMany({ orderBy: { label: "asc" }, select: { slug: true, label: true } }),
    db.recommendation.groupBy({ by: ["categorySlug"], where: { active: true }, _count: { _all: true } }),
  ]);
  const n = new Map(counts.map((c) => [c.categorySlug, c._count._all]));
  return categories.map((c) => ({ ...c, slides: n.get(c.slug) ?? 0 }));
}

/** The active slides for the storefront, in order. */
export async function storefrontSlides(categorySlug: string) {
  const rows = await db.recommendation.findMany({ where: { categorySlug, active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  return rows.map((r) => ({ id: r.id, kicker: r.kicker, blurb: r.blurb, recommender: r.recommender, picks: r.picks as unknown as StoredPick[], updatedAt: r.updatedAt }));
}
