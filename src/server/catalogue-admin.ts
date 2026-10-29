import { Prisma, type Product as Row } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { refreshCatalogue } from "@/server/catalogue-store";

// Every catalogue change, from a staff form or from the assistant, goes through here: validated,
// written, logged with its before and after, and pushed to the storefront. Prices come in as pounds
// (what staff type) and are stored as whole pence.

export interface Actor {
  id: string | null;
  name: string;
  source: "STAFF" | "AI";
}

export class AdminError extends Error {}

const VAT = 1.2;
const pence = (pounds: number) => Math.round(pounds * 100);

const money = z.number().min(0).max(1_000_000).nullable();
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/, "Use lower case letters, digits, - and _");

const specSchema = z.object({
  fuel: z.array(z.string()).default([]),
  width: z.number().nullable().default(null),
  depth: z.number().nullable().default(null),
  height: z.number().nullable().default(null),
  weight: z.number().nullable().default(null),
  ovenType: z.string().nullable().default(null),
  burners: z.number().nullable().default(null),
  kwTotal: z.number().nullable().default(null),
  phase: z.string().nullable().default(null),
  castors: z.string().nullable().default(null),
  duty: z.string().nullable().default(null),
  warrantyYears: z.number().nullable().default(null),
  source: z.string().trim().min(3, "Say where these figures come from"),
});

// Fields staff and the assistant may set. `id`, the legacy token and the legacy URL are never editable.
export const productFields = z.object({
  name: z.string().trim().min(2).max(200),
  brand: z.string().trim().max(80).nullable(),
  categorySlug: slug,
  // A path on this site or an https address (existing products point at supplier images): never javascript:, data: or //host.
  image: z.string().trim().max(300).refine((v) => v === "" || /^(\/(?!\/)|https:\/\/)/.test(v), "Use a path starting with / or an https:// address."),
  priceEx: money,
  priceInc: money,
  wasEx: money,
  leaseWeek: money,
  availability: z.enum(["IN_STOCK", "POA", "DISCONTINUED"]),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
  webExclusive: z.boolean(),
  description: z.string().trim().max(5000).nullable(),
  seoTitle: z.string().trim().max(70).nullable(),
  seoDescription: z.string().trim().max(170).nullable(),
  stockQty: z.number().int().min(0).max(1_000_000).nullable(),
  spec: specSchema.nullable(),
});

export type ProductPatch = Partial<z.infer<typeof productFields>>;
export const productPatchSchema = productFields.partial().strict();
export const productCreateSchema = productFields
  .partial({
    brand: true, image: true, priceEx: true, priceInc: true, wasEx: true, leaseWeek: true, availability: true,
    status: true, webExclusive: true, description: true, seoTitle: true, seoDescription: true, stockQty: true, spec: true,
  })
  .strict();

export const PLACEHOLDER_IMAGE = "/assets/img/placeholder.svg";

const snapshot = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");

async function audit(actor: Actor, a: { action: string; entity: string; entityId: string; summary: string; before?: unknown; after?: unknown }) {
  await db.auditLog.create({
    data: {
      actorId: actor.id, actorName: actor.name, source: actor.source, action: a.action, entity: a.entity, entityId: a.entityId,
      summary: a.summary,
      before: a.before === undefined ? undefined : snapshot(a.before),
      after: a.after === undefined ? undefined : snapshot(a.after),
    },
  });
}

// Pushes a change to the storefront: reload the in-memory catalogue, then drop cached pages.
// revalidatePath needs the Next request scope, so outside one (tests, scripts) it is skipped.
async function publish() {
  await refreshCatalogue();
  try {
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/", "layout");
  } catch {
    /* outside a request */
  }
}

