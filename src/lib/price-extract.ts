// Reads a product's price from a competitor's page the way search engines do: from its structured data
// (JSON-LD, then meta tags). Pure, so it is tested against saved snippets. Only GBP prices are accepted.

export interface Listing { name: string | null; sku: string | null; price: number | null; currency: string | null; inStock: boolean | null }

type Json = Record<string, unknown>;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const typeOf = (n: Json) => asArray(n["@type"]).map(String);

/** Every object in the data, outermost and earliest first, so a page's own product (mainEntity) is met before any it merely mentions. */
function flatten(node: unknown, out: Json[] = [], depth = 0): Json[] {
  if (depth > 6) return out;
  if (Array.isArray(node)) node.forEach((n) => flatten(n, out, depth + 1));
  else if (isObj(node)) {
    out.push(node);
    for (const v of Object.values(node)) if (typeof v === "object" && v !== null) flatten(v, out, depth + 1);
  }
  return out;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[£,\s]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

function fromOffer(offer: Json): Pick<Listing, "price" | "currency" | "inStock"> {
  const spec = asArray(offer.priceSpecification).find(isObj);
  const price = num(offer.price) ?? num(offer.lowPrice) ?? (spec ? num(spec.price) : null);
  const currency = String(offer.priceCurrency ?? (spec ? spec.priceCurrency : "") ?? "") || null;
  const avail = String(offer.availability ?? "");
  return { price, currency, inStock: avail ? /InStock|LimitedAvailability|OnlineOnly/i.test(avail) : null };
}

/** The first Product on the page with a readable price. Null when the page carries none. */
export function extractListing(html: string): Listing | null {
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try { data = JSON.parse(m[1]); } catch { continue; }
    for (const node of flatten(data)) {
      if (!typeOf(node).includes("Product")) continue;
      for (const offer of asArray(node.offers).flatMap((o) => (isObj(o) ? [o, ...asArray(o.offers).filter(isObj)] : []))) {
        const o = fromOffer(offer);
        if (o.price !== null) return { name: node.name ? String(node.name) : null, sku: node.sku ? String(node.sku) : null, ...o };
      }
    }
  }
  const meta = html.match(/product:price:amount"\s+content="([^"]+)"/i) ?? html.match(/itemprop="price"\s+content="([^"]+)"/i);
  const price = meta ? num(meta[1]) : null;
  if (price === null) return null;
  const cur = html.match(/product:price:currency"\s+content="([^"]+)"/i) ?? html.match(/itemprop="priceCurrency"\s+content="([^"]+)"/i);
  return { name: html.match(/<meta property="og:title" content="([^"]*)"/i)?.[1] ?? null, sku: null, price, currency: cur?.[1] ?? null, inStock: null };
}

/** True when the response is a bot-protection page or an outright refusal, which we report and never work around. */
export function isBlocked(status: number, html: string): boolean {
  return status === 403 || status === 429 || status === 503 || /just a moment|cf-chl|captcha|access denied|attention required/i.test(html.slice(0, 6000));
}

/** Product page addresses on a search results page, in order, on the given host only. */
export function productLinks(html: string, host: string): string[] {
  const seen = new Set<string>();
  for (const m of html.matchAll(/href="(https?:\/\/[^"#?]+\.html)"/gi)) {
    try { if (new URL(m[1]).hostname.replace(/^www\./, "") === host) seen.add(m[1]); } catch { /* skip */ }
  }
  return [...seen];
}
