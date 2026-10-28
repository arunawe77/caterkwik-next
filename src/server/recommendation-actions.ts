"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/server/request";
import { deleteSlide, moveSlide, RecommendationError, saveSlide, type Actor } from "@/server/recommendations";
import { currentUser, isAdmin } from "@/server/session";

// Form handlers for the recommendations screens. The service functions validate; these only turn form fields
// into the shapes they expect and the outcome into something a form can show.

async function staff(): Promise<Actor> {
  const user = await currentUser();
  if (!isAdmin(user)) redirect("/account/login?next=/admin");
  return { id: user!.id, name: user!.name, source: "STAFF" };
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// The storefront reads these pages straight from the database, but the category page itself is cached.
const refresh = (categorySlug: string) => {
  revalidatePath("/admin/recommendations", "layout");
  revalidatePath("/ovens", "layout");
  revalidatePath(`/ovens/${categorySlug}`);
};

export async function saveRecommendation(_: FormState, form: FormData): Promise<FormState> {
  const actor = await staff();
  const categorySlug = text(form, "categorySlug");
  // A card left completely blank is simply not on the slide.
  const picks = [1, 2, 3]
    .map((n) => ({ productId: text(form, `p${n}`), chip: text(form, `chip${n}`), heading: text(form, `heading${n}`), why: text(form, `why${n}`) }))
    .filter((p) => p.productId || p.chip || p.heading || p.why);
  try {
    await saveSlide(actor, text(form, "id") || null, {
      categorySlug, kicker: text(form, "kicker"), blurb: text(form, "blurb"), recommender: text(form, "recommender"), picks, active: form.get("active") === "on",
    });
  } catch (err) {
    if (err instanceof RecommendationError) return { error: err.message };
    throw err;
  }
  refresh(categorySlug);
  return { ok: true };
}

export async function removeRecommendation(form: FormData): Promise<void> {
  const actor = await staff();
  const slug = await deleteSlide(actor, text(form, "id"));
  if (slug) refresh(slug);
  redirect(slug ? `/admin/recommendations/${encodeURIComponent(slug)}` : "/admin/recommendations");
}

export async function shiftRecommendation(form: FormData): Promise<void> {
  const actor = await staff();
  await moveSlide(actor, text(form, "id"), text(form, "direction") === "up" ? "up" : "down");
  refresh(text(form, "categorySlug"));
}