function toData(patch: ProductPatch): Prisma.ProductUncheckedUpdateInput {
  const { priceEx, priceInc, wasEx, leaseWeek, spec, ...rest } = patch;
  const data: Prisma.ProductUncheckedUpdateInput = { ...rest };
  if (priceEx !== undefined) {
    data.priceExPence = priceEx === null ? null : pence(priceEx);
    // The inc VAT price follows the ex VAT one unless it is given too.
    if (priceInc === undefined) data.priceIncPence = priceEx === null ? null : Math.round(pence(priceEx) * VAT);
  }
  if (priceInc !== undefined) data.priceIncPence = priceInc === null ? null : pence(priceInc);
  if (wasEx !== undefined) data.wasExPence = wasEx === null ? null : pence(wasEx);
  if (leaseWeek !== undefined) data.leaseWeekPence = leaseWeek === null ? null : pence(leaseWeek);
  if (spec !== undefined) data.spec = spec === null ? Prisma.DbNull : spec;
  return data;
}

export const idOf = (name: string) =>
  name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "product";

async function requireCategory(slugValue: string) {
  const c = await db.category.findUnique({ where: { slug: slugValue } });
  if (!c) throw new AdminError(`There is no category "${slugValue}".`);
  return c;
}

function checkPriced(row: { status: string; availability: string; priceExPence: number | null }) {
  if (row.status === "ACTIVE" && row.availability === "IN_STOCK" && row.priceExPence === null) {
    throw new AdminError("An in-stock product on sale needs a price. Set the price, or mark it price on application.");
  }
}

export async function createProduct(actor: Actor, input: unknown): Promise<Row> {
  const parsed = productCreateSchema.safeParse(input);
  if (!parsed.success) throw new AdminError(issues(parsed.error));
  const v = parsed.data;
  await requireCategory(v.categorySlug);

  const base = idOf(v.name);
  let id = base;
  for (let n = 2; await db.product.findUnique({ where: { id }, select: { id: true } }); n++) id = `${base}-${n}`;

  // A new product starts as a draft, so nothing half-finished reaches the storefront.
  const { name, categorySlug, image, availability, status, ...rest } = v;
  const data = {
    id, name, categorySlug, image: image ?? PLACEHOLDER_IMAGE, availability: availability ?? "IN_STOCK", status: status ?? "DRAFT",
    alsoIn: [] as string[],
    ...toData(rest),
  } as Prisma.ProductUncheckedCreateInput;
  checkPriced({ status: data.status as string, availability: data.availability as string, priceExPence: (data.priceExPence as number | null | undefined) ?? null });

  const row = await db.product.create({ data });
  await audit(actor, { action: "create", entity: "product", entityId: id, summary: `Created product "${row.name}" (${row.status})`, after: row });
  await publish();
  return row;
}

export async function updateProduct(actor: Actor, id: string, input: unknown): Promise<Row> {
  const parsed = productPatchSchema.safeParse(input);
  if (!parsed.success) throw new AdminError(issues(parsed.error));
  if (!Object.keys(parsed.data).length) throw new AdminError("Nothing to change.");
  const before = await db.product.findUnique({ where: { id } });
  if (!before) throw new AdminError(`There is no product "${id}".`);
  if (parsed.data.categorySlug) await requireCategory(parsed.data.categorySlug);

  const data = toData(parsed.data);
  checkPriced({
    status: (data.status as string | undefined) ?? before.status,
    availability: (data.availability as string | undefined) ?? before.availability,
    priceExPence: data.priceExPence !== undefined ? (data.priceExPence as number | null) : before.priceExPence,
  });

  const after = await db.product.update({ where: { id }, data });
  await audit(actor, { action: "update", entity: "product", entityId: id, summary: describeChange(before, after), before, after });
  await publish();
  return after;
}

const GBP = (p: number | null) => (p === null ? "not published" : `£${(p / 100).toFixed(2)}`);

