import { describe, expect, it } from "vitest";
import { newestCsv, uropaConfigured, type RemoteFile } from "@/server/uropa-ftp";

const f = (name: string, day: number | undefined): RemoteFile => ({ name, size: 1, modifiedAt: day ? new Date(2026, 9, day) : undefined });

describe("uropa ftp", () => {
  it("picks the newest matching CSV, as Uropa advises for duplicates", () => {
    const files = [f("Price_old.csv", 1), f("PRICE_new.CSV", 20), f("stock.csv", 21), f("licence.pdf", 22)];
    expect(newestCsv(files, /price/i)?.name).toBe("PRICE_new.CSV");
    expect(newestCsv(files)?.name).toBe("stock.csv");
    expect(newestCsv([f("a.csv", undefined), f("b.csv", 3)])?.name).toBe("b.csv");
    expect(newestCsv([f("licence.pdf", 1)])).toBeNull();
  });

  it("falls back to the timestamp in the name when the listing has no dates", () => {
    const files = [f("Price_20261020-050253.csv", undefined), f("Price_20261029-050155.csv", undefined), f("Price_20261024-050411.csv", undefined)];
    expect(newestCsv(files, /^price/i)?.name).toBe("Price_20261029-050155.csv");
  });

  it("needs host, user and password", () => {
    expect(uropaConfigured({ UROPA_FTP_HOST: "h", UROPA_FTP_USER: "u", UROPA_FTP_PASSWORD: "p" } as never)).toBe(true);
    expect(uropaConfigured({ UROPA_FTP_HOST: "h" } as never)).toBe(false);
  });
});
