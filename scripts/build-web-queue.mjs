// Orders every Cooking product by how little we know about it and writes batches for web research.
// Thinnest first, so the first waves fix the worst pages. Products already researched are skipped.
//
//   node scripts/build-web-queue.mjs [batchSize=12]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f, fb) => (fs.existsSync(path.join(root, f)) ? JSON.parse(fs.readFileSync(path.join(root, f), "utf8")) : fb);
const size = Number(process.argv[2] ?? 12);
const seed = read("src/data/cooking-seed.json", { products: [] });
const rich = {};
const shardDir = path.join(root, "src/data/rich");
for (const f of fs.readdirSync(shardDir)) if (f.endsWith(".json")) Object.assign(rich, JSON.parse(fs.readFileSync(path.join(shardDir, f), "utf8")));

const done = new Set();
const webDir = path.join(root, "src/data/web");
fs.mkdirSync(webDir, { recursive: true });
for (const f of fs.readdirSync(webDir)) if (f.endsWith(".json")) for (const r of JSON.parse(fs.readFileSync(path.join(webDir, f), "utf8"))) done.add(r.id);

// Lower = thinner. Ovens already in the catalogue are included too once the Cooking products are done.
const thin = (r) => !r ? 0 : Object.keys(r.specs).length + (r.overview.length ? 6 : 0) + Math.min(r.features.length, 6) + (r.downloads.length ? 4 : 0) + Math.min(r.extra.length, 5);
const ovenIds = new Set(read("src/data/scrape.json", []).flatMap((c) => c.products.map((p) => decodeURIComponent(p.href.split("showprod_")[1].split(/[&#]/)[0]).toLowerCase())));
const items = [...seed.products.map((p) => ({ p, oven: false })), ...[...ovenIds].filter((id) => rich[id]).map((id) => ({ p: { id, name: rich[id].mpn ?? id, brand: rich[id].brand, token: id, legacyUrl: "" }, oven: true }))]
  .filter(({ p }) => !done.has(p.id))
  .sort((a, b) => Number(a.oven) - Number(b.oven) || thin(rich[a.p.id]) - thin(rich[b.p.id]));

const queueDir = path.join(root, "src/data/web-queue");
fs.rmSync(queueDir, { recursive: true, force: true });
fs.mkdirSync(queueDir, { recursive: true });
let n = 0;
for (let i = 0; i < items.length; i += size) {
  const batch = items.slice(i, i + size).map(({ p }) => ({
    id: p.id, name: p.name, brand: rich[p.id]?.brand ?? p.brand, mpn: rich[p.id]?.mpn ?? null, caterkwikUrl: p.legacyUrl || null,
    known: Object.fromEntries(Object.entries(rich[p.id]?.specs ?? {}).map(([k, s]) => [k, `${s.value}${s.unit ? " " + s.unit : ""}`])),
  }));
  fs.writeFileSync(path.join(queueDir, `batch-${String(++n).padStart(3, "0")}.json`), JSON.stringify(batch, null, 1));
}
console.log(`${items.length} products queued in ${n} batches of up to ${size}; ${done.size} already researched`);
