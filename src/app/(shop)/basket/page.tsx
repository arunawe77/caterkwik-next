import Link from "next/link";
import { Icon } from "@/components/icons";
import { priceCart } from "@/lib/cart";
import { productHref } from "@/lib/catalogue";
import { pence } from "@/lib/format";
import { utilityMetadata } from "@/lib/seo";
import { updateCart } from "@/server/cart-actions";
import { readCart } from "@/server/cart";

export const metadata = utilityMetadata("Your basket");

export default async function BasketPage() {
  const cart = priceCart(await readCart());

  if (!cart.lines.length) {
    return (
      <main className="wrap ovenpage">
        <header className="ohead">
          <h1><Icon name="basket" size={30} /> Your basket is empty</h1>
          <p className="sub">Find an oven, and add it here.</p>
        </header>
        <Link className="btn btn-navy" href="/ovens"><Icon name="search" />Browse commercial ovens</Link>
      </main>
    );
  }

  return (
    <main className="wrap ovenpage">
      <header className="ohead"><h1><Icon name="basket" size={30} /> Your basket</h1></header>
      <div className="twocol">
        <form action={updateCart} className="panel">
          <table className="table">
            <thead><tr><th>Product</th><th>Quantity</th><th className="num">Each inc VAT</th><th className="num">Line total</th><th /></tr></thead>
            <tbody>
              {cart.lines.map((l) => (
                <tr key={l.product.id}>
                  <td><Link href={productHref(l.product)}>{l.product.name}</Link></td>
                  <td><input type="number" name={`qty:${l.product.id}`} defaultValue={l.qty} min={1} max={99} aria-label={`Quantity of ${l.product.name}`} /></td>
                  <td className="num">{pence(l.unitIncPence)}</td>
                  <td className="num">{pence(l.unitIncPence * l.qty)}</td>
                  <td><button className="btn btn-ghost btn-sm" type="submit" name="remove" value={l.product.id}><Icon name="trash" size={16} />Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: "14px 0 0" }}><button className="btn btn-ghost btn-sm" type="submit"><Icon name="refresh" size={16} />Update quantities</button></p>
        </form>

        <aside className="panel">
          <h2><Icon name="cart" /> Order summary</h2>
          <div className="totals">
            <div><span>Subtotal ex VAT</span><span>{pence(cart.subtotalExPence)}</span></div>
            <div><span>VAT</span><span>{pence(cart.vatPence)}</span></div>
            <div className="grand"><span>Total inc VAT</span><span>{pence(cart.totalIncPence)}</span></div>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Delivery is kerbside. The team will contact you about delivery and installation, and quote them separately.</p>
          <Link className="btn btn-navy" href="/checkout" style={{ width: "100%" }}><Icon name="checkout" />Go to checkout<Icon name="arrowRight" /></Link>
        </aside>
      </div>
    </main>
  );
}

// Rendered per request from the catalogue in memory, so an admin change shows at once and a restart never serves a stale build.
export const dynamic = "force-dynamic";
