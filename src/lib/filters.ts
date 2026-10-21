import type { Product } from "@/lib/catalogue";

// Filter state lives in the URL (?brand=Lincat&brand=Falcon&stock=in-stock), so a filtered
// view can be shared, bookmarked and rendered on the server with no client JavaScript.

export type SearchParams = Record<string, string | string[] | undefined>;

export interface Selection {
  brand: string[];
  stock: string[];
}

export const STOCK_LABELS = {
  "in-stock": "Available",
  poa: "Price on application",
  discontinued: "Discontinued",
} as const;

const all = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export const parseSelection = (params: SearchParams): Selection => ({
  brand: all(params.brand),
  stock: all(params.stock).filter((s) => s in STOCK_LABELS),
});

const matches = (p: Product, sel: Selection) =>
  (!sel.brand.length || (p.brand !== null && sel.brand.includes(p.brand))) &&
  (!sel.stock.length || sel.stock.includes(p.stock));

export const applySelection = (list: Product[], sel: Selection) => list.filter((p) => matches(p, sel));

export interface Facet {
  value: string;
  label: string;
  count: number;
}

// Each facet counts what would be left if that option were added, with the other
// facet's selection applied: the count on the label is what the click will show.
export function facets(list: Product[], sel: Selection): { brand: Facet[]; stock: Facet[] } {
  const brandPool = applySelection(list, { ...sel, brand: [] });
  const stockPool = applySelection(list, { ...sel, stock: [] });

  const brands = new Map<string, number>();
  for (const p of brandPool) if (p.brand) brands.set(p.brand, (brands.get(p.brand) ?? 0) + 1);

  return {
    brand: [...new Set(list.flatMap((p) => (p.brand ? [p.brand] : [])))]
      .sort()
      .map((b) => ({ value: b, label: b, count: brands.get(b) ?? 0 })),
    stock: (Object.keys(STOCK_LABELS) as (keyof typeof STOCK_LABELS)[])
      .map((s) => ({ value: s, label: STOCK_LABELS[s], count: stockPool.filter((p) => p.stock === s).length }))
      .filter((f) => list.some((p) => p.stock === f.value)),
  };
}
