import { AreaChart, BarList } from "@/components/admin/charts";
import { RangeTabs } from "@/components/admin/range-tabs";
import { StatTile } from "@/components/admin/stat-tile";
import { money } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orderflow";
import { utilityMetadata } from "@/lib/seo";
import { change, dailySales, enquiryPipeline, kpis, LONG_RANGES, ordersByStatus, periodOf, rangeOf, salesByCategory, topProducts } from "@/server/analytics";

export const metadata = utilityMetadata("Analytics");
export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const days = rangeOf((await searchParams).range, LONG_RANGES);
  const [k, series, prior, statuses, products, categories, pipeline] = await Promise.all([
    kpis(days),
    dailySales(days),
    dailySales(days, periodOf(days).previous.to),
    ordersByStatus(days),
    topProducts(days, 10),
    salesByCategory(days, 10),
    enquiryPipeline(),
  ]);
  const versus = `vs previous ${days} days`;
  const label = days === 365 ? "12 months" : `${days} days`;

  return (
    <>
      <header className="adm-head">
        <div><h1>Analytics</h1><p>Sales, orders and demand over the last {label}.</p></div>
        <div className="adm-actions"><RangeTabs ranges={LONG_RANGES} current={days} base="/admin/analytics" /></div>
      </header>

      <div className="stats-row">
        <StatTile label="Revenue, inc VAT" value={money(k.now.revenue)} delta={change(k.now.revenue, k.before.revenue)} versus={versus} />
        <StatTile label="Orders" value={String(k.now.orders)} delta={change(k.now.orders, k.before.orders)} versus={versus} />
        <StatTile label="Average order" value={money(k.now.averageOrder)} delta={change(k.now.averageOrder, k.before.averageOrder)} versus={versus} />
        <StatTile label="New customers" value={String(k.now.newCustomers)} delta={change(k.now.newCustomers, k.before.newCustomers)} versus={versus} />
      </div>

      <section className="panel">
        <h2>Revenue by day</h2>
        <AreaChart kind="money" title="Revenue" previousLabel={`Previous ${label}`} points={series.map((p, i) => ({ label: p.label, value: p.revenue, previous: prior[i]?.revenue }))} />
      </section>
      <section className="panel">
        <h2>Orders by day</h2>
        <AreaChart kind="count" title="Orders" previousLabel={`Previous ${label}`} points={series.map((p, i) => ({ label: p.label, value: p.orders, previous: prior[i]?.orders }))} />
      </section>

      <div className="adm-two even">
        <section className="panel"><h2>Best sellers</h2>
          <BarList kind="money" empty="No sales in this period." bars={products.map((p) => ({ label: p.name, value: p.revenue, note: `${p.units} sold`, href: `/admin/products/${p.id}` }))} />
        </section>
        <section className="panel"><h2>Sales by category</h2>
          <BarList kind="money" empty="No sales in this period." bars={categories.map((c) => ({ label: c.name, value: c.revenue }))} />
        </section>
      </div>
      <div className="adm-two even">
        <section className="panel"><h2>Orders by status</h2>
          <BarList kind="count" empty="No orders in this period." bars={statuses.map((s) => ({ label: STATUS_LABEL[s.status], value: s.count }))} />
        </section>
        <section className="panel"><h2>Quotes and enquiries</h2>
          <p className="muted">All time, by where they are in your handling.</p>
          <BarList kind="count" bars={[{ label: "New", value: pipeline.NEW }, { label: "In progress", value: pipeline.IN_PROGRESS }, { label: "Done", value: pipeline.DONE }]} />
        </section>
      </div>
    </>
  );
}
