import type { Metadata } from "next";
import { LegacyPage, type Fragment } from "@/components/legacy-page";
import hub from "@/legacy/hub.json";
import { products, types } from "@/lib/catalogue";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: `Commercial Ovens: ${types.length} types, ${products.length} models, priced`,
  description: "Every kind of commercial oven Caterkwik sells, with what each is for, how many models they stock and what they start at.",
  path: "/ovens",
  image: "/assets/img/ovens-hub/6-burner-range.webp",
});

export default function OvensHub() {
  return <LegacyPage fragment={hub as Fragment} />;
}

// Rendered per request from the catalogue in memory, so an admin change shows at once and a restart never serves a stale build.
export const dynamic = "force-dynamic";
