import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CookingHub from "@/app/(shop)/cooking/page";
import CookingType, { generateStaticParams as typeParams } from "@/app/(shop)/cooking/[type]/page";
import CookingProduct, { generateStaticParams as productParams } from "@/app/(shop)/cooking/[type]/[id]/page";
import { cookingGroups, cookingProducts, cookingTypes, getProduct, productHref, products, types, typeHref } from "@/lib/catalogue";
import { richOf } from "@/lib/rich";
import { searchProducts } from "@/lib/search";

const html = (el: React.ReactNode) => renderToStaticMarkup(el as React.ReactElement);
const params = <T,>(v: T) => Promise.resolve(v);

describe("the Cooking catalogue", () => {
  it("adds every other cooking category without changing the oven counts", () => {
    expect(products).toHaveLength(413);
    expect(types).toHaveLength(23);
    expect(cookingProducts.length).toBeGreaterThan(2500);
    expect(cookingTypes.length).toBeGreaterThan(100);
    expect(cookingProducts.some((p) => products.some((o) => o.id === p.id))).toBe(false);
  });

  it("puts ovens under /ovens and everything else under /cooking", () => {
    expect(typeHref("4-burner")).toBe("/ovens/4-burner");
    const fryer = cookingProducts.find((p) => p.stock === "in-stock")!;
    expect(productHref(fryer)).toBe(`/cooking/${fryer.type}/${fryer.id}`);
    expect(getProduct(fryer.id)).toBe(fryer);
  });

  it("finds a cooking product by name or model number", () => {
    const p = cookingProducts.find((x) => x.stock === "in-stock")!;
    expect(searchProducts(p.token).some((r) => r.id === p.id)).toBe(true);
  });
});

describe("cooking pages", () => {
  it("lists every department with its categories", () => {
    const out = html(CookingHub());
    expect(out).toContain("Commercial cooking equipment");
    expect(out).toContain('href="/ovens"');
    for (const g of cookingGroups()) expect(out).toContain(`href="/cooking/${g.slug}"`);
    expect(out).not.toContain("Browse commercial ovens");
  });

  it("renders a category with schema filters, and 404s an oven type", async () => {
    const fryers = cookingGroups().find((g) => /fryer/i.test(g.label))!;
    const out = html(await CookingType({ params: params({ type: fryers.slug }), searchParams: params({}) }));
    expect(out).toContain(fryers.label);
    expect(out).toContain("Availability");
    expect(out).toContain("Type");
    const one = fryers.types[0];
    const filtered = html(await CookingType({ params: params({ type: fryers.slug }), searchParams: params({ type: one.slug }) }));
    expect(filtered).toContain(`of ${one.total} model`);
    await expect(CookingType({ params: params({ type: one.slug }), searchParams: params({}) })).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(CookingType({ params: params({ type: "4-burner" }), searchParams: params({}) })).rejects.toThrow();
  }, 60000);

  it("renders a product with its rich sections, hover-sourced figures and downloads", async () => {
    const target = cookingProducts.find((p) => p.stock === "in-stock" && p.type.includes("fryer"))!;
    const r = await richOf(target.id);
    expect(r).not.toBeNull();
    const out = html(await CookingProduct({ params: params({ type: target.type, id: target.id }) }));
    expect(out).toContain(target.name);
    expect(out).toContain("Technical specification");
    expect(out).toContain("Add to basket");
    expect(out).toContain('"@type":"Product"');
    expect(out).not.toContain("undefined");
  }, 60000);

  it("serves one static route per category and product", () => {
    expect(typeParams()).toHaveLength(cookingTypes.length);
    expect(productParams()).toHaveLength(cookingProducts.length);
  });
});
