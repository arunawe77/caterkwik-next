import hub from "@/data/hub.json";
import { getType, isOvenType, productsOfType, type OvenType, type Product } from "@/lib/catalogue";
import { money, plural } from "@/lib/format";
import type { Rich } from "@/lib/rich";
import { specText } from "@/lib/rich";
import { FUEL_LABELS } from "@/lib/labels";
import { COMPANY } from "@/lib/site";

// Every sentence on the generated pages is built from the catalogue, so the copy cannot drift from the
// data or claim what the data does not say. Where something is not published the copy says so.

export interface Faq {
  q: string;
  a: string;
}

const lower = (s: string) => s[0].toLowerCase() + s.slice(1);
const list = (items: string[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const labelsFor = (tags: string[], options: { value: string; label: string }[]) =>
  tags.flatMap((t) => options.find((o) => o.value === t)?.label ?? []);

// What Caterkwik say about themselves on the approved hub page, said once here.
export const WHY_CATERKWIK = [
  { title: "Price match promise", text: "Cheaper elsewhere? Ask, and they will match it." },
  { title: "Installation and service in house", text: "Delivery is kerbside; their own engineers do the rest." },
  { title: "Feefo Platinum Trusted Service", text: "Independent customer reviews, collected through Feefo." },
  { title: `Established ${COMPANY.established}`, text: "Internet prices with traditional service, from Ulverston in Cumbria." },
] as const;

// "natural gas and LPG": lower case in a sentence, except the acronym.
const fuelWords = (fuel: string[]) => list(fuel.map((f) => (FUEL_LABELS[f] ?? f).toLowerCase().replace("lpg", "LPG")));

const brandsOf = (list_: Product[]) => {
  const counts = new Map<string, number>();
  for (const p of list_) if (p.brand) counts.set(p.brand, (counts.get(p.brand) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

export function typeIntro(type: OvenType, own: Product[] = productsOfType(type.slug)): string[] {
  const brands = brandsOf(own);
  const range = type.fromPrice === null
    ? "None is currently priced."
    : type.maxPrice !== null && type.maxPrice > type.fromPrice
      ? `Prices run from ${money(type.fromPrice)} to ${money(type.maxPrice)} ex VAT.`
      : `The price is ${money(type.fromPrice)} ex VAT.`;
  const supply = labelsFor(type.supply, hub.finder.supplies).map(lower);
  const cooking = labelsFor(type.cooking, hub.finder.cookings).map(lower);
  const oven = isOvenType(type.slug);

  return [
    `Caterkwik list ${plural(type.total, "model")} of ${type.label.toLowerCase()}${brands.length ? ` from ${plural(brands.length, "maker")}` : ""}. ${plural(type.live, "model")} ${type.live === 1 ? "is" : "are"} available today. ${range}`,
    type.audience,
    ...(supply.length && cooking.length ? [`This type runs on ${list(supply)} and suits ${list(cooking)}.`] : []),
  ];
}

export function typeFaqs(type: OvenType, own: Product[] = productsOfType(type.slug)): Faq[] {
  const live = own.filter((p) => p.stock === "in-stock");
  const brands = brandsOf(own);
  const cheapest = live.toSorted((a, b) => a.priceEx! - b.priceEx!)[0];
  const leased = live.filter((p) => p.leaseWeek !== null);
  const name = type.label.toLowerCase();

  const faqs: Faq[] = [];
  faqs.push({
    q: `How much do ${name} cost?`,
    a: cheapest
      ? `${type.label} at Caterkwik start at ${money(cheapest.priceEx!)} ex VAT (${money(cheapest.priceInc!)} inc VAT) for the ${cheapest.name}${type.maxPrice! > type.fromPrice! ? `, and run up to ${money(type.maxPrice!)} ex VAT` : ""}. Prices are shown ex VAT with the inc VAT price beside them.`
      : `None of the ${name} Caterkwik list is currently priced${type.poa ? `: ${plural(type.poa, "model")} ${type.poa === 1 ? "is" : "are"} price on application, so call ${COMPANY.phone} for a quote` : ""}.`,
  });
  if (brands.length) {
    faqs.push({
      q: `Which brands make ${name}?`,
      a: `Caterkwik list ${name} from ${list(brands.map(([b, n]) => `${b} (${plural(n, "model")})`))}.`,
    });
  }
  if (type.supply.length) {
    faqs.push({
      q: `What do ${name} run on?`,
      a: `Caterkwik's ${name} run on ${list(labelsFor(type.supply, hub.finder.supplies).map(lower))}. Check the supply at your site before you order, because the wrong fuel cannot be commissioned.`,
    });
  }
  if (leased.length) {
    const weekly = Math.min(...leased.map((p) => p.leaseWeek!));
    faqs.push({
      q: `Can I lease ${name}?`,
      a: `${plural(leased.length, "model")} of ${name} show a lease price, from ${money(weekly)} a week. Lease terms and credit status decide the final figure, so the team confirms it.`,
    });
  }
  if (type.discontinued) {
    faqs.push({
      q: `Why are some ${name} listed without a price?`,
      a: `${plural(type.discontinued, "model")} of ${name} ${type.discontinued === 1 ? "is" : "are"} discontinued. Caterkwik still list ${type.discontinued === 1 ? "it" : "them"}, but with no price, and each page points to models that are available.`,
    });
  }
  faqs.push({
    q: `Does Caterkwik install and service ${isOvenType(type.slug) ? "ovens" : "this equipment"}?`,
    a: `Yes. Caterkwik do installation and service in house, and delivery on its own is kerbside. Call ${COMPANY.phone}, ${COMPANY.hours[0].toLowerCase()}, to book a survey.`,
  });
  return faqs;
}

// A paragraph of plain facts: what it is, what it costs, and the figures that are published.
const article = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");

// The published figures the rich record holds, in a sentence-ready form.
function richFacts(r: Rich | null | undefined): string[] {
  if (!r) return [];
  const s = r.specs;
  const t = (k: string) => (s[k] ? specText(s[k]) : null);
  return [
    t("fuel") && `${t("fuel")!.toLowerCase()} powered`,
    t("width") && `${t("width")} wide`, t("depth") && `${t("depth")} deep`, t("height") && `${t("height")} high`,
    t("weight") && `${t("weight")} in weight`,
    t("electricKw") && `${t("electricKw")} electrical`, t("gasKw") && `${t("gasKw")} on natural gas`,
    t("warranty") && `a ${t("warranty")} warranty`,
  ].filter((f): f is string => !!f);
}

export function productOverview(p: Product, rich?: Rich | null): string[] {
  const type = getType(p.type)!;
  const first = p.brand
    ? `The ${p.name} is ${article(p.brand)} ${p.brand} model in Caterkwik's ${type.label.toLowerCase()} range.`
    : `The ${p.name} is in Caterkwik's ${type.label.toLowerCase()} range.`;

  const money_ = p.stock === "discontinued"
    ? "It is discontinued, so Caterkwik show no price for it."
    : p.priceEx === null || p.priceInc === null
      ? "It is price on application: call the team for a quote."
      : `It costs ${money(p.priceEx)} ex VAT (${money(p.priceInc)} inc VAT)${p.wasEx === null ? "" : `, down from ${money(p.wasEx)} ex VAT`}${p.leaseWeek === null ? "." : `, or can be leased from ${money(p.leaseWeek)} a week.`}`;

  const s = p.spec;
  const facts = s ? [
    s.fuel.length ? `available for ${fuelWords(s.fuel)}` : null,
    s.width === null ? null : `${s.width} mm wide`,
    s.depth === null ? null : `${s.depth} mm deep`,
    s.height === null ? null : `${s.height} mm high`,
    s.burners === null ? null : `${s.burners} burners`,
    s.kwTotal === null ? null : `${s.kwTotal} kW across the hob`,
    s.ovenType ? `a ${s.ovenType} oven` : null,
    s.warrantyYears === null ? null : `a ${s.warrantyYears}-year warranty`,
  ].filter((f): f is string => f !== null) : [];

  const richF = richFacts(rich);
  const all_ = facts.length ? facts : richF;
  return [
    `${first} ${money_}`,
    all_.length
      ? `Published figures: ${list(all_)}. Anything not listed here is not published.`
      : "The full specification for this model is not part of this preview, so no figure is shown rather than a guess.",
  ];
}

export function productFaqs(p: Product, rich?: Rich | null): Faq[] {
  const s = p.spec;
  const rs = rich?.specs ?? {};
  const faqs: Faq[] = [];

  faqs.push({
    q: `How much is the ${p.name}?`,
    a: p.stock === "discontinued"
      ? "It is discontinued, so there is no price. Caterkwik can suggest a current replacement."
      : p.priceEx === null || p.priceInc === null
        ? `It is price on application. Call ${COMPANY.phone} for a quote.`
        : `${money(p.priceEx)} excluding VAT, which is ${money(p.priceInc)} including VAT.`,
  });
  if (p.stock === "in-stock" && p.leaseWeek !== null) {
    faqs.push({ q: "Can I lease it?", a: `Yes, from ${money(p.leaseWeek)} a week. The final figure depends on term and credit status, so the team confirms it.` });
  }
  if (!s && rs.fuel) {
    faqs.push({ q: "What fuel does it run on?", a: `It runs on ${specText(rs.fuel).toLowerCase()}. Check it matches your site's supply before you order.` });
  }
  if (s && s.fuel.length) {
    faqs.push({ q: "What fuel does it run on?", a: `It is available for ${fuelWords(s.fuel)}. Choose the one that matches your site's supply.` });
  }
  const dims = [rs.width && `${specText(rs.width)} wide`, rs.depth && `${specText(rs.depth)} deep`, rs.height && `${specText(rs.height)} high`].filter((x): x is string => !!x);
  faqs.push({
    q: "What are its dimensions?",
    a: !s && dims.length ? `${list(dims)}.${dims.length < 3 ? " The rest are not published." : ""}` : s && (s.width !== null || s.depth !== null || s.height !== null)
      ? `${list([s.width !== null && `${s.width} mm wide`, s.depth !== null && `${s.depth} mm deep`, s.height !== null && `${s.height} mm high`].filter((x): x is string => !!x))}.${[s.width, s.depth, s.height].includes(null) ? " The rest are not published." : ""}`
      : `Dimensions are not published for this model in the preview. Call ${COMPANY.phone}.`,
  });
  faqs.push({
    q: "Does Caterkwik install it?",
    a: `Yes. Caterkwik do installation and service in house. Delivery on its own is kerbside, and their engineers do the rest.`,
  });
  return faqs;
}

export function homeFaqs(all: Product[], typeCount: number): Faq[] {
  const live = all.filter((p) => p.stock === "in-stock");
  const prices = live.map((p) => p.priceEx!);
  const leased = live.filter((p) => p.leaseWeek !== null);
  return [
    {
      q: "What does Caterkwik sell?",
      a: `Commercial catering equipment, supplied with their own survey, installation and service teams. This site covers their commercial ovens: ${plural(typeCount, "type")} and ${plural(all.length, "model")}, ${live.length} of them available today.`,
    },
    {
      q: "How much do commercial ovens cost?",
      a: `Available ovens run from ${money(Math.min(...prices))} to ${money(Math.max(...prices))} ex VAT, depending on type, size and maker. Prices are shown ex VAT with the inc VAT price beside them, and you can switch the display at the top of the page.`,
    },
    {
      q: "Can I lease an oven?",
      a: `${plural(leased.length, "available oven")} show a lease price, from ${money(Math.min(...leased.map((p) => p.leaseWeek!)))} a week. The team confirms the final figure.`,
    },
    {
      q: "How do I choose the right oven?",
      a: "Start with what you cook, what supply you have and how many covers you do at your busiest. The oven finder on the Commercial Ovens page narrows the types as you pick, and Kit, the assistant in the corner, can narrow it further.",
    },
    {
      q: "Where is Caterkwik and when can I call?",
      a: `${COMPANY.name}, ${COMPANY.address}. ${COMPANY.hours.join("; ")}. Call ${COMPANY.phone}.`,
    },
  ];
}
