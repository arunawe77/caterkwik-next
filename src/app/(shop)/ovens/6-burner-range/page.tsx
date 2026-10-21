import type { Metadata } from "next";
import { LegacyPage, type Fragment } from "@/components/legacy-page";
import sixBurner from "@/legacy/six-burner.json";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "6 Burner Commercial Oven Ranges: gas, LPG and dual fuel",
  description: "Thirty-one six-burner commercial ranges from Falcon, Lincat, Blue Seal, Electrolux and Imperial. Filter by gas type, width, oven and running cost.",
  path: "/ovens/6-burner-range",
  image: "/assets/img/ovens-hub/6-burner-range.webp",
});

export default function SixBurner() {
  return <LegacyPage fragment={sixBurner as Fragment} />;
}
