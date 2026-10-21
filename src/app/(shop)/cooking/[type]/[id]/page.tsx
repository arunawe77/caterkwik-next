import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookingProducts, isOvenType } from "@/lib/catalogue";
import ProductPage, { generateMetadata as productMetadata } from "@/app/(shop)/ovens/[type]/[id]/page";

// The same product page as the ovens, for every other Cooking product.
type Props = { params: Promise<{ type: string; id: string }> };

export const generateStaticParams = () => cookingProducts.map((p) => ({ type: p.type, id: p.id }));

export async function generateMetadata(props: Props): Promise<Metadata> {
  return isOvenType((await props.params).type) ? {} : productMetadata(props);
}

export default async function CookingProductPage(props: Props) {
  if (isOvenType((await props.params).type)) notFound();
  return ProductPage(props);
}

export const dynamic = "force-dynamic";
