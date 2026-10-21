import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Crumbs } from "@/components/crumbs";
import { CatalogueKit } from "@/components/kit-chat";
import { cookingGroups, cookingProducts, products, types } from "@/lib/catalogue";
import { money, plural } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return pageMetadata({
    title: `Commercial Cooking Equipment: ${plural(cookingGroups().length + 1, "category")}, ${products.length + cookingProducts.length} models`,
    description: "Fryers, pizza ovens, griddles, chargrills, combination ovens, bain maries and the rest of Caterkwik's commercial cooking range, with the specification of every model.",
    path: "/cooking",
  });
}

// One card per department, straight to its products, with the oven types listed in place of a second hub.
export default function CookingHub() {
  const groups = cookingGroups();
  const live = cookingProducts.filter((p) => p.stock === "in-stock").length;

  return (
    <main className="wrap ovenpage">
      <Crumbs trail={[{ label: "Home", href: "/" }, { label: "Cooking", href: "/cooking" }]} />
      <header className="ohead">
        <h1><Icon name="flame" size={30} /> Commercial cooking equipment</h1>
        <p className="sub">
          {plural(cookingProducts.length + products.length, "model")} across {plural(groups.length + 1, "category")}; {live + products.filter((p) => p.stock === "in-stock").length} available today.
          Every product page carries the full specification Caterkwik publishes, with its datasheets.
        </p>
      </header>

      <ul className="ccards">
        <li>
          <Link href="/ovens">
            <b>Commercial ovens</b>
            <span>{plural(products.length, "model")} · {plural(types.length, "type")}, with the oven finder</span>
          </Link>
        </li>
        {groups.map((g) => (
          <li key={g.slug}>
            <Link href={`/cooking/${g.slug}`}>
              <b>{g.label}</b>
              <span>{plural(g.total, "model")}{g.fromPrice === null ? "" : ` · from ${money(g.fromPrice)} ex VAT`}</span>
            </Link>
          </li>
        ))}
      </ul>
      <CatalogueKit />
    </main>
  );
}

export const dynamic = "force-dynamic";
