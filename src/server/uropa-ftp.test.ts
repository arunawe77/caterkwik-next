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

  it("needs host, user and password", () => {
    expect(uropaConfigured({ UROPA_FTP_HOST: "h", UROPA_FTP_USER: "u", UROPA_FTP_PASSWORD: "p" } as never)).toBe(true);
    expect(uropaConfigured({ UROPA_FTP_HOST: "h" } as never)).toBe(false);
  });
});
