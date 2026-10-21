// Prints the redirect match rate for every old Caterkwik address in the scrape (D6).
//
//   node scripts/redirect-report.mjs http://localhost:3000
//
// Each of the 442 listings is requested at its original /cgi-bin/ address, without following
// the redirect. A listing matches when it answers 301 to a page on the new site: its product
// page, or (for a discontinued product) its type page. Nothing may land on the home page.

import { readFileSync } from "node:fs";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");
const scrape = JSON.parse(readFileSync(new URL("../src/data/scrape.json", import.meta.url), "utf8"));
const listings = scrape.flatMap((c) => c.products.map((p) => ({ type: c.label, name: p.name, href: p.href, discontinued: p.discontinued })));

const tally = { product: 0, discontinuedToType: 0, miss: [] };

for (const l of listings) {
  const url = new URL(l.href);
  const res = await fetch(`${base}${url.pathname}${url.search}`, { redirect: "manual" });
  const to = res.headers.get("location") ? new URL(res.headers.get("location"), base).pathname : null;
  const ok = res.status === 301 && to && to !== "/" && to !== "/ovens";

  if (!ok) tally.miss.push({ ...l, status: res.status, to });
  else if (/^\/ovens\/[^/]+$/.test(to) && l.discontinued) tally.discontinuedToType++;
  else if (/^\/ovens\/[^/]+\/[^/]+$/.test(to)) tally.product++;
  else tally.miss.push({ ...l, status: res.status, to });
}

const matched = tally.product + tally.discontinuedToType;
console.log(`Old addresses checked: ${listings.length}`);
console.log(`  to a product page:                 ${tally.product}`);
console.log(`  discontinued, to their type page:  ${tally.discontinuedToType}`);
console.log(`  not matched:                       ${tally.miss.length}`);
console.log(`Match rate: ${((matched / listings.length) * 100).toFixed(1)}%`);
for (const m of tally.miss) console.log(`  MISS ${m.status} ${m.href} -> ${m.to}`);
process.exit(tally.miss.length ? 1 : 0);
