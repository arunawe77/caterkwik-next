import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { extractListing, isBlocked, type Listing } from "@/lib/price-extract";

// Lets the admin assistant read one public web page, for example a manufacturer's product page staff point it at.
// It fetches only ordinary public web addresses: never an internal or private one, never with credentials, and never more
// than a few megabytes. What it returns is page content: the assistant treats it as information, never as instructions.

export class WebReadError extends Error {}

const MAX_BYTES = 2_000_000;
const MAX_TEXT = 12_000;
const MAX_REDIRECTS = 4;
const UA = "Mozilla/5.0 (compatible; CaterkwikAssistant; +https://www.caterkwik.co.uk)";

/** True for loopback, private, link-local, shared and other non-public addresses, in IPv4 or IPv6. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff");
}

type Lookup = (host: string) => Promise<{ address: string }[]>;
const realLookup: Lookup = (host) => lookup(host, { all: true });

/** Throws unless the address is a public http(s) page on the standard ports. Returns the parsed URL. */
export async function assertPublicUrl(raw: string, resolve: Lookup = realLookup): Promise<URL> {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new WebReadError("That is not a web address. Give the full address, starting https://"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new WebReadError("Only http and https addresses can be read.");
  if (url.username || url.password) throw new WebReadError("Addresses with a login in them are not allowed.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new WebReadError("Only the standard web ports can be used.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".") && isIP(host) === 0) {
    throw new WebReadError("That address is not a public website.");
  }
  const addresses = isIP(host) ? [{ address: host }] : await resolve(host).catch(() => { throw new WebReadError(`Could not find the website "${host}".`); });
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new WebReadError("That address is not a public website.");
  return url;
}

const entities: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&pound;": "£" };

/** The readable text of a page: scripts, styles and markup removed, entities decoded, whitespace tidied. */
export function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|br|section|article|ul|ol|table)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp|pound);/g, (m) => entities[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface WebPage {
  url: string;
  title: string | null;
  description: string | null;
  product: Listing | null;
  images: string[];
  text: string;
  truncated: boolean;
}

export interface ReadDeps { fetchFn?: typeof fetch; resolve?: Lookup }

async function readBody(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    chunks.push(value);
    if (size > MAX_BYTES) { await reader.cancel(); break; }
  }
  return Buffer.concat(chunks).toString("utf8");
}

const meta = (html: string, key: string) =>
  html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`, "i"))?.[1] ??
  html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`, "i"))?.[1] ?? null;

/** Reads one public page. Every redirect is checked again, so a public address cannot bounce the reader to an internal one. */
export async function readWebPage(rawUrl: string, deps: ReadDeps = {}): Promise<WebPage> {
  const doFetch = deps.fetchFn ?? fetch;
  let url = await assertPublicUrl(rawUrl, deps.resolve);
  for (let hop = 0; ; hop++) {
    let res: Response;
    try {
      res = await doFetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,text/plain" } });
    } catch (err) {
      throw new WebReadError(`Could not load the page: ${err instanceof Error ? err.message : "unknown error"}`);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop >= MAX_REDIRECTS) throw new WebReadError("The page redirected too many times.");
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url).toString(), deps.resolve);
      continue;
    }
    const type = res.headers.get("content-type") ?? "";
    const html = await readBody(res);
    if (isBlocked(res.status, html)) throw new WebReadError(`The site blocked automated reading (HTTP ${res.status}), so its details cannot be read. Ask staff to paste the details from the page.`);
    if (!res.ok) throw new WebReadError(`The page answered HTTP ${res.status}.`);
    if (type && !/text\/|html|xml/i.test(type)) throw new WebReadError("That address is not a web page (it is a file or image).");
    const text = pageText(html);
    const images = [...new Set([meta(html, "og:image"), ...[...html.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1])].filter((u): u is string => !!u))].slice(0, 6);
    return {
      url: url.toString(),
      title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].replace(/\s+/g, " ").trim() || meta(html, "og:title"),
      description: meta(html, "description") ?? meta(html, "og:description"),
      product: extractListing(html),
      images,
      text: text.slice(0, MAX_TEXT),
      truncated: text.length > MAX_TEXT,
    };
  }
}
