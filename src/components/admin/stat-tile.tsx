import Link from "next/link";

// A headline number with how it moved against the period before. The arrow and the sign carry
// the direction, so colour is never the only signal. `null` means there was nothing to compare with.
export function StatTile({
  label, value, delta, versus, href, goodWhenUp = true,
}: { label: string; value: string; delta?: number | null; versus?: string; href?: string; goodWhenUp?: boolean }) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <b>{value}</b>
      {delta !== undefined && (
        <span className={`delta ${delta === null || Math.abs(delta) < 0.05 ? "flat" : (delta > 0) === goodWhenUp ? "good" : "bad"}`}>
          {delta === null ? "No earlier period" : Math.abs(delta) < 0.05 ? "No change" : `${delta > 0 ? "▲ +" : "▼ "}${delta.toFixed(1)}%`}
          {versus && delta !== null && <em> {versus}</em>}
        </span>
      )}
    </>
  );
  return href ? <Link className="stat stat2" href={href}>{body}</Link> : <div className="stat stat2">{body}</div>;
}
