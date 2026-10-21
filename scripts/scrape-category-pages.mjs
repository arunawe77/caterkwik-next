// Reads each shop category's banner image and introduction from the live caterkwik.co.uk page, so the category pages
// here can carry the same words and picture the old pages rank on. Resumable: categories already in the output are skipped.
//
//   node --env-file=.env scripts/scrape-category-pages.mjs [--limit N]
//   node --env-file=.env scripts/scrape-category-pages.mjs --apply     write src/data/category-pages.json into the database
//
// Banners are saved under public/assets/img/banners/ and served by the app, so they outlive the old site.
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const OUT = "src/data/category-pages.json";
const BANNERS = "public/assets/img/banners";
const ORIGIN = "https://www.caterkwik.co.uk";
const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1] ?? true; };
const limit = Number(arg("--limit")) || Infinity;
const CONCURRENCY = 6;

const db = new PrismaClient();
const result = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};

if (process.argv.includes("--apply")) {
  let n = 0;
  for (const [slug, v] of Object.entries(result)) {
    // A database not in UTF-8 refuses a few symbols (fractions, say): retry without them rather than lose the row.
    const save = (d) => db.category.updateMany({ where: { slug }, data: { image: v.image ?? null, description: d ?? null } });
    try { n += (await save(v.description)).count; }
    catch { n += (await save(v.description?.replace(/[^-ÿ‘’“”–—…]/g, ""))).count; }
  }
  console.log(`Updated ${n} categories`);
  await db.$disconnect();
  process.exit(0);
}

const entities = { "&amp;": "&", "&nbsp;": " ", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&pound;": "£", "&rsquo;": "’", "&lsquo;": "‘", "&ndash;": "–", "&mdash;": "—" };
const decode = (s) => s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&[a-z]+;|&#39;/gi, (m) => entities[m.toLowerCase()] ?? m);

// The introduction is plain paragraphs: tags, embedded videos and the old site's layout are dropped.
function introOf(html) {
  const m = /<p[^>]*class=["']lead["'][^>]*>([\s\S]*?)<\/p>\s*(?:<div class=["']logo-carousel|<\/div>)/i.exec(html) ?? /<p[^>]*class=["']lead["'][^>]*>([\s\S]*?)<\/p>/i.exec(html);
  if (!m) return null;
  const text = decode(
    m[1].replace(/<iframe[\s\S]*?<\/iframe>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, " "),
  );
  const paras = text.split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const out = paras.join("\n\n");
  return out.length > 20 ? out : null;
}

function bannerOf(html) {
  const m = /<!--banner_image-->([\s\S]*?)<!--\/banner_image-->/i.exec(html);
  const src = m && /<img[^>]+src=['"]([^'"]+)['"]/i.exec(m[1]);
  return src ? new URL(src[1], ORIGIN).href : null;
}

async function get(url, binary) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; CaterkwikMigration/1.0)" }, redirect: "follow" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (e) {
      if (attempt === 2) { console.error(`  ${url}: ${e.message}`); return undefined; }
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
}

fs.mkdirSync(BANNERS, { recursive: true });
const categories = (await db.category.findMany({ where: { sourceUrl: { not: null } }, select: { slug: true, sourceUrl: true }, orderBy: { sortOrder: "asc" } }))
  .filter((c) => !(c.slug in result)).slice(0, limit);
console.log(`${categories.length} categories to read`);

const saved = new Map(); // banner url -> local path, so a banner shared by many categories is fetched once
async function banner(url) {
  if (saved.has(url)) return saved.get(url);
  const file = new URL(url).pathname.split("/").filter(Boolean).slice(-2).join("-").toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  const local = `/assets/img/banners/${file}`;
  if (!fs.existsSync(path.join(BANNERS, file))) {
    const data = await get(url, true);
    if (!data || data.length < 500) { saved.set(url, null); return null; }
    fs.writeFileSync(path.join(BANNERS, file), data);
  }
  saved.set(url, local);
  return local;
}

let done = 0, queue = [...categories];
const save = () => fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
async function worker() {
  for (let c; (c = queue.shift()); ) {
    const html = await get(`${ORIGIN}${c.sourceUrl}/`);
    if (html === undefined) continue; // fetch error: retry on the next run
    const entry = {};
    if (html) {
      const b = bannerOf(html);
      const image = b && (await banner(b));
      const description = introOf(html);
      if (image) entry.image = image;
      if (description) entry.description = description;
    }
    result[c.slug] = entry;
    if (++done % 50 === 0) { save(); console.log(`${done}/${categories.length}`); }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
save();
const withBoth = Object.values(result).filter((v) => v.image && v.description).length;
console.log(`Done. ${Object.keys(result).length} categories read; ${Object.values(result).filter((v) => v.image).length} banners, ${Object.values(result).filter((v) => v.description).length} introductions, ${withBoth} with both.`);
await db.$disconnect();
