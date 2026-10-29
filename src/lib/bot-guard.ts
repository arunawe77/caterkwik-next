import { createRateLimiter } from "@/kit/rate-limit";

// Site-wide protection against scrapers and floods, applied by the proxy. Two checks:
// 1. Clients that announce themselves as scraping tools (or send no user agent at all) are refused.
// 2. Everyone else gets a per-address request budget, so a script cannot walk the catalogue at machine speed.
// Search engines are exempt so SEO is untouched. A user agent can be faked, so this stops casual scrapers
// and floods, not a determined one; it is a first layer, not a replacement for a CDN or WAF in front.

const SEARCH_ENGINES = /googlebot|bingbot|duckduckbot|applebot|yandex|baiduspider|google-inspectionTool|adsbot-google|mediapartners-google/i;
const SCRAPER_TOOLS = /curl\/|wget\/|python-requests|python-urllib|aiohttp|httpx|scrapy|go-http-client|libwww-perl|java\/|okhttp|node-fetch|undici|axios\/|got \(|headlesschrome|phantomjs|selenium|puppeteer|playwright|httrack|masscan|sqlmap|nikto|ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|bytespider|gptbot|ccbot|claudebot|amazonbot|dataforseo/i;

export type AgentClass = "search" | "scraper" | "none" | "browser";

export function classifyAgent(ua: string | null | undefined): AgentClass {
  const s = (ua ?? "").trim();
  if (!s) return "none";
  if (SEARCH_ENGINES.test(s)) return "search";
  if (SCRAPER_TOOLS.test(s)) return "scraper";
  return "browser";
}

// Pages prefetch their links, so a person browsing quickly can make dozens of requests a minute.
const PER_MINUTE = 240;
const overBudget = createRateLimiter(PER_MINUTE, 60_000);

export type Verdict = { allow: true } | { allow: false; status: 403 | 429; retryAfter?: number };

export function judge(ip: string, ua: string | null | undefined, limiter: (key: string) => boolean = overBudget): Verdict {
  const kind = classifyAgent(ua);
  if (kind === "search") return { allow: true };
  if (kind === "scraper" || kind === "none") return { allow: false, status: 403 };
  if (ip !== "unknown" && limiter(ip)) return { allow: false, status: 429, retryAfter: 60 };
  return { allow: true };
}
