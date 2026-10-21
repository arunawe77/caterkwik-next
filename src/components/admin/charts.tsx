"use client";

import { useId, useRef, useState } from "react";

// Charts drawn as plain SVG and HTML: no chart library. One series colour for the thing being
// measured, a muted line for the same period before it, hairline grid, a tooltip on hover and a
// table of the same numbers for anyone who cannot use the picture.

export interface Point {
  label: string;
  value: number;
  previous?: number;
}

const W = 760;
const H = 250;
const PAD = { top: 14, right: 16, bottom: 28, left: 52 };

const fmt = (kind: "money" | "count", n: number, compact = false) =>
  kind === "count"
    ? n.toLocaleString("en-GB", { maximumFractionDigits: 0 })
    : compact && n >= 1000
      ? `£${(n / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })}k`
      : n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: n % 1 ? 2 : 0 });

// Round the top of the axis to a clean number so the ticks read 0 / 500 / 1,000.
export function niceMax(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 4, step: 1 };
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return { top: step * 4, step };
}

export function AreaChart({ points, kind, title, previousLabel }: { points: Point[]; kind: "money" | "count"; title: string; previousLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const hasPrev = points.some((p) => p.previous !== undefined);
  const { top, step } = niceMax(Math.max(...points.map((p) => Math.max(p.value, p.previous ?? 0))));
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => PAD.top + ih - (v / top) * ih;
  const line = (pick: (p: Point) => number | undefined) =>
    points.flatMap((p, i) => (pick(p) === undefined ? [] : [`${x(i).toFixed(1)},${y(pick(p)!).toFixed(1)}`])).join(" ");
  const area = `${PAD.left},${PAD.top + ih} ${line((p) => p.value)} ${x(points.length - 1)},${PAD.top + ih}`;
  const ticks = Array.from({ length: 5 }, (_, i) => i * step);
  const every = Math.ceil(points.length / 7);

  const move = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    const i = Math.round(((sx - PAD.left) / iw) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  };
  const hp = hover === null ? null : points[hover];

  return (
    <figure className="chart">
      <div className="chart-box" ref={box} onPointerMove={(e) => move(e.clientX)} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}t`}>
          <title id={`${id}t`}>{title}</title>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="axis" x={PAD.left - 8} y={y(t) + 4} textAnchor="end">{fmt(kind, t, true)}</text>
            </g>
          ))}
          {points.map((p, i) => i % every === 0 && <text key={p.label + i} className="axis" x={x(i)} y={H - 8} textAnchor="middle">{p.label}</text>)}
          <polygon className="area" points={area} />
          {hasPrev && <polyline className="prev" points={line((p) => p.previous)} />}
          <polyline className="cur" points={line((p) => p.value)} />
          {hover !== null && hp && (
            <g>
              <line className="cross" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} />
              <circle className="dot" cx={x(hover)} cy={y(hp.value)} r={5} />
            </g>
          )}
        </svg>
        {hover !== null && hp && (
          <div className="tip" style={{ left: `${(x(hover) / W) * 100}%` }} role="status">
            <b>{hp.label}</b>
            <span><i className="key cur" />{title}: {fmt(kind, hp.value)}</span>
            {hp.previous !== undefined && <span><i className="key prev" />{previousLabel ?? "Before"}: {fmt(kind, hp.previous)}</span>}
          </div>
        )}
      </div>
      {hasPrev && (
        <figcaption className="legend">
          <span><i className="key cur" />This period</span>
          <span><i className="key prev" />{previousLabel ?? "Previous period"}</span>
        </figcaption>
      )}
      <details className="chart-table">
        <summary>View as table</summary>
        <table className="table">
          <thead><tr><th>Day</th><th className="num">{title}</th>{hasPrev && <th className="num">{previousLabel ?? "Previous"}</th>}</tr></thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.label}><td>{p.label}</td><td className="num">{fmt(kind, p.value)}</td>{hasPrev && <td className="num">{p.previous === undefined ? "-" : fmt(kind, p.previous)}</td>}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export interface Bar {
  label: string;
  value: number;
  note?: string;
  href?: string;
}

// Horizontal bars with the value at the tip. Server-renderable, so it needs no script.
export function BarList({ bars, kind, empty = "Nothing to show yet." }: { bars: Bar[]; kind: "money" | "count"; empty?: string }) {
  if (!bars.length) return <p className="muted">{empty}</p>;
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <ul className="bars">
      {bars.map((b) => (
        <li key={b.label} title={`${b.label}: ${fmt(kind, b.value)}${b.note ? `, ${b.note}` : ""}`}>
          <span className="bar-label">{b.href ? <a href={b.href}>{b.label}</a> : b.label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.max((b.value / max) * 100, 1.5)}%` }} /></span>
          <span className="bar-value">{fmt(kind, b.value)}</span>
        </li>
      ))}
    </ul>
  );
}