function describeChange(a: Row, b: Row): string {
  const bits: string[] = [];
  if (a.priceExPence !== b.priceExPence) bits.push(`price ex VAT ${GBP(a.priceExPence)} to ${GBP(b.priceExPence)}`);
  if (a.status !== b.status) bits.push(`status ${a.status} to ${b.status}`);
  if (a.availability !== b.availability) bits.push(`availability ${a.availability} to ${b.availability}`);
  if (a.stockQty !== b.stockQty) bits.push(`stock ${a.stockQty ?? "untracked"} to ${b.stockQty ?? "untracked"}`);
  if (a.categorySlug !== b.categorySlug) bits.push(`category ${a.categorySlug} to ${b.categorySlug}`);
  for (const k of ["name", "brand", "description", "seoTitle", "seoDescription", "image"] as const) if (a[k] !== b[k]) bits.push(`${k} changed`);
  if (JSON.stringify(a.spec) !== JSON.stringify(b.spec)) bits.push("spec changed");
  if (a.wasExPence !== b.wasExPence) bits.push(`was price ${GBP(a.wasExPence)} to ${GBP(b.wasExPence)}`);
  if (a.leaseWeekPence !== b.leaseWeekPence) bits.push("lease price changed");
  return `"${b.name}": ${bits.join(", ") || "saved"}`;
}

export async function deleteProduct(actor: Actor, id: string): Promise<void> {
  const before = await db.product.findUnique({ where: { id } });
  if (!before) throw new AdminError(`There is no product "${id}".`);
  await db.product.delete({ where: { id } });
  await audit(actor, { action: "delete", entity: "product", entityId: id, summary: `Deleted product "${before.name}"`, before });
  await publish();
}

// Several products at once. Used by the product list's bulk bar and by the assistant (which must ask first).
export async function bulkUpdateProducts(actor: Actor, ids: string[], input: unknown): Promise<{ changed: number }> {
  const unique = [...new Set(ids)];
  if (!unique.length) throw new AdminError("No products selected.");
  if (unique.length > 500) throw new AdminError("At most 500 products at a time.");
  const parsed = productPatchSchema.pick({ status: true, availability: true, categorySlug: true, brand: true }).safeParse(input);
  if (!parsed.success || !Object.keys(parsed.data).length) throw new AdminError("Bulk edits can set status, availability, category or brand.");
  if (parsed.data.categorySlug) await requireCategory(parsed.data.categorySlug);

  const rows = await db.product.findMany({ where: { id: { in: unique } } });
  if (rows.length !== unique.length) throw new AdminError("Some of those products do not exist.");
  for (const r of rows) {
    checkPriced({ status: parsed.data.status ?? r.status, availability: parsed.data.availability ?? r.availability, priceExPence: r.priceExPence });
  }

  await db.product.updateMany({ where: { id: { in: unique } }, data: parsed.data });
  const after = await db.product.findMany({ where: { id: { in: unique } } });
  await audit(actor, {
    action: "bulk-update", entity: "product", entityId: unique.join(","),
    summary: `Updated ${unique.length} products: ${Object.entries(parsed.data).map(([k, v]) => `${k} to ${v}`).join(", ")}`,
    before: rows, after,
  });
  await publish();
  return { changed: unique.length };
}

// Moves the ex VAT price of the chosen products by a percentage. Only priced products change:
// a product with no published price stays without one.
export async function adjustPrices(actor: Actor, ids: string[], percent: number): Promise<{ changed: number }> {
  if (!Number.isFinite(percent) || percent < -90 || percent > 200 || percent === 0) {
    throw new AdminError("The change must be between -90% and +200%, and not zero.");
  }
  const unique = [...new Set(ids)];
  if (!unique.length || unique.length > 500) throw new AdminError("Choose between 1 and 500 products.");
  const rows = (await db.product.findMany({ where: { id: { in: unique } } })).filter((r) => r.priceExPence !== null);
  if (!rows.length) throw new AdminError("None of those products has a price to change.");

  const factor = 1 + percent / 100;
  await db.$transaction(
    rows.map((r) => {
      const ex = Math.round(r.priceExPence! * factor);
      return db.product.update({
        where: { id: r.id },
        data: {
          priceExPence: ex,
          priceIncPence: Math.round(ex * VAT),
          // A "was" price at or below the new price would show a saving that is not there.
          wasExPence: r.wasExPence !== null && r.wasExPence <= ex ? null : r.wasExPence,
        },
      });
    }),
  );
  const after = await db.product.findMany({ where: { id: { in: rows.map((r) => r.id) } } });
  await audit(actor, {
    action: "bulk-price", entity: "product", entityId: rows.map((r) => r.id).join(","),
    summary: `Changed ${rows.length} prices by ${percent > 0 ? "+" : ""}${percent}%`, before: rows, after,
  });
  await publish();
  return { changed: rows.length };
}

