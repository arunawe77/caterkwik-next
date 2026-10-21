"use client";

import { useEffect } from "react";

export interface LegacyScript {
  src?: string;
  text?: string;
}

// The approved pages drive themselves with plain scripts. React does not run scripts that
// arrive as markup, so they are appended here, in order, once the markup is in the page.
export function LegacyScripts({ scripts }: { scripts: LegacyScript[] }) {
  useEffect(() => {
    let cancelled = false;
    const added: HTMLScriptElement[] = [];

    (async () => {
      for (const s of scripts) {
        if (cancelled) return;
        const el = document.createElement("script");
        added.push(el);
        if (s.src) {
          el.src = s.src;
          await new Promise<void>((resolve) => {
            el.onload = el.onerror = () => resolve();
            document.body.append(el);
          });
        } else {
          el.text = s.text ?? "";
          document.body.append(el);
        }
      }
    })();

    return () => {
      cancelled = true;
      added.forEach((el) => el.remove());
    };
  }, [scripts]);

  return null;
}
