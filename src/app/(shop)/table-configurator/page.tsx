import Link from "next/link";
import { Icon } from "@/components/icons";
import { ProductCard } from "@/components/product-card";
import { TableConfigurator } from "@/components/table-configurator";
import { shopMembersOf, shopTypes, typeHref } from "@/lib/catalogue";
import { currentUser } from "@/server/session";

export const metadata = {
  title: "Stainless steel table configurator",
  description: "Design a made-to-measure stainless steel wall or centre table: size, undershelves, gantry, upstands and castors. Made in-house, quoted within one working day.",
};

const POINTS = [
  { icon: "check", text: "Fully welded 304 stainless steel top, made in-house" },
  { icon: "list", text: "Any size, with undershelves, gantries and upstands" },
  { icon: "truck", text: "Delivery and lead time confirmed with your quote" },
] as const;

// Ready-made tables from the catalogue (every category under Stainless Steel Tables), available ones first, cheapest first.
function readyMadeTables() {
  const category = shopTypes.find((t) => t.label === "Stainless Steel Tables");
  if (!category) return { category, tables: [] };
  const tables = shopMembersOf(category.slug)
    .filter((p) => p.stock !== "discontinued")
    .sort((a, b) => (a.priceEx ?? Infinity) - (b.priceEx ?? Infinity))
    .slice(0, 8);
  return { category, tables };
}

export default async function TableConfiguratorPage() {
  const user = await currentUser();
  const { category, tables } = readyMadeTables();
  return (
    <main className="wrap ovenpage">
      <header className="ohead">
        <p className="kicker">Cater-Fabs fabrication</p>
        <h1>Stainless steel table configurator</h1>
        <p className="sub">Design a table to fit your kitchen in six short steps. We make it in-house and send you a firm price.</p>
      </header>
      <ul className="quotepoints">
        {POINTS.map((p) => <li key={p.text}><Icon name={p.icon} size={16} />{p.text}</li>)}
      </ul>
      <TableConfigurator defaults={{ name: user?.name ?? undefined, email: user?.email }} />
      {tables.length > 0 && (
        <section aria-labelledby="readymade">
          <h2 id="readymade">Need one sooner? Ready-made stainless steel tables</h2>
          <p className="muted">Standard sizes from the shop{category && <>. <Link href={typeHref(category.slug)}>See all stainless steel tables</Link></>}.</p>
          <div className="ogrid">{tables.map((p) => <ProductCard key={p.id} product={p} />)}</div>
        </section>
      )}
    </main>
  );
}
