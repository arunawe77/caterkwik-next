import { describe, expect, it } from "vitest";
import { products } from "@/lib/catalogue";
import { resolveLegacy } from "@/lib/legacy";

const cgi = (action: string) => resolveLegacy("/cgi-bin/trolleyed_public.cgi", new URLSearchParams({ action }));
const root = "/shop/commercial-catering-equipment/commercial-ovens";
const none = new URLSearchParams();

describe("resolveLegacy", () => {
  it("sends an old product address to the new product page", () => {
    expect(cgi("showprod_CR6D")).toBe("/ovens/4-burner/cr6d");
    expect(cgi("showprod_FALCONG31016BURNERGASOVEN")).toBe("/ovens/6-burner-range/falcong31016burnergasoven");
  });

  it("sends a discontinued product to its type page, never the home page", () => {
    expect(cgi("showprod_GL174")).toBe("/ovens/4-burner");
  });

  it("sends an unknown token to the ovens hub", () => {
    expect(cgi("showprod_DOESNOTEXIST")).toBe("/ovens");
  });

  it("ignores other CGI actions", () => {
    expect(cgi("viewcart")).toBeNull();
    expect(resolveLegacy("/cgi-bin/trolleyed_public.cgi", none)).toBeNull();
  });

  it("sends old category paths to the type page, with or without a trailing slash", () => {
    expect(resolveLegacy(`${root}/6-burner-range/`, none)).toBe("/ovens/6-burner-range");
    expect(resolveLegacy(`${root}/convectionovens`, none)).toBe("/ovens/convectionovens");
    expect(resolveLegacy(`${root}/made-up/`, none)).toBe("/ovens");
    expect(resolveLegacy(`${root}/`, none)).toBe("/ovens");
  });

  it("leaves every other path alone", () => {
    expect(resolveLegacy("/ovens", none)).toBeNull();
    expect(resolveLegacy("/shop/commercial-catering-equipment/fridges/", none)).toBeNull();
  });

  it("resolves every one of the 442 scraped addresses without falling back to the hub", () => {
    let resolved = 0;
    for (const p of products) {
      const to = resolveLegacy(new URL(p.legacyUrl).pathname, new URL(p.legacyUrl).searchParams);
      expect(to, p.legacyUrl).not.toBe("/ovens");
      expect(to).not.toBeNull();
      resolved++;
    }
    expect(resolved).toBe(413);
  });
});
