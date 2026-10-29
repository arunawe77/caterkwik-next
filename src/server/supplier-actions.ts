"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FEED_FIELDS, type FeedMapping } from "@/lib/suppliers";
import { AdminError } from "@/server/catalogue-admin";
import type { FormState } from "@/server/request";
import { currentUser, isAdmin } from "@/server/session";
import { addSupplier, createDraftsFromFeed, setSelectedBrands, clearCost, deleteSupplier, linkItem, recordCost, saveMapping, setBrands, SupplierError, updateSupplier, type Actor } from "@/server/suppliers";

// Form handlers for the supplier screens. The service functions validate; these only turn form
// fields into the shapes they expect and the outcome into something a form can show.

async function staff(): Promise<Actor> {
  const user = await currentUser();
  if (!isAdmin(user)) redirect("/account/login?next=/admin");
  return { id: user!.id, name: user!.name, source: "STAFF" };
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// A thrown SupplierError is the validation message; anything else is a bug and propagates.
async function guarded(run: () => Promise<void>): Promise<FormState> {
  try {
    await run();
    return { ok: true };
  } catch (err) {
    if (err instanceof SupplierError) return { error: err.message };
    throw err;
  }
}

export async function saveSupplier(_: FormState, form: FormData): Promise<FormState> {
  const actor = await staff();
  const outcome = await guarded(async () => void (await addSupplier(actor, { name: text(form, "name"), kind: text(form, "kind") || "DIRECT", website: text(form, "website"), notes: text(form, "notes") })));
  if (outcome.ok) revalidatePath("/admin/suppliers", "layout");
  return outcome;
}

export async function editSupplier(_: FormState, form: FormData): Promise<FormState> {
  const actor = await staff();
  const outcome = await guarded(async () => void (await updateSupplier(actor, text(form, "id"), { name: text(form, "name"), kind: text(form, "kind"), website: text(form, "website"), notes: text(form, "notes") })));
  if (outcome.ok) revalidatePath("/admin/suppliers", "layout");
  return outcome;
}

export async function setSupplierActive(form: FormData): Promise<void> {
  const actor = await staff();
  await guarded(async () => void (await updateSupplier(actor, text(form, "id"), { active: text(form, "active") === "true" })));
  revalidatePath("/admin/suppliers", "layout");
}

export async function removeSupplier(form: FormData): Promise<void> {
  const actor = await staff();
  await guarded(() => deleteSupplier(actor, text(form, "id")));
  revalidatePath("/admin/suppliers", "layout");
  redirect("/admin/suppliers");
}

export async function saveBrands(_: FormState, form: FormData): Promise<FormState> {
  const actor = await staff();
  const outcome = await guarded(async () => void (await setBrands(actor, text(form, "id"), String(form.get("brands") ?? ""))));
  if (outcome.ok) revalidatePath("/admin/suppliers", "layout");
  return outcome;
}

export async function saveSelectedBrands(_: FormState, form: FormData): Promise<FormState> {
  const actor = await staff();
  const outcome = await guarded(async () => void (await setSelectedBrands(actor, text(form, "id"), form.getAll("selected").map(String), String(form.get("extra") ?? ""))));
  if (outcome.ok) revalidatePath("/admin/suppliers", "layout");
  return outcome;
}

export async function saveFeedColumns(_: FormState, form: FormData): Promise<FormState> {
  const actor = await staff();
  const mapping: FeedMapping = {};
  for (const f of FEED_FIELDS) mapping[f.key] = text(form, f.key);
  const outcome = await guarded(() => saveMapping(actor, text(form, "id"), mapping));
  if (outcome.ok) revalidatePath("/admin/suppliers", "layout");
  return outcome;
}

export async function saveCost(_: FormState, form: FormData): Promise<FormState> {
  const actor = await staff();
  const raw = text(form, "cost").replace(/[£,\s]/g, "");
  const outcome = await guarded(async () => void (await recordCost(actor, {
    productId: text(form, "productId"), supplierId: text(form, "supplierId"),
    cost: raw === "" ? Number.NaN : Number(raw) || Number.NaN, // NaN fails validation with a message
    basis: text(form, "basis") || "ex", sku: text(form, "sku"), note: text(form, "note"),
  })));
  if (outcome.ok) revalidatePath("/admin", "layout");
  return outcome;
}

export async function removeCost(form: FormData): Promise<void> {
  const actor = await staff();
  const productId = await clearCost(actor, text(form, "id"));
  revalidatePath("/admin", "layout");
  redirect(productId ? `/admin/products/${encodeURIComponent(productId)}` : text(form, "back") || "/admin/suppliers");
}

export async function linkSupplierItem(form: FormData): Promise<void> {
  const actor = await staff();
  await guarded(() => linkItem(actor, text(form, "id"), text(form, "productId")));
  revalidatePath("/admin/suppliers", "layout");
}

export async function syncUropa(): Promise<void> {
  const actor = await staff();
  const { startUropaSync } = await import("@/server/uropa-sync");
  const started = startUropaSync(actor);
  revalidatePath("/admin/suppliers", "layout");
  redirect(`/admin/suppliers/uropa?${started ? "syncing=1" : "busy=1"}`);
}

export async function applyWebPrice(form: FormData): Promise<void> {
  const actor = await staff();
  const { setToWebPrice } = await import("@/server/uropa-sync");
  let note: string;
  try {
    note = `Selling price of "${await setToWebPrice(actor, text(form, "id"))}" set to Uropa's web price.`;
  } catch (err) {
    if (!(err instanceof SupplierError) && !(err instanceof AdminError)) throw err;
    note = `Failed: ${err.message}`;
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/suppliers/uropa?fetched=${encodeURIComponent(note)}`);
}

export async function importUnmatchedAsDrafts(form: FormData): Promise<void> {
  const actor = await staff();
  let note: string;
  try {
    const r = await createDraftsFromFeed(actor, text(form, "id"), { categorySlug: text(form, "categorySlug"), brand: text(form, "brand") || undefined });
    note = `Created ${r.created} draft products${r.failed ? `, ${r.failed} failed (${r.messages.join("; ")})` : ""}${r.skippedNoName ? `, ${r.skippedNoName} skipped with no description` : ""}. Price and publish them from Products.`;
  } catch (err) {
    if (!(err instanceof SupplierError)) throw err;
    note = `Failed: ${err.message}`;
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/suppliers/${text(form, "id")}?fetched=${encodeURIComponent(note)}`);
}
