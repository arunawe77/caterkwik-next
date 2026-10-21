import Link from "next/link";
import { Icon } from "@/components/icons";
import { ClearBasket } from "@/components/clear-basket";
import { pence } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orderflow";
import { utilityMetadata } from "@/lib/seo";
import { db } from "@/server/db";

export const metadata = utilityMetadata("Order received");

// Shows only the order number, its state and its total: the id in the address is unguessable,
// but nothing personal is printed on the page.
export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order: id } = await searchParams;
  const order = id ? await db.order.findUnique({ where: { id }, select: { number: true, status: true, totalIncPence: true } }) : null;

  return (
    <main className="wrap ovenpage">
      <ClearBasket />
      {order ? (
        <header className="ohead">
          <p className="eyebrow">Order #{order.number}</p>
          <h1>{order.status === "AWAITING_PAYMENT" ? "Thanks, we have your order" : "Thanks, your payment is received"}</h1>
          <p className="sub">
            {STATUS_LABEL[order.status]}: {pence(order.totalIncPence)} including VAT.
            {order.status === "AWAITING_PAYMENT" ? " The team will contact you to arrange payment, delivery and installation." : " The team will contact you about delivery and installation."}
            {" "}A confirmation is on its way by email.
          </p>
        </header>
      ) : (
        <header className="ohead"><h1>We could not find that order</h1><p className="sub">If you have just paid, your confirmation email has the details.</p></header>
      )}
      <Link className="btn btn-navy" href="/ovens"><Icon name="search" />Keep browsing</Link>
    </main>
  );
}
