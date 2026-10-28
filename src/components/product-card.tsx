import Link from "next/link";
import { useId } from "react";
import { Icon } from "@/components/icons";
import { Price } from "@/components/price";
import { FUEL_LABELS } from "@/lib/labels";
import { money } from "@/lib/format";
import { productHref, type Product } from "@/lib/catalogue";

// Fuel, width, oven and output: only the figures the record actually has.
export function specLine({ spec }: Pick<Product, "spec">): string {
  if (!spec) return "";
  return [
    spec.fuel.length ? spec.fuel.map((f) => FUEL_LABELS[f] ?? f).join(" or ") : null,
    spec.width === null ? null : `${spec.width} mm wide`,
    spec.ovenType ? `${spec.ovenType === "convection" ? "Fan" : "Static"} oven` : null,
    spec.kwTotal === null ? null : `${spec.kwTotal} kW`,
  ].filter(Boolean).join(" · ");
}

// The figures the Specs tab lists: only those the record has.
export function specRows({ spec }: Pick<Product, "spec">): [string, string][] {
  if (!spec) return [];
  const dims = spec.width !== null && spec.depth !== null && spec.height !== null ? `${spec.width} × ${spec.depth} × ${spec.height} mm` : null;
  return ([
    ["Dimensions", dims], ["Burners", spec.burners === null ? null : String(spec.burners)], ["Weight", spec.weight === null ? null : `${spec.weight} kg`],
    ["Warranty", spec.warrantyYears === null ? null : `${spec.warrantyYears} ${spec.warrantyYears === 1 ? "year" : "years"}`],
  ] as [string, string | null][]).filter((r): r is [string, string] => r[1] !== null);
}

// Overview, Specs and Lease in one card (a choice of tabs that needs no script), with the price, stock and one button below.
// Phones get a compact row instead: photo beside name, figures and price, with the tabs hidden.
export function ProductCard({ product }: { product: Product }) {
  const href = productHref(product);
  const line = specLine(product);
  const rows = specRows(product);
  const uid = useId();
  const leaseText = product.leaseWeek !== null && product.stock === "in-stock" ? `Lease from ${money(product.leaseWeek)} a week` : "Ask us for a lease quote on this product.";
  const stock = product.stock === "in-stock" ? { text: "In stock", tone: "ok" } : product.stock === "discontinued" ? { text: "Discontinued", tone: "gone" } : { text: "Price on application", tone: "poa" };
  return (
    <article className="ocard hybrid">
      <Link className="shot" href={href} tabIndex={-1} aria-hidden>
        {/* Caterkwik's own photographs at the size they publish them, so never upscaled. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="photo" src={product.image} alt="" loading="lazy" />
      </Link>
      {(product.webExclusive || product.stock === "discontinued") && (
        <div className="flags">
          {product.webExclusive && <span className="chip">Web exclusive</span>}
          {product.stock === "discontinued" && <span className="chip chip-amber">Discontinued</span>}
        </div>
      )}
      <h3><Link href={href}>{product.name}</Link></h3>
      {line || rows.length ? (
        <div className="ctabs">
          <input type="radio" className="t1" name={uid} id={`${uid}-1`} defaultChecked />
          <input type="radio" className="t2" name={uid} id={`${uid}-2`} />
          <input type="radio" className="t3" name={uid} id={`${uid}-3`} />
          <div className="tbar">
            <label className="l1" htmlFor={`${uid}-1`}>Overview</label>
            <label className="l2" htmlFor={`${uid}-2`}>Specs</label>
            <label className="l3" htmlFor={`${uid}-3`}>Lease</label>
          </div>
          <div className="tpanes">
            <p className="pn pn1 spec">{line || "Specs are on the Specs tab."}</p>
            <div className="pn pn2">
              {rows.length ? <ul>{rows.map(([k, v]) => <li key={k}><span>{k}</span>{v}</li>)}</ul> : <p>Not published.</p>}
            </div>
            <p className="pn pn3 lease">{leaseText}</p>
          </div>
        </div>
      ) : leaseText && product.leaseWeek !== null ? <p className="lease">{leaseText}</p> : null}
      <Price product={product} />
      <p className={`stockline ${stock.tone}`}>{stock.text}</p>
      {product.spec?.warrantyYears != null && <p className="warr">{product.spec.warrantyYears} {product.spec.warrantyYears === 1 ? "year" : "years"} warranty</p>}
      <Link className="btn btn-ghost btn-sm" href={href}><Icon name="eye" size={16} />View product</Link>
    </article>
  );
}
