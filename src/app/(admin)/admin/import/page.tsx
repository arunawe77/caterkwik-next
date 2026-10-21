import Link from "next/link";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { ImportUpload } from "@/components/admin/import-upload";
import { utilityMetadata } from "@/lib/seo";
import { db } from "@/server/db";
import { confirmImport } from "@/server/product-import/actions";
import type { ImportSummary } from "@/server/product-import/apply";

export const metadata = utilityMetadata("Import products");
export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString("en-GB");
const when = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Stat({ value, label }: { value: number; label: string }) {
  return <div><b>{n(value)}</b><span>{label}</span></div>;
}

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run: runId } = await searchParams;
  const [runs, shown] = await Promise.all([
    db.importRun.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    runId ? db.importRun.findUnique({ where: { id: runId } }) : null,
  ]);
  const active = !!shown && (shown.status === "QUEUED" || shown.status === "RUNNING");
  const summary = shown?.status === "DONE" ? (shown.result as unknown as ImportSummary | null) : null;
  const options = (shown?.options ?? {}) as { updateExisting?: boolean; publish?: boolean };

  return (
    <>
      <header className="adm-head"><div><h1>Import products</h1><p>Add products, categories and their details from a Caterkwik crawl workbook (.xlsx).</p></div></header>
      <AutoRefresh active={active} />

      {shown && (
        <section className="panel">
          <h2>{shown.dryRun ? "Check" : "Import"} of {shown.fileName}</h2>
          <p className="muted">Started {when(shown.createdAt)} by {shown.actorName}</p>

          {active && (
            <>
              <p role="status">{shown.phase}{shown.total ? `: ${n(shown.done)} of ${n(shown.total)}` : "..."}</p>
              <div className="adm-progress"><span style={{ width: `${shown.total ? Math.round((shown.done / shown.total) * 100) : 5}%` }} /></div>
            </>
          )}
          {shown.status === "FAILED" && <p className="alert" role="alert">It failed: {shown.error}</p>}

          {summary && (
            <>
              <div className="adm-import-stats">
                <Stat value={summary.productsNew} label="new products" />
                <Stat value={summary.productsExisting} label={options.updateExisting && !shown.dryRun ? "existing products updated" : "already in the catalogue"} />
                <Stat value={summary.categoriesNew} label="new categories" />
                <Stat value={summary.categoriesAdopted + summary.categoriesExisting} label="categories already there" />
                <Stat value={summary.withoutPrice} label="without a price (price on application)" />
                <Stat value={summary.withDocuments} label="with PDFs and documents" />
                <Stat value={summary.withOptions} label="with purchase options" />
                <Stat value={summary.withReviews} label="with reviews" />
              </div>
              <p className="muted">
                Availability: {Object.entries(summary.availability).map(([k, v]) => `${n(v)} ${k.replace("_", " ").toLowerCase()}`).join(", ")}.
              </p>
              {summary.warnings.map((w) => <p key={w} className="alert">{w}</p>)}

              {shown.dryRun ? (
                <form action={confirmImport} className="form">
                  <input type="hidden" name="run" value={shown.id} />
                  <div className="adm-checks">
                    <label><input type="checkbox" name="update" defaultChecked={options.updateExisting} /> Update products already in the catalogue (name, prices, descriptions). Their category and status stay as they are.</label>
                    <label><input type="checkbox" name="publish" defaultChecked={options.publish} /> Put the products on the storefront. Left off, new ones arrive as drafts to review in Products; ticked, drafts from earlier imports go live as well.</label>
                  </div>
                  <button className="btn btn-navy" type="submit">Import {n(summary.productsNew)} new products</button>
                </form>
              ) : (
                <p className="okmsg" role="status">
                  Done. <Link href="/admin/products">See the products</Link> or <Link href="/admin/categories">the categories</Link>.
                </p>
              )}
            </>
          )}
        </section>
      )}

      <div className="adm-two">
        <section className="panel">
          <h2>Upload a workbook</h2>
          <ImportUpload />
        </section>
        <aside className="panel">
          <h2>Recent imports</h2>
          {runs.length ? (
            <ul className="adm-health">
              {runs.map((r) => (
                <li key={r.id}>
                  <span><Link href={`/admin/import?run=${r.id}`}>{r.fileName.replace(/^\d+-/, "")}</Link><br /><span className="muted">{r.dryRun ? "Check" : "Import"}, {when(r.createdAt)}, {r.actorName}</span></span>
                  <span className={`tag ${r.status === "DONE" ? "ACTIVE" : r.status === "FAILED" ? "ARCHIVED" : "DRAFT"}`}>{r.status.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted">Nothing imported yet.</p>}
        </aside>
      </div>
    </>
  );
}
