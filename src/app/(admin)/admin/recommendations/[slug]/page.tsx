import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms";
import { money } from "@/lib/format";
import { utilityMetadata } from "@/lib/seo";
import { TEAM } from "@/lib/team";
import { removeRecommendation, saveRecommendation, shiftRecommendation } from "@/server/recommendation-actions";
import { slidesFor, type StoredPick } from "@/server/recommendations";
import { db } from "@/server/db";

export const metadata = utilityMetadata("Recommendations for a page");
export const dynamic = "force-dynamic";

type Option = { id: string; name: string; priceExPence: number | null };
type Slide = { id: string; kicker: string; blurb: string; recommender: string; active: boolean; picks: StoredPick[] };

const CHIPS = ["Best value", "Mid-range", "Premium option", "Most compact", "Highest output", "Great price", "Our pick"];

function SlideForm({ slug, slide, products }: { slug: string; slide?: Slide; products: Option[] }) {
  const picks = [0, 1, 2].map((i) => slide?.picks[i]);
  return (
    <ActionForm action={saveRecommendation} submit={slide ? "Save slide" : "Add slide"} success="Saved.">
      <input type="hidden" name="categorySlug" value={slug} />
      {slide && <input type="hidden" name="id" value={slide.id} />}
      <div className="adm-grid">
        <label className="field"><span>Recommended by <i aria-hidden>*</i></span>
          <select name="recommender" defaultValue={slide?.recommender ?? TEAM[0].name} required>
            {TEAM.map((t) => <option key={t.name} value={t.name}>{t.name}, {t.role}</option>)}
          </select>
        </label>
        <label className="field"><span>Slide title <i aria-hidden>*</i></span><input name="kicker" required maxLength={60} defaultValue={slide?.kicker} placeholder="e.g. Best for small kitchens" /></label>
        <label className="field wide"><span>What they say <i aria-hidden>*</i></span><textarea name="blurb" rows={2} required maxLength={240} defaultValue={slide?.blurb} /></label>
      </div>
      {[1, 2, 3].map((n) => {
        const p = picks[n - 1];
        return (
          <fieldset key={n} className="rec-card">
            <legend>Card {n}{n > 1 ? " (optional)" : ""}</legend>
            <div className="adm-grid">
              <label className="field wide"><span>Product</span>
                <select name={`p${n}`} defaultValue={p?.productId ?? ""} required={n === 1}>
                  <option value="">{n === 1 ? "Choose a product" : "None"}</option>
                  {products.map((o) => <option key={o.id} value={o.id}>{o.name}{o.priceExPence === null ? "" : ` · ${money(o.priceExPence / 100)}`}</option>)}
                </select>
              </label>
              <label className="field"><span>Label</span><input name={`chip${n}`} list="rec-chips" maxLength={24} defaultValue={p?.chip} placeholder="Best value" /></label>
              <label className="field"><span>Heading</span><input name={`heading${n}`} maxLength={60} defaultValue={p?.heading} placeholder="Economy option" /></label>
              <label className="field wide"><span>Why we recommend it</span><input name={`why${n}`} maxLength={160} defaultValue={p?.why} /></label>
            </div>
          </fieldset>
        );
      })}
      <label className="adm-checks"><input type="checkbox" name="active" defaultChecked={slide ? slide.active : true} /> Show this slide on the page</label>
    </ActionForm>
  );
}

export default async function RecommendationsForPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await db.category.findUnique({ where: { slug }, select: { slug: true, label: true } });
  if (!category) notFound();
  const [slides, rows] = await Promise.all([
    slidesFor(slug),
    db.product.findMany({ where: { categorySlug: slug, status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true, priceExPence: true } }),
  ]);
  const products: Option[] = rows;

  return (
    <>
      <header className="adm-head">
        <div><h1>Recommendations: {category.label}</h1><p>The slides of the &quot;Recommended by&quot; banner on this page. With no active slides, the page shows the automatic banner.</p></div>
        <div className="adm-actions">
          <Link className="btn btn-ghost btn-sm" href="/admin/recommendations">All pages</Link>
          <Link className="btn btn-ghost btn-sm" href={`/ovens/${slug}`} target="_blank">View page</Link>
        </div>
      </header>
      <datalist id="rec-chips">{CHIPS.map((c) => <option key={c} value={c} />)}</datalist>

      {slides.map((s, i) => (
        <section key={s.id} className="panel">
          <h2>{i + 1}. {s.kicker} {!s.active && <span className="tag ARCHIVED">Hidden</span>}</h2>
          <SlideForm slug={slug} slide={s} products={products} />
          <div className="inline-edit">
            {i > 0 && <form action={shiftRecommendation}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="categorySlug" value={slug} /><input type="hidden" name="direction" value="up" /><button className="btn btn-ghost btn-sm" type="submit">Move up</button></form>}
            {i < slides.length - 1 && <form action={shiftRecommendation}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="categorySlug" value={slug} /><input type="hidden" name="direction" value="down" /><button className="btn btn-ghost btn-sm" type="submit">Move down</button></form>}
            <form action={removeRecommendation}><input type="hidden" name="id" value={s.id} /><button className="btn btn-ghost btn-sm adm-danger" type="submit">Remove slide</button></form>
          </div>
        </section>
      ))}

      <section className="panel">
        <h2>Add a slide</h2>
        {products.length < 1 ? <p className="muted">This page has no products to recommend yet.</p> : <SlideForm slug={slug} products={products} />}
      </section>
    </>
  );
}
