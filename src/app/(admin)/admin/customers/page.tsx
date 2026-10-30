import { Pager } from "@/components/admin/pager";
import { pence, shortDate } from "@/lib/format";
import { pageOf } from "@/lib/paging";
import { utilityMetadata } from "@/lib/seo";
import { db } from "@/server/db";

export const metadata = utilityMetadata("Customers");
export const dynamic = "force-dynamic";

const PAGE = 25;
const PAID = ["PAID", "PROCESSING", "SHIPPED", "COMPLETED"] as const;

// Everyone who has an account or has ordered. A guest is identified by their email address.
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q, page: raw } = await searchParams;
  const term = (q ?? "").trim();
  const [orders, users] = await Promise.all([
    db.order.groupBy({
      by: ["email"], _count: true, _sum: { totalIncPence: true }, _max: { createdAt: true },
      where: { status: { in: [...PAID] }, ...(term && { email: { contains: term, mode: "insensitive" } }) },
    }),
    db.user.findMany({ where: { role: "CUSTOMER", ...(term && { OR: [{ email: { contains: term, mode: "insensitive" } }, { name: { contains: term, mode: "insensitive" } }] }) }, orderBy: { createdAt: "desc" }, take: 300 }),
  ]);

  const byEmail = new Map(orders.map((o) => [o.email, o]));
  const rows = new Map<string, { email: string; name: string | null; account: boolean; joined: Date | null }>();
  for (const u of users) rows.set(u.email, { email: u.email, name: u.name, account: true, joined: u.createdAt });
  for (const o of orders) if (!rows.has(o.email)) rows.set(o.email, { email: o.email, name: null, account: false, joined: null });

  const list = [...rows.values()]
    .map((r) => ({ ...r, stats: byEmail.get(r.email) }))
    .sort((a, b) => (b.stats?._sum.totalIncPence ?? 0) - (a.stats?._sum.totalIncPence ?? 0));

  const { page, skip, take } = pageOf(raw, PAGE);
  const shown = list.slice(skip, skip + take);

  return (
    <>
      <header className="adm-head"><div><h1>Customers</h1><p>{list.length} customers. Spend counts paid orders, inc VAT.</p></div></header>
      <form className="adm-filters" role="search">
        <label>Search<input type="search" name="q" defaultValue={term} placeholder="Name or email" /></label>
        <button className="btn btn-ghost btn-sm" type="submit">Search</button>
      </form>
      <table className="table">
        <thead><tr><th>Customer</th><th>Account</th><th className="num">Orders</th><th className="num">Spend</th><th>Last order</th></tr></thead>
        <tbody>
          {shown.map((c) => (
            <tr key={c.email}>
              <td>{c.name ?? "Guest"}<br /><span className="muted">{c.email}</span></td>
              <td>{c.account ? `Joined ${shortDate(c.joined!)}` : <span className="muted">Guest checkout</span>}</td>
              <td className="num">{c.stats?._count ?? 0}</td>
              <td className="num">{pence(c.stats?._sum.totalIncPence ?? 0)}</td>
              <td>{c.stats?._max.createdAt ? shortDate(c.stats._max.createdAt) : <span className="muted">None</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!list.length && <p className="muted">No customers yet.</p>}
      <Pager path="/admin/customers" query={{ q: term }} page={page} size={PAGE} total={list.length} />
    </>
  );
}
