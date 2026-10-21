import type { Metadata } from "next";
import Link from "next/link";
import { CatalogueKit } from "@/components/kit-chat";
import { ProductCard } from "@/components/product-card";
import { plural } from "@/lib/format";
import { searchProducts } from "@/lib/search";
import { utilityMetadata } from "@/lib/seo";

export const metadata: Metadata = utilityMetadata("Search");

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) ?? "";
  const results = searchProducts(q);

  return (
    <main className="wrap ovenpage">
      <header className="ohead">
        <h1>{q ? `Results for “${q}”` : "Search"}</h1>
        <p className="sub">{q ? plural(results.length, "model") : "Search by product name, brand or model number."}</p>
      </header>
      {results.length > 0 ? (
        <div className="ogrid">{results.map((p) => <ProductCard key={p.id} product={p} />)}</div>
      ) : (
        q && <p className="noresults">Nothing matches. Try a model number such as <b>G3101</b>, or browse <Link href="/ovens">all commercial ovens</Link>.</p>
      )}
      <CatalogueKit />
    </main>
  );
}

// Rendered per request from the catalogue in memory, so an admin change shows at once and a restart never serves a stale build.
export const dynamic = "force-dynamic";
