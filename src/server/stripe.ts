import Stripe from "stripe";
import type { Order, OrderLine } from "@prisma/client";
import { SITE_URL } from "@/lib/site";

// Card payments through Stripe's hosted checkout page, so card details never touch this server.
// Without STRIPE_SECRET_KEY the site takes orders for payment by the team instead (see checkout).

export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;

export const stripeDeps: { client: () => Stripe } = {
  client: () => new Stripe(process.env.STRIPE_SECRET_KEY!),
};

export async function createCheckoutSession(order: Order & { lines: OrderLine[] }): Promise<{ id: string; url: string }> {
  const session = await stripeDeps.client().checkout.sessions.create({
    mode: "payment",
    customer_email: order.email,
    client_reference_id: order.id,
    metadata: { orderId: order.id },
    line_items: order.lines.map((l) => ({
      quantity: l.qty,
      // The price a customer sees includes VAT, so that is what is charged.
      price_data: { currency: "gbp", unit_amount: l.unitIncPence, product_data: { name: l.name } },
    })),
    success_url: `${SITE_URL}/checkout/success?order=${order.id}`,
    cancel_url: `${SITE_URL}/basket`,
  });
  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return { id: session.id, url: session.url };
}

export function readEvent(body: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) throw new Error("Missing webhook secret or signature");
  return Stripe.webhooks.constructEvent(body, signature, secret);
}
