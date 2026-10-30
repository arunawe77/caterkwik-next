import { describe, expect, it } from "vitest";
import { DEFAULT_SPEC, parseSpec, specLines, specMessage } from "@/lib/table-spec";

const form = (over: Record<string, unknown> = {}) => ({
  type: "wall", width: "1200", depth: "700", height: "900", undershelf: "one", gantry: "none", chamfer: "none", upstand: "none", castors: "", quantity: "1", ...over,
});

describe("parseSpec", () => {
  it("reads a valid form into numbers and a boolean", () => {
    const r = parseSpec(form({ width: "1500", castors: "on", quantity: "3" }));
    expect(r).toEqual({ ok: true, spec: { ...DEFAULT_SPEC, width: 1500, castors: true, quantity: 3 } });
  });

  it("refuses an unknown option or table type", () => {
    expect(parseSpec(form({ gantry: "triple" })).ok).toBe(false);
    expect(parseSpec(form({ type: "island" })).ok).toBe(false);
  });

  it("refuses sizes that are missing, fractional or out of range", () => {
    for (const bad of ["", "abc", "1200.5", "100", "99999"]) expect(parseSpec(form({ width: bad })).ok).toBe(false);
    expect(parseSpec(form({ height: "2000" })).ok).toBe(false);
  });

  it("names the field that is wrong", () => {
    const r = parseSpec(form({ depth: "5" }));
    expect(r.ok === false && r.error).toMatch(/depth/);
  });

  it("limits the quantity", () => {
    expect(parseSpec(form({ quantity: "0" })).ok).toBe(false);
    expect(parseSpec(form({ quantity: "51" })).ok).toBe(false);
  });
});

describe("spec text", () => {
  it("reads back in words", () => {
    const spec = { ...DEFAULT_SPEC, undershelf: "two" as const, gantry: "double-400" as const, castors: true };
    expect(specLines(spec).map((l) => l.value)).toContain("Two undershelves");
    const msg = specMessage(spec);
    expect(msg).toContain("Size (W x D x H): 1200 x 700 x 900mm");
    expect(msg).toContain("Gantry: Double tier, 400mm deep");
    expect(msg).toContain("Castors: Castors");
  });
});
