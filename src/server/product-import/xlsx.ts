import { createReadStream } from "node:fs";
import { Unzip, UnzipInflate, strFromU8 } from "fflate";

// A streaming reader for the Caterkwik crawl workbooks. They are too big to open whole (one sheet is 300 MB of XML),
// so only the sheets asked for are inflated, and rows are cut out of the XML as it arrives.
// It reads the shape openpyxl writes: inline strings, no shared string table.

export type Row = (string | null)[];

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };
const unescapeXml = (s: string) =>
  s.includes("&")
    ? s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
        e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e] ?? m))
    : s;

const columnIndex = (ref: string) => {
  let n = 0;
  for (let i = 0; i < ref.length; i++) n = n * 26 + ref.charCodeAt(i) - 64;
  return n - 1;
};

const CELL = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
const TEXT = /<t[^>]*>([\s\S]*?)<\/t>|<v>([\s\S]*?)<\/v>/;

/** One `<row>...</row>` of sheet XML as an array indexed by column. Blank cells are null. */
export function parseRow(xml: string): Row {
  const out: Row = [];
  for (const m of xml.matchAll(CELL)) {
    const hit = m[3] ? TEXT.exec(m[3]) : null;
    const value = hit ? unescapeXml(hit[1] ?? hit[2] ?? "") : "";
    out[columnIndex(m[1])] = value === "" ? null : value;
  }
  return out;
}

// Chunks are cut on `</row>`, so a row split across two chunks is completed by the next one.
export class RowSplitter {
  private buf = "";
  private readonly onRow: (row: Row) => void;
  constructor(onRow: (row: Row) => void) {
    this.onRow = onRow;
  }
  push(text: string) {
    this.buf += text;
    let i: number;
    while ((i = this.buf.indexOf("</row>")) >= 0) {
      const chunk = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 6);
      const start = chunk.lastIndexOf("<row ");
      if (start >= 0) this.onRow(parseRow(chunk.slice(start)));
    }
  }
}

/** Streams the file through the unzipper, handing each entry the callback picks to `onEntry`. */
function scan(path: string, pick: (name: string) => ((data: Uint8Array, final: boolean) => void) | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const unzip = new Unzip((file) => {
      const handler = pick(file.name);
      if (!handler) return;
      file.ondata = (err, data, final) => (err ? reject(err) : handler(data, final));
      file.start();
    });
    unzip.register(UnzipInflate);
    const stream = createReadStream(path, { highWaterMark: 1 << 20 });
    stream.on("data", (chunk) => {
      try {
        unzip.push(chunk as Uint8Array, false);
      } catch (err) {
        stream.destroy(err as Error);
      }
    });
    stream.on("end", () => {
      try {
        unzip.push(new Uint8Array(0), true);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
    stream.on("error", reject);
  });
}

const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];

async function sheetFiles(path: string): Promise<Map<string, string>> {
  const texts = new Map<string, string[]>();
  await scan(path, (name) => {
    if (name !== "xl/workbook.xml" && name !== "xl/_rels/workbook.xml.rels") return null;
    const parts: Uint8Array[] = [];
    texts.set(name, []);
    return (data, final) => {
      parts.push(data);
      if (final) texts.get(name)!.push(strFromU8(Uint8Array.from(parts.flatMap((p) => Array.from(p)))));
    };
  });
  const workbook = texts.get("xl/workbook.xml")?.[0];
  const rels = texts.get("xl/_rels/workbook.xml.rels")?.[0];
  if (!workbook || !rels) throw new Error("This is not an Excel workbook (.xlsx).");

  const target = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const to = attr(m[0], "Target");
    if (id && to) target.set(id, to.replace(/^\/?(xl\/)?/, "xl/"));
  }
  const byName = new Map<string, string>();
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], "name");
    const id = attr(m[0], "r:id");
    const file = id ? target.get(id) : undefined;
    if (name && file) byName.set(unescapeXml(name), file);
  }
  return byName;
}

export interface SheetRequest {
  /** Names the sheet may go by, in order of preference (the two workbooks name some differently). */
  names: string[];
  onRow: (row: Row) => void;
}

/** Reads the requested sheets in one pass. Returns the names that were found and read. */
export async function readSheets(path: string, wanted: Record<string, SheetRequest>): Promise<Record<string, string | null>> {
  const files = await sheetFiles(path);
  const found: Record<string, string | null> = {};
  const byFile = new Map<string, { key: string; splitter: RowSplitter; decoder: TextDecoder }>();
  for (const [key, req] of Object.entries(wanted)) {
    const name = req.names.find((n) => files.has(n));
    found[key] = name ?? null;
    if (name) byFile.set(files.get(name)!, { key, splitter: new RowSplitter(req.onRow), decoder: new TextDecoder() });
  }
  await scan(path, (entry) => {
    const sheet = byFile.get(entry);
    if (!sheet) return null;
    return (data, final) => {
      sheet.splitter.push(sheet.decoder.decode(data, { stream: !final }));
    };
  });
  return found;
}
