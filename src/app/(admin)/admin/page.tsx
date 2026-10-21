import Link from "next/link";
import { AreaChart, BarList } from "@/components/admin/charts";
import { RangeTabs } from "@/components/admin/range-tabs";
import { StatTile } from "@/components/admin/stat-tile";
import { money, pence, shortDate } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orderflow";
import { utilityMetadata } from "@/lib/seo";
import { percentLabel, POSITION_LABEL } from "@/lib/competitors";
import { change, dailySales, kpis, ordersByStatus, periodOf, RANGES, rangeOf, salesByCategory, stockAlerts, topProducts } from "@/server/analytics";
import { ensureCompetitors, overview } from "@/server/competitors";
import { db } from "@/server/db";

export const metadata = utilityMetadata("Admin");
export const dynamic = "force-dynamic";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const days = rangeOf((await searchParams).range);
  await ensureCompetitors();
  const market = await overview();
  const marketTracked = market.positions.cheapest + market.positions.level + market.positions.dearer > 0;
  const [k, series, prior, statuses, products, categories, stock, awaiting, toShip, newEnquiries, active, drafts, noPrice, recentOrders, recent] = await Promise.all([
    kpis(days),
    dailySales(days),
    dailySales(days, periodOf(days).previous.to),
    ordersByStatus(days),
    topProducts(days, 6),
    salesByCategory(days, 6),
    stockAlerts(),
    db.order.count({ where: { status: "AWAITING_PAYMENT" } }),
    db.order.count({ where: { status: { in: ["PAID", "PROCESSING"] } } }),
    db.enquiry.count({ where: { status: "NEW" } }),
    db.product.count({ where: { status: "ACTIVE" } }),
    db.product.count({ where: { status: "DRAFT" } }),
    db.product.count({ where: { status: "ACTIVE", availability: "IN_STOCK", priceExPence: null } }),
    db.order.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const versus = `vs previous ${days} days`;

  return (
    <>
      <header className="adm-head">
        <div><h1>Dashboard</h1><p>How the shop is doing, and what needs you.</p></div>
        <div className="adm-actions">
          <RangeTabs ranges={RANGES} current={days} base="/admin" />
          <Link className="btn btn-navy btn-sm" href="/admin/products/new">Add product</Link>
        </div>
      </header>

      <div className="stats-row">
        <StatTile label="Revenue, inc VAT" value={money(k.now.revenue)} delta={change(k.now.revenue, k.before.revenue)} versus={versus} />
        <StatTile label="Orders" value={String(k.now.orders)} delta={change(k.now.orders, k.before.orders)} versus={versus} href="/admin/orders" />
        <StatTile label="Average order" value={money(k.now.averageOrder)} delta={change(k.now.averageOrder, k.before.averageOrder)} versus={versus} />
        <StatTile label="New customers" value={String(k.now.newCustomers)} delta={change(k.now.newCustomers, k.before.newCustomers)} versus={versus} href="/admin/customers" />
        <StatTile label="Quotes and enquiries" value={String(k.now.enquiries)} delta={change(k.now.enquiries, k.before.enquiries)} versus={versus} href="/admin/enquiries" />
      </div>

      <section className="panel">
        <h2>Revenue</h2>
        <p className="muted">Paid orders, inc VAT, by day. The grey line is the {days} days before.</p>
        <AreaChart
          kind="money" title="Revenue" previousLabel={`Previous ${days} days`}
          points={series.map((p, i) => ({ label: p.label, value: p.revenue, previous: prior[i]?.revenue }))}
        />
      </section>

      <div className="adm-two even">
        <section className="panel">
          <h2>Best sellers</h2>
          <p className="muted">By revenue, last {days} days.</p>
          <BarList kind="money" empty="No sales in this period." bars={products.map((p) => ({ label: p.name, value: p.revenue, note: `${p.units} sold`, href: `/admin/products/${p.id}` }))} />
        </section>
        <section className="panel">
          <h2>Sales by category</h2>
          <p className="muted">By revenue, last {days} days.</p>
          <BarList kind="money" empty="No sales in this period." bars={categories.map((c) => ({ label: c.name, value: c.revenue }))} />
        </section>
      </div>

      <section className="panel">
        <h2>Against competitors</h2>
        <p className="muted">Where our ex VAT price stands against the cheapest competitor price recorded for each tracked product.</p>
        <BarList
          kind="count" empty="No competitor prices recorded yet."
          bars={marketTracked ? (["cheapest", "level", "dearer"] as const).map((k) => ({ label: POSITION_LABEL[k], value: market.positions[k], href: `/admin/competitors/prices?show=${k}` })) : []}
        />
        <p style={{ marginBottom: 0 }}>
          {market.averageGap !== null && <>Average gap {percentLabel(market.averageGap)}. </>}
          <Link href="/admin/competitors">Competitors</Link> · <Link href="/admin/competitors/prices">Price comparison</Link>
        </p>
      </section>

      <div className="adm-two even">
        <section className="panel">
          <h2>Needs attention</h2>
          <ul className="adm-health">
            <li><span>Orders awaiting payment</span><Link href="/admin/orders?status=AWAITING_PAYMENT">{awaiting}</Link></li>
            <li><span>Paid, ready to send</span><Link href="/admin/orders?status=PAID">{toShip}</Link></li>
            <li><span>New quotes and enquiries</span><Link href="/admin/enquiries">{newEnquiries}</Link></li>
            <li><span>Out of stock</span><Link href="/admin/inventory?show=out">{stock.out}</Link></li>
            <li><span>Low stock</span><Link href="/admin/inventory?show=low">{stock.low}</Link></li>
            <li><span>In stock with no price</span><Link href="/admin/products?missing=price">{noPrice}</Link></li>
          </ul>
          <p className="muted" style={{ marginBottom: 0 }}>Catalogue: {active} on sale, {drafts} drafts.</p>
        </section>
        <section className="panel">
          <h2>Orders by status</h2>
          <p className="muted">Placed in the last {days} days.</p>
          <BarList kind="count" empty="No orders in this period." bars={statuses.map((s) => ({ label: STATUS_LABEL[s.status], value: s.count, href: `/admin/orders?status=${s.status}` }))} />
        </section>
      </div>

      <div className="adm-two even">
        <section className="panel">
          <h2>Recent orders</h2>
          {recentOrders.length ? (
            <table className="table">
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/admin/orders/${o.id}`}>#{o.number}</Link></td>
                    <td>{o.name}<br /><span className="muted">{shortDate(o.createdAt)}</span></td>
                    <td><span className={`tag ${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
                    <td className="num">{pence(o.totalIncPence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">No orders yet.</p>}
          <p style={{ marginBottom: 0 }}><Link href="/admin/orders">All orders</Link></p>
        </section>
        <section className="panel">
          <h2>Recent changes</h2>
          {recent.length ? (
            <ul className="adm-health">
              {recent.map((r) => (
                <li key={r.id}><span>{r.summary}<br /><span className="muted">{r.actorName}, {shortDate(r.createdAt)}</span></span><span className={`tag ${r.source}`}>{r.source === "AI" ? "Assistant" : "Staff"}</span></li>
              ))}
            </ul>
          ) : <p className="muted">Nothing yet.</p>}
          <p style={{ marginBottom: 0 }}><Link href="/admin/activity">All activity</Link></p>
        </section>
      </div>
    </>
  );
}
