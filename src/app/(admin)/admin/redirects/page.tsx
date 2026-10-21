import { ActionForm, Field } from "@/components/forms";
import { utilityMetadata } from "@/lib/seo";
import { addRedirect, deleteRedirect } from "@/server/admin-actions";
import { db } from "@/server/db";

export const metadata = utilityMetadata("Redirects");

export default async function RedirectsPage() {
  const redirects = await db.customRedirect.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="twocol">
      <section className="panel">
        <h2>Added redirects</h2>
        <p className="muted">The 442 old product addresses redirect automatically. Add any others here; each answers with a 301 and is live within 15 seconds.</p>
        <table className="table">
          <thead><tr><th>From</th><th>To</th><th /></tr></thead>
          <tbody>
            {redirects.map((r) => (
              <tr key={r.id}>
                <td>{r.fromPath}</td><td>{r.toPath}</td>
                <td><form action={deleteRedirect}><input type="hidden" name="id" value={r.id} /><button className="btn btn-ghost btn-sm" type="submit">Delete</button></form></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!redirects.length && <p className="muted">None added.</p>}
      </section>
      <aside className="panel">
        <h2>Add a redirect</h2>
        <ActionForm action={addRedirect} submit="Save" success="Saved.">
          <Field name="fromPath" label="From path" required hint="For example /old-page" />
          <Field name="toPath" label="To path" required hint="For example /ovens/4-burner" />
        </ActionForm>
      </aside>
    </div>
  );
}
