import type { OrderStatus } from "@prisma/client";
import Link from "next/link";
import { pence, shortDate } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orderflow";
import { utilityMetadata } from "@/lib/seo";
import { db } from "@/server/db";

export const metadata = utilityMetadata("Orders");

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filter = status && status in STATUS_LABEL ? (status as OrderStatus) : undefined;
  const orders = await db.order.findMany({ where: filter ? { status: filter } : {}, orderBy: { createdAt: "desc" }, take: 200 });

  return (
    <>
      <p className="admin-nav">
        <Link href="/admin/orders">All</Link>
        {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => <Link key={s} href={`/admin/orders?status=${s}`}>{STATUS_LABEL[s]}</Link>)}
      </p>
      <table className="table">
        <thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Status</th><th className="num">Total inc VAT</th></tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td><Link href={`/admin/orders/${o.id}`}>#{o.number}</Link></td>
              <td>{shortDate(o.createdAt)}</td>
              <td>{o.name}<br /><span className="muted">{o.email}</span></td>
              <td><span className={`tag ${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
              <td className="num">{pence(o.totalIncPence)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!orders.length && <p className="muted">No orders.</p>}
    </>
  );
}
