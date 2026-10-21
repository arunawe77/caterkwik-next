import { familyFor, fieldsFor, type Field, type FieldGroup } from "./spec-schema.ts";

// Turns what a product page (and its spec-sheet PDFs) says into the family's schema. A field is
// filled only when a line states it; every value keeps the line it came from, so a figure can
// always be traced and a wrong one corrected at its source.

export interface RawDetails {
  title: string;
  sellingPoints: string[];
  details: string[];
  dimensions: string[];
  power: string[];
  special: string[];
  requirementIcons: string[];
  brand?: string | null;
  mpn?: string | null;
  metaDescription?: string | null;
  /** Text of the product's spec-sheet PDFs, one entry per document. */
  pdf?: { label: string; url: string; text: string }[];
}

export interface SpecValue {
  label: string;
  group: FieldGroup;
  value: string | number | boolean;
  unit?: string;
  filter?: boolean;
  /** The line of source text the value was read from. */
  from: string;
  source: "page" | "pdf";
}

export interface Enriched {
  family: string;
  overview: string[];
  features: string[];
  specs: Record<string, SpecValue>;
  /** Every "Label: value" line the page or sheet publishes, whether or not the schema names it. */
  extra: [string, string][];
}

const HEADER = /^(features?|specifications?|key features|technical (?:data|specifications?)|dimensions|options?|accessories|includes?|benefits)\s*:?$/i;
const PAIR = /^([A-Za-z][A-Za-z0-9 &/().,'%+-]{1,44}?)\s*:\s*(\S.{0,200})$/;
// Lines that are not the product: marketing furniture, contact blurbs, sheet boilerplate.
// Page script that leaks into the text on a few products (slider options and the like).
const CODE = /[{};]|=\s*['"\d]|autoplay|openEffect|closeEffect|\b(?:function|var|margin)\b|\$\(/;
const NOISE = /^(call|tel|email|www\.|http|please|note|\*|disclaimer|©)|\bterms and conditions\b|\bsubject to change\b/i;

// A real specification row has a short label and a value that is not the start of a sentence.
const goodPair = (k: string, v: string) =>
  /^[A-Z0-9]/.test(k.trim()) && !/^https?$/i.test(k) && !/^(?:true|false)$/i.test(v.trim()) && k.trim().split(/\s+/).length <= 5 && !/[,;]$|\b(?:and|or|the|a|to|of|which|that)$/i.test(v.trim()) && !/^(?:sales description|description)$/i.test(k.trim());

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function linesOf(d: RawDetails, scope: "power" | "dimensions" | "details" | "any", pdf: boolean): string[] {
  const pdfLines = pdf ? (d.pdf ?? []).flatMap((p) => p.text.split("\n").map(clean).filter((l) => l.length > 2 && l.length < 400)) : [];
  switch (scope) {
    case "power": return [...d.power, ...d.special, ...pdfLines];
    case "dimensions": return [...d.dimensions, ...pdfLines];
    case "details": return [...d.details, ...d.sellingPoints, ...pdfLines];
    default: return [d.title, ...d.sellingPoints, ...d.details, ...d.dimensions, ...d.power, ...d.special, ...pdfLines];
  }
}

function read(field: Field, d: RawDetails): SpecValue | null {
  // The page's own words win over a PDF; the PDF only fills what the page leaves blank.
  for (const source of ["page", "pdf"] as const) {
    if (source === "pdf" && !d.pdf?.length) break;
    if (field.custom) {
      const lines = source === "page" ? [...d.power, ...d.special] : (d.pdf ?? []).flatMap((p) => p.text.split("\n").map(clean).filter((l) => l.length > 2 && l.length < 400));
      const r = field.custom(lines);
      if (r) return { label: field.label, group: field.group, value: r.value, unit: field.unit, filter: field.filter, from: r.from.slice(0, 220), source };
    }
    for (const p of field.patterns) {
      const pool = source === "page" ? linesOf(d, p.in ?? "any", false) : (d.pdf ?? []).flatMap((x) => x.text.split("\n").map(clean).filter((l) => l.length > 2 && l.length < 400));
      for (const line of pool) {
        const m = line.match(p.re);
        if (!m) continue;
        const raw = p.to ? p.to(m) : field.type === "number" ? Number((m[1] ?? "").replace(",", ".")) : field.type === "flag" ? true : clean(m[1] ?? m[0]);
        if (raw === null || raw === "" || (typeof raw === "number" && !Number.isFinite(raw))) continue;
        return { label: field.label, group: field.group, value: raw, unit: field.unit, filter: field.filter, from: line.slice(0, 220), source };
      }
    }
  }
  return null;
}

export function enrich(categoryUrls: string[], d: RawDetails): Enriched {
  const family = familyFor(categoryUrls);
  const specs: Record<string, SpecValue> = {};
  for (const field of fieldsFor(family)) {
    const v = read(field, d);
    if (v) specs[field.key] = v;
  }

  const overview: string[] = [];
  const features: string[] = [];
  const extra: [string, string][] = [];
  const seenExtra = new Set<string>();
  const pushExtra = (k: string, v: string) => {
    const key = `${k.toLowerCase()}|${v.toLowerCase()}`;
    if (!seenExtra.has(key)) { seenExtra.add(key); extra.push([clean(k), clean(v)]); }
  };

  for (const raw of d.details) {
    const line = clean(raw);
    if (!line || HEADER.test(line) || NOISE.test(line) || CODE.test(line)) continue;
    const pair = line.match(PAIR);
    if (pair && goodPair(pair[1], pair[2])) { pushExtra(pair[1], pair[2]); continue; }
    if (pair) continue;
    if (line.length >= 110) overview.push(line);
    else if (line.length >= 4) features.push(line);
  }
  for (const doc of d.pdf ?? []) {
    for (const raw of doc.text.split("\n")) {
      const pair = clean(raw).match(PAIR);
      if (pair && pair[2].length < 90 && !NOISE.test(pair[0]) && !CODE.test(pair[0]) && goodPair(pair[1], pair[2])) pushExtra(pair[1], pair[2]);
    }
  }

  return { family: family.id, overview, features, specs, extra: extra.slice(0, 60) };
}
