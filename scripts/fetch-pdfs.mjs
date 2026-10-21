// Downloads the specification sheets and brochures each product page links to, turns them into
// text with pdftotext, and stores the text per product in src/data/pdf-text.json. Manuals are
// skipped by default (large, mostly installation prose); pass --manuals to include them. One
// document shared by several products is downloaded once.
//
//   node scripts/fetch-pdfs.mjs [--manuals]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const details = JSON.parse(fs.readFileSync(path.join(root, "src/data/details.json"), "utf8"));
const outFile = path.join(root, "src/data/pdf-text.json");
const manuals = process.argv.includes("--manuals");
const WANT = /spec|data\s*sheet|datasheet|technical|brochure|catalogue|flyer|dimension|features|overview/i;
const SKIP = /manual|instruction|install|service|parts|warranty|checklist|terms|cleaning|recipe/i;
const MAX_CHARS = 24000;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ckpdf-"));

const wanted = (dl) => WANT.test(dl.label + " " + dl.url) && (manuals || !SKIP.test(dl.label)) || (manuals && /manual/i.test(dl.label));
const urls = new Map(); // url -> label
for (const d of Object.values(details)) for (const dl of d.downloads ?? []) if (/\.pdf($|\?)/i.test(dl.url) && wanted(dl)) urls.set(dl.url, dl.label);
console.log(`${urls.size} distinct PDFs to read`);

const cache = fs.existsSync(path.join(root, "src/data/.pdf-cache.json")) ? JSON.parse(fs.readFileSync(path.join(root, "src/data/.pdf-cache.json"), "utf8")) : {};
const queue = [...urls.keys()].filter((u) => !(u in cache));
let done = 0;
const worker = async () => {
  while (queue.length) {
    const url = queue.shift();
    try {
      const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Caterkwik staging data check)" }, signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(String(r.status));
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 25 * 1024 * 1024) throw new Error("too large");
      const file = path.join(tmp, `${done++}.pdf`);
      fs.writeFileSync(file, buf);
      const text = execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", file, "-"], { maxBuffer: 64 * 1024 * 1024, timeout: 60000 }).toString("utf8");
      cache[url] = text.replace(/\f/g, "\n").replace(/[ \t]{3,}/g, "  ").slice(0, MAX_CHARS);
      fs.unlinkSync(file);
    } catch (e) { cache[url] = null; console.error(`skip ${url}: ${e.message}`); }
    if (done % 25 === 0) fs.writeFileSync(path.join(root, "src/data/.pdf-cache.json"), JSON.stringify(cache));
    await new Promise((r) => setTimeout(r, 200));
  }
};
await Promise.all([worker(), worker(), worker()]);
fs.writeFileSync(path.join(root, "src/data/.pdf-cache.json"), JSON.stringify(cache));

const out = {};
for (const [id, d] of Object.entries(details)) {
  const docs = (d.downloads ?? []).filter((dl) => cache[dl.url]).map((dl) => ({ label: dl.label, url: dl.url, text: cache[dl.url] }));
  if (docs.length) out[id] = docs;
}
fs.writeFileSync(outFile, JSON.stringify(out));
console.log(`${Object.keys(out).length} products have spec-sheet text; ${Object.values(cache).filter((v) => v === null).length} PDFs could not be read`);
fs.rmSync(tmp, { recursive: true, force: true });
