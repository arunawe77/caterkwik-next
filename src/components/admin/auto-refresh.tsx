"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-reads the page's server data every couple of seconds while something is running.
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
