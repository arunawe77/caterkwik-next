import { readSheets, type Row } from "./xlsx.ts";

// Turns a Caterkwik crawl workbook into what the database needs, without touching the database.
// Two workbooks are known: "all sections" (one row per unique product, 461 columns, category sheet with paths)
// and the per-section ones such as "hotel and bar" (204 columns, different sheet names). Columns are found by
// header, so a column one workbook lacks is simply empty.

export type Availability = "IN_STOCK" | "POA" | "DISCONTINUED";

export interface PlannedCategory {
  slug: string;
  /** The slug Caterkwik's own address ends in, which the seeded oven and cooking categories already use. */
  legacySlug: string;
  label: string;
  path: string;
  section: string | null;
  sourceUrl: string;
  parentUrl: string | null;
  sortOrder: number;
}

export interface PlannedProduct {
  code: string;
  id: string;
  name: string;
  brand: string | null;
  categoryUrl: string;
  alsoInUrls: string[];
  image: string | null;
  legacyUrl: string | null;
  priceExPence: number | null;
  priceIncPence: number | null;
  leaseWeekPence: number | null;
  availability: Availability;
  webExclusive: boolean;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  detail: {
    mpn: string | null; gtin: string | null; condition: string | null; subTitle: string | null; productType: string | null;
    shortDescription: string | null; section: string | null; sections: string[]; categoryPaths: string[];
    images: unknown[] | null; documents: unknown[] | null; options: unknown[] | null; leasePlans: unknown[] | null;
    accessories: unknown[] | null; alsoBought: string[] | null; reviews: unknown[] | null; videos: string[] | null;
    attributes: Record<string, string>; dataFlags: string[];
  };
}

export interface Plan {
  sheets: Record<string, string | null>;
  categories: PlannedCategory[];
  products: PlannedProduct[];
  warnings: string[];
  skipped: number;
}

type Rec = Record<string, string>;

