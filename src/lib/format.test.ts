import { describe, expect, it } from "vitest";
import { money, plural } from "@/lib/format";

describe("format", () => {
  it("formats pounds with thousands separators and pence", () => {
    expect(money(1337.99)).toBe("£1,337.99");
    expect(money(0)).toBe("£0.00");
    expect(money(5000)).toBe("£5,000.00");
  });

  it("pluralises", () => {
    expect(plural(1, "model")).toBe("1 model");
    expect(plural(0, "model")).toBe("0 models");
    expect(plural(442, "model")).toBe("442 models");
  });
});
