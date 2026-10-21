import type { ProductDetail } from "@prisma/client";

// Everything the spreadsheet import brought in that has no field of its own. Read only: it is the
// product page as Caterkwik had it, kept for reference and for the storefront to draw on later.

type Item = Record<string, unknown>;
const items = (v: unknown): Item[] => (Array.isArray(v) ? (v as Item[]) : []);
const gbp = (v: unknown) => (typeof v === "number" ? `£${v.toFixed(2)}` : "");
const link = (url: unknown, label: unknown) => (typeof url === "string" ? <a href={url} target="_blank" rel="noreferrer">{String(label ?? url)}</a> : String(label ?? ""));

function Block({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return <details><summary>{title} ({count})</summary>{children}</details>;
}

export function ImportedDetails({ detail: d }: { detail: ProductDetail }) {
  const attrs = Object.entries((d.attributes ?? {}) as Record<string, string>);
  const images = items(d.images), docs = items(d.documents), options = items(d.options), lease = items(d.leasePlans);
  const acc = items(d.accessories), reviews = items(d.reviews), videos = Array.isArray(d.videos) ? (d.videos as string[]) : [];
  const also = Array.isArray(d.alsoBought) ? (d.alsoBought as string[]) : [];

  return (
    <section className="panel">
      <h2>Imported details</h2>
      <p className="muted">From {d.sourceFile ?? "a spreadsheet"}{d.section ? `, ${d.section}` : ""}.{d.mpn ? ` Manufacturer part ${d.mpn}.` : ""}{d.gtin ? ` EAN ${d.gtin}.` : ""}</p>
      {d.dataFlags.length > 0 && <p className="alert">Check against the manufacturer: {d.dataFlags.join("; ")}.</p>}
      {d.categoryPaths.length > 0 && <p className="muted">Listed under: {d.categoryPaths.join(" | ")}</p>}
      <Block title="Specification" count={attrs.length}>
        <table className="table"><tbody>{attrs.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
      </Block>
      <Block title="Purchase options" count={options.length}>
        <table className="table"><tbody>{options.map((o, i) => <tr key={i}><td>{String(o.group ?? "")}</td><td>{String(o.option ?? "")}</td><td>{String(o.sku ?? "")}</td><td className="num">{gbp(o.priceEx)}</td></tr>)}</tbody></table>
      </Block>
      <Block title="Accessories" count={acc.length}>
        <table className="table"><tbody>{acc.map((a, i) => <tr key={i}><td>{String(a.relationship ?? "")}</td><td>{String(a.name ?? a.code ?? "")}</td><td className="num">{gbp(a.priceEx)}</td></tr>)}</tbody></table>
      </Block>
      <Block title="Lease plans" count={lease.length}>
        <table className="table"><thead><tr><th>Months</th><th className="num">Monthly</th><th className="num">Weekly</th></tr></thead><tbody>{lease.map((l, i) => <tr key={i}><td>{String(l.months ?? "")}</td><td className="num">{gbp(l.monthly)}</td><td className="num">{gbp(l.weekly)}</td></tr>)}</tbody></table>
      </Block>
      <Block title="Documents" count={docs.length}>
        <ul>{docs.map((x, i) => <li key={i}>{link(x.url, x.title)}{x.type ? <span className="muted"> ({String(x.type)})</span> : null}</li>)}</ul>
      </Block>
      <Block title="Images" count={images.length}>
        <ul>{images.map((x, i) => <li key={i}>{link(x.url, x.url)}</li>)}</ul>
      </Block>
      <Block title="Videos" count={videos.length}><ul>{videos.map((v) => <li key={v}>{link(v, v)}</li>)}</ul></Block>
      <Block title="Reviews" count={reviews.length}>
        <ul>{reviews.map((r, i) => <li key={i}>{String(r.score ?? "")}/2 · {String(r.date ?? "")}: {String(r.text ?? "")}</li>)}</ul>
      </Block>
      <Block title="Customers also bought" count={also.length}><ul>{also.map((a) => <li key={a}>{a}</li>)}</ul></Block>
    </section>
  );
}
