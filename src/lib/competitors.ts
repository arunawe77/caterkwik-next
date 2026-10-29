// Pure helpers for the competitor module: VAT, price gaps and where we stand. No database here,
// so it is cheap to test. Money is whole pence throughout; null means "not recorded".

export const VAT = 1.2;
/** A recorded price older than this is flagged as stale. */
export const STALE_DAYS = 30;

export const incFromEx = (ex: number) => Math.round(ex * VAT);
export const exFromInc = (inc: number) => Math.round(inc / VAT);

// The sites Caterkwik is measured against. Seeded once; staff can add, pause or remove any of them.
export const SEED_COMPETITORS = [
  { id: "catering-appliance", name: "Catering Appliance", domain: "catering-appliance.com", url: "https://www.catering-appliance.com/", notes: "Closest match on product and price." },
  { id: "nisbets", name: "Nisbets", domain: "nisbets.co.uk", url: "https://www.nisbets.co.uk/", notes: null },
  { id: "catering-hygiene", name: "Catering Hygiene", domain: "cateringhygiene.co.uk", url: "https://www.cateringhygiene.co.uk/shop/", notes: null },
  { id: "alliance-online", name: "Alliance Online", domain: "allianceonline.co.uk", url: "https://www.allianceonline.co.uk/", notes: null },
  { id: "cs-catering-equipment", name: "CS Catering Equipment", domain: "cs-catering-equipment.co.uk", url: "https://www.cs-catering-equipment.co.uk/", notes: null },
  { id: "next-day-catering", name: "Next Day Catering", domain: "nextdaycatering.co.uk", url: "https://www.nextdaycatering.co.uk/", notes: null },
] as const;

export interface Gap {
  pence: number; // ours minus theirs: positive means we are dearer
  percent: number; // of their price
}

export function gapOf(ourEx: number | null, theirEx: number | null): Gap | null {
  if (ourEx === null || theirEx === null || theirEx <= 0) return null;
  return { pence: ourEx - theirEx, percent: ((ourEx - theirEx) / theirEx) * 100 };
}

export type Position = "cheapest" | "level" | "dearer" | "unpriced" | "untracked";

export const POSITION_LABEL: Record<Position, string> = {
  cheapest: "We are cheapest", level: "Level", dearer: "Undercut", unpriced: "We have no price", untracked: "Not tracked",
};

/** Where our ex VAT price stands against the cheapest competitor price recorded for the product. */
export function positionOf(ourEx: number | null, theirs: (number | null)[]): Position {
  const known = theirs.filter((p): p is number => p !== null);
  if (!known.length) return "untracked";
  if (ourEx === null) return "unpriced";
  const lowest = Math.min(...known);
  return ourEx < lowest ? "cheapest" : ourEx === lowest ? "level" : "dearer";
}

export const isStale = (checkedAt: Date, now = new Date()) => now.getTime() - checkedAt.getTime() > STALE_DAYS * 86_400_000;

/** Signed, one-decimal percentage with an arrow, so direction never relies on colour alone. */
export const percentLabel = (p: number) => (Math.abs(p) < 0.05 ? "No difference" : `${p > 0 ? "▲ +" : "▼ -"}${Math.abs(p).toFixed(1)}%`);

/** The price the staff typed, turned into both ex and inc VAT. Blank in, nulls out. */
export function bothPrices(pounds: number | null, basis: "ex" | "inc"): { ex: number | null; inc: number | null } {
  if (pounds === null) return { ex: null, inc: null };
  const pence = Math.round(pounds * 100);
  return basis === "ex" ? { ex: pence, inc: incFromEx(pence) } : { ex: exFromInc(pence), inc: pence };
}

/** True when the url is http(s) and sits on the competitor's own domain (or a subdomain of it). */
export function urlOnDomain(url: string, domain: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

export const cleanDomain = (raw: string) => raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
export const slugOf = (name: string) => name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// ---- Automatic checking ------------------------------------------------------------------
// Only sites that answer an ordinary request are checked by the server. The others sit behind bot protection, which is
// never worked around: they stay manual. Each entry says how to search the site and how its prices are shown.
export interface AutoSite { searchUrl: (q: string) => string; /** Sitemap index listing every product page, used instead of the site's search when set. */ sitemapUrl?: string; basis: "ex" | "inc"; delayMs: number }

export const AUTO_SITES: Record<string, AutoSite> = {
  // Magento. Its robots.txt asks for a 30 second crawl delay. Prices on its pages include VAT. Its search now redirects
  // to the shop front page, so products are found from the sitemap named in its robots.txt.
  "cateringhygiene.co.uk": { sitemapUrl: "https://www.cateringhygiene.co.uk/shop/sitemap.xml", searchUrl: (q) => `https://www.cateringhygiene.co.uk/shop/catalogsearch/result/?q=${encodeURIComponent(q)}`, basis: "inc", delayMs: 30_000 },
};

export const autoSiteFor = (domain: string): AutoSite | null => AUTO_SITES[domain.replace(/^www\./, "").toLowerCase()] ?? null;
