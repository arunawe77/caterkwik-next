"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addCompetitor, clearPrice, CompetitorError, deleteCompetitor, recordPrice, updateCompetitor, type Actor } from "@/server/competitors";
import type { FormState } from "@/server/request";
import { currentUser, isAdmin } from "@/server/session";

// Form handlers for the competitor screens. The service functions validate; these only turn form
// fields into the shapes they expect and the outcome into something a form can show.

async function staff(): Promise<Actor> {
  const user = await currentUser();
  if (!isAdmin(user)) redirect("/account/login?next=/admin");
  return { id: user!.id, name: user!.name, source: "STAFF" };
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// A thrown CompetitorError is the validation message; anything else is a bug and propagates.
async function guarded(run: () => Promise<void>): Promise<FormState> {
  try {
    await run();
    return { ok: true };
  } catch (err) {
    if (err instanceof CompetitorError) return { error: err.message };
    throw err;
  }
}

export async function saveCompetitor(_: FormState, form: FormData): Promise<FormState> {
  const actor = await staff();
  const outcome = await guarded(async () => {
    await addCompetitor(actor, { name: text(form, "name"), domain: text(form, "domain"), url: text(form, "url") || undefined, notes: text(form, "notes") });
  });
  if (outcome.ok) revalidatePath("/admin/competitors");
  return outcome;
}

export async function setCompetitorActive(form: FormData): Promise<void> {
  const actor = await staff();
  await guarded(async () => void (await updateCompetitor(actor, text(form, "id"), { active: text(form, "active") === "true" })));
  revalidatePath("/admin/competitors");
}

export async function removeCompetitor(form: FormData): Promise<void> {
  const actor = await staff();
  await guarded(() => deleteCompetitor(actor, text(form, "id")));
  revalidatePath("/admin/competitors");
}

function priceFromForm(f: FormData) {
  const raw = text(f, "price").replace(/[£,\s]/g, "");
  const stock = text(f, "inStock");
  return {
    productId: text(f, "productId"), competitorId: text(f, "competitorId"),
    price: raw === "" ? null : Number(raw) || Number.NaN, // NaN fails validation with a message, rather than silently clearing the price
    basis: text(f, "basis") || "ex",
    url: text(f, "url"), theirName: text(f, "theirName"), note: text(f, "note"),
    inStock: stock === "yes" ? true : stock === "no" ? false : null,
  };
}

export async function savePrice(_: FormState, form: FormData): Promise<FormState> {
  const actor = await staff();
  const outcome = await guarded(async () => void (await recordPrice(actor, priceFromForm(form))));
  if (outcome.ok) revalidatePath("/admin/competitors", "layout");
  return outcome;
}

export async function removePrice(form: FormData): Promise<void> {
  const actor = await staff();
  const productId = text(form, "productId");
  await clearPrice(actor, productId, text(form, "competitorId"));
  revalidatePath("/admin/competitors", "layout");
  redirect(`/admin/competitors/prices/${encodeURIComponent(productId)}`);
}
