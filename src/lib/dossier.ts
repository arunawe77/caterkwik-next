import { ATTRIBUTE, RANK, SECTIONS, attributeFor, type Dossier, type Fact, type Section, type Source, type WebRecord } from "@/lib/product-schema";
import type { Rich } from "@/lib/rich";
import { specText } from "@/lib/rich";

// Merges everything known about one product into a single record the page renders: Caterkwik's own page
// (source 0), the spec sheets it links to, and the web research. For each attribute the best-ranked
// source is shown; other sources that give a different value are kept beside it as "also reported".

type Value = string | number | boolean | string[];
interface Candidate { fact: Fact; rank: number }

const text = (v: Value, unit?: string): string =>
  Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : `${v}${unit && typeof v === "number" ? " " + unit : ""}`;

// "27.2 kg" and 27.2 are the same claim; so are "3/4 BSP" and "3/4\" bsp".
const canon = (v: Value): string => String(Array.isArray(v) ? v.join("|") : v).toLowerCase().replace(/[\s"'”″.,]/g, "").replace(/kgs?$|mm$|litres?$|ltr$|kw$|°c$|w$|a$/, "");

/** The host a source address points at. A path on this site (a document we host ourselves) has no host and counts as Caterkwik. */
export function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return "www.caterkwik.co.uk"; }
}

