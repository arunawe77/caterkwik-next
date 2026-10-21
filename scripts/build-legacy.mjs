// Extracts the three approved demo pages from the original plain-Node site into
// src/legacy/*.json, so Next serves them exactly as they were signed off.
//
//   node scripts/build-legacy.mjs ..
//
// Each fragment holds the page's structured data, its body markup, and the scripts to run.
// URLs are left as the originals; src/lib/legacy-html.ts points them at the new pages at render time.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const source = resolve(process.argv[2] ?? "..");
const require = createRequire(join(source, "index.js"));
const out = resolve(import.meta.dirname, "../src/legacy");
mkdirSync(out, { recursive: true });

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
const attr = (attrs, name) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1];

function fragment(html, bodyEnd) {
  const start = html.indexOf("<main");
  const end = bodyEnd === "main" ? html.indexOf("</main>") + "</main>".length : html.indexOf('<footer class="site">');
  const tail = html.slice(html.indexOf("</footer>") + "</footer>".length, html.lastIndexOf("</body>"));

  const ld = [...html.slice(0, start).matchAll(SCRIPT)]
    .filter(([, attrs]) => attr(attrs, "type") === "application/ld+json")
    .map(([, , json]) => json);

  const scripts = [];
  const markup = tail.replace(SCRIPT, (whole, attrs, text) => {
    if (attr(attrs, "type") === "application/json") return whole; // inert data the page scripts read
    scripts.push(attr(attrs, "src") ? { src: attr(attrs, "src") } : { text });
    return "";
  });

  return { ld, main: html.slice(start, end), markup: markup.trim(), scripts };
}

const pages = {
  hub: () => fragment(require("./render-hub.js").page(), "main"),
  "six-burner": () => fragment(require("./render-six-burner.js").page(), "main"),
  g3101: () => fragment(readFileSync(join(source, "public/index.html"), "utf8"), "footer"),
};

// The department strip under the nav is identical on every page; keep one copy.
const g3101 = readFileSync(join(source, "public/index.html"), "utf8");
writeFileSync(join(out, "usps.json"), JSON.stringify(g3101.slice(g3101.indexOf('<div class="usps">'), g3101.indexOf("<main")).trim()));

// Kit's chat panel and launcher are identical on every page; the generated pages reuse this copy.
const chatStart = g3101.indexOf('<div class="chat" id="chat"');
writeFileSync(join(out, "chat.json"), JSON.stringify(g3101.slice(chatStart, g3101.indexOf("<script src=", chatStart)).trim()));

for (const [name, build] of Object.entries(pages)) {
  const f = build();
  writeFileSync(join(out, `${name}.json`), JSON.stringify(f));
  console.log(`${name}: ${f.main.length} chars of markup, ${f.scripts.length} scripts, ${f.ld.length} JSON-LD`);
}
