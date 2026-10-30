"use server";

import { redirect } from "next/navigation";
import { specMessage, parseSpec } from "@/lib/table-spec";
import { db } from "@/server/db";
import { enquiryForCustomer, enquiryForTeam } from "@/server/emails";
import { SALES_EMAIL, sendMail } from "@/server/mail";
import { clientIp, limits, type FormState } from "@/server/request";
import { enquirySchema, firstError } from "@/server/schemas";
import { currentUser } from "@/server/session";

// Sends a configured table to the team as a QUOTE enquiry. The spec is re-checked here, and the message is built
// from the checked spec, so what the team reads is always something the configurator could have produced.
export async function submitTableQuote(_: FormState, form: FormData): Promise<FormState> {
  const spec = parseSpec(Object.fromEntries(form));
  if (!spec.ok) return { error: spec.error };

  const postcode = String(form.get("postcode") ?? "").trim().slice(0, 12);
  const notes = String(form.get("notes") ?? "").trim().slice(0, 1000);
  const message = [specMessage(spec.spec), postcode && `Delivery postcode: ${postcode}`, notes && `\nNotes: ${notes}`].filter(Boolean).join("\n");

  const parsed = enquirySchema.safeParse({ ...Object.fromEntries(form), kind: "QUOTE", message, productId: undefined });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { website, name, email, phone, company } = parsed.data;
  if (website) return { ok: true };
  if (limits.enquiry(await clientIp())) return { error: "Too many messages from this address. Call the team on 01229 480001." };

  const user = await currentUser();
  const enquiry = await db.enquiry.create({
    data: { kind: "QUOTE", name, email, phone, company, message, productName: "Made-to-measure stainless steel table", userId: user?.id },
  });
  await Promise.all([
    sendMail({ to: SALES_EMAIL(), replyTo: enquiry.email, ...enquiryForTeam(enquiry) }),
    sendMail({ to: enquiry.email, ...enquiryForCustomer(enquiry) }),
  ]);
  redirect("/quote/sent");
}
