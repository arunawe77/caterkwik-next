import { redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { STATUS_LABEL } from "@/lib/orderflow";
import { pence, shortDate } from "@/lib/format";
import { utilityMetadata } from "@/lib/seo";
import { logout } from "@/server/auth-actions";
import { db } from "@/server/db";
import { currentUser } from "@/server/session";

export const metadata = utilityMetadata("Your account");

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/account/login?next=/account");

  const [orders, enquiries] = await Promise.all([
    db.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.enquiry.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  return (
    <main className="wrap ovenpage">
      <header className="ohead">
        <h1>Hello, {user.name}</h1>
        <p className="sub">{user.email}</p>
      </header>

      <section className="panel">
        <h2>Your orders</h2>
        {orders.length ? (
          <table className="table">
            <thead><tr><th>Order</th><th>Date</th><th>Status</th><th className="num">Total inc VAT</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>#{o.number}</td><td>{shortDate(o.createdAt)}</td>
                  <td><span className={`tag ${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
                  <td className="num">{pence(o.totalIncPence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">No orders yet.</p>}
      </section>

      <section className="panel" style={{ marginTop: 20 }}>
        <h2>Your quotes and messages</h2>
        {enquiries.length ? (
          <table className="table">
            <thead><tr><th>Date</th><th>About</th><th>Status</th></tr></thead>
            <tbody>
              {enquiries.map((e) => (
                <tr key={e.id}><td>{shortDate(e.createdAt)}</td><td>{e.productName ?? e.message.slice(0, 60)}</td><td><span className={`tag ${e.status}`}>{e.status === "NEW" ? "Received" : e.status === "DONE" ? "Answered" : "In progress"}</span></td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">Nothing yet.</p>}
      </section>

      <form action={logout} style={{ marginTop: 24 }}><button className="btn btn-ghost" type="submit"><Icon name="logout" />Sign out</button></form>
    </main>
  );
}
