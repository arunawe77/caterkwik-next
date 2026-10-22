import Link from "next/link";
import { FUEL_LABELS } from "@/lib/labels";
import { money } from "@/lib/format";
import { productHref, type Product } from "@/lib/catalogue";

export interface Design { id: string; title: string; note: string; wide?: boolean }

export const DESIGNS: Design[] = [
  { id: "B", title: "Datasheet", note: "Reads like the manufacturer's data plate. Model code, a proper spec table with real units, price in a footer bar. For buyers who already know what they need." },
  { id: "D", title: "Floor footprint", note: "A plan view at scale with the six burners drawn in. Answers 'will it fit my kitchen?' before anyone clicks." },
  { id: "E", title: "Model number", note: "Oversized model code behind the photo. Confident and editorial, with very little text." },
  { id: "F", title: "Spotlight", note: "The oven lit on a dark stage. Premium feel for the high-end ranges." },
  { id: "H", title: "Fuel colour block", note: "A tinted panel with the fuel named in outline type, so gas, electric and dual-fuel can be told apart across a whole grid." },
  { id: "I", title: "Flip card", note: "Photo and price on the front. Hover or tab onto it and it turns over to show specs and both buttons." },
  { id: "J", title: "Tabs", note: "Overview, Specs and Lease in one card. Everything is there, nothing crowds the grid." },
  { id: "M", title: "Marketplace", note: "Familiar shop layout: stars, price, reassurance line, one strong button." },
  { id: "N", title: "Quote builder", note: "Quantity stepper and line total. Made for restaurant fit-outs buying several units." },
  { id: "O", title: "Spec gauges", note: "Output, width and burners as gauges, so size and power read at a glance without numbers." },
  { id: "P", title: "Pinned print", note: "A tilted photo print with a strip of tape. Friendly and independent-supplier." },
  { id: "Q", title: "Disc", note: "Product on a round tinted disc with the price in a pill on its rim. Calm and centred." },
  { id: "R", title: "Diagonal", note: "A slanted navy band behind the oven gives a sense of movement. Brand label cut into the band." },
  { id: "S", title: "Menu leaders", note: "Specs set like a restaurant menu with dotted leaders. A nod to the customer's own world." },
  { id: "T", title: "Ticket", note: "Perforated stub with a barcode and a TOTAL line. Playful and memorable." },
  { id: "U", title: "Mobile row", note: "Compact side-by-side card made for phones, where a tall card wastes the screen." },
];

function data(p: Product) {
  const s = p.spec;
  const fuel = s?.fuel.length ? s.fuel.map((f) => FUEL_LABELS[f] ?? f) : [];
  return {
    short: p.name.replace(/\s+with\s+.*$/i, "").replace(/\s+-\s+CK.*$/, ""),
    model: p.name.match(/\b[A-Z]{1,3}\d{3,5}\b/)?.[0] ?? p.id.toUpperCase(),
    fuelText: fuel.join(" or "),
    gas: fuel.some((f) => /gas|lpg/i.test(f)),
    w: s?.width ?? null, d: s?.depth ?? null, h: s?.height ?? null,
    kw: s?.kwTotal ?? null, burners: s?.burners ?? 6,
    oven: s?.ovenType === "convection" ? "Fan" : s?.ovenType ? "Static" : null,
    warranty: s?.warrantyYears ?? 3,
    ex: p.priceEx === null ? "POA" : money(p.priceEx),
    inc: p.priceInc === null ? null : money(p.priceInc),
    lease: p.leaseWeek === null ? null : money(p.leaseWeek),
    leaseNum: p.leaseWeek === null ? null : p.leaseWeek.toFixed(2),
    stock: p.stock === "in-stock" ? "In stock" : p.stock === "discontinued" ? "Discontinued" : "Price on application",
  };
}

