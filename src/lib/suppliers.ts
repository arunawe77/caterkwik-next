// Pure helpers for the supplier module: the seed list, reading a feed file, matching codes and comparing costs.
// No database here, so it is cheap to test. Money is whole pence ex VAT; null means "not known".

export type SupplierKind = "FEED" | "DIRECT";

// Feed No. 1 is Uropa. Each entry is a brand it carries, with the supplier we can also buy that brand from directly (if known).
const UROPA_BRANDS: [brand: string, direct?: string[]][] = [
  ["Antunes", ["Jestic"]], ["Alto-Shaam", ["FEM"]], ["Bakers Pride", ["Middleby"]], ["Basix", ["Mechline"]], ["Bradley", ["Grakka"]],
  ["Bravilor Bonomat"], ["Blue Ice"], ["Blue Seal"], ["Blodgett", ["Middleby"]], ["Cinders", ["Gastronomy Plus"]], ["Craven"], ["Classeq"],
  ["Counterline"], ["Dormont", ["Mechline"]], ["EAIS"], ["Edlund", ["Metcalfe"]], ["Fri Fri", ["Lincat"]], ["Frymaster", ["Welbilt"]], ["Falcon"],
  ["Foster Refrigerator"], ["Garland", ["Welbilt"]], ["Greasepak", ["Mechline"]], ["Gamko"], ["Gram Professional", ["FEM"]],
  ["Henney Penny", ["Jestic"]], ["Hobart Ecomax"], ["Hobart Ecomax Plus"], ["Hobart Profi"], ["Hoshizaki"], ["Hygenix", ["Mechline"]],
  ["Imperial", ["Gamble"]], ["IMC", ["Lincat"]], ["Infrico"], ["Instanta"], ["King Edward"], ["Lincat"], ["Marco"], ["Mechline"],
  ["Merrychef", ["Middleby"]], ["Metcalfe"], ["Pitco", ["Middleby"]], ["Rational"], ["Roband", ["Metcalfe"]], ["Sammic"],
  ["Scotsman", ["Hubbard Ice"]], ["Sharp", ["RH Hall"]], ["Simag", ["Pentland Wholesale"]], ["Sirman", ["FEM"]], ["Synergy Grill"],
  ["Tormek", ["Metcalfe"]], ["Valera"], ["Vestfrost", ["Blue Badge", "Pentland"]], ["Williams"], ["Winterhalter"],
];

export const slugOf = (name: string) => name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export interface SeedSupplier { id: string; name: string; kind: SupplierKind; brands: string[] }

/** Uropa first, then every supplier named in brackets, each with the brands it carries. Where Uropa carries a brand and a direct supplier is known, both carry it. */
export function seedSuppliers(): SeedSupplier[] {
  const uropa: SeedSupplier = { id: "uropa", name: "Uropa", kind: "FEED", brands: UROPA_BRANDS.map(([b]) => b) };
  const direct = new Map<string, SeedSupplier>();
  for (const [brand, via] of UROPA_BRANDS) {
    for (const name of via ?? []) {
      const id = slugOf(name);
      const s = direct.get(id) ?? { id, name, kind: "DIRECT" as const, brands: [] };
      s.brands.push(brand);
      direct.set(id, s);
    }
  }
  return [uropa, ...[...direct.values()].sort((a, b) => a.name.localeCompare(b.name))];
}

// ---- Reading a feed file ---------------------------------------------------------------

