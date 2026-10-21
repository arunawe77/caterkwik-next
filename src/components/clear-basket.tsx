"use client";

import { useEffect } from "react";
import { CART_COOKIE } from "@/lib/cart";

// After a card payment the basket is emptied here, in the browser that holds the cookie.
export function ClearBasket() {
  useEffect(() => {
    document.cookie = `${CART_COOKIE}=; path=/; max-age=0`;
  }, []);
  return null;
}
