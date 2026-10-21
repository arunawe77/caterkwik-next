import type { MetadataRoute } from "next";
import { cookingGroups, cookingProducts, productHref, products, shopProducts, shopTypes, typeHref, types } from "@/lib/catalogue";
import { absolute } from "@/lib/seo";
import { SCRAPED_ON } from "@/lib/site";

// Every page worth indexing, with the date its data was read. The G3101 worked example is included.
const LAST_MODIFIED = new Date(SCRAPED_ON);

const entries: [string, number][] = [
  ["/", 1],
  ["/ovens", 0.9],
  ["/cooking", 0.9],
  ["/falcon/g3101-otc-p", 0.6],
  ...types.map((t): [string, number] => [typeHref(t.slug), 0.8]),
  ...cookingGroups().map((g): [string, number] => [`/cooking/${g.slug}`, 0.7]),
  ["/shop/commercial-catering-equipment", 0.8],
  ...shopTypes.filter((t) => t.total > 0).map((t): [string, number] => [typeHref(t.slug), t.parentSlug ? 0.6 : 0.8]),
  ...[...products, ...cookingProducts, ...shopProducts].map((p): [string, number] => [productHref(p), p.stock === "discontinued" ? 0.3 : 0.6]),
];

export default function sitemap(): MetadataRoute.Sitemap {
  return entries.map(([path, priority]) => ({
    url: absolute(path),
    lastModified: LAST_MODIFIED,
    changeFrequency: path === "/" || path === "/ovens" ? "weekly" : "monthly",
    priority,
  }));
}

// Rendered per request from the catalogue in memory, so an admin change shows at once and a restart never serves a stale build.
export const dynamic = "force-dynamic";