/** A CSV reader that copes with quoted fields, doubled quotes, embedded newlines, a BOM and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

export type FeedField = "sku" | "mpn" | "name" | "brand" | "cost" | "stock";
export const FEED_FIELDS: { key: FeedField; label: string; required: boolean }[] = [
  { key: "sku", label: "Supplier code", required: true },
  { key: "mpn", label: "Manufacturer part number", required: false },
  { key: "name", label: "Description", required: false },
  { key: "brand", label: "Brand", required: false },
  { key: "cost", label: "Cost price", required: true },
  { key: "stock", label: "Stock", required: false },
];
export type FeedMapping = Partial<Record<FeedField, string>>;

const HINTS: Record<FeedField, RegExp[]> = {
  sku: [/^(product|item|stock|supplier|part)?\s*(code|sku|ref|reference|no|number)$/i, /^sku$/i, /^code$/i],
  mpn: [/^(mpn|manufacturer'?s?\s*(part)?\s*(no|number|code|ref)?|man(ufacturer)?\.?\s*part.*)$/i],
  name: [/^(product\s*)?(name|description|title)$/i, /desc/i],
  brand: [/^(brand|manufacturer|make|range)$/i],
  cost: [/^(net|trade|cost|buy|your|nett)\s*(price|cost)?$/i, /^price$/i, /(trade|net|cost)/i],
  stock: [/^(stock|qty|quantity|available|in\s*stock)/i],
};

/** Guesses which header holds which field. Staff can correct it; a saved mapping always wins. */
export function guessMapping(headers: string[]): FeedMapping {
  const out: FeedMapping = {};
  const taken = new Set<string>();
  for (const key of Object.keys(HINTS) as FeedField[]) {
    for (const re of HINTS[key]) {
      const h = headers.find((x) => !taken.has(x) && re.test(x.trim()));
      if (h) { out[key] = h; taken.add(h); break; }
    }
  }
  return out;
}

/** "£1,234.50" to 123450 pence; blank or junk to null. */
export function penceOf(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[£,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export function stockOf(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[,\s+]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** Part numbers are matched ignoring case, spaces and punctuation, so "G3101-A" and "g3101 a" agree. */
export const codeKey = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export interface FeedRow { sku: string; mpn: string | null; brand: string | null; name: string | null; costExPence: number | null; stockQty: number | null }

/** Turns parsed CSV into rows using the mapping. Rows with no code are skipped and counted. */
export function readFeed(rows: string[][], mapping: FeedMapping): { rows: FeedRow[]; skipped: number; missing: string[] } {
  const [head, ...body] = rows;
  if (!head) return { rows: [], skipped: 0, missing: [] };
  const col = (f: FeedField) => (mapping[f] ? head.findIndex((h) => h.trim() === mapping[f]!.trim()) : -1);
  const idx = Object.fromEntries(FEED_FIELDS.map((f) => [f.key, col(f.key)])) as Record<FeedField, number>;
  const missing = FEED_FIELDS.filter((f) => f.required && idx[f.key] < 0).map((f) => f.label);
  if (missing.length) return { rows: [], skipped: 0, missing };
  const get = (r: string[], f: FeedField) => (idx[f] >= 0 ? (r[idx[f]] ?? "").trim() : "");
  const out: FeedRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const r of body) {
    const sku = get(r, "sku");
    if (!sku || seen.has(sku)) { skipped++; continue; }
    seen.add(sku);
    out.push({
      sku, mpn: get(r, "mpn") || null, brand: get(r, "brand") || null, name: get(r, "name") || null,
      costExPence: penceOf(get(r, "cost")), stockQty: stockOf(get(r, "stock")),
    });
  }
  return { rows: out, skipped, missing: [] };
}

// ---- Comparing costs -------------------------------------------------------------------

export interface CostLine { supplierId: string; supplierName: string; kind: SupplierKind; costExPence: number | null }

export interface CostComparison {
  cheapest: CostLine | null;
  /** Set when a feed supplier is cheaper than the cheapest direct supplier: what each unit would save, in pence. */
  feedSaving: { feed: CostLine; direct: CostLine; pence: number; percent: number } | null;
}

export function compareCosts(lines: CostLine[]): CostComparison {
  const priced = lines.filter((l): l is CostLine & { costExPence: number } => l.costExPence !== null);
  if (!priced.length) return { cheapest: null, feedSaving: null };
  const by = (a: CostLine & { costExPence: number }, b: CostLine & { costExPence: number }) => a.costExPence - b.costExPence;
  const cheapest = [...priced].sort(by)[0];
  const feed = priced.filter((l) => l.kind === "FEED").sort(by)[0];
  const direct = priced.filter((l) => l.kind === "DIRECT").sort(by)[0];
  const saving = feed && direct && feed.costExPence < direct.costExPence
    ? { feed, direct, pence: direct.costExPence - feed.costExPence, percent: ((direct.costExPence - feed.costExPence) / direct.costExPence) * 100 }
    : null;
  return { cheapest, feedSaving: saving };
}

/** Margin on our ex VAT selling price over a cost, as a percent of the selling price. */
export const marginOf = (sellEx: number | null, costEx: number | null) =>
  sellEx === null || costEx === null || sellEx <= 0 ? null : ((sellEx - costEx) / sellEx) * 100;
