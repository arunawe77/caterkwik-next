"use server";

import { getProduct } from "@/lib/catalogue";
import { db } from "@/server/db";
import { enquiryForCustomer, enquiryForTeam } from "@/server/emails";
import { SALES_EMAIL, sendMail } from "@/server/mail";
import { clientIp, limits, type FormState } from "@/server/request";
import { enquirySchema, firstError } from "@/server/schemas";
import { currentUser } from "@/server/session";

// Quote requests, call-back requests and general enquiries. Saved first, then emailed to the team
// and acknowledged to the customer; a mail failure never loses the enquiry.
export async function submitEnquiry(_: FormState, form: FormData): Promise<FormState> {
  const parsed = enquirySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { website, productId, ...data } = parsed.data;

  // A bot filled the field no person can see. Say thanks and keep nothing.
  if (website) return { ok: true };
  if (limits.enquiry(await clientIp())) return { error: "Too many messages from this address. Call the team on 01229 480001." };

  // The product name comes from the catalogue, not from the form.
  const product = productId ? getProduct(productId) : undefined;
  const user = await currentUser();

  const enquiry = await db.enquiry.create({
    data: { ...data, productId: product?.id, productName: product?.name, userId: user?.id },
  });

  await Promise.all([
    sendMail({ to: SALES_EMAIL(), replyTo: enquiry.email, ...enquiryForTeam(enquiry) }),
    sendMail({ to: enquiry.email, ...enquiryForCustomer(enquiry) }),
  ]);
  return { ok: true };
}
