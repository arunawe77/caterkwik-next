import { getProduct, type Product } from "@/lib/catalogue";

// The basket is a cookie holding product ids and quantities, nothing else. It is untrusted:
// every read validates it against the catalogue and prices it from there, so no figure a visitor
// can edit ever reaches an order.

export const CART_COOKIE = "ck_cart";
export const MAX_LINES = 30;
export const MAX_QTY = 99;

export interface CartItem {
  id: string;
  qty: number;
}

export interface PricedLine {
  product: Product;
  qty: number;
  unitExPence: number;
  unitIncPence: number;
}

export interface PricedCart {
  lines: PricedLine[];
  subtotalExPence: number;
  vatPence: number;
  totalIncPence: number;
}

export const toPence = (pounds: number) => Math.round(pounds * 100);

// Only available, priced products can be bought. Discontinued and price-on-application ones
// are quote-only.
export const isPurchasable = (p: Product) => p.stock === "in-stock" && p.priceEx !== null && p.priceInc !== null;

const clampQty = (n: unknown) => (Number.isInteger(n) ? Math.min(Math.max(n as number, 1), MAX_QTY) : null);

export function parseCart(raw: string | undefined | null): CartItem[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(decodeURIComponent(raw));
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const merged = new Map<string, number>();
  for (const entry of data) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
    const product = getProduct(entry[0]);
    const qty = clampQty(entry[1]);
    if (!product || !isPurchasable(product) || qty === null) continue;
    merged.set(product.id, Math.min((merged.get(product.id) ?? 0) + qty, MAX_QTY));
  }
  return [...merged].slice(0, MAX_LINES).map(([id, qty]) => ({ id, qty }));
}

export const serializeCart = (items: CartItem[]) => encodeURIComponent(JSON.stringify(items.map((i) => [i.id, i.qty])));

export const cartCount = (raw: string | undefined | null) => parseCart(raw).reduce((n, i) => n + i.qty, 0);

export function addItem(items: CartItem[], id: string, qty: number): CartItem[] {
  return parseCart(serializeCart([...items, { id, qty }]));
}

export function priceCart(items: CartItem[]): PricedCart {
  const lines = items.flatMap((item): PricedLine[] => {
    const product = getProduct(item.id);
    if (!product || !isPurchasable(product)) return [];
    return [{ product, qty: item.qty, unitExPence: toPence(product.priceEx!), unitIncPence: toPence(product.priceInc!) }];
  });
  const subtotalExPence = lines.reduce((n, l) => n + l.unitExPence * l.qty, 0);
  const totalIncPence = lines.reduce((n, l) => n + l.unitIncPence * l.qty, 0);
  return { lines, subtotalExPence, vatPence: totalIncPence - subtotalExPence, totalIncPence };
}
