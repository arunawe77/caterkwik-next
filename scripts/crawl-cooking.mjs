// Walks the whole Cooking department on caterkwik.co.uk: reads the category tree from the site's
// own navigation, lists every category page, and writes each product once with every category it
// appears in. Output: src/data/cooking.json. A category that parses to zero products is reported,
// never silently dropped.
//
//   node scripts/crawl-cooking.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://www.caterkwik.co.uk";
const ENT = { amp: "&", nbsp: " ", pound: "£", quot: '"', apos: "'", lt: "<", gt: ">" };
const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const strip = (s) => decode((s ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const money = (s) => (s ? Number(s.replace(/,/g, "")) : null);

async function get(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Caterkwik staging data check)" }, redirect: "follow", signal: AbortSignal.timeout(45000) });
      const body = await r.text();
      if (r.ok && body.length > 20000) return body;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(`fetch failed: ${url}`);
}

// The Cooking block of the main navigation: nested <ul>/<li class="parent"> to any depth.
function navTree(h) {
  const start = h.indexOf('<li class="single top-parent"><a href="/shop/commercial-catering-equipment/commercial-cooking-equipment/">');
  if (start < 0) throw new Error("Cooking navigation not found");
  const next = h.slice(start + 10).search(/<li class="[^"]*top-parent/); const cut = next < 0 ? -1 : start + 10 + next;
  const block = h.slice(start, cut < 0 ? undefined : cut);
  const cats = [];
  const stack = [];
  const re = /<li\b[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>|<\/li>|<ul\b|<\/ul>/gi;
  let m, depth = 0;
  const open = []; // [depth] -> category path
  for (const t of block.matchAll(re)) {
    m = t[0].toLowerCase();
    if (m.startsWith("<ul")) depth++;
    else if (m.startsWith("</ul")) depth--;
    else if (m.startsWith("<li")) {
      const href = t[1].trim().replace(/^https?:\/\/www\.caterkwik\.co\.uk/, "");
      const label = strip(t[2]);
      if (!href.startsWith("/shop/")) continue;
      const parent = stack.length ? stack[stack.length - 1] : null;
      cats.push({ url: href, label, parent: parent?.url ?? null });
      stack.push({ url: href });
      open.push(stack.length);
    } else if (m === "</li>") stack.pop();
  }
  const seen = new Set();
  return cats.filter((c) => c.url !== "/shop/commercial-catering-equipment/commercial-cooking-equipment/" && !seen.has(c.url) && seen.add(c.url));
}

function parseBox(b) {
  const p = {};
  p.name = strip((b.match(/class="productname"[^>]*>([\s\S]*?)<\/a>/) ?? [])[1]);
  p.href = (b.match(/class="productname" href="([^"]+)"/) ?? [])[1] ?? null;
  p.img = (b.match(/SRC="([^"]*\/shop\/images\/products\/[^"]+)"/i) ?? [])[1] ?? null;
  p.ex = money((b.match(/class="item-price">\s*(?:&pound;|£)([\d,]+\.\d\d)/) ?? [])[1]);
  p.inc = money((b.match(/class="vat-price">\s*(?:&pound;|£)([\d,]+\.\d\d)/) ?? [])[1]);
  p.was = money((b.match(/class="prev-price">[\s\S]*?(?:&pound;?|£)([\d,]+\.\d\d)/) ?? [])[1]);
  p.dims = strip((b.match(/class="[^"]*item-dimensions">([\s\S]*?)<\/p>/) ?? [])[1]).replace(/^Dimensions: /, "") || null;
  p.starPct = +(b.match(/feefo_review_stars'><span style='width:([\d.]+)%/) ?? [])[1] || null;
  p.reviews = +(b.match(/class="num_reviews">\((\d+)\)/) ?? [])[1] || null;
  p.leaseWeek = money((b.match(/lease-content[\s\S]*?(?:&pound;|£)([\d,]+\.\d\d)\s*per week/) ?? [])[1]);
  p.discontinued = b.includes("Discontinued");
  p.poa = /item-price">\s*POA/.test(b);
  p.webExclusive = b.toUpperCase().includes("WEB EXCLUSIVE");
  return p;
}

const tokenOf = (href) => decodeURIComponent(href.split("showprod_")[1].split(/[&#]/)[0]);

const home = await get(`${SITE}/shop/commercial-catering-equipment/commercial-cooking-equipment/`);
const cats = navTree(home);
console.log(`${cats.length} categories in the Cooking navigation`);

const products = new Map();
const report = [];
const known = new Map(cats.map((c) => [c.url.replace(/\/$/, ""), c]));
const queue = [...cats];
const norm = (u) => decode(u).trim().replace(/^https?:\/\/www\.caterkwik\.co\.uk/, "");
const worker = async () => {
  for (;;) {
    const c = queue.shift();
    if (!c) { if (inflight === 0) return; await new Promise((r) => setTimeout(r, 200)); continue; }
    inflight++;
    try {
      const h = await get(SITE + c.url);
      const boxes = h.split('class="col three productbox"').slice(1);
      c.h1 = strip((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) ?? [])[1]) || c.label;
      c.count = boxes.length;
      // Sub-categories shown as tiles on the page itself, which the navigation may not list.
      const base = c.url.replace(/\/$/, "");
      for (const m of h.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const u = norm(m[1]);
        const k = u.replace(/\/$/, "");
        if (!u.startsWith(base + "/") || u.includes("?") || u.includes("#") || known.has(k)) continue;
        const sub = { url: u.endsWith("/") ? u : u + "/", label: strip(m[2]) || k.split("/").pop(), parent: c.url };
        known.set(k, sub); cats.push(sub); queue.push(sub);
      }
      for (const b of boxes) {
        const p = parseBox(b);
        if (!p.href || !p.href.includes("showprod_")) continue;
        const token = tokenOf(p.href);
        const key = token.toLowerCase();
        const have = products.get(key) ?? { ...p, token, categories: [] };
        if (!have.categories.includes(c.url)) have.categories.push(c.url);
        products.set(key, have);
      }
      report.push(`${String(boxes.length).padStart(4)}  ${c.parent ? "  " : ""}${c.label}`);
    } catch (e) { c.error = e.message; report.push(`FAIL  ${c.label}: ${e.message}`); }
    inflight--;
    await new Promise((r) => setTimeout(r, 250));
  }
};
let inflight = 0;
await Promise.all([worker(), worker(), worker()]);

// The navigation block also carries a few Food Prep and Furniture pages; they are not Cooking.
const OUTSIDE = new Set(["doughmixers", "furniture-lighting"]);
const rootOf = (u) => { const p = u.split("/").filter(Boolean); const i = p.indexOf("commercial-catering-equipment"); const r = p[i + 1]; return r === "commercial-cooking-equipment" ? p[i + 2] : r; };
for (let i = cats.length - 1; i >= 0; i--) if (OUTSIDE.has(rootOf(cats[i].url))) cats.splice(i, 1);
for (const [k, p] of products) { p.categories = p.categories.filter((u) => !OUTSIDE.has(rootOf(u))); if (!p.categories.length) products.delete(k); }
fs.writeFileSync(path.join(root, "src/data/cooking.json"), JSON.stringify({ crawled: new Date().toISOString().slice(0, 10), categories: cats, products: [...products.values()] }, null, 1));
console.log(report.sort().join("\n"));
console.log(`\n${products.size} unique products across ${cats.length} categories; ${cats.filter((c) => c.error).length} failed; ${cats.filter((c) => c.count === 0).length} empty`);
