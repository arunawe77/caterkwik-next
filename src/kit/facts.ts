import sixBurner from "@/data/six-burner.json";
import { products, types, type Product } from "@/lib/catalogue";
import { money } from "@/lib/format";
import { FUEL_LABELS } from "@/lib/labels";
import { SCRAPED_ON } from "@/lib/site";

// Kit's grounding for every page except the G3101 product page, generated from the same
// catalogue the pages render, so he cannot quote a price or a dimension a page does not show.
// A missing figure is said in the words "not published", and he repeats them.

const price = (p: Product) =>
  p.stock === "discontinued" ? "DISCONTINUED, do not quote a price"
    : p.priceEx === null || p.priceInc === null ? "price on application"
      : `${money(p.priceEx)} ex VAT (${money(p.priceInc)} inc)`;

function describe(p: Product): string {
  const s = p.spec;
  const bits = [
    `${p.name} [code ${p.token}]`,
    price(p),
    p.leaseWeek !== null && p.stock === "in-stock" ? `lease from ${money(p.leaseWeek)} a week` : null,
    ...(s ? [
      s.fuel.length ? `available in ${s.fuel.map((f) => FUEL_LABELS[f] ?? f).join(" or ")}` : "fuel not published",
      s.width === null ? "width not published" : `${s.width} mm wide`,
      s.ovenType ? `${s.ovenType} oven` : "oven type not published",
      s.kwTotal === null ? "kW not published" : `${s.kwTotal} kW hob total`,
    ] : []),
  ];
  return `- ${bits.filter(Boolean).join("; ")}`;
}

export function catalogueFacts(): string {
  const sections = types.map((t) => {
    const own = products.filter((p) => p.type === t.slug);
    const head = `## ${t.label}: ${t.live} available${t.fromPrice === null ? ", none currently priced" : `, from ${money(t.fromPrice)} ex VAT`}${t.discontinued ? `, ${t.discontinued} discontinued` : ""}`;
    return [head, ...own.map(describe)].join("\n");
  });

  // The one record Caterkwik do not list: our worked example, with its own page.
  const ours = sixBurner.filter((r) => r.notInCatalogue).map((r) => `- ${r.name}: NOT currently listed on caterkwik.co.uk; we built a page for it at /falcon/g3101-otc-p`);

  return `# WHERE YOU ARE: the Caterkwik oven catalogue, not the G3101 OTC/P product page
There is no "this range" here. The visitor is on the oven hub, a type page, a product page, search results or the
six-burner category. When they ask what fits, answer from the lists below, cheapest first, and name two or three by
model and ex VAT price. The G3101 OTC/P is not one of the catalogue products; mention it only if it genuinely fits best.

# THE OVEN CATALOGUE (${SCRAPED_ON})
${products.length} products in ${types.length} types, read from caterkwik.co.uk on that date, plus the makers' published
spec sheets for the six-burner ranges. Prices are ex VAT unless stated. Where a line says "not published", say exactly
that rather than estimating. Never quote a price for a discontinued model. To narrow a choice, ask what supply they
have, how many covers they do, and what the oven is for.

${sections.join("\n\n")}

## Not in the catalogue
${ours.join("\n")}
`;
}
