import { describe, expect, it } from "vitest";
import { classifyAgent, judge } from "@/lib/bot-guard";
import { createRateLimiter } from "@/kit/rate-limit";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

describe("classifyAgent", () => {
  it("recognises browsers, search engines, tools and a missing agent", () => {
    expect(classifyAgent(CHROME)).toBe("browser");
    expect(classifyAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe("search");
    expect(classifyAgent("python-requests/2.31")).toBe("scraper");
    expect(classifyAgent("curl/8.4.0")).toBe("scraper");
    expect(classifyAgent("Mozilla/5.0 (compatible; CaterkwikPriceCheck)")).toBe("browser");
    expect(classifyAgent("")).toBe("none");
    expect(classifyAgent(null)).toBe("none");
  });
});

describe("judge", () => {
  it("refuses scrapers and agentless clients, lets search engines and browsers through", () => {
    expect(judge("1.1.1.1", "Scrapy/2.0")).toEqual({ allow: false, status: 403 });
    expect(judge("1.1.1.1", undefined)).toEqual({ allow: false, status: 403 });
    expect(judge("1.1.1.1", "Googlebot/2.1")).toEqual({ allow: true });
    expect(judge("1.1.1.1", CHROME)).toEqual({ allow: true });
  });
  it("answers 429 once an address spends its budget, but never throttles search engines", () => {
    const limiter = createRateLimiter(3, 60_000);
    for (let i = 0; i < 3; i++) expect(judge("2.2.2.2", CHROME, limiter).allow).toBe(true);
    expect(judge("2.2.2.2", CHROME, limiter)).toEqual({ allow: false, status: 429, retryAfter: 60 });
    expect(judge("2.2.2.2", "Googlebot/2.1", limiter)).toEqual({ allow: true });
    expect(judge("3.3.3.3", CHROME, limiter).allow).toBe(true);
  });
});
