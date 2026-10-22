"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MAX_QTY, type CartItem } from "@/lib/cart";
import { addQuoteItem, parseQuote, quoteLines, QUOTE_COOKIE, serializeQuote } from "@/lib/quote";
import { db } from "@/server/db";
import { enquiryForCustomer, enquiryForTeam } from "@/server/emails";
import { SALES_EMAIL, sendMail } from "@/server/mail";
import { clientIp, limits, type FormState } from "@/server/request";
import { enquirySchema, firstError } from "@/server/schemas";
import { currentUser } from "@/server/session";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

const qtyOf = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(Math.max(n, 1), MAX_QTY) : 1;
};

async function readQuote(): Promise<CartItem[]> {
  return parseQuote((await cookies()).get(QUOTE_COOKIE)?.value);
}

// Not httpOnly, so the header can show the count without making every page dynamic.
async function writeQuote(items: CartItem[]): Promise<void> {
  const jar = await cookies();
  if (!items.length) jar.delete(QUOTE_COOKIE);
  else jar.set(QUOTE_COOKIE, serializeQuote(items), { path: "/", maxAge: THIRTY_DAYS, sameSite: "lax" });
}

export async function addToQuote(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  await writeQuote(addQuoteItem(await readQuote(), id, qtyOf(form.get("qty"))));
  redirect(`/quote/new?added=${encodeURIComponent(id)}`);
}

export async function updateQuote(form: FormData): Promise<void> {
  const remove = form.get("remove");
  const items = [...form.entries()]
    .filter(([key]) => key.startsWith("qty:"))
    .map(([key, value]) => ({ id: key.slice(4), qty: qtyOf(value) }))
    .filter((item) => item.id !== remove);
  await writeQuote(parseQuote(serializeQuote(items)));
  redirect("/quote/new");
}

// Sends the quote basket to the team as a QUOTE enquiry, with the lines written into the message.
export async function submitQuote(_: FormState, form: FormData): Promise<FormState> {
  const lines = quoteLines(await readQuote());
  if (!lines.length) return { error: "Your quote basket is empty. Add a product first." };

  const notes = String(form.get("notes") ?? "").trim();
  const postcode = String(form.get("postcode") ?? "").trim();
  const message = [
    "Quote request",
    ...lines.map((l) => `- ${l.qty} x ${l.product.name} (${l.product.id})`),
    postcode && `Delivery postcode: ${postcode}`,
    notes && `\nNotes: ${notes}`,
  ].filter(Boolean).join("\n");

  const parsed = enquirySchema.safeParse({ ...Object.fromEntries(form), kind: "QUOTE", message });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { website, name, email, phone, company } = parsed.data;
  if (website) return { ok: true };
  if (limits.enquiry(await clientIp())) return { error: "Too many messages from this address. Call the team on 01229 480001." };

  const user = await currentUser();
  const enquiry = await db.enquiry.create({
    data: {
      kind: "QUOTE", name, email, phone, company, message,
      productId: lines[0].product.id,
      productName: lines.length > 1 ? `${lines.length} products` : lines[0].product.name,
      userId: user?.id,
    },
  });
  await Promise.all([
    sendMail({ to: SALES_EMAIL(), replyTo: enquiry.email, ...enquiryForTeam(enquiry) }),
    sendMail({ to: enquiry.email, ...enquiryForCustomer(enquiry) }),
  ]);
  await writeQuote([]);
  redirect("/quote/sent");
}
