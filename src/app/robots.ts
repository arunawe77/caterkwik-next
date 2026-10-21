import type { MetadataRoute } from "next";
import { INDEXABLE, absolute } from "@/lib/seo";

// Staging blocks all crawling. Production (ALLOW_INDEXING=true) opens the catalogue and keeps
// crawlers out of search results, the gate and the API.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: INDEXABLE
      ? { userAgent: "*", allow: "/", disallow: ["/api/", "/gate", "/search"] }
      : { userAgent: "*", disallow: "/" },
    sitemap: absolute("/sitemap.xml"),
  };
}
