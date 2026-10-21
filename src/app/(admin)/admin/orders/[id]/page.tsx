import { notFound } from "next/navigation";
import { pence, shortDate } from "@/lib/format";
import { nextStatuses, STATUS_LABEL } from "@/lib/orderflow";
import { utilityMetadata } from "@/lib/seo";
import { setOrderStatus } from "@/server/admin-actions";
import { db } from "@/server/db";

export const metadata = utilityMetadata("Order");

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const order = await db.order.findUnique({ where: { id: (await params).id }, include: { lines: true } });
  if (!order) notFound();
  const moves = nextStatuses(order.status);

  return (
    <div className="twocol">
      <section className="panel">
        <h2>Order #{order.number} <span className={`tag ${order.status}`}>{STATUS_LABEL[order.status]}</span></h2>
        <p className="muted">Placed {shortDate(order.createdAt)}{order.paidAt && `, paid ${shortDate(order.paidAt)}`}{order.stripeSessionId && ", by card"}</p>
        <table className="table">
          <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Each inc VAT</th><th className="num">Line</th></tr></thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.id}><td>{l.name}</td><td className="num">{l.qty}</td><td className="num">{pence(l.unitIncPence)}</td><td className="num">{pence(l.unitIncPence * l.qty)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="totals" style={{ marginTop: 14 }}>
          <div><span>Subtotal ex VAT</span><span>{pence(order.subtotalExPence)}</span></div>
          <div className="grand"><span>Total inc VAT</span><span>{pence(order.totalIncPence)}</span></div>
        </div>
      </section>

      <aside className="panel">
        <h2>Customer</h2>
        <p style={{ margin: "0 0 14px" }}>
          {order.name}{order.company && `, ${order.company}`}<br />
          <a href={`mailto:${order.email}`}>{order.email}</a> · {order.phone}<br />
          {[order.addressLine1, order.addressLine2, order.city, order.postcode].filter(Boolean).join(", ")}
        </p>
        {order.notes && <p><b>Notes:</b> {order.notes}</p>}
        {order.trackingNote && <p><b>Tracking:</b> {order.trackingNote}</p>}

        {moves.length > 0 && (
          <>
            <h2>Move this order</h2>
            {moves.map((to) => (
              <form key={to} action={setOrderStatus} className="inline" style={{ display: "flex", margin: "0 0 8px" }}>
                <input type="hidden" name="id" value={order.id} />
                <input type="hidden" name="status" value={to} />
                {to === "SHIPPED" && <input type="text" name="trackingNote" placeholder="Tracking or delivery note" />}
                <button className="btn btn-ghost btn-sm" type="submit">{STATUS_LABEL[to]}</button>
              </form>
            ))}
          </>
        )}
      </aside>
    </div>
  );
}
