"use client";

import { useId, useMemo, useState } from "react";

interface Category { slug: string; label: string }

// A category dropdown with a search box, always in A to Z order. Typing narrows the list; the chosen category stays in it
// even when it no longer matches, so the form never loses a selection. `emptyLabel` adds a first "no choice" entry (for filters).
export function CategoryPicker({ categories, name, defaultValue = "", required = false, emptyLabel }: {
  categories: Category[];
  name: string;
  defaultValue?: string;
  required?: boolean;
  emptyLabel?: string;
}) {
  const id = useId();
  const [term, setTerm] = useState("");
  const [value, setValue] = useState(defaultValue);
  const sorted = useMemo(() => [...categories].sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" })), [categories]);
  const shown = useMemo(() => {
    const t = term.trim().toLowerCase();
    return t ? sorted.filter((c) => c.slug === value || c.label.toLowerCase().includes(t)) : sorted;
  }, [sorted, term, value]);
  const matches = term.trim() ? shown.filter((c) => c.slug !== value || c.label.toLowerCase().includes(term.trim().toLowerCase())).length : sorted.length;

  return (
    <div className="catpicker">
      <input
        type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search categories" aria-label="Search categories"
        aria-controls={id} autoComplete="off"
        onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
      />
      <select id={id} name={name} required={required} value={value} onChange={(e) => setValue(e.target.value)}>
        {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : <option value="" disabled>Choose...</option>}
        {shown.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
      </select>
      {term.trim() && <small role="status">{matches === 0 ? "No category matches." : `${matches} ${matches === 1 ? "match" : "matches"}`}</small>}
    </div>
  );
}
