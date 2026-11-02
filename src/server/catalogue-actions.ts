"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminError, adjustPrices, bulkUpdateProducts, createCategory, createProduct, deleteCategory, deleteProduct, publishDrafts, undoChange, updateCategory, updateProduct, type Actor } from "@/server/catalogue-admin";
import { currentUser, isAdmin } from "@/server/session";
import type { FormState } from "@/server/request";

// Form handlers for the admin catalogue screens. The service functions validate; these only turn
// form fields into the shapes they expect and the outcome into something a form can show.

async function staff(): Promise<Actor> {
  const user = await currentUser();
  if (!isAdmin(user)) redirect("/account/login?next=/admin");
  return { id: user!.id, name: user!.name, source: "STAFF" };
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const orNull = (f: FormData, k: string) => text(f, k) || null;
const number = (f: FormData, k: string): number | null | undefined => {
  const v = text(f, k);
  if (v === "") return null;
  const n = Number(v.replace(/[£,]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

// A thrown AdminError is the validation message; anything else is a bug and propagates.
async function guarded(run: () => Promise<FormState>): Promise<FormState> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof AdminError) return { error: err.message };
    throw err;
  }
}

function productFromForm(f: FormData) {
  const priceEx = number(f, "priceEx");
  const priceInc = number(f, "priceInc");
  for (const [label, v] of [["Price ex VAT", priceEx], ["Price inc VAT", priceInc], ["Was price", number(f, "wasEx")], ["Lease per week", number(f, "leaseWeek")]] as const) {
    if (v === undefined) throw new AdminError(`${label} must be a number.`);
  }
  const stock = number(f, "stockQty");
  if (stock === undefined || (stock !== null && !Number.isInteger(stock))) throw new AdminError("Stock must be a whole number, or empty if you do not track it.");
  return {
    name: text(f, "name"), brand: orNull(f, "brand"), categorySlug: text(f, "categorySlug"), image: text(f, "image") || undefined,
    priceEx, wasEx: number(f, "wasEx"), leaseWeek: number(f, "leaseWeek"),
    // Blank inc VAT price means "work it out from ex VAT".
    ...(priceInc !== null || priceEx === null ? { priceInc } : {}),
    availability: text(f, "availability"), status: text(f, "status"), webExclusive: f.get("webExclusive") === "on",
    description: orNull(f, "description"), seoTitle: orNull(f, "seoTitle"), seoDescription: orNull(f, "seoDescription"), stockQty: stock,
  };
}

export async function saveProduct(_: FormState, form: FormData): Promise<FormState> {
  const actor = await staff();
  const id = text(form, "id");
  let target = id;
  const outcome = await guarded(async () => {
    const input = productFromForm(form);
    if (id) {
      await updateProduct(actor, id, input);
    } else {
      target = (await createProduct(actor, input)).id;
    }
    return { ok: true };
  });
  if (!outcome.ok) return outcome;
  revalidatePath("/admin/products");
  if (!id) redirect(`/admin/products/${target}?created=1`);
  return outcome;
}

export async function removeProduct(form: FormData): Promise<void> {
  const actor = await staff();
  await guarded(async () => {
    await deleteProduct(actor, text(form, "id"));
    return { ok: true };
  });
  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function enrichFromWeb(form: FormData): Promise<void> {
  const actor = await staff();
  const id = text(form, "id");
  let note: string;
  try {
    const { enrichProduct } = await import("@/server/product-enrich");
    const r = await enrichProduct(actor, id);
    note = r.found
      ? `Added ${r.added} specifications${r.description ? " and a description" : ""} from the web. Check them against the manufacturer.${r.notes ? ` Note: ${r.notes}` : ""}`
      : `Nothing reliable found for this exact model.${r.notes ? ` ${r.notes}` : ""}`;
  } catch (err) {
    if (!(err instanceof AdminError)) throw err;
    note = `Failed: ${err.message}`;
  }
  revalidatePath("/admin/products", "layout");
  redirect(`/admin/products/${encodeURIComponent(id)}?enriched=${encodeURIComponent(note)}`);
}

// The product list's bulk bar. Applies to the ticked rows.
export async function bulkProducts(form: FormData): Promise<void> {
  const actor = await staff();
  const ids = form.getAll("ids").map(String);
  const op = text(form, "op");
  const [kind, value] = op.split(":");
  const back = text(form, "back") || "/admin/products";
  let notice = "";
  const outcome = await guarded(async () => {
    if (kind === "publish") {
      const r = await publishDrafts(actor, ids);
      notice = `Put ${r.published} drafts on sale.${r.needPrice ? ` ${r.needPrice} left as drafts: in stock but no price.` : ""}${r.notDraft ? ` ${r.notDraft} skipped: not drafts.` : ""}`;
    } else if (kind === "enrich") {
      if (!ids.length) throw new AdminError("No products selected.");
      const { startEnrichQueue } = await import("@/server/product-enrich");
      notice = startEnrichQueue(actor, ids) ? `Enriching ${Math.min(ids.length, 200)} products from the web in the background.` : "An enrich queue is already running. Wait for it to finish.";
    } else if (kind === "price") await adjustPrices(actor, ids, Number(value));
    else if (kind === "status") await bulkUpdateProducts(actor, ids, { status: value });
    else if (kind === "availability") await bulkUpdateProducts(actor, ids, { availability: value });
    else throw new AdminError("Choose an action first.");
    return { ok: true };
  });
  revalidatePath("/admin/products");
  const sep = back.includes("?") ? "&" : "?";
  redirect(outcome.error ? `${back}${sep}error=${encodeURIComponent(outcome.error)}` : notice ? `${back}${sep}notice=${encodeURIComponent(notice)}` : back);
}

export async function undo(form: FormData): Promise<void> {
  const actor = await staff();
  await guarded(async () => {
    await undoChange(actor, text(form, "id"));
    return { ok: true };
  });
  revalidatePath("/admin/activity");
  redirect("/admin/activity");
}

export async function saveCategory(_: FormState, form: FormData): Promise<FormState> {
  const actor = await staff();
  const slug = text(form, "slug");
  const list = (k: string) => text(form, k).split(",").map((s) => s.trim()).filter(Boolean);
  const fields = { label: text(form, "label"), audience: text(form, "audience"), cooking: list("cooking"), supply: list("supply"), covers: list("covers"), image: text(form, "image") || null, description: text(form, "description") || null };
  const existing = text(form, "existing") === "1";
  const outcome = await guarded(async () => {
    if (existing) await updateCategory(actor, slug, fields);
    else await createCategory(actor, { slug, ...fields });
    return { ok: true };
  });
  revalidatePath("/admin/categories");
  return outcome;
}

export async function removeCategory(form: FormData): Promise<void> {
  const actor = await staff();
  const outcome = await guarded(async () => {
    await deleteCategory(actor, text(form, "slug"));
    return { ok: true };
  });
  revalidatePath("/admin/categories");
  redirect(outcome.error ? `/admin/categories?error=${encodeURIComponent(outcome.error)}` : "/admin/categories");
}

// Inventory screen: set one product's units in stock. Empty means stock is not tracked.
export async function setStock(form: FormData): Promise<void> {
  const actor = await staff();
  const back = text(form, "back") || "/admin/inventory";
  const qty = number(form, "stockQty");
  const outcome = await guarded(async () => {
    if (qty === undefined || (qty !== null && !Number.isInteger(qty))) throw new AdminError("Stock must be a whole number, or empty if you do not track it.");
    await updateProduct(actor, text(form, "id"), { stockQty: qty });
    return { ok: true };
  });
  revalidatePath("/admin/inventory");
  redirect(outcome.error ? `${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(outcome.error)}` : back);
}
