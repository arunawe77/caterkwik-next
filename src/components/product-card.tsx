import Link from "next/link";
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

export function ProductCard({ product }: { product: Product }) {
  const href = productHref(product);
  const line = specLine(product);
  return (
    <article className="ocard">
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
      {line && <p className="spec">{line}</p>}
      <Price product={product} />
      {product.leaseWeek !== null && product.stock === "in-stock" && (
        <p className="lease">Lease from {money(product.leaseWeek)} a week</p>
      )}
      <Link className="btn btn-ghost btn-sm" href={href}><Icon name="eye" size={16} />View product</Link>
    </article>
  );
}
