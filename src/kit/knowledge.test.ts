import { describe, expect, it } from "vitest";
import { PRODUCT_FACTS, SYSTEM_PROMPT, systemPrompt } from "@/kit/knowledge";

describe("systemPrompt", () => {
  it("is the product-page prompt when nothing is added", () => {
    expect(systemPrompt()).toBe(SYSTEM_PROMPT);
    expect(SYSTEM_PROMPT).toContain(PRODUCT_FACTS);
  });

  it("swaps the product facts for the extra facts rather than stacking them", () => {
    const out = systemPrompt("CATALOGUE FACTS");
    expect(out).toContain("CATALOGUE FACTS");
    expect(out).not.toContain(PRODUCT_FACTS);
    expect(out.length).toBeLessThan(SYSTEM_PROMPT.length);
  });
});
