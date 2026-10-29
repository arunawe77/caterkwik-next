import { csvRows, penceOf, stockOf, type FeedRow } from "@/lib/suppliers";

// Uropa publishes three files: prices (what we pay), stock, and the product data (names, brands, descriptions, categories).
// They share the product code. No database here, so it is cheap to test. Money is whole pence; null means "not known".
// Prices are taken as ex VAT, which is how a trade price list is quoted.

export interface UropaFiles { price: string; stock: string; product: string }

export interface UropaMerge {
  rows: FeedRow[];
  /** Priced lines with no product record (they cannot be named, so they are left out). */
  noProduct: number;
  /** Lines Uropa has archived, or whose price has expired or not started. */
  retired: number;
}

const cp1252 = new TextDecoder("windows-1252");

/** Uropa's text has C1 control characters where a Windows apostrophe, dash or quote was misread (U+0092 for the right quote). Put the real character back; Postgres rejects the control one. */
export const cleanText = (s: string) =>
  s.replace(/[\u0080-\u009f]/g, (c) => cp1252.decode(Uint8Array.of(c.charCodeAt(0)))).replace(/[\u0080-\u009f]/g, "");

const yes = (v: string | undefined) => /^(y|yes|true|1)$/i.test((v ?? "").trim());

/** "04/08/2026 00:00:00" to a date; blank or junk to null. */
export function ukDate(raw: string | undefined): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec((raw ?? "").trim());
  return m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))) : null;
}

/** Column positions by header name; a missing required column is reported rather than guessed. */
function columns(head: string[], names: Record<string, string>, file: string): Record<string, number> {
  const find = (n: string) => head.findIndex((h) => h.trim().toLowerCase() === n.toLowerCase());
  const out: Record<string, number> = {};
  const missing: string[] = [];
  for (const [key, name] of Object.entries(names)) {
    out[key] = find(name);
    if (out[key] < 0 && !name.startsWith("?")) missing.push(name);
    if (out[key] < 0 && name.startsWith("?")) out[key] = find(name.slice(1));
  }
  if (missing.length) throw new Error(`The Uropa ${file} file has no ${missing.join(", ")} column. Its columns are: ${head.slice(0, 12).join(", ")}...`);
  return out;
}

/** Joins the price, stock and product files on the product code into one feed row per priced line. */
export function mergeUropa(files: UropaFiles, now = new Date()): UropaMerge {
  // Prices: the single-unit line for each code that is in force today.
  const prices = new Map<string, { cost: number | null; rrp: number | null; web: number | null }>();
  let retired = 0;
  let c: Record<string, number> | null = null;
  for (const r of csvRows(files.price)) {
    if (!c) { c = columns(r, { code: "ProductCode", net: "NetPrice", rrp: "RRP", web: "WebOnlyPrice", start: "?StartDate", end: "?ExpiryDate", from: "?QuantityFrom" }, "price"); continue; }
    const code = (r[c.code] ?? "").trim();
    if (!code) continue;
    const from = Number(r[c.from] ?? 1);
    if (c.from >= 0 && from > 1) continue; // quantity breaks are not the unit price
    const start = ukDate(r[c.start]);
    const end = ukDate(r[c.end]);
    if ((start && start > now) || (end && end < now)) { retired++; continue; }
    prices.set(code, { cost: penceOf(r[c.net]), rrp: penceOf(r[c.rrp]), web: penceOf(r[c.web]) });
  }

  const stock = new Map<string, { qty: number | null; dropped: boolean }>();
  let s: Record<string, number> | null = null;
  for (const r of csvRows(files.stock)) {
    if (!s) { s = columns(r, { code: "Product Code", qty: "Stock Level", dropped: "?DROPPEDLINE" }, "stock"); continue; }
    const code = (r[s.code] ?? "").trim();
    if (code) stock.set(code, { qty: stockOf(r[s.qty]), dropped: s.dropped >= 0 && yes(r[s.dropped]) });
  }

  // Product data is read a row at a time and only the wanted columns are kept: the file has over 500 columns.
  const rows: FeedRow[] = [];
  let noProduct = 0;
  const seen = new Set<string>();
  let p: Record<string, number> | null = null;
  for (const r of csvRows(files.product)) {
    if (!p) {
      p = columns(r, { code: "ProductCode", name: "Name", brand: "?BrandName", long: "?LongDescription", short: "?ShortDescription", ref: "?SUPPLIER_REF", archived: "?ARCHIVED", cls: "?WebClassName", sec: "?WebSectionName", grp: "?WebGroupName" }, "product");
      continue;
    }
    const get = (k: string) => (p![k] >= 0 ? cleanText(r[p![k]] ?? "").trim() : "");
    const code = get("code");
    const price = prices.get(code);
    if (!code || !price || seen.has(code)) continue;
    seen.add(code);
    if (yes(get("archived"))) { retired++; continue; }
    const name = get("name");
    if (!name) { noProduct++; continue; }
    const st = stock.get(code);
    const ref = get("ref");
    rows.push({
      sku: code, mpn: ref && ref !== code ? ref : null, brand: get("brand") || null, name,
      costExPence: price.cost, stockQty: st?.qty ?? null, rrpPence: price.rrp, webPence: price.web, dropped: st?.dropped ?? false,
      description: (get("long") || get("short") || null)?.slice(0, 5000) ?? null,
      groupName: [get("cls"), get("sec"), get("grp")].filter(Boolean).join(" > ") || null,
    });
  }
  noProduct += [...prices.keys()].filter((k) => !seen.has(k)).length;
  return { rows, noProduct, retired };
}

// ---- Placing new products ---------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

/** Category labels to slugs. A label used by more than one category maps to null: ambiguous, so never guessed. */
export function categoryIndex(cats: { slug: string; label: string }[]): Map<string, string | null> {
  const idx = new Map<string, string | null>();
  for (const c of cats) {
    const k = norm(c.label);
    if (k) idx.set(k, idx.has(k) && idx.get(k) !== c.slug ? null : c.slug);
  }
  return idx;
}

/** The most specific of Uropa's group, section and class that names exactly one of our categories; the fallback otherwise. */
export function pickCategory(idx: Map<string, string | null>, groupName: string | null | undefined, fallback: string): string {
  const parts = (groupName ?? "").split(" > ").map(norm).filter(Boolean).reverse();
  for (const part of parts) {
    const hit = idx.get(part);
    if (hit) return hit;
  }
  return fallback;
}

/** A draft's address and name: the brand is put in front unless the name already carries it. */
export const draftName = (name: string, brand: string | null) => (brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${name}` : name);
