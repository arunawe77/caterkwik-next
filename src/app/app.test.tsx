import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProductLayout, { metadata as productMetadata } from "@/app/(product)/layout";
import G3101, { metadata as g3101Metadata } from "@/app/(product)/falcon/g3101-otc-p/page";
import ShopLayout from "@/app/(shop)/layout";
import Gate from "@/app/(shop)/gate/page";
import Home from "@/app/(shop)/page";
import NotInPreview from "@/app/(shop)/not-in-preview/page";
import SixBurner, { metadata as sixMetadata } from "@/app/(shop)/ovens/6-burner-range/page";
import OvensHub, { metadata as hubMetadata } from "@/app/(shop)/ovens/page";
import TypePage, { generateMetadata as typeMetadata, generateStaticParams as typeParams } from "@/app/(shop)/ovens/[type]/page";
import ProductPage, { generateMetadata as productMeta, generateStaticParams as productParams } from "@/app/(shop)/ovens/[type]/[id]/page";
import SearchPage from "@/app/(shop)/search/page";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { cookingProducts, cookingTypes, getProduct, products, types } from "@/lib/catalogue";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const params = <T,>(v: T) => Promise.resolve(v);

describe("layouts", () => {
  it("both route groups render the shell around their page", () => {
    expect(html(<ShopLayout><p>x</p></ShopLayout>)).toContain("<p>x</p>");
    expect(html(<ProductLayout><p>y</p></ProductLayout>)).toContain("<p>y</p>");
    expect(productMetadata.robots).toEqual({ index: false, follow: false });
  });
});

describe("the three approved pages", () => {
  it("embed the hub, the six-burner category and the G3101 page", () => {
    expect(html(<OvensHub />)).toContain("hubfinder");
    expect(html(<SixBurner />)).toContain("ck-ovens-data");
    expect(html(<G3101 />)).toContain('id="hero-img"');
    expect(hubMetadata.title).toContain(`${types.length} types`);
    expect(sixMetadata.alternates?.canonical).toBe("http://localhost:3000/ovens/6-burner-range");
    expect(g3101Metadata.alternates?.canonical).toBe("http://localhost:3000/falcon/g3101-otc-p");
  });

  it("link every six-burner card to a page on this site", () => {
    const out = html(<SixBurner />);
    expect(out).not.toContain("caterkwik.co.uk/cgi-bin/trolleyed_public.cgi?action=showprod_SLR9C\"");
    expect(out).toContain('href="/ovens/6-burner-range/slr9c"');
    expect(html(<OvensHub />)).toContain('href="/ovens/4-burner"');
  });
});

describe("home", () => {
  it("shows the hero, the featured types and lease picks", () => {
    const out = html(<Home />);
    expect(out).toContain("Commercial catering equipment, supplied and serviced");
    expect(out).toContain("6 Burner Ovens");
    expect(out).toContain("Lease from");
    expect(out).toContain('"@type":"Organization"');
  });
});

describe("type page", () => {
  const render = async (type: string, query: Record<string, string | string[]> = {}) =>
    html(await TypePage({ params: params({ type }), searchParams: params(query) }));

  it("lists available models, then discontinued ones below the grid with no price", async () => {
    const out = await render("4-burner");
    expect(out).toContain("<h1>4 Burner Ovens</h1>");
    expect(out).toContain("Discontinued (3)");
    expect(out.indexOf("Discontinued (3)")).toBeGreaterThan(out.indexOf(`<h3><a href="/ovens/4-burner/cr6d">`));
    expect(out).toContain("from £1,337.99 ex VAT");
    expect(out).toContain('"@type":"ItemList"');
  });

  it("filters by brand and availability from the URL and offers a way back", async () => {
    const out = await render("4-burner", { brand: "Lincat", stock: "in-stock" });
    expect(out).not.toContain("Discontinued (");
    expect(out).toContain("Clear all");
    expect(out).toContain('name="brand" checked="" value="Lincat"');
    expect(out).not.toContain(`<h3><a href="/ovens/4-burner/cr6d">`);
  });

  it("says so when nothing is available or nothing matches", async () => {
    expect(await render("domestic_ovens")).toContain("Nothing currently available");
    expect(await render("4-burner", { brand: "Falcon", stock: "poa" })).toContain("No model matches that selection.");
  });

  it("omits a facet group with fewer than two options", async () => {
    const out = await render("10_burner_commercial_ovens");
    expect(out).not.toContain("<legend>Brand</legend>");
  });

  it("404s an unknown type and serves metadata and static params for the rest", async () => {
    await expect(render("nope")).rejects.toThrow();
    expect(await typeMetadata({ params: params({ type: "nope" }), searchParams: params({}) })).toEqual({});
    const meta = await typeMetadata({ params: params({ type: "4-burner" }), searchParams: params({}) });
    expect(meta.description).toContain("from £1,337.99 ex VAT");
    const noPrice = await typeMetadata({ params: params({ type: "domestic_ovens" }), searchParams: params({}) });
    expect(noPrice.description).not.toContain("from £");
    expect(typeParams()).toHaveLength(types.length - 1);
    expect(typeParams().some((p) => p.type === "6-burner-range")).toBe(false);
  });
});

