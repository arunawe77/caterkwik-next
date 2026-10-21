import { productHref, type Product, type Spec } from "@/lib/catalogue";
import { FUEL_LABELS } from "@/lib/labels";
import type { Rich } from "@/lib/rich";
import { specText } from "@/lib/rich";
import { SITE_URL } from "@/lib/site";

const mm = (n: number | null) => (n === null ? null : `${n} mm`);
const capitalise = (s: string) => s[0].toUpperCase() + s.slice(1);

// The data's own values, in the words a buyer reads. Anything unlisted is capitalised as is.
const WORDS: Record<string, string> = {
  none: "None required",
  single: "Single phase",
  three: "Three phase",
  fitted: "Fitted",
  optional: "Optional extra",
  standard: "Standard",
  heavy: "Heavy duty",
};
const word = (v: string | null) => (v === null ? null : (WORDS[v] ?? capitalise(v)));

// Every row is a published figure or null, which the page prints as "Not published": never an estimate.
export function specRows(s: Spec): [string, string | null][] {
  return [
    ["Fuel", s.fuel.length ? s.fuel.map((f) => FUEL_LABELS[f] ?? f).join(" or ") : null],
    ["Width", mm(s.width)],
    ["Depth", mm(s.depth)],
    ["Height", mm(s.height)],
    ["Weight", s.weight === null ? null : `${s.weight} kg`],
    ["Oven", word(s.ovenType)],
    ["Burners", s.burners === null ? null : String(s.burners)],
    ["Hob output", s.kwTotal === null ? null : `${s.kwTotal} kW`],
    ["Electrical supply", word(s.phase)],
    ["Castors", word(s.castors)],
    ["Duty", word(s.duty)],
    ["Warranty", s.warrantyYears === null ? null : `${s.warrantyYears} years`],
  ];
}

// schema.org Product with the specification as additionalProperty.
export function productJsonLd(p: Product, rich?: Rich | null) {
  const url = `${SITE_URL}${productHref(p)}`;
  let offers;
  if (p.stock === "in-stock" && p.priceEx !== null) {
    offers = { "@type": "Offer", price: p.priceEx.toFixed(2), priceCurrency: "GBP", availability: "https://schema.org/InStock", url };
  } else if (p.stock === "discontinued") {
    offers = { "@type": "Offer", priceCurrency: "GBP", availability: "https://schema.org/Discontinued", url };
  }
  const properties = [
    ...(p.spec ? specRows(p.spec).flatMap(([name, value]) => (value === null ? [] : [{ "@type": "PropertyValue", name, value }])) : []),
    ...Object.values(rich?.specs ?? {}).map((s) => ({ "@type": "PropertyValue", name: s.label, value: specText(s) })),
    ...(rich?.extra ?? []).slice(0, 25).map(([name, value]) => ({ "@type": "PropertyValue", name, value })),
  ];

  return {
    "@context": "https://schema.org", "@type": "Product", name: p.name, image: /^https?:\/\//.test(p.image) ? p.image : `${SITE_URL}${p.image}`,
    ...(p.brand && { brand: { "@type": "Brand", name: p.brand } }),
    ...(offers && { offers }),
    ...(rich?.mpn && { mpn: rich.mpn, sku: rich.mpn }),
    ...(rich && (rich.overview[0] ?? rich.summary.join(". ")) && { description: (rich.overview[0] ?? rich.summary.join(". ")).slice(0, 5000) }),
    ...(properties.length && { additionalProperty: properties }),
  };
}
