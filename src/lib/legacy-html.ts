import { getProduct, getType, productHref, typeHref } from "@/lib/catalogue";

// The three signed-off demo pages carry the original site's addresses. These rules point
// them at the new pages at render time, so the markup itself stays exactly as approved.

const SITE = String.raw`https://www\.caterkwik\.co\.uk`;
const OVENS = String.raw`${SITE}/shop/commercial-catering-equipment/commercial-ovens`;

const RULES: [RegExp, (...groups: string[]) => string][] = [
  [new RegExp(String.raw`${SITE}/cgi-bin/trolleyed_public\.cgi\?action=showprod_([\w.%-]+)`, "g"),
    (_, token) => {
      const product = getProduct(decodeURIComponent(token));
      return product ? productHref(product) : "/ovens";
    }],
  [new RegExp(String.raw`${OVENS}/([\w-]+)/?`, "g"), (_, slug) => (getType(slug) ? typeHref(slug) : "/ovens")],
  [new RegExp(String.raw`${OVENS}/?`, "g"), () => "/ovens"],
  [new RegExp(String.raw`${SITE}/shop/commercial-catering-equipment/?`, "g"), () => "/not-in-preview"],
  [new RegExp(String.raw`${SITE}/?(?=")`, "g"), () => "/"],
  [/\/ovens\/6-burner(?![\w-])/g, () => "/ovens/6-burner-range"],
  [/View on caterkwik\.co\.uk/g, () => "View product"],
];

export const localise = (html: string) => RULES.reduce((out, [re, to]) => out.replace(re, to), html);
