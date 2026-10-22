import { getProduct, type Product } from "@/lib/catalogue";
import { MAX_LINES, MAX_QTY, type CartItem } from "@/lib/cart";

// The quote basket works like the shopping basket (a cookie of ids and quantities, re-validated on
// every read) but takes any catalogue product, including price on application and discontinued ones.

export const QUOTE_COOKIE = "ck_quote";

const clampQty = (n: unknown) => (Number.isInteger(n) ? Math.min(Math.max(n as number, 1), MAX_QTY) : null);

export function parseQuote(raw: string | undefined | null): CartItem[] {
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
    if (!product || qty === null) continue;
    merged.set(product.id, Math.min((merged.get(product.id) ?? 0) + qty, MAX_QTY));
  }
  return [...merged].slice(0, MAX_LINES).map(([id, qty]) => ({ id, qty }));
}

export const serializeQuote = (items: CartItem[]) => encodeURIComponent(JSON.stringify(items.map((i) => [i.id, i.qty])));

export const quoteCount = (raw: string | undefined | null) => parseQuote(raw).reduce((n, i) => n + i.qty, 0);

export const addQuoteItem = (items: CartItem[], id: string, qty: number): CartItem[] => parseQuote(serializeQuote([...items, { id, qty }]));

export interface QuoteLine {
  product: Product;
  qty: number;
}

export const quoteLines = (items: CartItem[]): QuoteLine[] =>
  items.flatMap((i) => {
    const product = getProduct(i.id);
    return product ? [{ product, qty: i.qty }] : [];
  });
