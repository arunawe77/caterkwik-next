import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { LegacyPage, type Fragment } from "@/components/legacy-page";
import g3101 from "@/legacy/g3101.json";
import { absolute, pageMetadata } from "@/lib/seo";

const PATH = "/falcon/g3101-otc-p";
const IMAGE = "/assets/img/g3101-otc-p.jpg";
const DESCRIPTION = "Falcon Dominator Plus G3101 OTC/P: 6 propane burners over a fan-assisted 2/1 GN electric oven, in stock, installed by Caterkwik.";

export const metadata: Metadata = pageMetadata({ title: "Falcon Dominator Plus G3101 OTC/P", description: DESCRIPTION, path: PATH, image: IMAGE });

// The figures the page itself shows: £3,097.99 ex VAT, in stock, 900 x 857 x 943 mm, 115 kg.
const PRODUCT = {
  "@context": "https://schema.org", "@type": "Product",
  name: "Falcon Dominator Plus G3101 OTC/P", description: DESCRIPTION, image: absolute(IMAGE), url: absolute(PATH),
  brand: { "@type": "Brand", name: "Falcon" },
  offers: { "@type": "Offer", price: "3097.99", priceCurrency: "GBP", availability: "https://schema.org/InStock", url: absolute(PATH) },
  additionalProperty: [
    { "@type": "PropertyValue", name: "Width", value: "900 mm" },
    { "@type": "PropertyValue", name: "Depth", value: "857 mm" },
    { "@type": "PropertyValue", name: "Height", value: "943 mm" },
    { "@type": "PropertyValue", name: "Weight", value: "115 kg" },
    { "@type": "PropertyValue", name: "Fuel", value: "Propane (LPG)" },
    { "@type": "PropertyValue", name: "Burners", value: "6" },
  ],
};

export default function G3101() {
  return (
    <>
      <LegacyPage fragment={g3101 as Fragment} />
      <JsonLd data={PRODUCT} />
    </>
  );
}
