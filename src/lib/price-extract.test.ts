import { describe, expect, it } from "vitest";
import { autoSiteFor } from "@/lib/competitors";
import { extractListing, isBlocked, productLinks } from "@/lib/price-extract";

const ld = (obj: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(obj)}</script></head></html>`;

describe("extractListing", () => {
  it("reads a Product with one Offer", () => {
    const html = ld({ "@type": "Product", name: "Buffalo CK164", sku: "CK164", offers: { "@type": "Offer", price: "322.8", priceCurrency: "GBP", availability: "http://schema.org/InStock" } });
    expect(extractListing(html)).toEqual({ name: "Buffalo CK164", sku: "CK164", price: 322.8, currency: "GBP", inStock: true });
  });

  it("finds the Product inside an @graph and takes the first priced offer of a list", () => {
    const html = ld({ "@graph": [{ "@type": "WebSite" }, { "@type": ["Product"], name: "X", offers: [{ price: 0 }, { price: 10, priceCurrency: "GBP", availability: "OutOfStock" }] }] });
    expect(extractListing(html)).toMatchObject({ price: 10, inStock: false });
  });

  it("finds the page's own product inside mainEntity, before related products it mentions", () => {
    const html = ld({
      "@type": "ItemPage",
      mainEntity: { "@type": "Product", name: "Buffalo CK164", sku: "CK164", offers: { price: "322.8", priceCurrency: "GBP", availability: "http://schema.org/InStock" }, isRelatedTo: [{ "@type": "Product", sku: "OTHER", offers: { price: "413.99", priceCurrency: "GBP" } }] },
    });
    expect(extractListing(html)).toEqual({ name: "Buffalo CK164", sku: "CK164", price: 322.8, currency: "GBP", inStock: true });
  });

  it("reads an AggregateOffer's low price and a price specification", () => {
    expect(extractListing(ld({ "@type": "Product", offers: { "@type": "AggregateOffer", lowPrice: "£1,200.50", priceCurrency: "GBP" } }))?.price).toBe(1200.5);
    expect(extractListing(ld({ "@type": "Product", offers: { priceSpecification: { price: 5, priceCurrency: "GBP" } } }))).toMatchObject({ price: 5, currency: "GBP" });
  });

  it("skips broken JSON and falls back to meta tags", () => {
    const html = `<script type="application/ld+json">{ not json</script><meta property="product:price:amount" content="99.5"><meta property="product:price:currency" content="GBP">`;
    expect(extractListing(html)).toMatchObject({ price: 99.5, currency: "GBP", sku: null });
  });

  it("returns null when the page carries no price", () => {
    expect(extractListing("<html>nothing</html>")).toBeNull();
    expect(extractListing(ld({ "@type": "Organization" }))).toBeNull();
  });
});

describe("isBlocked", () => {
  it("recognises refusals and challenge pages", () => {
    expect(isBlocked(403, "")).toBe(true);
    expect(isBlocked(429, "")).toBe(true);
    expect(isBlocked(200, "<title>Just a moment...</title>")).toBe(true);
    expect(isBlocked(200, "<html>a product page</html>")).toBe(false);
  });
});

describe("productLinks", () => {
  it("keeps product pages on the given host once each", () => {
    const html = `<a href="https://www.shop.co.uk/a-b.html">a</a><a href="https://www.shop.co.uk/a-b.html">again</a><a href="https://other.com/x.html">x</a><a href="https://www.shop.co.uk/page">no</a>`;
    expect(productLinks(html, "shop.co.uk")).toEqual(["https://www.shop.co.uk/a-b.html"]);
  });
});

describe("autoSiteFor", () => {
  it("lists only the site that answers ordinary requests", () => {
    expect(autoSiteFor("cateringhygiene.co.uk")?.basis).toBe("inc");
    expect(autoSiteFor("www.cateringhygiene.co.uk")).not.toBeNull();
    expect(autoSiteFor("nisbets.co.uk")).toBeNull();
  });
});
