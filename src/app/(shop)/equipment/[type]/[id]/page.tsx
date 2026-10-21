import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isShopType } from "@/lib/catalogue";
import ProductPage, { generateMetadata as productMetadata } from "@/app/(shop)/ovens/[type]/[id]/page";

// The product page for every product in the imported category tree, under /equipment/<category>/<product>.
type Props = { params: Promise<{ type: string; id: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  return isShopType((await props.params).type) ? productMetadata(props) : {};
}

export default async function EquipmentProductPage(props: Props) {
  if (!isShopType((await props.params).type)) notFound();
  return ProductPage(props);
}

export const dynamic = "force-dynamic";
