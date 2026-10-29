import { autoSiteFor, type AutoSite } from "@/lib/competitors";
import { extractListing, isBlocked, productLinks } from "@/lib/price-extract";
import { codeKey } from "@/lib/suppliers";
import { recordPrice, type Actor } from "@/server/competitors";
import { db } from "@/server/db";

// Automatic price checks. Only for sites listed in AUTO_SITES (the ones that answer an ordinary request), spaced by
// each site's crawl delay. A refusal or bot-protection page is recorded as the reason and never worked around.
// Staff-entered prices still work for every site; this only keeps recorded ones fresh and finds new pages.

export interface CheckDeps { fetchFn?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => Date; budgetMs?: number }
export interface CheckSummary { checked: number; updated: number; failed: number; found: number; notListed: number; skipped: number; stoppedEarly: boolean }

const UA = "Mozilla/5.0 (compatible; CaterkwikPriceCheck; +https://www.caterkwik.co.uk)";
const NOT_LISTED_RETRY_DAYS = 30;
const BLOCK_PAUSE_DAYS = 7;

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const empty = (): CheckSummary => ({ checked: 0, updated: 0, failed: 0, found: 0, notListed: 0, skipped: 0, stoppedEarly: false });

/** Spaces requests to one site by its crawl delay, and stops when the time budget is spent. */
function pacer(site: AutoSite, deps: CheckDeps) {
  const sleep = deps.sleep ?? realSleep;
  const started = Date.now();
  let first = true;
  return {
    /** False when there is no time left for another request. */
    async turn(): Promise<boolean> {
      if (deps.budgetMs !== undefined && Date.now() - started + (first ? 0 : site.delayMs) > deps.budgetMs) return false;
      if (!first) await sleep(site.delayMs);
      first = false;
      return true;
    },
  };
}

