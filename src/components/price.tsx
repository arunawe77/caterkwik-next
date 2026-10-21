import { money } from "@/lib/format";
import type { Product } from "@/lib/catalogue";

type Priced = Pick<Product, "stock" | "priceEx" | "priceInc" | "wasEx">;

// Both prices are rendered; `body.showinc` decides which one leads.
export function Price({ product }: { product: Priced }) {
  if (product.stock === "discontinued") return <p className="price"><span className="nostock">Discontinued</span></p>;
  if (product.priceEx === null || product.priceInc === null) {
    return <p className="price"><span className="nostock">Price on application</span></p>;
  }
  return (
    <p className="price">
      <b className="ex">{money(product.priceEx)}</b>
      <span className="inc">{money(product.priceInc)} inc. VAT</span>
      {product.wasEx !== null && <span className="was">was {money(product.wasEx)}</span>}
    </p>
  );
}
