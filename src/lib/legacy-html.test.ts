import { describe, expect, it } from "vitest";
import { localise } from "@/lib/legacy-html";

const SITE = "https://www.caterkwik.co.uk";

describe("localise", () => {
  it("points an old product address at the generated product page", () => {
    expect(localise(`href="${SITE}/cgi-bin/trolleyed_public.cgi?action=showprod_SLR9C"`)).toBe('href="/ovens/6-burner-range/slr9c"');
  });

  it("rewrites addresses inside JSON data too", () => {
    expect(localise(`{"url":"${SITE}/cgi-bin/trolleyed_public.cgi?action=showprod_SLR9C","x":1}`))
      .toBe('{"url":"/ovens/6-burner-range/slr9c","x":1}');
  });

  it("sends an unknown product to the ovens hub", () => {
    expect(localise(`${SITE}/cgi-bin/trolleyed_public.cgi?action=showprod_NOPE`)).toBe("/ovens");
  });

  it("maps old category addresses to type pages, and unknown ones to the hub", () => {
    const base = `${SITE}/shop/commercial-catering-equipment/commercial-ovens`;
    expect(localise(`${base}/4-burner/`)).toBe("/ovens/4-burner");
    expect(localise(`${base}/6-burner-range/`)).toBe("/ovens/6-burner-range");
    expect(localise(`${base}/made-up/`)).toBe("/ovens");
    expect(localise(`${base}/`)).toBe("/ovens");
  });

  it("maps the department and home addresses, and the renamed six-burner path", () => {
    expect(localise(`href="${SITE}/shop/commercial-catering-equipment/"`)).toBe('href="/not-in-preview"');
    expect(localise(`href="${SITE}/"`)).toBe('href="/"');
    expect(localise('<a href="/ovens/6-burner">')).toBe('<a href="/ovens/6-burner-range">');
    expect(localise("/ovens/6-burner-range")).toBe("/ovens/6-burner-range");
  });

  it("relabels the outbound button", () => {
    expect(localise("View on caterkwik.co.uk")).toBe("View product");
  });
});