async function get(url: string, deps: CheckDeps): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  try {
    const res = await (deps.fetchFn ?? fetch)(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(30_000), redirect: "follow" });
    const html = await res.text();
    if (isBlocked(res.status, html)) return { ok: false, error: `Blocked by the site (HTTP ${res.status}). Enter this price by hand.` };
    if (!res.ok) return { ok: false, error: `The page answered HTTP ${res.status}.` };
    return { ok: true, html };
  } catch (err) {
    return { ok: false, error: `Could not load the page: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}

const SITEMAP_TTL_MS = 24 * 3_600_000;
const sitemaps = new Map<string, { at: number; urls: { url: string; key: string }[] }>();

export const clearSitemapCache = () => sitemaps.clear();

/** Product page addresses from a site's sitemap (index then children), cached for a day. Null if any file could not be read. */
async function sitemapPages(site: AutoSite, deps: CheckDeps): Promise<{ url: string; key: string }[] | null> {
  const cached = sitemaps.get(site.sitemapUrl!);
  if (cached && Date.now() - cached.at < SITEMAP_TTL_MS) return cached.urls;
  const sleep = deps.sleep ?? realSleep;
  const loc = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
  const index = await get(site.sitemapUrl!, deps);
  if (!index.ok) return null;
  const files = loc(index.html).filter((u) => u.endsWith(".xml"));
  const pages = files.length ? [] as string[] : loc(index.html);
  for (const f of files) {
    await sleep(site.delayMs);
    const part = await get(f, deps);
    if (!part.ok) return null;
    pages.push(...loc(part.html));
  }
  const urls = pages.filter((u) => u.endsWith(".html")).map((url) => ({ url, key: codeKey(new URL(url).pathname) }));
  sitemaps.set(site.sitemapUrl!, { at: Date.now(), urls });
  return urls;
}

const pence = (n: number) => Math.round(n * 100);

/** Re-reads the page of every recorded price on an automatic site, oldest attempt first. */
export async function checkPrices(actor: Actor, opts: { max?: number } & CheckDeps = {}): Promise<CheckSummary> {
  const out = empty();
  const now = (opts.now ?? (() => new Date()))();
  const competitors = await db.competitor.findMany({ where: { active: true } });
  for (const c of competitors) {
    const site = autoSiteFor(c.domain);
    if (!site) continue;
    const paused = await db.competitorPrice.count({
      where: { competitorId: c.id, lastError: { startsWith: "Blocked" }, lastAttemptAt: { gt: new Date(now.getTime() - BLOCK_PAUSE_DAYS * 86_400_000) } },
    });
    if (paused) { out.skipped += paused; continue; }
    const rows = await db.competitorPrice.findMany({
      where: { competitorId: c.id, url: { not: null }, product: { status: { not: "ARCHIVED" } } },
      orderBy: [{ lastAttemptAt: { sort: "asc", nulls: "first" } }], take: opts.max ?? 20,
    });
    const pace = pacer(site, opts);
    for (const row of rows) {
      if (!(await pace.turn())) { out.stoppedEarly = true; break; }
      out.checked++;
      const page = await get(row.url!, opts);
      let error: string | null = page.ok ? null : page.error;
      if (page.ok) {
        const listing = extractListing(page.html);
        if (!listing || listing.price === null) error = "No price could be read from the page.";
        else if (listing.currency && listing.currency !== "GBP") error = `The page prices in ${listing.currency}, not pounds.`;
        else {
          await recordPrice(actor, {
            productId: row.productId, competitorId: c.id, price: listing.price, basis: site.basis, url: row.url, theirName: listing.name ?? row.theirName ?? "",
            inStock: listing.inStock ?? row.inStock, note: row.note ?? "",
          });
          const was = site.basis === "inc" ? row.priceIncPence : row.priceExPence;
          if (was !== pence(listing.price)) out.updated++;
        }
      }
      if (error) out.failed++;
      await db.competitorPrice.update({ where: { id: row.id }, data: { lastAttemptAt: new Date(), lastError: error } });
      // A refusal means stop asking that site.
      if (error?.startsWith("Blocked")) { out.stoppedEarly = true; break; }
    }
  }
  return out;
}

/** Finds the page for products that have a part number but no entry yet, by searching the site for the part number. */
export async function discoverListings(actor: Actor, opts: { max?: number } & CheckDeps = {}): Promise<CheckSummary> {
  const out = empty();
  const now = (opts.now ?? (() => new Date()))();
  const competitors = await db.competitor.findMany({ where: { active: true } });
  for (const c of competitors) {
    const site = autoSiteFor(c.domain);
    if (!site) continue;
    const retryBefore = new Date(now.getTime() - NOT_LISTED_RETRY_DAYS * 86_400_000);
    const products = await db.product.findMany({
      where: {
        status: { not: "ARCHIVED" }, detail: { is: { mpn: { not: null } } },
        NOT: { competitorPrices: { some: { competitorId: c.id, OR: [{ url: { not: null } }, { lastAttemptAt: { gt: retryBefore } }] } } },
      },
      select: { id: true, detail: { select: { mpn: true } } }, take: opts.max ?? 20, orderBy: { id: "asc" },
    });
    const pace = pacer(site, opts);
    const listed = site.sitemapUrl ? await sitemapPages(site, opts) : null;
    search: for (const p of products) {
      const mpn = p.detail?.mpn?.trim();
      const key = codeKey(mpn);
      if (!mpn || key.length < 4) { out.skipped++; continue; }
      if (!(await pace.turn())) { out.stoppedEarly = true; break; }
      // A candidate must carry the part number in its address, and the page itself must then confirm it as its SKU.
      let candidates: string[];
      if (listed) candidates = listed.filter((l) => l.key.includes(key)).slice(0, 4).map((l) => l.url);
      else {
        const results = await get(site.searchUrl(mpn), opts);
        if (!results.ok) {
          out.failed++;
          if (results.error.startsWith("Blocked")) { out.stoppedEarly = true; break; }
          continue;
        }
        candidates = productLinks(results.html, c.domain).filter((u) => codeKey(new URL(u).pathname).includes(key)).slice(0, 2);
      }
      let found = false;
      for (const url of candidates) {
        if (!(await pace.turn())) { out.stoppedEarly = true; break search; }
        const page = await get(url, opts);
        if (!page.ok) {
          if (page.error.startsWith("Blocked")) { out.stoppedEarly = true; break search; }
          continue;
        }
        const listing = extractListing(page.html);
        if (!listing || listing.price === null || listing.currency !== "GBP" || codeKey(listing.sku) !== key) continue;
        await recordPrice(actor, { productId: p.id, competitorId: c.id, price: listing.price, basis: site.basis, url, theirName: listing.name ?? "", inStock: listing.inStock, note: "Found automatically by part number" });
        await db.competitorPrice.update({ where: { productId_competitorId: { productId: p.id, competitorId: c.id } }, data: { lastAttemptAt: new Date(), lastError: null } });
        out.found++;
        found = true;
        break;
      }
      if (!found) {
        out.notListed++;
        const data = { lastAttemptAt: new Date(), lastError: "Not listed on this site." };
        await db.competitorPrice.upsert({ where: { productId_competitorId: { productId: p.id, competitorId: c.id } }, create: { productId: p.id, competitorId: c.id, ...data }, update: data });
      }
    }
  }
  return out;
}

let running = false;
export const checkInProgress = () => running;

/** Runs the checks then discovery in the background, one run at a time. False if a run is already going. */
export function startBackgroundCheck(actor: Actor, opts: { max?: number; budgetMs?: number } = {}): boolean {
  if (running) return false;
  running = true;
  void (async () => {
    try {
      await checkPrices(actor, opts);
      await discoverListings(actor, opts);
    } catch (err) {
      console.error("competitor check failed", err);
    } finally {
      running = false;
    }
  })();
  return true;
}