export function buildDossier(id: string, rich: Rich | null, web: WebRecord | null, pageUrl: string | null): Dossier {
  const sources: Source[] = [];
  const add = (s: Source): number => {
    const i = sources.findIndex((x) => x.url === s.url);
    if (i >= 0) return i;
    sources.push(s);
    return sources.length - 1;
  };
  const candidates = new Map<string, Candidate[]>();
  const other: Fact[] = [];
  const put = (fact: Fact, kind: Source["kind"]) => {
    const key = fact.key && ATTRIBUTE.has(fact.key) ? fact.key : attributeFor(fact.label)?.key;
    if (!key) {
      if (!other.some((o) => o.label.toLowerCase() === fact.label.toLowerCase() && canon(o.value) === canon(fact.value))) other.push(fact);
      return;
    }
    const a = ATTRIBUTE.get(key)!;
    const list = candidates.get(key) ?? [];
    list.push({ fact: { ...fact, key, label: a.label, section: a.section, unit: fact.unit ?? a.unit }, rank: RANK[kind] });
    candidates.set(key, list);
  };

  const pageSrc = pageUrl ? add({ kind: "caterkwik", url: pageUrl, title: "Caterkwik product page" }) : -1;
  if (rich) {
    const docSrc = new Map<string, number>();
    for (const d of rich.pdf) docSrc.set(d.url, add({ kind: "datasheet", url: d.url, title: d.label }));
    const firstDoc = [...docSrc.values()][0];
    for (const [k, s] of Object.entries(rich.specs)) {
      const src = s.source === "pdf" && firstDoc !== undefined ? firstDoc : pageSrc;
      if (src < 0) continue;
      put({ key: k, label: s.label, value: typeof s.value === "number" || typeof s.value === "boolean" ? s.value : specText({ ...s, unit: undefined }), unit: s.unit, source: src }, sources[src].kind);
    }
    for (const [k, v] of rich.extra) if (pageSrc >= 0) put({ label: k, value: v, source: pageSrc }, "caterkwik");
    if (rich.mpn && pageSrc >= 0) put({ key: "mpn", label: "Manufacturer part number", value: rich.mpn, source: pageSrc }, "caterkwik");
    if (rich.brand && pageSrc >= 0) put({ key: "brand", label: "Brand", value: rich.brand, source: pageSrc }, "caterkwik");
    for (const d of rich.dimensions) if (pageSrc >= 0 && /\d/.test(d)) put({ key: "dimensions", label: "Dimensions", value: d, source: pageSrc }, "caterkwik");
    const pw = rich.power.filter((l) => l.length < 160);
    if (pw.length && pageSrc >= 0) put({ label: "Power requirements", value: pw.join("; "), section: "Electrical", source: pageSrc }, "caterkwik");
    if (rich.special.length && pageSrc >= 0) put({ label: "Special requirements", value: rich.special.join("; "), section: "Ventilation & siting", source: pageSrc }, "caterkwik");
  }

  const webIndex = new Map<number, number>();
  if (web?.found) {
    // A researcher may cite Caterkwik's own page as a retailer; it ranks as Caterkwik.
    const own = (u: string) => /(^|\.)caterkwik\.co\.uk$/i.test(hostOf(u));
    web.sources.forEach((s, i) => webIndex.set(i, add(own(s.url) ? { ...s, kind: "caterkwik" as const } : { ...s })));
    for (const f of web.facts) {
      const src = webIndex.get(f.source);
      if (src === undefined) continue;
      put({ ...f, source: src }, sources[src].kind);
    }
  }

  // Winner per attribute, with the differing claims kept.
  const bySection = new Map<Section, (Fact & { alternatives?: { value: Value; source: number }[]; agree?: number })[]>();
  for (const [key, list] of candidates) {
    list.sort((a, b) => a.rank - b.rank);
    const best = list[0].fact;
    const mine = canon(best.value);
    const same = list.filter((c) => canon(c.fact.value) === mine);
    const differ = list.filter((c) => canon(c.fact.value) !== mine);
    const alternatives = differ.filter((c, i, all) => all.findIndex((x) => canon(x.fact.value) === canon(c.fact.value)) === i).map((c) => ({ value: c.fact.value, source: c.fact.source }));
    const section = ATTRIBUTE.get(key)!.section;
    const row = { ...best, ...(alternatives.length ? { alternatives } : {}), agree: same.length };
    bySection.set(section, [...(bySection.get(section) ?? []), row]);
  }
  const order = (k?: string) => (k ? [...ATTRIBUTE.keys()].indexOf(k) : 9999);

  const hl = (web?.found ? web.highlights ?? [] : []).flatMap((h) => (webIndex.has(h.source) ? [{ text: h.text, source: webIndex.get(h.source)! }] : []));
  const features = pageSrc >= 0 ? (rich?.features ?? []).map((t) => ({ text: t, source: pageSrc })) : [];
  const seen = new Set<string>();
  const highlights = [...features, ...hl].filter((h) => !seen.has(canon(h.text)) && seen.add(canon(h.text)));

  return {
    id,
    sources,
    summary: [...(rich?.overview ?? []), ...(web?.found && web.summary ? [web.summary] : [])],
    highlights,
    sections: SECTIONS.flatMap((section) => {
      const facts = bySection.get(section);
      return facts?.length ? [{ section, facts: facts.sort((a, b) => order(a.key) - order(b.key)) }] : [];
    }),
    other: other.slice(0, 120),
    included: [...new Set(web?.found ? web.included ?? [] : [])],
    documents: [
      ...(rich?.downloads ?? []).map((d) => ({ label: d.label, url: d.url })),
      ...(rich?.checklists ?? []).map((d) => ({ label: d.label, url: d.url, kind: "checklist" })),
      ...(web?.found ? web.documents ?? [] : []),
    ].filter((d, i, all) => all.findIndex((x) => x.url === d.url) === i),
    images: (web?.found ? web.images ?? [] : []).flatMap((img) => {
      const i = img.source === undefined ? undefined : webIndex.get(img.source);
      // Only manufacturer images are shown; a retailer's photograph is theirs.
      return i !== undefined && sources[i].kind === "manufacturer" ? [{ ...img, source: i }] : [];
    }),
    faqs: (web?.found ? web.faqs ?? [] : []).map((q) => ({ ...q, source: q.source === undefined ? undefined : webIndex.get(q.source) })),
    alternatives: web?.found ? web.alternatives ?? [] : [],
  };
}

export { text as factText };
