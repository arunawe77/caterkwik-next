import { cookies } from "next/headers";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { QuoteForm } from "@/components/quote-form";
import { toPence } from "@/lib/cart";
import { productHref } from "@/lib/catalogue";
import { pence } from "@/lib/format";
import { parseQuote, quoteLines, QUOTE_COOKIE } from "@/lib/quote";
import { searchProducts } from "@/lib/search";
import { utilityMetadata } from "@/lib/seo";
import { addToQuote, updateQuote } from "@/server/quote-actions";

export const metadata = utilityMetadata("Request a quote");

const POINTS = [
  { icon: "list", text: "As many lines as you need: 2 items or 200" },
  { icon: "check", text: "Volume pricing and trade accounts" },
  { icon: "truck", text: "Stock, lead times, delivery and installation confirmed per line" },
] as const;

// The project quote page: build the whole list, search for more items, then send it to the team.
export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) ?? "";
  const lines = quoteLines(parseQuote((await cookies()).get(QUOTE_COOKIE)?.value));
  const onList = new Set(lines.map((l) => l.product.id));
  const results = q ? searchProducts(q, 12) : [];

  const units = lines.reduce((n, l) => n + l.qty, 0);
  const listInc = lines.reduce((n, l) => n + (l.product.priceInc !== null ? toPence(l.product.priceInc) * l.qty : 0), 0);

  return (
    <main className="wrap ovenpage">
      <header className="ohead">
        <p className="kicker">Project quotes</p>
        <h1>Are you pricing up a project?</h1>
        <p className="sub">
          Build the whole list, every item with the quantity you need, for a kitchen, a rollout or a full fit-out. We&apos;ll come
          back with project pricing, stock and lead times, and installation if you want it.
        </p>
      </header>
      <ul className="quotepoints">
        {POINTS.map((p) => <li key={p.text}><Icon name={p.icon} size={16} />{p.text}</li>)}
      </ul>

      <div className="twocol">
        <div>
          <section className="panel">
            <h2>Your items <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>
              {lines.length ? `${lines.length} line${lines.length === 1 ? "" : "s"} · ${units} unit${units === 1 ? "" : "s"}` : "Nothing added yet"}
            </span></h2>
            {lines.length > 0 ? (
              <form action={updateQuote}>
                <table className="table">
                  <thead><tr><th>Product</th><th>Quantity</th><th className="num">List price inc VAT</th><th /></tr></thead>
                  <tbody>
                    {lines.map(({ product: p, qty }) => (
                      <tr key={p.id}>
                        <td><Link href={productHref(p)}>{p.name}</Link></td>
                        <td><input type="number" name={`qty:${p.id}`} defaultValue={qty} min={1} max={99} aria-label={`Quantity of ${p.name}`} /></td>
                        <td className="num">{p.priceInc !== null ? pence(toPence(p.priceInc)) : "On application"}</td>
                        <td><button className="btn btn-ghost btn-sm" type="submit" name="remove" value={p.id}><Icon name="trash" size={16} />Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ margin: "14px 0 0" }}><button className="btn btn-ghost btn-sm" type="submit"><Icon name="refresh" size={16} />Update quantities</button></p>
              </form>
            ) : (
              <p className="notice">Search below to add your first item. Add as many as the project needs, each with its own quantity.</p>
            )}

            <h3>{lines.length ? "Add another item" : "Add an item"}</h3>
            <form action="/quote/new" role="search" className="addbar">
              <label className="addqty" style={{ flex: 1 }}>
                <span className="sr-only">Search the catalogue</span>
                <input type="search" name="q" defaultValue={q} placeholder="Search by product, brand or model number" />
              </label>
              <button className="btn btn-navy" type="submit"><Icon name="search" />Search</button>
            </form>
            {q && results.length === 0 && <p className="muted">Nothing found for &ldquo;{q}&rdquo;. Describe it in the project notes instead and we&apos;ll source it.</p>}
            {results.length > 0 && (
              <ul className="quoteresults">
                {results.map((p) => (
                  <li key={p.id}>
                    <span><b>{p.name}</b><br /><small>{p.priceInc !== null ? `${pence(toPence(p.priceInc))} inc VAT` : "Price on application"}</small></span>
                    {onList.has(p.id) ? (
                      <span className="onlist"><Icon name="check" size={14} /> On list</span>
                    ) : (
                      <form action={addToQuote}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="btn btn-ghost btn-sm" type="submit">Add</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="panel">
          <h2><Icon name="mail" /> Your quote request</h2>
          <div className="totals">
            <div><span>Lines</span><span>{lines.length}</span></div>
            <div><span>Total units</span><span>{units}</span></div>
            <div className="grand"><span>List price inc VAT</span><span>{pence(listInc)}</span></div>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>List price only, to show the size of the job. Your quoted project price will be worked out by the team.</p>
          {lines.length > 0 ? <QuoteForm /> : <p className="muted">Add an item to send your list.</p>}
          <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>No obligation. We usually reply the same working day.</p>
        </aside>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
