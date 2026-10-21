import { cookies } from "next/headers";
import { CART_COOKIE, parseCart, serializeCart, type CartItem } from "@/lib/cart";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function readCart(): Promise<CartItem[]> {
  return parseCart((await cookies()).get(CART_COOKIE)?.value);
}

// Not httpOnly: the header reads it to show the item count without making every page dynamic.
// It holds only ids and quantities, and the server re-validates it on every read.
export async function writeCart(items: CartItem[]): Promise<void> {
  const jar = await cookies();
  if (!items.length) jar.delete(CART_COOKIE);
  else jar.set(CART_COOKIE, serializeCart(items), { path: "/", maxAge: THIRTY_DAYS, sameSite: "lax" });
}
