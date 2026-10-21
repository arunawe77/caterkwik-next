import Link from "next/link";
import { CategoryForm } from "@/components/admin/category-form";
import { utilityMetadata } from "@/lib/seo";
import { removeCategory } from "@/server/catalogue-actions";
import { db } from "@/server/db";

export const metadata = utilityMetadata("Categories");
export const dynamic = "force-dynamic";

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string }> }) {
  const { edit, error } = await searchParams;
  const [categories, counts] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: "asc" } }),
    db.product.groupBy({ by: ["categorySlug"], _count: true }),
  ]);
  const n = new Map(counts.map((c) => [c.categorySlug, c._count]));
  const editing = categories.find((c) => c.slug === edit);

  return (
    <>
      <header className="adm-head"><div><h1>Categories</h1><p>{categories.length} categories. The slug is the web address and cannot change. <Link href="/admin/import">Import more from a spreadsheet</Link>.</p></div></header>
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="adm-two">
        <section className="panel">
          <table className="table">
            <thead><tr><th>Category</th><th>Where it sits</th><th className="num">Products</th><th /></tr></thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.slug}>
                  <td><Link href={`/admin/products?category=${c.slug}`}>{c.label}</Link></td>
                  <td className="muted">{c.path ?? `/ovens/${c.slug}`}</td>
                  <td className="num">{n.get(c.slug) ?? 0}</td>
                  <td className="adm-actions">
                    <Link className="btn btn-ghost btn-sm" href={`/admin/categories?edit=${c.slug}`}>Edit</Link>
                    {!(n.get(c.slug) ?? 0) && (
                      <form action={removeCategory}><input type="hidden" name="slug" value={c.slug} /><button className="btn btn-ghost btn-sm adm-danger" type="submit">Delete</button></form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <aside className="panel">
          <h2>{editing ? `Edit ${editing.label}` : "Add a category"}</h2>
          <CategoryForm
            key={editing?.slug ?? "new"}
            existing={!!editing}
            values={editing
              ? { slug: editing.slug, label: editing.label, audience: editing.audience, cooking: editing.cooking.join(", "), supply: editing.supply.join(", "), covers: editing.covers.join(", "), image: editing.image ?? "", description: editing.description ?? "" }
              : { slug: "", label: "", audience: "", cooking: "", supply: "", covers: "", image: "", description: "" }}
          />
          {editing && <p><Link href="/admin/categories">Add a new one instead</Link></p>}
        </aside>
      </div>
    </>
  );
}
