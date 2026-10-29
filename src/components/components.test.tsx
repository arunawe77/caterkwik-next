import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Crumbs } from "@/components/crumbs";
import { JsonLd } from "@/components/json-ld";
import { LegacyPage } from "@/components/legacy-page";
import { Price } from "@/components/price";
import { ProductCard, specLine } from "@/components/product-card";
import { Footer, Header } from "@/components/site-chrome";
import { SiteShell, siteMetadata } from "@/components/site-shell";
import { getProduct, products } from "@/lib/catalogue";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("Price", () => {
  it("renders both prices so CSS can lead with either, plus the was price", () => {
    const out = html(<Price product={getProduct("cr6d")!} />);
    expect(out).toContain('<b class="ex">£1,337.99</b>');
    expect(out).toContain("£1,605.59 inc. VAT");
    expect(out).toContain("was £1,439.99");
  });

  it("omits the was price when there is none", () => {
    expect(html(<Price product={getProduct("slr9c")!} />)).not.toContain("was");
  });

  it("shows no price for discontinued or price-on-application products", () => {
    expect(html(<Price product={getProduct("gl174")!} />)).toContain("Discontinued");
    const poa = products.find((p) => p.stock === "poa")!;
    const out = html(<Price product={poa} />);
    expect(out).toContain("Price on application");
    expect(out).not.toContain("£");
  });
});

describe("ProductCard", () => {
  it("links to the generated page and shows spec, price and lease", () => {
    const out = html(<ProductCard product={getProduct("slr9c")!} />);
    expect(out).toContain('href="/ovens/6-burner-range/slr9c"');
    expect(out).toContain("Natural gas or LPG · 900 mm wide · Static oven · 27 kW");
    expect(out).toContain("Lease from £6.16 a week");
    expect(out).toContain('src="/assets/img/products/slr9c.jpg"');
  });

  it("flags discontinued and web-exclusive products and shows no lease for them", () => {
    const gone = html(<ProductCard product={getProduct("gl174")!} />);
    expect(gone).toContain("chip-amber");
    expect(gone).not.toContain("Lease");
    const exclusive = products.find((p) => p.webExclusive && p.stock === "in-stock");
    if (exclusive) expect(html(<ProductCard product={exclusive} />)).toContain("Web exclusive");
  });

  it("builds a spec line only from the figures the record has", () => {
    expect(specLine({ spec: null })).toBe("");
    const spec = { ...getProduct("slr9c")!.spec!, fuel: [], width: null, ovenType: "convection", kwTotal: null };
    expect(specLine({ spec })).toBe("Fan oven");
  });

  it("skips the spec line for products without a specification", () => {
    expect(html(<ProductCard product={getProduct("cr6d")!} />)).not.toContain('class="spec"');
  });
});

describe("Crumbs and JsonLd", () => {
  it("links every crumb but the last, and emits BreadcrumbList data", () => {
    const out = html(<Crumbs trail={[{ label: "Home", href: "/" }, { label: "Ovens", href: "/ovens" }, { label: "4 Burner", href: "/ovens/4-burner" }]} />);
    expect(out).toContain('<a href="/">Home</a>');
    expect(out).toContain('<a href="/ovens">Ovens</a>');
    expect(out).toContain("4 Burner</span>");
    expect(out).not.toContain('href="/ovens/4-burner"');
    expect(out).toContain('"@type":"BreadcrumbList"');
    expect(out).toContain('"position":3');
  });

  it("escapes < so no field can close the script tag", () => {
    const out = html(<JsonLd data={{ name: "</script><b>x" }} />);
    expect(out).not.toContain("</script><b>");
    expect(out).toContain("\\u003c/script>");
  });
});

describe("site chrome", () => {
  it("renders the header with search, VAT switch, phone and the departments", () => {
    const out = html(<Header />);
    expect(out).toContain('action="/search"');
    expect(out).toContain('data-vat="ex"');
    expect(out).toContain('href="tel:01229480001"');
    expect(out).toContain('href="/cooking"');
    expect(out).toContain('class="usps"');
  });

  it("renders the footer with company details", () => {
    const out = html(<Footer />);
    expect(out).toContain("Cater-Kwik Ltd");
    expect(out).toContain("04432906");
    expect(out).toContain("Staging preview");
  });

  it("wraps a page in the shell: fonts, VAT init script, header and footer", () => {
    const out = html(<SiteShell><main>child</main></SiteShell>);
    expect(out).toContain('<html lang="en-GB">');
    expect(out).toContain("fonts.googleapis.com");
    expect(out).toContain("showinc");
    expect(out).toContain("<main>child</main>");
    expect(out.indexOf("site-header") === -1 && out.indexOf('class="site"') < out.indexOf("child")).toBe(true);
    expect(siteMetadata.robots).toEqual({ index: false, follow: false });
  });
});

describe("LegacyPage", () => {
  it("renders the approved markup with addresses pointed at the new pages", () => {
    const out = html(
      <LegacyPage
        fragment={{
          ld: ['{"url":"https://www.caterkwik.co.uk/cgi-bin/trolleyed_public.cgi?action=showprod_CR6D"}'],
          main: '<main><a href="https://www.caterkwik.co.uk/cgi-bin/trolleyed_public.cgi?action=showprod_SLR9C">x</a></main>',
          markup: '<div id="chat"></div>',
          scripts: [{ src: "/assets/chat.js" }],
        }}
      />,
    );
    expect(out).toContain('href="/ovens/6-burner-range/slr9c"');
    expect(out).toContain('<script type="application/ld+json">{"url":"/ovens/4-burner/cr6d"}</script>');
    expect(out).toContain('<div id="chat"></div>');
  });
});
