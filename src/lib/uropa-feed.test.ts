import { describe, expect, it } from "vitest";
import { categoryIndex, cleanText, draftName, mergeUropa, pickCategory, ukDate } from "@/lib/uropa-feed";
import { csvRows } from "@/lib/suppliers";

const NOW = new Date("2026-10-29T10:00:00Z");
const price = [
  "ProductCode,PriceList,NetPrice,RRP,WebOnlyPrice,StartDate,ExpiryDate,QuantityFrom,QuantityTo",
  "A1,PLATCK,10.00000,15.99000,14.00000,04/08/2026 00:00:00,,1.00000,999999.00000",
  "A1,PLATCK,9.00000,15.99000,14.00000,04/08/2026 00:00:00,,10.00000,999999.00000",
  "B2,PLATCK,5.50000,8.99000,7.50000,04/08/2026 00:00:00,,1.00000,999999.00000",
  "OLD,PLATCK,5.00000,8.00000,7.00000,01/01/2025 00:00:00,01/02/2026 00:00:00,1.00000,999999.00000",
  "LATER,PLATCK,5.00000,8.00000,7.00000,01/12/2026 00:00:00,,1.00000,999999.00000",
  "NONAME,PLATCK,5.00000,8.00000,7.00000,01/01/2026 00:00:00,,1.00000,999999.00000",
  "GONE,PLATCK,5.00000,8.00000,7.00000,01/01/2026 00:00:00,,1.00000,999999.00000",
].join("\r\n");
const stock = ["Product Code,Ship Direct Flag,Delivery Flash,Stock Level,Stock Promise Date,DROPPEDLINE", "A1,STOCKED,,12,,N", "B2,DIRECT,DF_1DAY,0,,Y"].join("\n");
const product = [
  'ProductCode,"ShortDescription",VatCode,"Name","LongDescription",BrandName,ARCHIVED,SUPPLIER_REF,WebClassName,WebSectionName,WebGroupName',
  'A1,"short",STD,"Bib Apron","Long, with a comma",Whites,N,REF-A1,Clothing,Aprons,Bib Aprons',
  "B2,,STD,Fryer,,Lincat,N,B2,Cooking,Fryers,",
  "OLD,,STD,Old thing,,X,N,,,,",
  "LATER,,STD,Later thing,,X,N,,,,",
  "NONAME,,STD,,,X,N,,,,",
  "GONE,,STD,Archived thing,,X,Y,,,,",
  "NOPRICE,,STD,Unpriced thing,,X,N,,,,",
].join("\n");

describe("mergeUropa", () => {
  const m = mergeUropa({ price, stock, product }, NOW);

  it("joins price, stock and product on the code and keeps only the unit price line", () => {
    expect(m.rows.map((r) => r.sku)).toEqual(["A1", "B2"]);
    expect(m.rows[0]).toMatchObject({ sku: "A1", mpn: "REF-A1", brand: "Whites", name: "Bib Apron", costExPence: 1000, rrpPence: 1599, webPence: 1400, stockQty: 12, dropped: false, description: "Long, with a comma", groupName: "Clothing > Aprons > Bib Aprons" });
  });

  it("flags dropped lines and does not repeat the code as a part number", () => {
    expect(m.rows[1]).toMatchObject({ sku: "B2", mpn: null, dropped: true, stockQty: 0, groupName: "Cooking > Fryers" });
  });

  it("leaves out expired, not-yet-started, archived and unnamed lines, and says how many", () => {
    expect(m.retired).toBe(3);
    expect(m.noProduct).toBe(1);
  });

  it("refuses a file without the columns it needs", () => {
    expect(() => mergeUropa({ price: "Code,Cost\nA,1", stock, product }, NOW)).toThrow(/price file has no ProductCode/);
  });
});

describe("helpers", () => {
  it("puts real characters back where a Windows apostrophe was misread as a control character", () => {
    expect(cleanText(`Chef${String.fromCharCode(0x92)}s ${String.fromCharCode(0x96)} knife${String.fromCharCode(0x81)}`)).toBe("Chef’s – knife");
    expect(cleanText("Plain text, £5")).toBe("Plain text, £5");
  });

  it("reads UK dates", () => {
    expect(ukDate("04/08/2026 00:00:00")?.toISOString()).toBe("2026-08-04T00:00:00.000Z");
    expect(ukDate("")).toBeNull();
  });

  it("streams rows the same way as before, including quoted newlines", () => {
    expect([...csvRows('a,b\r\n"x\ny",2\r\n\r\n')]).toEqual([["a", "b"], ["x\ny", "2"]]);
  });

  it("places a product by its most specific category name that is unique, else the fallback", () => {
    const idx = categoryIndex([{ slug: "aprons", label: "Aprons" }, { slug: "fryers", label: "Fryers" }, { slug: "a-bibs", label: "Bibs" }, { slug: "b-bibs", label: "Bibs" }]);
    expect(pickCategory(idx, "Clothing > Aprons > Bib Aprons", "other")).toBe("aprons");
    expect(pickCategory(idx, "Cooking > Fryers", "other")).toBe("fryers");
    expect(pickCategory(idx, "Misc > Bibs", "other")).toBe("other"); // two categories share the label
    expect(pickCategory(idx, null, "other")).toBe("other");
  });

  it("puts the brand in front of a name unless it is already there", () => {
    expect(draftName("Bib Apron", "Whites")).toBe("Whites Bib Apron");
    expect(draftName("Whites Bib Apron", "Whites")).toBe("Whites Bib Apron");
    expect(draftName("Apron", null)).toBe("Apron");
  });
});
