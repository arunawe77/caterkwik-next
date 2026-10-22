"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// A thin bar across the top that starts the moment an internal link is clicked and ends when the new page arrives.
export function NavProgress() {
  const where = usePathname() + "?" + useSearchParams().toString();
  // The page we left when a link was clicked: the bar is on until the location is no longer that one.
  const [from, setFrom] = useState<string | null>(null);
  const busy = from !== null && from === where;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname + url.search === location.pathname + location.search) return;
      setFrom(location.pathname + "?" + location.search.slice(1));
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return <div className={busy ? "navbar on" : "navbar"} role="progressbar" aria-hidden={!busy} />;
}
