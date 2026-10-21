"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { CART_COOKIE, cartCount } from "@/lib/cart";
import { Icon } from "@/components/icons";

// The basket count in the header. Pages stay static: the count is read from the basket cookie in
// the browser. This header outlives every navigation, so it re-renders on each one (usePathname)
// and reads the cookie again.
function readCount(): number {
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${CART_COOKIE}=`))?.slice(CART_COOKIE.length + 1);
  // Next stores the cookie URL-encoded again, so the browser sees it one layer deeper than the server does.
  return cartCount(raw && decodeURIComponent(raw));
}
const subscribe = () => () => {};

export function CartLink() {
  usePathname();
  const count = useSyncExternalStore(subscribe, readCount, () => 0);
  return <Link href="/basket" className="iconlink"><Icon name="basket" />Basket{count > 0 && ` (${count})`}</Link>;
}