describe("product page", () => {
  const render = async (type: string, id: string) => html(await ProductPage({ params: params({ type, id }) }));

  it("shows an available product with both prices, lease and a specification", async () => {
    const out = await render("6-burner-range", "slr9c");
    expect(out).toContain("<h1>Lincat Silverlink SLR9/SLR9C 6-Burner Gas Oven</h1>");
    expect(out).toContain("£1,132.99");
    expect(out).toContain("£1,359.59");
    expect(out).toContain("Lease this item from only £6.16 per week");
    expect(out).toContain("<span>Width</span><span>900 mm</span>");
    expect(out).toContain('"additionalProperty"');
  });

  it("shows a was price when there is one", async () => {
    expect(await render("4-burner", "cr6d")).toContain('<span class="was">£1,439.99</span>');
  });

  it("says a figure is not published rather than guessing", async () => {
    const out = await render("6-burner-range", "g3101d");
    expect(out).toContain("Not published");
  });

  it("shows the full published specification when the product page has one", async () => {
    const out = await render("4-burner", "cr6d");
    expect(out).toContain("Technical specification");
    expect(out).toContain("Key features");
  });

  it("shows no price for a discontinued product and offers available alternatives", async () => {
    const out = await render("4-burner", "gl174");
    expect(out).toContain("This model is discontinued");
    expect(out).toContain("Available alternatives");
    const buyBox = out.slice(out.indexOf('class="pbuy"'), out.indexOf("<h2>Overview"));
    expect(buyBox).not.toContain("£");
  });

  it("handles price on application", async () => {
    const poa = products.find((p) => p.stock === "poa")!;
    const out = await render(poa.type, poa.id);
    expect(out).toContain("Price on application. Call the team for a quote.");
    expect(out).toContain("Similar models");
    expect(out).not.toContain("Available alternatives");
  });

  it("omits the brand when the name gives none", async () => {
    const unbranded = products.find((p) => !p.brand)!;
    expect(await render(unbranded.type, unbranded.id)).not.toContain('class="eyebrow"');
  });

  it("404s a missing product or one filed under another type", async () => {
    await expect(render("4-burner", "nope")).rejects.toThrow();
    await expect(render("8-burner", "cr6d")).rejects.toThrow();
  });

  it("builds metadata and one static route per product", async () => {
    const meta = await productMeta({ params: params({ type: "4-burner", id: "cr6d" }) });
    expect(meta.title).toBe("Blue Seal Cobra Series CR6D Gas 4 Burner Oven");
    expect(meta.description).toContain("£1,337.99 ex VAT");
    expect(meta.alternates?.canonical).toBe("http://localhost:3000/ovens/4-burner/cr6d");
    expect(meta.openGraph).toMatchObject({ title: meta.title, siteName: "Caterkwik", locale: "en_GB" });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
    expect((await productMeta({ params: params({ type: "4-burner", id: "gl174" }) })).description).toContain("Discontinued.");
    expect(await productMeta({ params: params({ type: "x", id: "y" }) })).toEqual({});
    const poa = products.find((p) => p.stock === "poa")!;
    expect((await productMeta({ params: params({ type: poa.type, id: poa.id }) })).description).not.toContain("£");
    expect(productParams()).toHaveLength(413);
  });
});

describe("search page", () => {
  const render = async (q?: string | string[]) => html(await SearchPage({ searchParams: params({ q }) }));

  it("lists matches for a query", async () => {
    const out = await render("g3101");
    expect(out).toContain("Results for “g3101”");
    expect(out).toContain("/ovens/6-burner-range/falcong31016burnergasoven");
  });

  it("uses the first value of a repeated parameter and trims", async () => {
    expect(await render(["  cr6d ", "other"])).toContain("Results for “cr6d”");
  });

  it("explains an empty search and a search with no results", async () => {
    expect(await render()).toContain("Search by product name, brand or model number.");
    expect(await render("zzzzqqqq")).toContain("Nothing matches.");
  });
});

describe("small pages", () => {
  it("explains departments outside the preview", () => {
    expect(html(<NotInPreview />)).toContain("This department is not in the preview");
  });

  it("shows the gate, with an error when the password was wrong and a safe return path", async () => {
    const plain = html(await Gate({ searchParams: params({}) }));
    expect(plain).not.toContain("not right");
    expect(plain).toContain('name="next" value="/"');
    const wrong = html(await Gate({ searchParams: params({ error: "1", next: "/ovens" }) }));
    expect(wrong).toContain("That password is not right.");
    expect(wrong).toContain('value="/ovens"');
    expect(html(await Gate({ searchParams: params({ next: "//evil.example" }) }))).toContain('name="next" value="/"');
  });
});

describe("sitemap and robots", () => {
  it("lists the home page, the hub, every type and every product", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toHaveLength(4 + types.length + products.length + cookingTypes.filter((t) => t.total > 0).length + cookingProducts.length);
    expect(urls).toContain("http://localhost:3000/falcon/g3101-otc-p");
    expect(urls).toContain("http://localhost:3000/ovens/4-burner/cr6d");
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("blocks all crawling on staging and points at the sitemap", () => {
    const r = robots();
    expect(r.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(r.sitemap).toBe("http://localhost:3000/sitemap.xml");
  });
});

describe("data sanity", () => {
  it("has the G3101 range in the catalogue", () => {
    expect(getProduct("falcong31016burnergasoven")!.spec!.width).toBe(900);
  });
});
