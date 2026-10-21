import { afterAll, describe, expect, it } from "vitest";
import {
  categoryHref, cookingProducts, getProduct, getType, isShopType, productHref, productsOfType, products, seedProducts, seedTypeMeta, sectionOf,
  setCatalogue, shopChildrenOf, shopMembersOf, shopProducts, shopRoots, shopTrail, shopTypeAt, typeHref, type Product, type TypeMeta,
} from "@/lib/catalogue";

// A small department tree: Refrigeration > Bottle Coolers > Undercounter, with a product listed in two places.
const meta = (slug: string, label: string, parentSlug: string | null): TypeMeta => ({
  slug, label, audience: "", cooking: [], supply: [], covers: [], parentSlug,
  sourceUrl: `/shop/commercial-catering-equipment/${slug.replace("-", "/")}`, path: label, section: "Refrigeration",
});
const metas = [meta("fridge", "Refrigeration", null), meta("fridge-bottle", "Bottle Coolers", "fridge"), meta("fridge-under", "Undercounter", "fridge-bottle"), meta("bar", "Bar", null)];
const product = (id: string, type: string, alsoIn: string[] = [], stock: Product["stock"] = "in-stock"): Product => ({
  id, token: id.toUpperCase(), name: `Product ${id}`, brand: "Acme", type, alsoIn, image: "/x.jpg",
  priceEx: stock === "in-stock" ? 100 : null, priceInc: stock === "in-stock" ? 120 : null, wasEx: null, leaseWeek: null,
  stock, webExclusive: false, legacyUrl: "", spec: null,
});
const shop = [product("a", "fridge-under"), product("b", "fridge-bottle"), product("c", "fridge-under", ["bar"]), product("d", "bar", [], "discontinued")];

describe("the shop category tree", () => {
  setCatalogue([...seedProducts, ...shop], [...seedTypeMeta, ...metas]);
  afterAll(() => setCatalogue(seedProducts, seedTypeMeta));

  it("keeps imported products out of the oven and cooking catalogues", () => {
    expect(products).toHaveLength(413);
    expect(cookingProducts.some((p) => p.id === "a")).toBe(false);
    expect(shopProducts.map((p) => p.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(getProduct("a")).toBeDefined();
  });

  it("counts a product in its category, the ones it is also listed in, and every category above", () => {
    expect(shopMembersOf("fridge-under").map((p) => p.id).sort()).toEqual(["a", "c"]);
    expect(shopMembersOf("fridge-bottle").map((p) => p.id).sort()).toEqual(["a", "b", "c"]);
    expect(shopMembersOf("fridge").map((p) => p.id).sort()).toEqual(["a", "b", "c"]);
    expect(shopMembersOf("bar").map((p) => p.id).sort()).toEqual(["c", "d"]);
    expect(getType("fridge")).toMatchObject({ total: 3, live: 3, fromPrice: 100 });
    expect(getType("bar")).toMatchObject({ total: 2, live: 1, discontinued: 1 });
  });

  it("knows the departments, children and trail", () => {
    expect(shopRoots().map((t) => t.slug)).toEqual(["fridge", "bar"]);
    expect(shopChildrenOf("fridge").map((t) => t.slug)).toEqual(["fridge-bottle"]);
    expect(shopTrail("fridge-under").map((t) => t.label)).toEqual(["Refrigeration", "Bottle Coolers", "Undercounter"]);
  });

  it("serves a category at the address it has always had, whatever the case or trailing slash", () => {
    expect(typeHref("fridge-under")).toBe("/shop/commercial-catering-equipment/fridge/under");
    expect(shopTypeAt("/shop/commercial-catering-equipment/Fridge/Under/")?.slug).toBe("fridge-under");
    expect(shopTypeAt("/shop/commercial-catering-equipment/nothing")).toBeUndefined();
    expect(categoryHref("fridge")).toBe(typeHref("fridge"));
  });

  it("gives its products their own section", () => {
    expect(isShopType("fridge")).toBe(true);
    expect(isShopType("4-burner")).toBe(false);
    expect(sectionOf("fridge-under")).toBe("equipment");
    expect(productHref(shop[0])).toBe("/equipment/fridge-under/a");
    expect(productsOfType("fridge")).toHaveLength(3);
  });
});
