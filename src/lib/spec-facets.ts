import type { Product } from "@/lib/catalogue";
import { specText, type Rich, type RichSpec } from "@/lib/rich";

// Filters built from the product schema, so each category offers the choices that decide that purchase
// (tank size on a fryer, wells on a bain marie) rather than a fixed list. State lives in the URL as
// s.<field>=<value>, like the brand and availability filters. A product that does not publish a
// figure never matches a filter on it: nothing is guessed to make a count look better.

export type SpecSelection = Record<string, string[]>;
export interface SpecFacet {
  key: string;
  label: string;
  options: { value: string; label: string; count: number }[];
}

const PREFIX = "s.";
const all = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export function parseSpecSelection(params: Record<string, string | string[] | undefined>): SpecSelection {
  const out: SpecSelection = {};
  for (const [k, v] of Object.entries(params)) if (k.startsWith(PREFIX) && all(v).length) out[k.slice(PREFIX.length)] = all(v);
  return out;
}
export const specParam = (key: string) => PREFIX + key;

const fmt = (n: number) => String(Math.round(n * 100) / 100);

// Numbers are bucketed into at most five ranges (or listed exactly when there are few distinct values).
function bucketer(values: number[], unit?: string): { of: (n: number) => string; order: string[] } {
  const u = unit ? ` ${unit}` : "";
  const distinct = [...new Set(values)].sort((a, b) => a - b);
  if (distinct.length <= 6) return { of: (n) => `${fmt(n)}${u}`, order: distinct.map((n) => `${fmt(n)}${u}`) };
  const sorted = [...values].sort((a, b) => a - b);
  const edges = [1, 2, 3, 4].map((i) => sorted[Math.floor((sorted.length * i) / 5)]);
  const cuts = [...new Set(edges)].filter((e) => e > sorted[0]);
  const ranges: [number, number, string][] = [];
  let lo = sorted[0];
  for (const c of [...cuts, Infinity]) {
    const top = c === Infinity ? sorted.at(-1)! : c;
    const last = c === Infinity;
    const label = last ? `${fmt(lo)}${u} and over` : `${fmt(lo)} to under ${fmt(top)}${u}`;
    ranges.push([lo, c, label]);
    lo = c;
  }
  return { of: (n) => ranges.find(([a, b]) => n >= a && n < b)?.[2] ?? ranges.at(-1)![2], order: ranges.map((r) => r[2]) };
}

const valueOf = (s: RichSpec, bucket?: (n: number) => string): string =>
  typeof s.value === "number" ? (bucket ? bucket(s.value) : specText(s)) : s.value === true ? "Yes" : specText(s);

interface Model { key: string; label: string; of: (r: Rich) => string | null; order: string[] }

function modelsFor(list: Product[], rich: Map<string, Rich>): Model[] {
  const present = list.flatMap((p) => (rich.has(p.id) ? [rich.get(p.id)!] : []));
  if (present.length < 4) return [];
  const keys = new Set<string>();
  for (const r of present) for (const [k, s] of Object.entries(r.specs)) if (s.filter) keys.add(k);
  const models: Model[] = [];
  for (const key of keys) {
    const have = present.filter((r) => r.specs[key]);
    if (have.length < Math.max(3, present.length * 0.3)) continue;
    const first = have[0].specs[key];
    let model: Model;
    if (typeof first.value === "number") {
      const b = bucketer(have.map((r) => r.specs[key].value as number), first.unit);
      model = { key, label: first.label, of: (r) => (r.specs[key] ? valueOf(r.specs[key], b.of) : null), order: b.order };
    } else {
      const seen = [...new Set(have.map((r) => valueOf(r.specs[key])))].sort();
      model = { key, label: first.label, of: (r) => (r.specs[key] ? valueOf(r.specs[key]) : null), order: seen };
    }
    if (model.order.length >= 2 && model.order.length <= 9) models.push(model);
  }
  return models.sort((a, b) => a.label.localeCompare(b.label)).slice(0, 6);
}

const matches = (p: Product, rich: Map<string, Rich>, models: Model[], sel: SpecSelection, skip?: string) =>
  models.every((m) => {
    const wanted = sel[m.key];
    if (!wanted?.length || m.key === skip) return true;
    const r = rich.get(p.id);
    const v = r ? m.of(r) : null;
    return v !== null && wanted.includes(v);
  });

export function specFacets(list: Product[], rich: Map<string, Rich>, sel: SpecSelection): { facets: SpecFacet[]; apply: (l: Product[]) => Product[] } {
  const models = modelsFor(list, rich);
  return {
    apply: (l) => l.filter((p) => matches(p, rich, models, sel)),
    facets: models.map((m) => {
      const pool = list.filter((p) => matches(p, rich, models, sel, m.key));
      const counts = new Map<string, number>();
      for (const p of pool) { const r = rich.get(p.id); const v = r ? m.of(r) : null; if (v) counts.set(v, (counts.get(v) ?? 0) + 1); }
      return { key: m.key, label: m.label, options: m.order.map((o) => ({ value: o, label: o, count: counts.get(o) ?? 0 })) };
    }),
  };
}
