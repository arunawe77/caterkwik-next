import Link from "next/link";

// A row of time ranges that sets ?range= and nothing else, so the page stays a plain link away.
export function RangeTabs({ ranges, current, base }: { ranges: readonly number[]; current: number; base: string }) {
  return (
    <nav className="range-tabs" aria-label="Time range">
      {ranges.map((r) => (
        <Link key={r} href={`${base}?range=${r}`} aria-current={r === current ? "true" : undefined}>
          {r === 365 ? "12 months" : `${r} days`}
        </Link>
      ))}
    </nav>
  );
}
