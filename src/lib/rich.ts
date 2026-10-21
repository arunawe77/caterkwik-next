import { shardLoaders } from "@/data/rich";

// Everything Caterkwik's own page publishes about a product beyond the listing: prose, features,
// the specification the schema could read, and the raw requirement lines. Built by
// scripts/build-specs.mjs. A product with no record simply has no rich sections.

export interface RichSpec {
  label: string;
  group: string;
  value: string | number | boolean;
  unit?: string;
  filter?: boolean;
  from: string;
  source: "page" | "pdf";
}

export interface Rich {
  family: string;
  overview: string[];
  features: string[];
  specs: Record<string, RichSpec>;
  extra: [string, string][];
  dimensions: string[];
  power: string[];
  special: string[];
  icons: string[];
  downloads: { label: string; url: string }[];
  checklists: { label: string; url: string }[];
  related: { token: string; name: string; price: number | null }[];
  mpn: string | null;
  brand: string | null;
  keywords: string | null;
  summary: string[];
  pdf: { label: string; url: string }[];
}

const loaded = new Map<string, Promise<Record<string, Rich>>>();

export async function richOf(id: string): Promise<Rich | null> {
  const key = id.toLowerCase();
  const shard = key[0].replace(/[^a-z0-9]/, "_");
  const load = shardLoaders[shard];
  if (!load) return null;
  if (!loaded.has(shard)) loaded.set(shard, load().then((m) => m.default as Record<string, Rich>));
  return (await loaded.get(shard)!)[key] ?? null;
}

/** A spec's display text: "3.5 kW", "Three phase", "Yes". */
export function specText(s: RichSpec): string {
  if (s.value === true) return "Yes";
  if (typeof s.value === "number") return `${s.value} ${s.unit ?? ""}`.trim();
  const text = String(s.value);
  const out = text[0] ? text[0].toUpperCase() + text.slice(1) : text;
  return s.unit ? `${out} ${s.unit}` : out;
}

const ORDER = ["Capacity", "Performance", "Power & supply", "Dimensions", "Construction", "Controls & features", "Compliance & service"];

/** The specs grouped under their schema heading, in a fixed order. */
export function specGroups(r: Rich): { group: string; rows: { key: string; label: string; text: string; from: string; source: string }[] }[] {
  const by = new Map<string, { key: string; label: string; text: string; from: string; source: string }[]>();
  for (const [key, s] of Object.entries(r.specs)) {
    const list = by.get(s.group) ?? [];
    list.push({ key, label: s.label, text: specText(s), from: s.from, source: s.source });
    by.set(s.group, list);
  }
  return ORDER.filter((g) => by.has(g)).map((g) => ({ group: g, rows: by.get(g)! }));
}
