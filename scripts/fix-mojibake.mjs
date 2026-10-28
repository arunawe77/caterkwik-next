// Repairs text that was read as Latin-1 when it was UTF-8 (a bullet shown as "a-circumflex, control, cent", a pound sign shown as
// "A-circumflex, pound") in the JSON data files and, optionally, in a database.
//
//   node scripts/fix-mojibake.mjs                                 reports what it would change in src/data
//   node scripts/fix-mojibake.mjs --write                         rewrites those files
//   node scripts/fix-mojibake.mjs --db=postgresql://...           reports for a database (text and JSON columns)
//   node scripts/fix-mojibake.mjs --db=postgresql://... --write   repairs it in place
//
// Each broken sequence is decoded on its own, and only when UTF-8 decoding gives clean text. A bullet whose middle byte was already
// lost (a-circumflex, "?", cent) is restored too. The database address must be given here: it never falls back to DATABASE_URL, so this
// cannot reach a live database by accident.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const write = process.argv.includes("--write");

// Windows-1252 bytes 0x80-0x9f appear as these characters when text was mis-decoded as cp1252 rather than Latin-1.
const CP1252 = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89],
  [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95],
  [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);
const CONT = "\\u0080-\\u00bf\\u0192\\u02c6\\u02dc\\u0152\\u0153\\u0160\\u0161\\u0178\\u017d\\u017e\\u2013\\u2014\\u2018-\\u201e\\u2020-\\u2022\\u2026\\u2030\\u2039\\u203a\\u20ac\\u2122";
// A lead byte (0xC2-0xF4 shown as a Latin-1 letter) followed by one or more continuation bytes.
const RUN = new RegExp(`[\\u00c2-\\u00f4][${CONT}]+`, "g");
const BAD = new RegExp(`[\\u00c2-\\u00f4][${CONT}]|\\u00e2\\?\\u00a2`);

function decodeRun(run) {
  const bytes = [];
  for (const ch of run) {
    const c = ch.codePointAt(0);
    if (c < 256) bytes.push(c);
    else if (CP1252.has(c)) bytes.push(CP1252.get(c));
    else return run;
  }
  const out = Buffer.from(bytes).toString("utf8");
  return out.includes("�") ? run : out;
}

export function repair(s) {
  if (!BAD.test(s)) return s;
  return s.replace(/â\?¢/g, "•").replace(RUN, decodeRun);
}

function fix(v) {
  if (typeof v === "string") return repair(v);
  if (Array.isArray(v)) return v.map(fix);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)]));
  return v;
}

function countChanged(a, b) {
  if (typeof a === "string") return a !== b ? 1 : 0;
  if (a && typeof a === "object") return Object.keys(a).reduce((n, k) => n + countChanged(a[k], b[k]), 0);
  return 0;
}

let files = 0, strings = 0;
function walkDir(dir) {
  for (const name of readdirSync(dir)) {
    // Raw text pulled out of PDFs legitimately contains odd letters; it is not mis-decoded UTF-8, so it is left alone.
    if (name.startsWith(".") || name.startsWith("pdf-")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkDir(p);
    else if (p.endsWith(".json")) {
      const raw = readFileSync(p, "utf8");
      if (!BAD.test(raw)) continue;
      const before = JSON.parse(raw), after = fix(before);
      const n = countChanged(before, after);
      if (!n) continue;
      files++; strings += n;
      console.log(`${p}: ${n} strings`);
      // Keep the file's own layout: single-line files stay single-line.
      if (write) writeFileSync(p, JSON.stringify(after, null, raw.match(/\n( +)\S/)?.[1].length) + (raw.endsWith("\n") ? "\n" : ""));
    }
  }
}

const dbArg = process.argv.find((a) => a.startsWith("--db="));
if (!dbArg) {
  walkDir("src/data");
  console.log(`${write ? "Fixed" : "Would fix"} ${strings} strings in ${files} files.`);
} else {
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url: dbArg.slice(5) } } });
  const cols = await db.$queryRawUnsafe("select table_name t, column_name c, data_type d from information_schema.columns where table_schema='public' and data_type in ('text','character varying','jsonb','json')");
  let changed = 0;
  for (const { t, c, d } of cols) {
    const rows = await db.$queryRawUnsafe(`select ctid::text id, "${c}"::text v from "${t}" where "${c}" is not null`);
    for (const r of rows) {
      if (!BAD.test(r.v)) continue;
      const isJson = d.startsWith("json");
      const parsed = isJson ? JSON.parse(r.v) : null;
      const repaired = isJson ? fix(parsed) : repair(r.v);
      // A JSON column is compared by content, not spacing: Postgres and JSON.stringify space the same value differently.
      if (isJson ? countChanged(parsed, repaired) === 0 : repaired === r.v) continue;
      const fixed = isJson ? JSON.stringify(repaired) : repaired;
      changed++;
      console.log(`${t}.${c} ${r.id}`);
      if (write) await db.$executeRawUnsafe(`update "${t}" set "${c}" = $1${isJson ? `::${d}` : ""} where ctid = $2::tid`, fixed, r.id);
    }
  }
  console.log(`${write ? "Fixed" : "Would fix"} ${changed} database values.`);
  await db.$disconnect();
}