const Cut = ({ p, className = "" }: { p: Product; className?: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img className={`cut ${className}`} src={p.image} alt="" loading="lazy" />
);
const Stars = () => <span className="stars"><i /><span>17 reviews</span></span>;

export function DesignCard({ id, p }: { id: string; p: Product }) {
  const href = productHref(p);
  const d = data(p);
  const name = <h3><Link href={href}>{d.short}</Link></h3>;
  const dims = d.w && d.d && d.h ? `${d.w} × ${d.d} × ${d.h} mm` : null;

  switch (id) {
    case "B":
      return (
        <article className="dx dxB">
          <header><span className="mono">{d.model}</span><span>{d.stock}</span></header>
          <Link href={href} tabIndex={-1} aria-hidden className="pic"><Cut p={p} /></Link>
          <div className="in"><span className="brand">{p.brand}</span>{name}</div>
          <table>
            <tbody>
              <tr><th>Fuel</th><td>{d.fuelText || "-"}</td></tr>
              <tr><th>W × D × H</th><td className="mono">{dims ?? "-"}</td></tr>
              <tr><th>Output</th><td className="mono">{d.kw ? `${d.kw} kW` : "-"}</td></tr>
              <tr><th>Oven</th><td>{d.oven ? `${d.oven}, 2/1 GN` : "-"}</td></tr>
              <tr><th>Warranty</th><td>{d.warranty} years parts and labour</td></tr>
            </tbody>
          </table>
          <footer><span><b>{d.ex}</b><small>ex VAT</small></span><Link className="go" href={href}>View</Link></footer>
        </article>
      );
    case "D":
      return (
        <article className="dx dxD">
          <div className="plan">
            <div className="foot" style={{ aspectRatio: `${d.w ?? 900} / ${d.d ?? 770}` }}>
              {Array.from({ length: d.burners }).map((_, i) => <i key={i} />)}
              <span className="mono">{d.w} × {d.d}</span>
            </div>
          </div>
          <div className="in">
            <p className="kick">Floor space needed</p>
            {name}
            <div className="chips"><span>{d.fuelText}</span><span>{d.kw} kW</span><span>{d.h} mm high</span></div>
            <div className="buy"><b>{d.ex}</b><small>ex VAT</small><Link className="go" href={href}>View</Link></div>
          </div>
        </article>
      );
    case "E":
      return (
        <article className="dx dxE">
          <span className="ghost" aria-hidden>{d.model}</span>
          <Link href={href} tabIndex={-1} aria-hidden className="pic"><Cut p={p} /></Link>
          <div className="in">
            <p className="kick">{p.brand}</p>
            {name}
            <div className="line"><b>{d.ex}</b><Link href={href}>View range →</Link></div>
          </div>
        </article>
      );
    case "F":
      return (
        <article className="dx dxF">
          <Link href={href} tabIndex={-1} aria-hidden className="pic"><Cut p={p} /></Link>
          <div className="in">
            <p className="kick">{p.brand} · {d.model}</p>
            {name}
            <p className="sub">{d.fuelText} · {d.w} mm · {d.kw} kW</p>
            <div className="line"><b>{d.ex}</b><span>ex VAT</span></div>
            <Link className="go" href={href}>Discover</Link>
          </div>
        </article>
      );
    case "H":
      return (
        <article className="dx dxH">
          <span className="fuelword" aria-hidden>{d.gas ? "GAS" : "ELEC"}</span>
          <Link href={href} tabIndex={-1} aria-hidden className="pic"><Cut p={p} /></Link>
          <div className="mid"><p className="kick">{d.fuelText}</p>{name}</div>
          <div className="foot"><div><b>{d.ex}</b><small>ex VAT</small></div><Link className="go" href={href}>View</Link></div>
        </article>
      );
    case "I":
      return (
        <article className="dx dxI" tabIndex={0}>
          <div className="flip">
            <div className="front">
              <Cut p={p} />
              {name}
              <b className="pr">{d.ex}</b>
              <span className="hint">Hover for specs</span>
            </div>
            <div className="back">
              <p className="kick">{d.model}</p>
              <ul>
                <li><span>Fuel</span>{d.fuelText}</li>
                <li><span>Width</span>{d.w} mm</li>
                <li><span>Output</span>{d.kw} kW</li>
                <li><span>Burners</span>{d.burners}</li>
                <li><span>Warranty</span>{d.warranty} years</li>
              </ul>
              <Link className="go" href={href}>View product</Link>
              <Link className="go ghost" href={href}>Add to quote</Link>
            </div>
          </div>
        </article>
      );
    case "J":
      return (
        <article className="dx dxJ">
          <input type="radio" name="jt" id="j1" defaultChecked /><input type="radio" name="jt" id="j2" /><input type="radio" name="jt" id="j3" />
          <div className="pic"><Cut p={p} /></div>
          {name}
          <div className="bar"><label htmlFor="j1">Overview</label><label htmlFor="j2">Specs</label><label htmlFor="j3">Lease</label></div>
          <div className="panes">
            <div className="pn pn1"><p>{d.fuelText} · {d.w} mm wide · {d.oven} oven · {d.kw} kW</p><p className="pr"><b>{d.ex}</b> <small>ex VAT</small></p></div>
            <div className="pn pn2"><ul><li><span>Dimensions</span>{dims}</li><li><span>Burners</span>{d.burners}</li><li><span>Warranty</span>{d.warranty} years</li></ul></div>
            <div className="pn pn3"><p className="pr"><b>{d.lease}</b> <small>a week</small></p><p>Spread the cost. Ask for a lease quote on this oven.</p></div>
          </div>
          <Link className="go" href={href}>View product</Link>
        </article>
      );
    case "M":
      return (
        <article className="dx dxM">
          <div className="pic"><Cut p={p} /></div>
          {name}
          <Stars />
          <div className="pr"><b>{d.ex}</b><small>ex VAT</small></div>
          <p className="inc">{d.inc} inc VAT</p>
          <p className="ok">{d.stock}</p>
          <p className="sub">{d.warranty} years parts and labour warranty</p>
          <Link className="go" href={href}>Add to quote</Link>
        </article>
      );
    case "N":
      return (
        <article className="dx dxN">
          <div className="row1"><Cut p={p} /><div>{name}<p className="sub">{d.model} · {d.kw} kW</p></div></div>
          <div className="qty"><span className="lbl">Quantity</span><span className="step"><button type="button" aria-label="Fewer">−</button><b>2</b><button type="button" aria-label="More">+</button></span></div>
          <div className="tot"><span>2 × {d.ex}</span><b>{p.priceEx === null ? "POA" : money(p.priceEx * 2)}</b></div>
          <small className="ex">ex VAT</small>
          <Link className="go" href={href}>Add to quote</Link>
          <Link className="alt" href={href}>or view details</Link>
        </article>
      );
    case "O":
      return (
        <article className="dx dxO">
          <div className="pic"><Cut p={p} /></div>
          {name}
          <div className="gauges">
            <div><span>Output</span><i style={{ ["--v" as string]: `${Math.min(100, ((d.kw ?? 0) / 40) * 100)}%` }} /><b>{d.kw} kW</b></div>
            <div><span>Width</span><i style={{ ["--v" as string]: `${Math.min(100, ((d.w ?? 0) / 1200) * 100)}%` }} /><b>{d.w} mm</b></div>
            <div><span>Burners</span><i style={{ ["--v" as string]: `${Math.min(100, (d.burners / 10) * 100)}%` }} /><b>{d.burners}</b></div>
          </div>
          <div className="buy"><b>{d.ex}</b><Link className="go" href={href}>View</Link></div>
        </article>
      );
    case "P":
      return (
        <article className="dx dxP">
          <div className="print"><span className="tape" /><Cut p={p} /></div>
          {name}
          <p className="sub">{d.fuelText} · {d.w} mm · {d.kw} kW</p>
          <div className="line"><b>{d.ex}</b><Link className="go" href={href}>View</Link></div>
        </article>
      );
    case "Q":
      return (
        <article className="dx dxQ">
          <div className="disc"><Cut p={p} /><span className="pill">{d.ex}</span></div>
          {name}
          <p className="sub">{d.fuelText} · {d.w} mm · {d.kw} kW</p>
          <Link className="go" href={href}>View product</Link>
        </article>
      );
    case "R":
      return (
        <article className="dx dxR">
          <div className="band"><span className="brandcut">{p.brand}</span><Cut p={p} /></div>
          <div className="in">
            {name}
            <p className="sub">{d.fuelText} · {d.w} mm · {d.kw} kW</p>
            <div className="line"><b>{d.ex}</b><small>ex VAT</small><Link className="go" href={href}>View</Link></div>
          </div>
        </article>
      );
    case "S":
      return (
        <article className="dx dxS">
          <div className="pic"><Cut p={p} /></div>
          <p className="kick">{p.brand}</p>
          {name}
          <ul>
            <li><span>Fuel</span><i /><b>{d.fuelText}</b></li>
            <li><span>Width</span><i /><b>{d.w} mm</b></li>
            <li><span>Output</span><i /><b>{d.kw} kW</b></li>
            <li><span>Warranty</span><i /><b>{d.warranty} years</b></li>
            <li className="tot"><span>Price</span><i /><b>{d.ex}</b></li>
          </ul>
          <Link className="go" href={href}>See the full spec</Link>
        </article>
      );
    case "T":
      return (
        <div className="dx dxT">
          <article>
            <div className="top"><Cut p={p} /><span className="mono">{d.model}</span></div>
            {name}
            <p className="sub mono">{d.fuelText.toUpperCase()} · {d.w} MM · {d.kw} KW</p>
            <div className="tear" />
            <div className="tot"><span>TOTAL EX VAT</span><b className="mono">{d.ex}</b></div>
            <div className="code" aria-hidden />
            <Link className="go" href={href}>View product</Link>
          </article>
        </div>
      );
    case "U":
      return (
        <article className="dx dxU">
          <Link href={href} tabIndex={-1} aria-hidden className="pic"><Cut p={p} /></Link>
          <div className="in">
            {name}
            <p className="sub">{d.w} mm · {d.kw} kW</p>
            <b className="pr">{d.ex}</b>
            <small>ex VAT</small>
            <Link className="go" href={href}>View</Link>
          </div>
        </article>
      );
    default:
      return null;
  }
}
