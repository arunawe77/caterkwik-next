import { catalogueVersion, everyProduct, type Product } from "@/lib/catalogue";

// 413 products fit in memory: a linear scan is faster than any index we could build and
// needs nothing running beside the site. Model numbers are matched against the legacy
// token and against every word of the name, so "g3101" and "G3101 OTC/P" both find it.

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const build = () => everyProduct().map((p) => ({
  p,
  text: norm(`${p.name} ${p.token} ${p.brand ?? ""}`),
  name: norm(p.name),
  token: norm(p.token),
}));

// Rebuilt when the catalogue is swapped (an admin edit), otherwise reused.
let built = { version: catalogueVersion(), index: build() };
const current = () => {
  if (built.version !== catalogueVersion()) built = { version: catalogueVersion(), index: build() };
  return built.index;
};

function score(entry: ReturnType<typeof build>[number], terms: string[], phrase: string): number {
  if (!terms.every((t) => entry.text.includes(t))) return 0;
  const words = new Set(entry.name.split(" "));
  return 1
    + (entry.token === phrase ? 100 : 0)
    + (entry.name.startsWith(phrase) ? 10 : 0)
    + (entry.name.includes(phrase) ? 20 : 0)
    + terms.filter((t) => words.has(t)).length * 3;
}

// Equal relevance falls back to what a shopper wants first: available, then cheapest.
const byAvailability = (a: Product, b: Product) =>
  Number(a.stock === "discontinued") - Number(b.stock === "discontinued")
  || (a.priceEx ?? Infinity) - (b.priceEx ?? Infinity);

export function searchProducts(query: string, limit = 60): Product[] {
  const phrase = norm(query);
  if (!phrase) return [];
  const terms = phrase.split(" ");
  return current()
    .map((e) => ({ p: e.p, s: score(e, terms, phrase) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || byAvailability(a.p, b.p))
    .slice(0, limit)
    .map((r) => r.p);
}
