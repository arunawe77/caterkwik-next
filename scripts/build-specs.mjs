// details.json (+ pdf-text.json when present) + cooking.json -> src/data/enriched.json, and a coverage
// report per family so a field that never fills is visible. Run after fetch-details / fetch-pdfs.
//
//   node scripts/build-specs.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enrich } from "../src/lib/spec-extract.ts";
import { fieldsFor, FAMILIES } from "../src/lib/spec-schema.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f, fallback) => (fs.existsSync(path.join(root, f)) ? JSON.parse(fs.readFileSync(path.join(root, f), "utf8")) : fallback);
const details = read("src/data/details.json", {});
const cooking = read("src/data/cooking.json", { products: [] });
const scrape = read("src/data/scrape.json", []);
const pdf = read("src/data/pdf-text.json", {});

const cats = new Map();
for (const p of cooking.products) cats.set(p.token.toLowerCase(), p.categories);
for (const c of scrape) for (const p of c.products) {
  const id = decodeURIComponent(p.href.split("showprod_")[1].split(/[&#]/)[0]).toLowerCase();
  if (!cats.has(id)) cats.set(id, [c.url]);
}

const out = {};
const cover = {};
for (const [id, d] of Object.entries(details)) {
  const e = enrich(cats.get(id) ?? [], { ...d, pdf: pdf[id] });
  out[id] = e;
  const c = (cover[e.family] ??= { n: 0, fields: {}, overview: 0, features: 0, extra: 0 });
  c.n++; c.overview += e.overview.length ? 1 : 0; c.features += e.features.length ? 1 : 0; c.extra += e.extra.length ? 1 : 0;
  for (const k of Object.keys(e.specs)) c.fields[k] = (c.fields[k] ?? 0) + 1;
}
fs.writeFileSync(path.join(root, "src/data/enriched.json"), JSON.stringify(out));
for (const fam of FAMILIES) {
  const c = cover[fam.id];
  if (!c) continue;
  console.log(`\n${fam.label} (${c.n}) overview ${c.overview} features ${c.features} extra-specs ${c.extra}`);
  console.log(fieldsFor(fam).map((f) => `${f.key} ${c.fields[f.key] ?? 0}`).join(" · "));
}
console.log(`\n${Object.keys(out).length} products enriched`);

// ── Cooking seed: every product the oven catalogue does not already hold ─────────────────────
const hub = read("src/data/hub.json", { types: [] });
const OVEN_SLUGS = new Set(hub.types.map((t) => t.slug));
const ovenTokens = new Set();
for (const c of scrape) for (const p of c.products) ovenTokens.add(decodeURIComponent(p.href.split("showprod_")[1].split(/[&#]/)[0]).toLowerCase());

const GROUPS = {
  fooddisplay: "Food display & servery", bainmaries: "Bain maries & food servers", commercialfryers: "Fryers & chip scuttles",
  pizzaovens: "Pizza ovens", "hotcupboards-carvery-units": "Hot cupboards, carvery & heated lamps", commercial_griddles: "Griddles",
  "combination-ovens": "Combination ovens", "combination-ovens-bonnet": "Combination ovens", "combination-ovens-other": "Combination ovens",
  "combination-ovens-falcon": "Combination ovens", "combination-ovens-rational": "Combination ovens",
  "induction_cooktops-": "Induction cooking", "induction-hobs": "Induction cooking", chargrills__charbroilers: "Chargrills & charbroilers",
  catering_barbecue_grills: "BBQ & hog roast", commercial_toasters: "Toasters", "bratt-pans": "Bratt pans, boiling pans & kettles",
  "contact-grillspanini-grills": "Contact & panini grills", boilingtops: "Boiling tops & hobs", pastaboilers: "Pasta boilers & rice cookers",
  commercial_rice_cookers: "Pasta boilers & rice cookers", smokers: "Smokers", salamander_grills: "Salamander grills",
  "commercial-microwaves": "Microwaves", "kebab-machines--kebab-knives": "Kebab machines", "high-speed-ovens": "High speed ovens",
  "waffle-makers": "Waffle makers", rotisserie: "Rotisseries", "sous-vide-cooking": "Sous-vide cooking", "hot-dog-equipment": "Hot dog equipment",
  crepemachines: "Crepe machines", atmosphericsteamers: "Steamers", "commercial-ovens": "Commercial ovens",
};
const segs = (u) => u.split("/").filter(Boolean);
const rootOf = (u) => { const p = segs(u); const i = p.indexOf("commercial-catering-equipment"); const r = p[i + 1]; return r === "commercial-cooking-equipment" ? p[i + 2] : r; };
const slugOf = (u) => segs(u).at(-1);
const catByUrl = new Map(cooking.categories.map((c) => [c.url, c]));
const used = new Map(); // slug -> url, to keep slugs unique across departments
const slugFor = (url) => {
  const last = slugOf(url);
  if (OVEN_SLUGS.has(last)) return last;
  let slug = last.replace(/^[_-]+|[_-]+$/g, "");
  for (const [s, u] of used) if (s === slug && u !== url) { slug = `${rootOf(url).replace(/^[_-]+|[_-]+$/g, "")}-${slug}`; break; }
  used.set(slug, url);
  return slug;
};
const tidy = (s) => s.replace(/\s+/g, " ").trim();
const seedTypes = new Map();
const seedProducts = [];
for (const p of cooking.products) {
  const id = p.token.toLowerCase();
  if (ovenTokens.has(id)) continue;
  const urls = [...p.categories].filter((u) => catByUrl.has(u)).sort((a, b) => segs(b).length - segs(a).length);
  if (!urls.length) continue;
  const slug = slugFor(urls[0]);
  const cat = catByUrl.get(urls[0]);
  if (!seedTypes.has(slug)) {
    const e0 = out[id];
    seedTypes.set(slug, { slug, label: tidy(cat.h1 || cat.label), group: GROUPS[rootOf(urls[0])] ?? "Other cooking equipment", family: e0?.family ?? "specialist" });
  }
  const d = details[id];
  const brand = d?.brand || null;
  const ex = p.ex, inc = p.inc;
  seedProducts.push({
    id, token: p.token, name: p.name, brand, type: slug,
    alsoIn: [...new Set(urls.slice(1).map(slugFor))].filter((s) => s !== slug),
    image: p.img ?? `https://www.caterkwik.co.uk/shop/images/products/${id}.jpg`,
    priceEx: ex, priceInc: inc, wasEx: p.was, leaseWeek: p.leaseWeek,
    stock: p.discontinued ? "discontinued" : ex === null ? "poa" : "in-stock",
    webExclusive: p.webExclusive, legacyUrl: p.href.startsWith("http") ? p.href : `https://www.caterkwik.co.uk${p.href}`, spec: null,
  });
}
// alsoIn may name categories that hold no product of their own; drop the ones that do not exist as types.
for (const p of seedProducts) p.alsoIn = p.alsoIn.filter((s) => seedTypes.has(s) || OVEN_SLUGS.has(s));
for (const t of seedTypes.values()) {
  const fam = FAMILIES.find((f) => f.id === t.family);
  t.audience = fam ? fam.decides : "";
}
const typesOut = [...seedTypes.values()].sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
fs.writeFileSync(path.join(root, "src/data/cooking-seed.json"), JSON.stringify({ types: typesOut, products: seedProducts }));
console.log(`cooking seed: ${seedProducts.length} products in ${typesOut.length} categories`);

// ── The rich record the product page reads: everything the page published, in one file ───────
const rich = {};
for (const [id, d] of Object.entries(details)) {
  const e = out[id];
  rich[id] = {
    family: e.family, overview: e.overview, features: e.features, specs: e.specs, extra: e.extra,
    dimensions: d.dimensions, power: d.power, special: d.special, icons: d.requirementIcons,
    downloads: d.downloads, checklists: d.checklists, related: d.related,
    mpn: d.mpn, brand: d.brand, keywords: d.metaKeywords, summary: d.sellingPoints,
    pdf: (pdf[id] ?? []).map((x) => ({ label: x.label, url: x.url })),
  };
}
// One file per leading character, loaded on demand, so a product page reads ~250 KB rather than the lot.
const shardDir = path.join(root, "src/data/rich");
fs.rmSync(shardDir, { recursive: true, force: true });
fs.mkdirSync(shardDir, { recursive: true });
const shards = {};
for (const [id, r] of Object.entries(rich)) (shards[id[0].replace(/[^a-z0-9]/, "_")] ??= {})[id] = r;
for (const [k, v] of Object.entries(shards)) fs.writeFileSync(path.join(shardDir, k + ".json"), JSON.stringify(v));
fs.writeFileSync(path.join(shardDir, "index.ts"),
  "// Generated by scripts/build-specs.mjs. Do not edit.\n" +
  "export const shardLoaders: Record<string, () => Promise<{ default: unknown }>> = {\n" +
  Object.keys(shards).sort().map((k) => "  " + JSON.stringify(k) + ": () => import(\"./" + k + ".json\"),").join("\n") + "\n};\n");
console.log("rich records: " + Object.keys(rich).length + " in " + Object.keys(shards).length + " shards");
