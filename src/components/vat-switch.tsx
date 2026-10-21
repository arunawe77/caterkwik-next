"use client";

import { useSyncExternalStore } from "react";

type Mode = "ex" | "inc";

// The mode is the `showinc` class on <body>: CSS swaps the two rendered prices with no
// re-render, and the approved pages' own scripts toggle the same class.
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

const read = (): Mode => (document.body.classList.contains("showinc") ? "inc" : "ex");

function set(mode: Mode) {
  document.body.classList.toggle("showinc", mode === "inc");
  try {
    localStorage.setItem("vat", mode);
  } catch {}
  listeners.forEach((fn) => fn());
}

export function VatSwitch() {
  const mode = useSyncExternalStore(subscribe, read, () => "ex" as Mode);
  return (
    <div className="vatswitch" role="group" aria-label="Price display">
      {(["ex", "inc"] as const).map((m) => (
        <button key={m} type="button" data-vat={m} aria-pressed={mode === m} onClick={() => set(m)}>
          {m === "ex" ? "Ex. VAT" : "Inc. VAT"}
        </button>
      ))}
    </div>
  );
}
