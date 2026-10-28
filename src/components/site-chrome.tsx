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

// Accreditations and partners shown in the footer, in the order the current site gives them.
const ACCREDITATIONS = [
  { name: "Investors in People", src: "/assets/img/logos/investors-in-people.png", w: 800, h: 294 },
  { name: "CEDA", src: "/assets/img/logos/ceda.png", w: 114, h: 69 },
  { name: "UKAS", src: "/assets/img/logos/ukas.jpg", w: 88, h: 61 },
  { name: "McAfee Secure", src: "/assets/img/logos/mcafee.jpg", w: 99, h: 65, href: "https://www.mcafeesecure.com/RatingVerify?ref=www.caterkwik.co.uk" },
  { name: "Energy Technology List (ECA)", src: "/assets/img/logos/eca-logo.png", w: 154, h: 47, href: "http://www.caterkwik.co.uk/energyeff.shtml#eca" },
  { name: "Carbon Trust", src: "/assets/img/logos/carbon-trust.svg", w: 1332, h: 860, href: "http://www.caterkwik.co.uk/energyeff.shtml#ctrust" },
] as const;

const PAYMENTS = [
  { name: "Visa", src: "/assets/img/payments/visa.svg" },
  { name: "Mastercard", src: "/assets/img/payments/mastercard.svg" },
  { name: "Maestro", src: "/assets/img/payments/maestro.svg" },
  { name: "PayPal", src: "/assets/img/payments/paypal.svg" },
] as const;

const SOCIAL = [
  { name: "X (Twitter)", href: "https://twitter.com/caterkwikltd", path: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" },
  { name: "Facebook", href: "https://www.facebook.com/cater.kwik", path: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" },
  { name: "YouTube", href: "https://www.youtube.com/user/Caterkwik", path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" },
] as const;

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
            <li><Link href="/reconditioned-and-graded" className="iconlink recon"><Icon name="check" />Reconditioned &amp; Graded</Link></li>
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
            <button type="submit" className="search-go" aria-label="Search"><svg viewBox="0 0 24 24" {...icon} width="18" height="18" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg></button>
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
        <div className="fband">
          <div className="fband-copy">
            <p className="fband-kicker">Trusted by caterers since {COMPANY.established}</p>
            <p className="fband-title">Independent advice, fair prices, and a team that picks up the phone.</p>
          </div>
          <a className="fband-feefo" href="https://www.feefo.com/en-GB/reviews/caterkwik?displayFeedbackType=BOTH&timeFrame=ALL" target="_blank" rel="noopener noreferrer" aria-label="Read our customer reviews on Feefo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/img/logos/feefo.png" alt="Feefo Trusted Service award" width={84} height={84} loading="lazy" />
            <span>Read our reviews</span>
          </a>
          <a className="btn btn-amber fband-mail" href="http://eepurl.com/h3wU-/" target="_blank" rel="noopener noreferrer"><Icon name="mail" />Join our mailing list</a>
        </div>

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
            <ul><li>Kitchen survey &amp; design</li><li>Installation &amp; service</li><li>Public sector</li><li><Link href="/live-consult">Book a live consultation</Link></li><li><Link href="/case-studies">Case studies</Link></li><li><Link href="/meet-the-team">Meet the team</Link></li><li><Link href="/reconditioned-and-graded">Reconditioned &amp; graded</Link></li></ul>
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

        <div className="faccred">
          <p className="faccred-title">Accreditations and partners</p>
          <ul>
            {ACCREDITATIONS.map((a) => {
              // eslint-disable-next-line @next/next/no-img-element
              const img = <img src={a.src} alt={a.name} width={a.w} height={a.h} loading="lazy" />;
              return <li key={a.name}>{"href" in a ? <a href={a.href} target="_blank" rel="noopener noreferrer" title={a.name}>{img}</a> : <span title={a.name}>{img}</span>}</li>;
            })}
          </ul>
        </div>

        <div className="fbase">
          <div className="fbase-pay">
            <span>We accept</span>
            <ul>
              {PAYMENTS.map((x) => (
                <li key={x.name} title={x.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={x.src} alt={x.name} height={22} loading="lazy" />
                </li>
              ))}
            </ul>
          </div>
          <ul className="fsocial" aria-label="Follow Cater-Kwik">
            {SOCIAL.map((x) => (
              <li key={x.name}>
                <a href={x.href} target="_blank" rel="noopener noreferrer" aria-label={x.name}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden><path d={x.path} /></svg>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="fsmall">
          <p>All prices shown are exclusive of VAT. Delivery charges may be applicable.</p>
          <p>Sales &amp; service: Mon to Fri 8am to 6pm, Sat 9am to 5pm. Next day delivery: order by 4pm, selected lines, subject to availability.</p>
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
