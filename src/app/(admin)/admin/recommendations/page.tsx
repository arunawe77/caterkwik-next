import Link from "next/link";
import { utilityMetadata } from "@/lib/seo";
import { overview } from "@/server/recommendations";

export const metadata = utilityMetadata("Recommendations");
export const dynamic = "force-dynamic";

export default async function RecommendationsPage() {
  const categories = await overview();
  const custom = categories.filter((c) => c.slides > 0);
  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Recommendations</h1>
          <p>The &quot;Recommended by&quot; banner on each category page. Choose who recommends, what they say and which products. A page you do not set up keeps the automatic banner.</p>
        </div>
      </header>

      <section className="panel">
        <h2>Pages with your own recommendations ({custom.length})</h2>
        {custom.length ? (
          <ul className="adm-health">
            {custom.map((c) => <li key={c.slug}><span><Link href={`/admin/recommendations/${c.slug}`}>{c.label}</Link><br /><span className="muted">{c.slides} {c.slides === 1 ? "slide" : "slides"}</span></span></li>)}
          </ul>
        ) : <p className="muted">None yet. Every page uses the automatic banner.</p>}
      </section>

      <section className="panel">
        <h2>All category pages</h2>
        <table className="table">
          <thead><tr><th>Page</th><th>Banner</th><th /></tr></thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.slug}>
                <td>{c.label}</td>
                <td>{c.slides > 0 ? <span className="tag IN_STOCK">Your own, {c.slides}</span> : <span className="muted">Automatic</span>}</td>
                <td><Link className="btn btn-ghost btn-sm" href={`/admin/recommendations/${c.slug}`}>{c.slides > 0 ? "Edit" : "Set up"}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
