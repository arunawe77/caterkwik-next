"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { QUOTE_COOKIE, quoteCount } from "@/lib/quote";
import { Icon } from "@/components/icons";

// Same approach as the basket link: read the count from the cookie in the browser.
function readCount(): number {
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${QUOTE_COOKIE}=`))?.slice(QUOTE_COOKIE.length + 1);
  return quoteCount(raw && decodeURIComponent(raw));
}
const subscribe = () => () => {};

export function QuoteLink() {
  usePathname();
  const count = useSyncExternalStore(subscribe, readCount, () => 0);
  return <Link href="/quote/new" className="iconlink"><Icon name="mail" />Get a Quote{count > 0 && ` (${count})`}</Link>;
}
