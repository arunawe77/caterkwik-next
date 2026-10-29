import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home, { metadata as homeMetadata } from "@/app/(shop)/page";
import TypePage from "@/app/(shop)/ovens/[type]/page";
import ProductPage from "@/app/(shop)/ovens/[type]/[id]/page";
import { metadata as searchMetadata } from "@/app/(shop)/search/page";
import { metadata as gateMetadata } from "@/app/(shop)/gate/page";
import { metadata as notInPreviewMetadata } from "@/app/(shop)/not-in-preview/page";
import { metadata as hubMetadata } from "@/app/(shop)/ovens/page";
import G3101 from "@/app/(product)/falcon/g3101-otc-p/page";
import { Faqs, TypeLinks, WhyCaterkwik } from "@/components/content-blocks";
import { Header } from "@/components/site-chrome";
import { siteMetadata } from "@/components/site-shell";
import { products, types } from "@/lib/catalogue";
import { renderAsync } from "@/test/render";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const params = <T,>(v: T) => Promise.resolve(v);
const ldBlocks = (out: string) =>
  [...out.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1].replace(/\\u003c/g, "<")));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("content blocks", () => {
  it("renders questions as details and repeats them as FAQPage data", () => {
    const out = html(<Faqs heading="Q&A" faqs={[{ q: "Why?", a: "Because." }]} />);
    expect(out).toContain("<summary>Why?</summary><p>Because.</p>");
    const [faq] = ldBlocks(out);
    expect(faq).toMatchObject({ "@type": "FAQPage", mainEntity: [{ name: "Why?", acceptedAnswer: { text: "Because." } }] });
  });

  it("renders four trust points and a plain link for every type given", () => {
    expect(html(<WhyCaterkwik />)).toContain("Price match promise");
    const out = html(<TypeLinks heading="All" types={types} />);
    expect((out.match(/<a href="\/ovens\//g) ?? []).length).toBe(types.length);
    expect(out).toContain("from £1,337.99");
    expect(out).toContain("2 listed");
  });
});

describe("home page", () => {
  it("is canonical, has social tags, and links to every oven type", () => {
    expect(homeMetadata.alternates?.canonical).toBe("http://localhost:3000/");
    expect(homeMetadata.openGraph).toMatchObject({ siteName: "Caterkwik" });
    const out = html(<Home />);
    for (const t of types) expect(out).toContain(`href="/ovens/${t.slug}"`);
    expect(out).toContain("Questions about buying an oven");
    expect(out).toContain("Why buy from Caterkwik");
  });

  it("describes the organisation and the site search for search engines", () => {
    const types_ = ldBlocks(html(<Home />)).flat().map((b) => b["@type"]);
    expect(types_).toEqual(expect.arrayContaining(["Organization", "WebSite", "FAQPage"]));
    const site = ldBlocks(html(<Home />)).flat().find((b) => b["@type"] === "WebSite");
    expect(site.potentialAction.target).toBe("http://localhost:3000/search?q={search_term_string}");
  });
});

describe("type page content", { timeout: 60000 }, () => {
  const render = async (type: string) => renderAsync(await TypePage({ params: params({ type }), searchParams: params({}) }));

  it("has an introduction, questions, trust points and links to every other type", { timeout: 60000 }, async () => {
    const out = await render("4-burner");
    expect(out).toContain("About 4 burner ovens");
    expect(out).toContain("4 Burner Ovens: common questions");
    expect(out).toContain("Why buy from Caterkwik");
    for (const t of types.filter((x) => x.slug !== "4-burner")) expect(out).toContain(`href="/ovens/${t.slug}"`);
  });

  it("describes itself as a collection of its products", async () => {
    const collection = ldBlocks(await render("4-burner")).find((b) => b["@type"] === "CollectionPage");
    expect(collection.mainEntity.numberOfItems).toBe(20);
    expect(collection.mainEntity.itemListElement[0].url).toBe("http://localhost:3000/ovens/4-burner/cr6d");
  });
});

describe("product page content", () => {
  const render = async (type: string, id: string) => html(await ProductPage({ params: params({ type, id }) }));

  it("has an overview, questions, similar models and links to the other types", async () => {
    const out = await render("6-burner-range", "slr9c");
    expect(out).toContain("<h2>Overview</h2>");
    expect(out).toContain("Questions about this model");
    expect(out).toContain("Similar models");
    expect(out).toContain('href="/ovens/4-burner"');
    expect(ldBlocks(out).map((b) => b["@type"])).toEqual(expect.arrayContaining(["Product", "FAQPage", "BreadcrumbList"]));
  });

  it("links a product to the other types it is listed under", async () => {
    const out = await render("6-burner-range", "g56d");
    expect(out).toContain("Also listed under");
    expect(out).toContain('<a href="/ovens/gas_convection_ovens">Convection Ovens - Gas</a>');
    expect(await render("4-burner", "cr6d")).not.toContain("Also listed under");
  });

  it("separates several types with commas", async () => {
    const multi = products.find((p) => p.alsoIn.length > 1);
    if (multi) expect(await render(multi.type, multi.id)).toContain("</a>, <a");
  });
});

describe("utility pages", () => {
  it("are kept out of the index but followable", () => {
    for (const m of [searchMetadata, gateMetadata, notInPreviewMetadata]) expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("the hub carries social tags too", () => {
    expect(hubMetadata.openGraph).toMatchObject({ url: "http://localhost:3000/ovens" });
  });
});

describe("the G3101 page", () => {
  it("describes the product it shows, with the price and availability on the page", () => {
    const [product] = ldBlocks(html(<G3101 />));
    expect(product).toMatchObject({
      "@type": "Product", brand: { name: "Falcon" }, url: "http://localhost:3000/falcon/g3101-otc-p",
      offers: { price: "3097.99", priceCurrency: "GBP", availability: "https://schema.org/InStock" },
    });
    expect(product.additionalProperty).toContainEqual({ "@type": "PropertyValue", name: "Width", value: "900 mm" });
  });
});

describe("navigation", () => {
  it("does not pass credit to departments that are not in the preview", () => {
    const out = html(<Header />);
    const anchors = out.match(/<a [^>]*>/g) ?? [];
    expect(anchors.filter((a) => a.includes('href="/not-in-preview"')).every((a) => a.includes('rel="nofollow"'))).toBe(true);
    expect(anchors.some((a) => a.includes('href="/ovens"') && a.includes("nofollow"))).toBe(false);
  });
});

describe("the indexing switch, on", () => {
  const load = async () => {
    vi.resetModules();
    vi.stubEnv("ALLOW_INDEXING", "true");
    vi.stubEnv("SITE_PASSWORD", "");
    return Promise.all([import("@/app/robots"), import("@/proxy"), import("@/components/site-shell")]);
  };

  it("opens robots.txt to the catalogue but not the gate, search or API", async () => {
    const [{ default: robots }] = await load();
    expect(robots().rules).toEqual({ userAgent: "*", allow: "/", disallow: ["/api/", "/gate", "/search"] });
  });

  it("stops sending noindex, and lets pages be indexed", async () => {
    const [, { proxy }, shell] = await load();
    const res = await proxy(new NextRequest("http://staging.test/ovens"));
    expect(res.headers.get("X-Robots-Tag")).toBeNull();
    expect(shell.siteMetadata.robots).toEqual({ index: true, follow: true });
  });

  it("is off in the default test environment", () => {
    expect(siteMetadata.robots).toEqual({ index: false, follow: false });
  });
});

describe("case studies page", () => {
  it("lists every customer story and is canonical", async () => {
    const { default: CaseStudies, metadata } = await import("@/app/(shop)/case-studies/page");
    const { caseStudies } = await import("@/lib/case-studies");
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/case-studies");
    const out = html(<CaseStudies />);
    expect((out.match(/class="cs-card"/g) ?? []).length).toBe(caseStudies.length);
    expect(out).toContain("La Brasseria");
    expect(out).toContain('href="https://www.caterkwik.co.uk/docs/catersafe-case-study.pdf"');
  });

  it("folds only long stories at a word boundary", async () => {
    const { splitStory } = await import("@/lib/case-studies");
    expect(splitStory("short")).toEqual({ lead: "short", rest: "" });
    const { lead, rest } = splitStory("word ".repeat(100), 50);
    expect(lead.endsWith("…")).toBe(true);
    expect(`${lead.slice(0, -1)} ${rest}`.replace(/\s+/g, " ").trim()).toBe("word ".repeat(100).trim());
  });
});
