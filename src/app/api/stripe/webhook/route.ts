import { handleStripeEvent } from "@/server/orders";
import { readEvent } from "@/server/stripe";

// Stripe tells us a payment finished. The body is verified against the signing secret before
// anything is read from it, and the raw text is needed for that, so it is not parsed first.
export async function POST(req: Request) {
  let event;
  try {
    event = readEvent(await req.text(), req.headers.get("stripe-signature"));
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  return Response.json({ result: await handleStripeEvent(event) });
}
