"use server";

import { redirect } from "next/navigation";
import { priceCart } from "@/lib/cart";
import { readCart, writeCart } from "@/server/cart";
import { db } from "@/server/db";
import { createOrder, notifyOrder } from "@/server/orders";
import { clientIp, limits, type FormState } from "@/server/request";
import { checkoutSchema, firstError } from "@/server/schemas";
import { currentUser } from "@/server/session";
import { createCheckoutSession, stripeConfigured } from "@/server/stripe";

// The order is priced here from the catalogue, never from anything the browser sent. With Stripe
// configured the customer is sent to its hosted payment page and the webhook marks the order paid.
// Without it the order is taken for payment by the team, which is how staging runs.
export async function placeOrder(_: FormState, form: FormData): Promise<FormState> {
  if (limits.checkout(await clientIp())) return { error: "Too many attempts. Call the team on 01229 480001." };
  const parsed = checkoutSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstError(parsed.error) };

  const cart = priceCart(await readCart());
  if (!cart.lines.length) return { error: "Your basket is empty." };

  const order = await createOrder(parsed.data, cart, (await currentUser())?.id);

  if (stripeConfigured()) {
    let session;
    try {
      session = await createCheckoutSession(order);
    } catch (err) {
      console.error("[checkout] Stripe session failed:", err instanceof Error ? err.message : err);
      await db.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
      return { error: "We could not start the payment. Nothing has been charged. Please try again or call the team." };
    }
    await db.order.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });
    redirect(session.url);
  }

  await notifyOrder(order);
  await writeCart([]);
  redirect(`/checkout/success?order=${order.id}`);
}
