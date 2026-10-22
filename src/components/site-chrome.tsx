import Link from "next/link";
import usps from "@/legacy/usps.json";
import { CartLink } from "@/components/cart-link";
import { QuoteLink } from "@/components/quote-link";
import { Icon } from "@/components/icons";
import { VatSwitch } from "@/components/vat-switch";
import { navDepartments, type NavNode } from "@/lib/nav-tree";
import { COMPANY } from "@/lib/site";

// How many sub categories a column shows before it hands over to its own page.
const PER_COLUMN = 7;

const tel = `tel:${COMPANY.phone.replace(/\s/g, "")}`;
const icon = { fill: "none", stroke: "currentColor", strokeWidth: 2 } as const;

function Column({ column, cap = PER_COLUMN }: { column: NavNode; cap?: number }) {
  const shown = column.children.slice(0, cap);
  const more = column.children.length - shown.length;
  return (
    <div className={cap === Infinity ? "mcol flow" : "mcol"}>
      <strong>{column.href ? <Link href={column.href}>{column.label}</Link> : column.label}</strong>
      {shown.length > 0 && (
        <ul>
          {shown.map((c) => <li key={c.label + (c.href ?? "")}>{c.href ? <Link href={c.href}>{c.label}</Link> : c.label}</li>)}
          {more > 0 && column.href && <li className="more"><Link href={column.href}>All {column.label.toLowerCase()} ({column.children.length})</Link></li>}
        </ul>
      )}
    </div>
  );
}

// Department > category > sub category. Plain links under CSS hover and focus, so it works with no script, keyboards
// reach it, and every category is in the page for a crawler to follow.
function DepartmentNav() {
  const departments = navDepartments();
  return (
    <nav className="cats" aria-label="Departments">
      <div className="wrap">
        {departments.map((d) => (
          <div key={d.label} className="dept">
            <Link href={d.href} aria-haspopup="true" title={d.label}>{d.short ?? d.label}</Link>
            <div className="mega">
              <div className="mgrid">
                {d.columns.filter((c) => c.children.length > 0).map((c) => <Column key={c.label + (c.href ?? "")} column={c} />)}
                {/* Categories with nothing beneath them share one list, rather than each leaving a heading with a gap under it. */}
                {d.columns.some((c) => c.children.length === 0) && (
                  <Column cap={Infinity} column={{ label: `Also in ${d.label}`, count: 0, children: d.columns.filter((c) => c.children.length === 0) }} />
                )}
              </div>
              <Link className="mall" href={d.href}>Shop all {d.label.toLowerCase()}</Link>
            </div>
          </div>
        ))}
        <Link className="alldepts" href="/shop/commercial-catering-equipment">All departments</Link>
      </div>
    </nav>
  );
}

export function Header() {
  return (
    <>
      <div className="utility">
        <div className="wrap">
          <ul className="hide-sm">
            <li><strong>Est. {COMPANY.established}</strong> · Internet prices with traditional service</li>
            <li>Price match promise</li>
            <li>Feefo Platinum Trusted Service</li>
          </ul>
          <ul>
            <li>Here for you 8am to 6pm, Mon to Sat</li>
            <li><a href={tel} className="iconlink"><Icon name="phone" />{COMPANY.phone}</a></li>
            <li><Link href="/account" className="iconlink"><Icon name="user" />Account</Link></li>
            <li><Link href="/live-consult" className="iconlink"><Icon name="phone" />Book a live consultation</Link></li>
            <li><QuoteLink /></li>
            <li><CartLink /></li>
          </ul>
        </div>
      </div>
      <header className="site">
        <div className="wrap hrow">
          <Link href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo" src="/assets/img/caterkwik-logo.png" alt="Cater-Kwik" />
          </Link>
          <form className="search" action="/search" role="search">
            <svg viewBox="0 0 24 24" {...icon} width="18" height="18" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="search" name="q" placeholder="Search by product, brand or model number" aria-label="Search" />
          </form>
          <VatSwitch />
          <a className="phone" href={tel}>
            <span className="ring">
              <svg viewBox="0 0 24 24" {...icon} width="17" height="17" aria-hidden>
                <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
              </svg>
            </span>
            <span><b>{COMPANY.phone}</b><span>Sales &amp; service, Mon to Sat</span></span>
          </a>
        </div>
      </header>
      <DepartmentNav />
      <div dangerouslySetInnerHTML={{ __html: usps }} />
    </>
  );
}

export function Footer() {
  return (
    <footer className="site">
      <div className="wrap">
        <div className="fgrid">
          <div>
            <strong>Cooking</strong>
            <ul>
              <li><Link href="/ovens">Commercial ovens</Link></li>
              <li><Link href="/ovens/6-burner-range">6 burner ovens</Link></li>
              <li><Link href="/ovens/convectionovens">Convection ovens</Link></li>
              <li><Link href="/ovens/wood-fired-ovens">Wood fired ovens</Link></li>
              <li><Link href="/contact" className="iconlink"><Icon name="mail" size={15} />Contact the team</Link></li>
            </ul>
          </div>
          <div>
            <strong>Services</strong>
            <ul><li>Kitchen survey &amp; design</li><li>Installation &amp; service</li><li>Public sector</li><li><Link href="/live-consult">Book a live consultation</Link></li><li><Link href="/meet-the-team">Meet the team</Link></li><li>Reconditioned &amp; graded</li></ul>
          </div>
          <div>
            <strong>Talk to us</strong>
            <ul><li>{COMPANY.phone}</li>{COMPANY.hours.map((h) => <li key={h}>{h}</li>)}</ul>
          </div>
          <div style={{ maxWidth: "34ch" }}>
            <strong>{COMPANY.name}</strong>
            <ul>
              <li>{COMPANY.address}</li>
              <li>Company Reg {COMPANY.companyNumber}</li>
              <li>VAT {COMPANY.vat}</li>
              <li>Established {COMPANY.established}</li>
            </ul>
          </div>
        </div>
        <p className="demonote">
          <b>Staging preview for Caterkwik, prepared by Awe Creative.</b> Nothing here can be ordered. Products, prices and
          availability were read from caterkwik.co.uk on 23 September 2026; where a figure is not published the page says so.
          Photographs are Caterkwik&apos;s own.
        </p>
      </div>
    </footer>
  );
}