const SITE = "https://www.caterkwik.co.uk";
export const normalUrl = (url: string) => url.trim().replace(/^https?:\/\/(www\.)?caterkwik\.co\.uk/i, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
const absolute = (url: string | undefined) => (url ? (url.startsWith("/") ? SITE + url : url) : null);
const list = (v: string | undefined) => (v ? v.split("|").map((s) => s.trim()).filter(Boolean) : []);
const pence = (v: string | undefined) => {
  if (v === undefined || v === "") return null;
  const n = Number(v.replace(/[£,]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};
const num = (v: string | undefined) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : null;
};
const truthy = (v: string | undefined) => v === "1" || v?.toLowerCase() === "true" || v?.toLowerCase() === "yes";
const clip = (v: string | undefined, max: number) => {
  if (!v) return null;
  if (v.length <= max) return v;
  const cut = v.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20))}…`;
};

const slugPart = (s: string) => s.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");

/** Deterministic from the address alone, so a second workbook lands on the same categories. */
export function categorySlugs(url: string): { slug: string; legacySlug: string } {
  const segments = url.split("/").filter(Boolean).filter((s) => s !== "shop" && s !== "commercial-catering-equipment");
  const parts = segments.map(slugPart).filter(Boolean);
  const legacySlug = (parts.at(-1) ?? "category").slice(0, 80);
  let slug = parts.join("-");
  if (slug.length > 80) {
    let h = 0;
    for (const ch of slug) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
    slug = `${slug.slice(0, 71).replace(/-+$/, "")}-${h.toString(36).slice(0, 8)}`.slice(0, 80);
  }
  return { slug: slug || "category", legacySlug };
}

export const productId = (code: string) => code.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "product";

/** Reads a sheet's first row as the header and hands every later row over as {header: value}, blanks left out. */
function records(onRecord: (r: Rec) => void) {
  let header: string[] | null = null;
  return (row: Row) => {
    if (!header) {
      header = row.map((h) => h ?? "");
      return;
    }
    const r: Rec = {};
    for (let i = 0; i < header.length; i++) if (row[i] != null && header[i]) r[header[i]] = row[i]!;
    onRecord(r);
  };
}

// Columns that have a home of their own, so they are not repeated under "attributes".
const MAPPED = new Set([
  "Product code", "Product URL", "Product name", "Brand", "Manufacturer part number", "GTIN / EAN", "Condition", "Sub-title",
  "Main section", "All sections", "Sub-section", "Product type", "Status", "Categories listed in", "Category URLs", "Availability",
  "Price ex VAT", "Price inc VAT", "Lease from (per week)", "Web exclusive price", "Short description", "Full description",
  "HTML title", "Meta description", "Main image", "Accessories offered", "Customers also bought", "Discontinued",
]);

const group = <T,>(map: Map<string, T[]>, code: string | undefined, item: T) => {
  if (!code) return;
  const key = code.toLowerCase();
  const a = map.get(key);
  if (a) a.push(item);
  else map.set(key, [item]);
};

export async function buildPlan(path: string, progress: (phase: string) => void = () => {}): Promise<Plan> {
  const warnings: string[] = [];
  const images = new Map<string, unknown[]>(), documents = new Map<string, unknown[]>(), options = new Map<string, unknown[]>();
  const leasePlans = new Map<string, unknown[]>(), accessories = new Map<string, unknown[]>(), reviews = new Map<string, unknown[]>();
  const videos = new Map<string, string[]>(), flags = new Map<string, string[]>();
  const productRecs: Rec[] = [];
  const categoryRecs: Rec[] = [];
  let summaryTitle = "";
  let summarySeen = false;

  progress("Reading the workbook");
  const sheets = await readSheets(path, {
    summary: { names: ["Summary"], onRow: (row) => { if (!summarySeen) { summarySeen = true; summaryTitle = row[0] ?? ""; } } },
    products: { names: ["Products"], onRow: records((r) => productRecs.push(r)) },
    categories: { names: ["Categories", "Category pages"], onRow: records((r) => categoryRecs.push(r)) },
    images: {
      names: ["Images", "All images"],
      onRow: records((r) => group(images, r["Product code"], { url: absolute(r["Full-size URL"] || r["Product URL"]), thumb: absolute(r["Thumb URL"]), alt: r["Alt"] ?? null })),
    },
    documents: {
      names: ["Documents", "All documents"],
      onRow: records((r) => group(documents, r["Product code"], { title: r["Title"] ?? r["Type"] ?? "Document", type: r["Type"] ?? null, url: absolute(r["URL"]), pages: num(r["Pages"]) })),
    },
    options: {
      names: ["Options", "All options"],
      onRow: records((r) => {
        if (/^please select/i.test(r["Option"] ?? "")) return;
        group(options, r["Product code"], { group: r["Group"] ?? null, option: r["Option"] ?? null, sku: r["SKU"] ?? null, priceEx: num(r["Price ex VAT"]), addOn: r["Add-on"] ?? null });
      }),
    },
    lease: {
      names: ["Lease plans", "All lease plans"],
      onRow: records((r) => group(leasePlans, r["Product code"], {
        months: num(r["Months"]), rate: num(r["Rate per £1000"]), total: num(r["Total"] ?? r["Total cost"]), monthly: num(r["Monthly"]),
        weekly: num(r["Weekly"]), taxRelief: num(r["Tax relief"]), netCost: num(r["Net cost"]),
      })),
    },
    accessories: {
      names: ["Accessories"],
      onRow: records((r) => group(accessories, r["Product code"], { relationship: r["Relationship"] ?? null, code: r["Linked code"] ?? null, name: r["Name"] ?? null, priceEx: num(r["Price ex VAT"]) })),
    },
    reviews: {
      names: ["Reviews"],
      onRow: records((r) => group(reviews, r["Product code"], { date: r["Date"] ?? null, score: num(r["Score (+2 to -2)"]), text: r["Review"] ?? null })),
    },
    videos: { names: ["Videos"], onRow: records((r) => group(videos, r["Product code"], r["Video URL"] ?? "")) },
    flags: { names: ["Data flags"], onRow: records((r) => { for (const flag of list(r["Flags"])) group(flags, r["Product code"], flag); }) },
  });
  if (!sheets.products) throw new Error('This workbook has no "Products" sheet. Use one of the Caterkwik crawl workbooks.');

  progress("Working out categories");
  const fileSection = /^Caterkwik (.+): page index$/.exec(summaryTitle)?.[1]?.trim() ?? null;
  const categories = new Map<string, PlannedCategory>();
  const addCategory = (url: string, label: string, path: string | null, section: string | null) => {
    const sourceUrl = normalUrl(url);
    if (!sourceUrl || !label) return;
    const known = categories.get(sourceUrl);
    if (known) {
      if (!known.section && section) known.section = section;
      if (path && known.path === known.label && path !== label) known.path = path;
      return;
    }
    categories.set(sourceUrl, { ...categorySlugs(sourceUrl), label, path: path ?? label, section, sourceUrl, parentUrl: null, sortOrder: categories.size });
  };

  for (const r of categoryRecs) {
    if (r["HTTP status"] && r["HTTP status"] !== "200") continue;
    const url = r["URL"];
    if (!url) continue;
    addCategory(url, r["Category name"] ?? r["Page name"] ?? "", r["Category path"] ?? null, r["Section"] ?? fileSection);
  }

  progress("Reading products");
  const products: PlannedProduct[] = [];
  const seen = new Set<string>();
  const usedIds = new Set<string>();
  let skipped = 0;
  let uncategorised = 0;

  for (const r of productRecs) {
    const code = r["Product code"]?.trim();
    const name = r["Product name"]?.trim();
    if (!code || !name || seen.has(code.toLowerCase())) {
      skipped++;
      if (code && seen.has(code.toLowerCase())) warnings.push(`Product code ${code} appears twice; the first row was used.`);
      continue;
    }
    seen.add(code.toLowerCase());

    const section = r["Main section"] ?? fileSection;
    const urls = list(r["Category URLs"]);
    const paths = list(r["Categories listed in"]);
    const own: string[] = [];
    urls.forEach((u, i) => {
      const label = (paths.length === urls.length ? paths[i].split(">").at(-1)!.trim() : "") || decodeURIComponent(u.split("/").filter(Boolean).at(-1) ?? "").replace(/[-_]+/g, " ");
      addCategory(u, label, paths.length === urls.length ? paths[i] : null, section);
      const key = normalUrl(u);
      if (!own.includes(key)) own.push(key);
    });
    if (!own.length) {
      uncategorised++;
      addCategory(`${SITE}/shop/uncategorised`, "Uncategorised", null, section);
      own.push("/shop/uncategorised");
    }

    let id = productId(code);
    for (let n = 2; usedIds.has(id); n++) id = `${productId(code)}-${n}`;
    usedIds.add(id);

    const priceEx = pence(r["Price ex VAT"]);
    const sourceStatus = (r["Status"] ?? "").toLowerCase();
    const sourceAvail = (r["Availability"] ?? "").toLowerCase();
    let availability: Availability =
      sourceStatus === "discontinued" || truthy(r["Discontinued"]) || sourceAvail === "discontinued" ? "DISCONTINUED"
      : sourceStatus === "poa" || sourceAvail === "poa" ? "POA" : "IN_STOCK";
    if (availability === "IN_STOCK" && priceEx === null) availability = "POA";

    const key = code.toLowerCase();
    const attributes: Rec = {};
    for (const [k, v] of Object.entries(r)) if (!MAPPED.has(k)) attributes[k] = v;

    products.push({
      code, id, name, brand: r["Brand"] ?? null,
      categoryUrl: own[0], alsoInUrls: own.slice(1),
      image: absolute(r["Main image"]) ?? (images.get(key)?.[0] as { url: string | null } | undefined)?.url ?? null,
      legacyUrl: r["Product URL"] ?? null,
      priceExPence: priceEx, priceIncPence: pence(r["Price inc VAT"]) ?? (priceEx === null ? null : Math.round(priceEx * 1.2)),
      leaseWeekPence: pence(r["Lease from (per week)"]),
      availability, webExclusive: truthy(r["Web exclusive price"]),
      description: clip(r["Full description"] ?? r["Short description"], 5000),
      seoTitle: clip(r["HTML title"], 70), seoDescription: clip(r["Meta description"], 170),
      detail: {
        mpn: r["Manufacturer part number"] ?? null, gtin: r["GTIN / EAN"] ?? null, condition: r["Condition"] ?? null,
        subTitle: r["Sub-title"] ?? null, productType: r["Product type"] ?? null, shortDescription: r["Short description"] ?? null,
        section, sections: list(r["All sections"]).length ? list(r["All sections"]) : section ? [section] : [], categoryPaths: paths,
        images: images.get(key) ?? null, documents: documents.get(key) ?? null, options: options.get(key) ?? null,
        leasePlans: leasePlans.get(key) ?? null, accessories: accessories.get(key) ?? null,
        alsoBought: r["Customers also bought"] ? list(r["Customers also bought"]) : null,
        reviews: reviews.get(key) ?? null, videos: videos.get(key) ?? null, attributes, dataFlags: flags.get(key) ?? [],
      },
    });
  }
  if (uncategorised) warnings.push(`${uncategorised} products had no category and were put in "Uncategorised".`);

  // Parents are the category whose address is this one minus its last segment; a missing parent is left unset.
  for (const c of categories.values()) {
    const parent = c.sourceUrl.slice(0, c.sourceUrl.lastIndexOf("/"));
    if (categories.has(parent)) c.parentUrl = parent;
  }
  const resolved = new Set<string>();
  const pathOf = (c: PlannedCategory, depth = 0): string => {
    if (c.path !== c.label || !c.parentUrl || depth > 12 || resolved.has(c.sourceUrl)) return c.path;
    resolved.add(c.sourceUrl);
    c.path = `${pathOf(categories.get(c.parentUrl)!, depth + 1)} > ${c.label}`;
    return c.path;
  };
  for (const c of categories.values()) pathOf(c);

  return { sheets, categories: [...categories.values()], products, warnings, skipped };
}
