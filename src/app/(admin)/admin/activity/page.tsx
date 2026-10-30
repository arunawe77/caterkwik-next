import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { Pager } from "@/components/admin/pager";
import { pageOf } from "@/lib/paging";
import { utilityMetadata } from "@/lib/seo";
import { undo } from "@/server/catalogue-actions";
import { db } from "@/server/db";

export const metadata = utilityMetadata("Activity log");
export const dynamic = "force-dynamic";

const PAGE = 50;
const when = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ source?: string; page?: string }> }) {
  const { source, page: raw } = await searchParams;
  const where: Prisma.AuditLogWhereInput = source === "AI" || source === "STAFF" ? { source } : {};
  const { page, skip, take } = pageOf(raw, PAGE);
  const [rows, total] = await Promise.all([db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }), db.auditLog.count({ where })]);

  return (
    <>
      <header className="adm-head"><div><h1>Activity log</h1><p>Every catalogue change, by staff or by the assistant. A single product change can be undone.</p></div></header>
      <p className="admin-nav">
        <Link href="/admin/activity">All</Link><Link href="/admin/activity?source=AI">Assistant</Link><Link href="/admin/activity?source=STAFF">Staff</Link>
      </p>
      <table className="table">
        <thead><tr><th>When</th><th>Who</th><th>Change</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{when(r.createdAt)}</td>
              <td>{r.actorName}<br /><span className={`tag ${r.source}`}>{r.source === "AI" ? "Assistant" : "Staff"}</span></td>
              <td>
                {r.entity === "product" && !r.entityId.includes(",") ? <Link href={`/admin/products/${r.entityId}`}>{r.summary}</Link> : r.summary}
                {r.undoneAt && <><br /><span className="muted">Undone</span></>}
              </td>
              <td>
                {!r.undoneAt && r.entity === "product" && ["update", "create", "delete"].includes(r.action) && (
                  <form action={undo}><input type="hidden" name="id" value={r.id} /><button className="btn btn-ghost btn-sm" type="submit">Undo</button></form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="muted">Nothing logged yet.</p>}
      <Pager path="/admin/activity" query={{ source }} page={page} size={PAGE} total={total} />
    </>
  );
}
