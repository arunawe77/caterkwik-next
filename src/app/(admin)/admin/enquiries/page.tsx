import { Pager } from "@/components/admin/pager";
import { shortDate } from "@/lib/format";
import { pageOf } from "@/lib/paging";
import { utilityMetadata } from "@/lib/seo";
import { setEnquiryStatus } from "@/server/admin-actions";
import { db } from "@/server/db";

export const metadata = utilityMetadata("Quotes and enquiries");

const PAGE = 25;
const KIND = { QUOTE: "Quote", CALLBACK: "Call back", GENERAL: "Enquiry" } as const;

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page, skip, take } = pageOf((await searchParams).page, PAGE);
  const [enquiries, total] = await Promise.all([db.enquiry.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], skip, take }), db.enquiry.count()]);

  return (
    <>
      {enquiries.map((e) => (
        <section key={e.id} className="panel" style={{ marginBottom: 14 }}>
          <h2>
            {KIND[e.kind]}{e.productName && `: ${e.productName}`} <span className={`tag ${e.status}`}>{e.status === "NEW" ? "New" : e.status === "DONE" ? "Done" : "In progress"}</span>
          </h2>
          <p className="muted" style={{ margin: "0 0 8px" }}>
            {shortDate(e.createdAt)} · {e.name}{e.company && `, ${e.company}`} · <a href={`mailto:${e.email}`}>{e.email}</a>{e.phone && ` · ${e.phone}`}
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{e.message}</p>
          <form action={setEnquiryStatus} className="inline">
            <input type="hidden" name="id" value={e.id} />
            <input type="text" name="notes" defaultValue={e.notes ?? ""} placeholder="Notes" aria-label="Notes" />
            {e.status !== "IN_PROGRESS" && <button className="btn btn-ghost btn-sm" name="status" value="IN_PROGRESS" type="submit">In progress</button>}
            {e.status !== "DONE" && <button className="btn btn-navy btn-sm" name="status" value="DONE" type="submit">Mark done</button>}
            {e.status !== "NEW" && <button className="btn btn-ghost btn-sm" name="status" value="NEW" type="submit">Reopen</button>}
          </form>
        </section>
      ))}
      {!enquiries.length && <p className="muted">Nothing yet.</p>}
      <Pager path="/admin/enquiries" query={{}} page={page} size={PAGE} total={total} />
    </>
  );
}
