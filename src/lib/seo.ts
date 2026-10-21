import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

// Staging is never indexed. Production sets ALLOW_INDEXING=true and the same code opens up:
// robots meta, the X-Robots-Tag header and robots.txt all follow this one switch.
export const INDEXABLE = process.env.ALLOW_INDEXING === "true";

export const ROBOTS = INDEXABLE ? { index: true, follow: true } : { index: false, follow: false };

const DEFAULT_IMAGE = "/assets/img/caterkwik-logo.png";
export const absolute = (path: string) => (/^https?:\/\//.test(path) ? path : `${SITE_URL}${path}`);

interface Page {
  title: string;
  description: string;
  path: string;
  image?: string;
}

// One place that decides what every indexable page tells search engines and social previews:
// a canonical address (filters and tracking parameters never create a second page), Open Graph, Twitter.
export function pageMetadata({ title, description, path, image }: Page): Metadata {
  const picture = absolute(image ?? DEFAULT_IMAGE);
  return {
    title,
    description,
    alternates: { canonical: absolute(path) },
    openGraph: {
      title, description, url: absolute(path), siteName: "Caterkwik", locale: "en_GB", type: "website",
      images: [{ url: picture }],
    },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: [picture] },
  };
}

// Utility pages (search results, the gate): followable, never indexed, in any environment.
export const utilityMetadata = (title: string): Metadata => ({ title, robots: { index: false, follow: true } });