// ---- categories --------------------------------------------------------------------------

const categoryFields = z.object({
  label: z.string().trim().min(2).max(80),
  audience: z.string().trim().max(400),
  cooking: z.array(z.string().trim().max(30)).max(10),
  supply: z.array(z.string().trim().max(30)).max(10),
  covers: z.array(z.string().trim().max(30)).max(10),
  image: z.string().trim().max(300).nullable(),
  description: z.string().trim().max(5000).nullable(),
});

export async function createCategory(actor: Actor, input: unknown) {
  const parsed = categoryFields.partial({ audience: true, cooking: true, supply: true, covers: true, image: true, description: true }).extend({ slug }).strict().safeParse(input);
  if (!parsed.success) throw new AdminError(issues(parsed.error));
  if (await db.category.findUnique({ where: { slug: parsed.data.slug } })) throw new AdminError(`The category "${parsed.data.slug}" already exists.`);
  const last = await db.category.aggregate({ _max: { sortOrder: true } });
  const row = await db.category.create({
    data: { audience: "", cooking: [], supply: [], covers: [], ...parsed.data, sortOrder: (last._max.sortOrder ?? 0) + 1 },
  });
  await audit(actor, { action: "create", entity: "category", entityId: row.slug, summary: `Created category "${row.label}"`, after: row });
  await publish();
  return row;
}

export async function updateCategory(actor: Actor, slugValue: string, input: unknown) {
  const parsed = categoryFields.partial().strict().safeParse(input);
  if (!parsed.success || !Object.keys(parsed.data).length) throw new AdminError("Nothing valid to change.");
  const before = await requireCategory(slugValue);
  const after = await db.category.update({ where: { slug: slugValue }, data: parsed.data });
  await audit(actor, { action: "update", entity: "category", entityId: slugValue, summary: `Updated category "${after.label}"`, before, after });
  await publish();
  return after;
}

export async function deleteCategory(actor: Actor, slugValue: string): Promise<void> {
  const before = await requireCategory(slugValue);
  const n = await db.product.count({ where: { categorySlug: slugValue } });
  if (n) throw new AdminError(`"${before.label}" still has ${n} products. Move or delete them first.`);
  await db.category.delete({ where: { slug: slugValue } });
  await audit(actor, { action: "delete", entity: "category", entityId: slugValue, summary: `Deleted category "${before.label}"`, before });
  await publish();
}

// ---- undo ---------------------------------------------------------------------------------

// Puts a single product back as it was before a logged change (update, create or delete).
export async function undoChange(actor: Actor, auditId: string): Promise<string> {
  const log = await db.auditLog.findUnique({ where: { id: auditId } });
  if (!log) throw new AdminError("That change is not in the log.");
  if (log.undoneAt) throw new AdminError("That change was already undone.");
  if (log.entity !== "product" || !["update", "create", "delete"].includes(log.action)) {
    throw new AdminError("Only single product changes can be undone.");
  }

  if (log.action === "create") {
    await db.product.deleteMany({ where: { id: log.entityId } });
  } else {
    const { createdAt, updatedAt, ...data } = log.before as Record<string, unknown>;
    void createdAt; void updatedAt;
    const row = { ...data, spec: data.spec ?? Prisma.DbNull } as unknown as Prisma.ProductUncheckedCreateInput;
    await db.product.upsert({ where: { id: log.entityId }, create: row, update: row as Prisma.ProductUncheckedUpdateInput });
  }
  await db.auditLog.update({ where: { id: auditId }, data: { undoneAt: new Date() } });
  await audit(actor, { action: "undo", entity: "product", entityId: log.entityId, summary: `Undid: ${log.summary}` });
  await publish();
  return `Undid: ${log.summary}`;
}
