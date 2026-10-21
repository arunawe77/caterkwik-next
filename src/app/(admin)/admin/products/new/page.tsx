import Link from "next/link";
import { EMPTY_PRODUCT, ProductForm } from "@/components/admin/product-form";
import { utilityMetadata } from "@/lib/seo";
import { db } from "@/server/db";

export const metadata = utilityMetadata("New product");
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const categories = await db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, label: true } });
  return (
    <>
      <header className="adm-head">
        <div><h1>New product</h1><p>It is saved as a draft, so it stays off the shop until you put it on sale.</p></div>
        <div className="adm-actions"><Link className="btn btn-ghost btn-sm" href="/admin/products">Back to products</Link></div>
      </header>
      <ProductForm values={EMPTY_PRODUCT} categories={categories} />
    </>
  );
}
