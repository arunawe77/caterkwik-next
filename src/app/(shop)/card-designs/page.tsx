import { notFound } from "next/navigation";
import { getProduct } from "@/lib/catalogue";
import { ProductCard } from "@/components/product-card";
import { utilityMetadata } from "@/lib/seo";
import { DESIGNS, DesignCard } from "./designs";
import "@/styles/card-designs.css";

export const metadata = utilityMetadata("Product card designs");

const SAMPLE = "falcong31016burnergasoven";

/* A sample page: one real product in seventeen card designs, for choosing a direction. Not linked from the site. */
export default function CardDesignsPage() {
  const p = getProduct(SAMPLE);
  if (!p) notFound();
  return (
    <main className="wrap ovenpage cdx">
      <header className="ohead">
        <h1>Product card designs</h1>
        <p className="sub">One oven, seventeen ways to show it. Hover or tab onto each card to see how it moves. A is how the cards look on the site now.</p>
      </header>
      <div className="cdx-grid">
        <section className="cdx-opt">
          <div className="cdx-tag"><b>A</b><div><strong>Current</strong><span>Centred photo, name, spec line, price and one button.</span></div></div>
          <div className="cdx-stage"><div className="cur"><ProductCard product={p} /></div></div>
        </section>
        {DESIGNS.map((d) => (
          <section key={d.id} className={`cdx-opt${d.wide ? " wide" : ""}`}>
            <div className="cdx-tag"><b>{d.id}</b><div><strong>{d.title}</strong><span>{d.note}</span></div></div>
            <div className="cdx-stage"><DesignCard id={d.id} p={p} /></div>
          </section>
        ))}
      </div>
    </main>
  );
}
