import Link from "next/link";
import { StatTile } from "@/components/admin/stat-tile";
import { ActionForm, Field } from "@/components/forms";
import { autoSiteFor, percentLabel } from "@/lib/competitors";
import { shortDate } from "@/lib/format";
import { utilityMetadata } from "@/lib/seo";
import { checkCompetitorsNow, removeCompetitor, saveCompetitor, setCompetitorActive } from "@/server/competitor-actions";
import { checkInProgress } from "@/server/competitor-check";
import { ensureCompetitors, overview } from "@/server/competitors";

export const metadata = utilityMetadata("Competitors");
export const dynamic = "force-dynamic";

export default async function CompetitorsPage({ searchParams }: { searchParams: Promise<{ checking?: string }> }) {
  const q = await searchParams;
  await ensureCompetitors();
  const o = await overview();
  const tracked = o.positions.cheapest + o.positions.level + o.positions.dearer + o.positions.unpriced;

  return (
    <>
      <header className="adm-head">
        <div><h1>Competitors</h1><p>Who we are measured against, and how our prices compare. Prices are ex VAT.</p></div>
        <div className="adm-actions"><Link className="btn btn-navy btn-sm" href="/admin/competitors/prices">Price comparison</Link></div>
      </header>

      <div className="stats-row">
        <StatTile label="Products tracked" value={String(tracked)} href="/admin/competitors/prices?show=tracked" />
        <StatTile label="We are cheapest" value={String(o.positions.cheapest)} href="/admin/competitors/prices?show=cheapest" />
        <StatTile label="Undercut" value={String(o.positions.dearer)} href="/admin/competitors/prices?show=dearer" />
        <StatTile label="Level" value={String(o.positions.level)} href="/admin/competitors/prices?show=level" />
        <div className="stat stat2">
          <span className="stat-label">Average gap to them</span>
          <b>{o.averageGap === null ? "None yet" : percentLabel(o.averageGap)}</b>
          <span className="delta flat">{o.averageGap === null ? "Record a price to start" : o.averageGap > 0 ? "We are dearer on average" : "We are cheaper on average"}</span>
        </div>
      </div>

      <div className="adm-two">
        <section className="panel">
          <h2>Sites we watch</h2>
          <p className="muted">
            Sites marked <b>Automatic</b> are read by the server: it finds each product by part number and re-checks the recorded pages, one request every 30 seconds.
            The others block automated checks, so their prices are typed in from the public product page. Open a product from the
            <Link href="/admin/competitors/prices"> price comparison</Link> to record what a site charges.
          </p>
          {q.checking && <p className="okmsg" role="status">{q.checking === "started" ? "Checking in the background. Refresh in a few minutes to see new prices." : "A check is already running."}</p>}
          <form action={checkCompetitorsNow} className="form">
            <button className="btn btn-navy btn-sm" type="submit" disabled={checkInProgress()}>{checkInProgress() ? "Checking now..." : "Check automatic sites now"}</button>
          </form>
          <table className="table">
            <thead><tr><th>Competitor</th><th>Tracking</th><th className="num">Products</th><th className="num">Avg gap</th><th>Last recorded</th><th /></tr></thead>
            <tbody>
              {o.competitors.map((c) => (
                <tr key={c.id}>
                  <td>
                    <a href={c.url} target="_blank" rel="noopener noreferrer">{c.name}</a>
                    {!c.active && <> <span className="tag ARCHIVED">Paused</span></>}
                    <br /><span className="muted">{c.domain}{c.notes ? ` · ${c.notes}` : ""}</span>
                  </td>
                  <td>{autoSiteFor(c.domain) ? <span className="tag IN_STOCK">Automatic</span> : <span className="muted">By hand</span>}</td>
                  <td className="num">{c.tracked}{c.stale > 0 && <><br /><span className="muted">{c.stale} out of date</span></>}</td>
                  <td className="num">{c.averageGap === null ? "-" : percentLabel(c.averageGap)}</td>
                  <td>{c.lastChecked ? shortDate(c.lastChecked) : <span className="muted">Never</span>}</td>
                  <td>
                    <span className="inline-edit">
                      <form action={setCompetitorActive}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="active" value={String(!c.active)} />
                        <button className="btn btn-ghost btn-sm" type="submit">{c.active ? "Pause" : "Resume"}</button>
                      </form>
                      <form action={removeCompetitor}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="btn btn-ghost btn-sm adm-danger" type="submit" aria-label={`Remove ${c.name} and its recorded prices`}>Remove</button>
                      </form>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!o.competitors.length && <p className="muted">No competitors yet.</p>}
        </section>

        <aside className="panel">
          <h2>Add a competitor</h2>
          <ActionForm action={saveCompetitor} submit="Add competitor" success="Added.">
            <Field name="name" label="Name" required />
            <Field name="domain" label="Website" required hint="For example nisbets.co.uk" />
            <Field name="url" label="Shop front address" hint="Optional. Where the Visit link goes." />
            <Field name="notes" label="Notes" rows={2} />
          </ActionForm>
        </aside>
      </div>
    </>
  );
}
