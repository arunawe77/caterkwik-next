// Reads every oven's own page on caterkwik.co.uk and keeps what it publishes beyond the listing:
// feature bullets, identifiers, dimensions, power and special requirements, requirement icons,
// downloads, and the accessories it suggests. Raw text only: nothing is interpreted here, so
// src/lib/spec-extract.ts is the one place that decides what a line means, and a figure the page
// does not state stays absent.
//
//   node scripts/fetch-details.mjs [--force] [token ...]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "src/data/details.json");
const scrape = JSON.parse(fs.readFileSync(path.join(root, "src/data/scrape.json"), "utf8"));

const tokenOf = (href) => decodeURIComponent(href.split("showprod_")[1].split(/[&#]/)[0]);
const ENT = { amp: "&", nbsp: " ", pound: "£", quot: '"', apos: "'", lt: "<", gt: ">", deg: "°", times: "×", frac12: "½", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", bull: "•", reg: "®", trade: "™" };
const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z0-9]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const text = (html) => decode(html.replace(/<(br|\/p|\/li|\/div|\/h\d)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n").trim();
const lines = (html) => text(html).split("\n").map((l) => l.replace(/^[•\-\s]+/, "").trim()).filter((l) => l && l !== ">" && !/^[\w-]+="[^"]*">?$/.test(l));
const between = (h, a, b) => { const i = h.indexOf(a); if (i < 0) return ""; const j = h.indexOf(b, i + a.length); return h.slice(i + a.length, j < 0 ? undefined : j); };
const abs = (u) => new URL(decode(u), "https://www.caterkwik.co.uk/").href;

export function parseDetails(h) {
  const d = {};
  d.title = text(between(h, "<h1", "</h1>").replace(/^[^>]*>/, ""));
  d.metaDescription = decode((h.match(/<meta name="description" content="([^"]*)"/i) ?? [])[1] ?? "").trim() || null;
  d.metaKeywords = decode((h.match(/<meta name="keywords" content="([^"]*)"/i) ?? [])[1] ?? "").trim() || null;
  d.sellingPoints = lines(between(h, 'id="selling-points"', "</ul>"));

  const info = between(h, 'id="info-tab"', "<!--dimensions_tab_content-->");
  const ident = {};
  for (const m of info.matchAll(/<strong>([A-Z ]+):<\/strong>\s*([^<]*)/g)) ident[m[1].trim().toLowerCase()] = decode(m[2]).trim();
  d.brand = ident.brand ?? null;
  d.mpn = ident.mpn ?? null;
  d.condition = text((info.match(/itemprop="condition"[^>]*>([^<]*)/) ?? [])[1] ?? "") || null;
  d.details = lines(info.replace(/<div id="identifiers">[\s\S]*?<\/div>/, "").replace(/<img[^>]*>/g, "").replace(/<p style="display: none;"[\s\S]*?<\/p>/, ""));

  d.dimensions = lines(between(h, 'id="dimensions-tab"', "<!--/dimensions_tab_content-->")).filter((l) => l !== "Dimensions:");

  const req = between(h, 'id="requirements-tab"', "<!--/requirements_tab_content-->");
  d.requirementIcons = [...req.matchAll(/<li class="tooltip-wrap">[\s\S]*?<span>([^<]*)<\/span>/g)].map((m) => decode(m[1]).trim());
  const section = (label) => {
    const m = req.match(new RegExp(`<strong>${label}:</strong>([\\s\\S]*?)(?=</p>)`, "i"));
    return m ? lines(m[1]).filter((l) => !/^please refer to manufacturers? specification$/i.test(l)) : [];
  };
  d.power = section("Power Requirements");
  d.special = section("Special Requirements");

  d.downloads = [...between(h, 'id="downloads-tab"', "<!--/downloads_tab_content-->").matchAll(/<a href="([^"]+)"[^>]*>([^<]*)<\/a>/g)]
    .map((m) => ({ label: text(m[2]), url: abs(m[1]) }));
  d.checklists = [...between(h, 'id="checklist-tab"', "<!--/checklist_tab_content-->").matchAll(/<a href="([^"]+)"[^>]*>([^<]*)<\/a>/g)]
    .map((m) => ({ label: text(m[2]), url: abs(m[1]) }));

  d.related = [...between(h, 'id="associated-products-tab"', "<!--/associated_products-->").matchAll(/showprod_([^"&]+)"[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>\s*<\/a>\s*<p class="item-price">([^<]*)</g)]
    .map((m) => {
      const price = decode(m[3]).replace(/[£,\s]/g, "");
      return { token: decodeURIComponent(m[1]), name: text(m[2]), price: /^\d+(\.\d+)?$/.test(price) ? +price : null };
    });
  d.hasSpares = /class="spare-product|<!--spare_products-->\s*<div class="row">\s*<div[^>]*>\s*<a /i.test(h);
  return d;
}

async function get(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Caterkwik staging data check)" }, signal: AbortSignal.timeout(45000) });
      const body = await r.text();
      if (r.ok && body.length > 20000) return body;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(`fetch failed: ${url}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = args.filter((a) => !a.startsWith("--"));
  const hrefs = new Map();
  for (const cat of scrape) for (const p of cat.products) hrefs.set(tokenOf(p.href).toLowerCase(), p.href);
  const cooking = path.join(root, "src/data/cooking.json");
  if (fs.existsSync(cooking)) for (const p of JSON.parse(fs.readFileSync(cooking, "utf8")).products) hrefs.set(p.token.toLowerCase(), p.href.startsWith("http") ? p.href : "https://www.caterkwik.co.uk" + p.href);

  const have = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : {};
  const todo = [...hrefs].filter(([id]) => (only.length ? only.map((o) => o.toLowerCase()).includes(id) : force || !have[id]));
  console.log(`${todo.length} to fetch, ${Object.keys(have).length} cached`);
  const failed = [];
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const [id, href] = todo[i++];
      try {
        have[id] = { ...parseDetails(await get(href)), fetched: new Date().toISOString().slice(0, 10) };
      } catch (e) { failed.push(id); console.error(e.message); }
      if (i % 25 === 0) { console.log(`${i}/${todo.length}`); fs.writeFileSync(out, JSON.stringify(have)); }
      await new Promise((r) => setTimeout(r, 250));
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  fs.writeFileSync(out, JSON.stringify(Object.fromEntries(Object.entries(have).sort(([a], [b]) => a.localeCompare(b))), null, 1));
  console.log(`done. ${Object.keys(have).length} stored, ${failed.length} failed${failed.length ? ": " + failed.join(", ") : ""}`);
}
