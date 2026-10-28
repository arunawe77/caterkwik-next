// One-off: reads the old site's case-studies page, writes src/data/case-studies.json and copies the images to
// public/assets/img/case-studies/.   node scripts/scrape-case-studies.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://www.caterkwik.co.uk";
const imgDir = path.join(root, "public/assets/img/case-studies");
fs.mkdirSync(imgDir, { recursive: true });

const decode = (s) => s
  .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#0?39;|&rsquo;/g, "’").replace(/&nbsp;/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const text = (html) => decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
  .split("\n").map((l) => l.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();

const page = await (await fetch(`${ORIGIN}/case-studies.shtml`)).text();
const blocks = page.split(/<a href="/).slice(1).filter((b) => b.includes("project-banner"));
const out = [];
for (const b of blocks) {
  const href = b.match(/^([^"]*)"/)[1];
  const img = b.match(/<img src="\/images\/projects\/([^"]+)"/)?.[1];
  const title = b.match(/<h3>([\s\S]*?)<\/h3>/)?.[1];
  const body = b.match(/<p>([\s\S]*?)<\/p>/)?.[1];
  if (!img || !title || !body) continue;
  const file = decodeURIComponent(img);
  const dest = path.join(imgDir, file);
  if (!fs.existsSync(dest)) {
    const r = await fetch(`${ORIGIN}/images/projects/${img}`);
    if (r.ok) fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    else console.warn("image failed", img, r.status);
  }
  out.push({
    title: text(title),
    body: text(body),
    image: fs.existsSync(dest) ? file : null,
    document: href.startsWith("/docs/") ? href : null,
  });
}
fs.writeFileSync(path.join(root, "src/data/case-studies.json"), JSON.stringify(out, null, 2) + "\n");
console.log(out.length, "case studies");
