import { redirect } from "next/navigation";
import { ActionForm, Field } from "@/components/forms";
import { Icon } from "@/components/icons";
import { priceCart } from "@/lib/cart";
import { pence } from "@/lib/format";
import { utilityMetadata } from "@/lib/seo";
import { readCart } from "@/server/cart";
import { placeOrder } from "@/server/checkout-actions";
import { currentUser } from "@/server/session";
import { stripeConfigured } from "@/server/stripe";

export const metadata = utilityMetadata("Checkout");

export default async function CheckoutPage() {
  const cart = priceCart(await readCart());
  if (!cart.lines.length) redirect("/basket");
  const user = await currentUser();
  const card = stripeConfigured();

  return (
    <main className="wrap ovenpage">
      <header className="ohead"><h1><Icon name="checkout" size={30} /> Checkout</h1></header>
      <div className="twocol">
        <div className="panel">
          <h2><Icon name="user" /> Your details</h2>
          <ActionForm action={placeOrder} submit={card ? "Continue to payment" : "Place order"} icon={card ? "lock" : "check"}>
            <div className="two">
              <Field name="name" label="Your name" required autoComplete="name" defaultValue={user?.name} />
              <Field name="email" label="Email" type="email" required autoComplete="email" defaultValue={user?.email} />
              <Field name="phone" label="Phone" type="tel" required autoComplete="tel" />
              <Field name="company" label="Company" autoComplete="organization" />
            </div>
            <Field name="addressLine1" label="Delivery address" required autoComplete="address-line1" />
            <Field name="addressLine2" label="Address line 2" autoComplete="address-line2" />
            <div className="two">
              <Field name="city" label="Town or city" required autoComplete="address-level2" />
              <Field name="postcode" label="Postcode" required autoComplete="postal-code" />
            </div>
            <Field name="notes" label="Notes for the team" rows={3} hint="Access, a preferred delivery day, anything we should know." />
          </ActionForm>
        </div>

        <aside className="panel">
          <h2><Icon name="basket" /> Your order</h2>
          <ul style={{ margin: "0 0 14px", paddingLeft: 18 }}>
            {cart.lines.map((l) => <li key={l.product.id}>{l.qty} x {l.product.name}</li>)}
          </ul>
          <div className="totals">
            <div><span>Subtotal ex VAT</span><span>{pence(cart.subtotalExPence)}</span></div>
            <div><span>VAT</span><span>{pence(cart.vatPence)}</span></div>
            <div className="grand"><span>Total inc VAT</span><span>{pence(cart.totalIncPence)}</span></div>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            {card
              ? "You pay by card on Stripe's secure page. Delivery and installation are quoted separately by the team."
              : "The team will contact you to arrange payment, delivery and installation."}
          </p>
        </aside>
      </div>
    </main>
  );
}
