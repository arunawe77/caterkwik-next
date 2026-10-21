import type Stripe from "stripe";
import type { Order, OrderLine } from "@prisma/client";
import type { PricedCart } from "@/lib/cart";
import { db } from "@/server/db";
import { orderConfirmation, orderForTeam } from "@/server/emails";
import { SALES_EMAIL, sendMail } from "@/server/mail";

type OrderWithLines = Order & { lines: OrderLine[] };

export interface OrderDetails {
  name: string;
  email: string;
  phone: string;
  company?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postcode: string;
  notes?: string;
}

// An order keeps a snapshot of what was sold and for how much, priced by the server from the catalogue.
export function createOrder(details: OrderDetails, cart: PricedCart, userId?: string): Promise<OrderWithLines> {
  return db.order.create({
    data: {
      ...details,
      userId,
      subtotalExPence: cart.subtotalExPence,
      totalIncPence: cart.totalIncPence,
      lines: {
        create: cart.lines.map((l) => ({
          productId: l.product.id, name: l.product.name, unitExPence: l.unitExPence, unitIncPence: l.unitIncPence, qty: l.qty,
        })),
      },
    },
    include: { lines: true },
  });
}

export async function notifyOrder(order: OrderWithLines): Promise<void> {
  await Promise.all([
    sendMail({ to: order.email, ...orderConfirmation(order) }),
    sendMail({ to: SALES_EMAIL(), replyTo: order.email, ...orderForTeam(order) }),
  ]);
}

// Stripe delivers an event at least once, sometimes twice. Recording its id first, in the same
// transaction as the change, means each event is acted on exactly once.
export async function handleStripeEvent(event: Stripe.Event): Promise<"handled" | "duplicate" | "ignored"> {
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.expired") return "ignored";
  const session = event.data.object as Stripe.Checkout.Session;
  const orderId = session.metadata?.orderId;
  if (!orderId) return "ignored";

  const paid = event.type === "checkout.session.completed" && session.payment_status === "paid";
  const outcome = await db.$transaction(async (tx) => {
    if (await tx.webhookEvent.findUnique({ where: { id: event.id } })) return "duplicate" as const;
    await tx.webhookEvent.create({ data: { id: event.id } });
    await tx.order.updateMany({
      where: { id: orderId, status: "AWAITING_PAYMENT" },
      data: paid ? { status: "PAID", paidAt: new Date() } : { status: "CANCELLED" },
    });
    return "handled" as const;
  });

  if (outcome === "handled" && paid) {
    const order = await db.order.findUnique({ where: { id: orderId }, include: { lines: true } });
    if (order) await notifyOrder(order);
  }
  return outcome;
}
