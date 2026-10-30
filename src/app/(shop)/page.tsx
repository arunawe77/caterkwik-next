import type { Metadata } from "next";
import Link from "next/link";
import { Faqs, TypeLinks, WhyCaterkwik } from "@/components/content-blocks";
import { Icon, type IconName } from "@/components/icons";
import { JsonLd } from "@/components/json-ld";
import { CatalogueKit } from "@/components/kit-chat";
import { ProductCard } from "@/components/product-card";
import { caseStudies, caseStudyImage, splitStory, type CaseStudy } from "@/lib/case-studies";
import { everyProduct, productHref, products, shopRoots, types, typeHref } from "@/lib/catalogue";
import { departments, spread, showable } from "@/lib/home-mix";
import { Carousel, CountUp, GlowArea, HeroShowcase, HeroSpot, Reveal, ScrollWords, type ShowcaseSlide } from "@/components/home-motion";
import { homeFaqs } from "@/lib/copy";
import { money } from "@/lib/format";
import { absolute, pageMetadata } from "@/lib/seo";
import { COMPANY } from "@/lib/site";
import "@/styles/home.css";
import "@/styles/home-premium.css";

export const metadata: Metadata = pageMetadata({
  title: "Caterkwik | Commercial catering equipment, supplied and serviced",
  description: `Commercial catering equipment, from ovens and cooking equipment to refrigeration and bar: ${everyProduct().length} products with internet prices and traditional service since ${COMPANY.established}.`,
  path: "/",
});

const FEATURED = ["6-burner-range", "convectionovens", "cook--hold--ovens", "wood-fired-ovens"];
const STRIP = FEATURED;
const STORIES = ["La Brasseria", "Framptons", "Beatons Tearooms"];
const SERVICES: { icon: IconName; title: string; text: string }[] = [
  { icon: "ruler", title: "Kitchen survey and design", text: "Layouts and equipment lists planned around how your kitchen really works." },
  { icon: "truck", title: "Delivery", text: "Our own logistics team, with live updates on your Caterkwik account." },
  { icon: "wrench", title: "Installation and service", text: "Gas safe registered engineers for installation, servicing and repairs." },
  { icon: "key", title: "Lease and finance", text: "Spread the cost with weekly lease prices on selected equipment." },
];

export default function Home() {
  const all = everyProduct();
  const depts = departments(12);
  // One lane per category, so the row is not ovens from end to end.
  const picks = spread(all.filter((p) => showable(p) && p.leaseWeek !== null), (p) => p.type, 10);
  const range = spread(all.filter(showable), (p) => p.type, 12);
  const showcase = depts.slice(0, 6).map((d) => d.product);
  const slides: ShowcaseSlide[] = (showcase.length ? showcase : picks.slice(0, 5)).map((p) => ({
    href: productHref(p), name: p.name, brand: p.brand, image: p.image, price: money(p.priceEx!), lease: p.leaseWeek !== null ? money(p.leaseWeek) : null,
  }));
  const years = new Date().getFullYear() - COMPANY.established;
  const stories = STORIES.map((t) => caseStudies.find((c) => c.title.startsWith(t))).filter((c): c is CaseStudy => !!c && !!caseStudyImage(c));
  const brands = Object.entries(
    all.reduce<Record<string, number>>((m, p) => (p.brand ? { ...m, [p.brand]: (m[p.brand] ?? 0) + 1 } : m), {}),
  ).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name]) => name);
  const allHref = shopRoots().length ? "/shop/commercial-catering-equipment" : "/cooking";
  const tel = `tel:${COMPANY.phone.replace(/\s+/g, "")}`;

  return (
    <main className="home">
      <noscript><style>{".reveal{opacity:1!important;transform:none!important}"}</style></noscript>
      <header className="hm-hero">
        <HeroSpot />
        <div className="hm-aurora" aria-hidden><i /><i /><i /></div>
        <div className="wrap">
          <div>
            <p className="eyebrow">Established {COMPANY.established}</p>
            <h1><span className="ln"><span>Commercial catering</span></span> <span className="ln"><span>equipment, <em>supplied</em></span></span> <span className="ln"><span><em>and serviced</em></span></span></h1>
            <p className="sub">
              Internet prices with traditional service. From a single oven to a full kitchen refit, we advise, deliver, install and look
              after it for years to come.
            </p>
            <div className="hm-actions">
              <Link className="btn btn-primary" href={allHref}>Shop all equipment</Link>
              <Link className="btn btn-ghostdark" href="/quote">Get a quote</Link>
              <a className="btn btn-ghostdark" href={tel}><Icon name="phone" />{COMPANY.phone}</a>
            </div>
            <p className="hm-popular">
              <span>Popular</span>
              {depts.slice(0, 5).map((d) => <Link key={d.key} href={d.href}>{d.label}</Link>)}
            </p>
            <ul className="hm-nums">
              <li><CountUp to={years} suffix="+" /><span>years supplying caterers</span></li>
              <li><CountUp to={all.length} /><span>products across cooking, refrigeration, bar, display and more</span></li>
              <li><CountUp to={caseStudies.length} /><span>customer stories</span></li>
            </ul>
          </div>
          <HeroShowcase slides={slides} />
        </div>
      </header>

      <section className="hm-trust" aria-label="Why customers choose us">
        <div className="wrap">
          <ul>
            <li><Icon name="check" /><div><b>Price match promise</b><span>Internet prices, honestly matched</span></div></li>
            <li><Icon name="truck" /><div><b>Our own logistics</b><span>Delivery updates on your account</span></div></li>
            <li><Icon name="wrench" /><div><b>Installation and service</b><span>Gas safe engineers, after-sales care</span></div></li>
            <li><Icon name="phone" /><div><b>Real people on the phone</b><span>Here 8am to 6pm, Monday to Saturday</span></div></li>
          </ul>
        </div>
      </section>

      {brands.length > 0 && (
        <section className="hm-marquee" aria-label="Brands we supply">
          <div className="hm-marquee-track">
            {[0, 1].map((k) => (
              <ul key={k} aria-hidden={k === 1}>{brands.map((b) => <li key={b}>{b}<i /></li>)}</ul>
            ))}
          </div>
        </section>
      )}

      <section className="hm-statement">
        <div className="wrap">
          <p className="eyebrow">Why Caterkwik</p>
          <ScrollWords text="Internet prices with traditional service. We advise, supply, deliver, install and look after commercial catering equipment, with real people on the phone from the first question to the engineer visit." />
        </div>
      </section>

      <section className="hm-recon" aria-label="Reconditioned and graded equipment">
        <div className="wrap">
          <div>
            <p className="eyebrow">Reconditioned &amp; Graded</p>
            <h2>Looking to save? Ask about reconditioned and graded equipment</h2>
            <p>Availability changes, so tell us what you need and we will come back with what we have.</p>
          </div>
          <Link className="btn btn-primary" href="/reconditioned-and-graded">See reconditioned &amp; graded</Link>
        </div>
      </section>

      {depts.length > 0 && (
        <div className="wrap ovenpage">
          <section className="hm-sec">
            <div className="hm-head">
              <div><h2>Shop by department</h2><p>Cooking, refrigeration, display, bar and more, priced and supported the same way.</p></div>
              <Link className="hm-link" href={allHref}>All equipment &rarr;</Link>
            </div>
            <Reveal><GlowArea className="hm-depts">
              {depts.map((d) => (
                <Link key={d.key} className="hm-dept glow" href={d.href}>
                  <span className="pic">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.product.image} alt="" loading="lazy" width={240} height={240} />
                  </span>
                  <div>
                    <h3>{d.label}</h3>
                    <p>{d.live} available{d.fromPrice !== null ? `, from ${money(d.fromPrice)}` : ""}</p>
                  </div>
                </Link>
              ))}
            </GlowArea></Reveal>
          </section>
        </div>
      )}

      {range.length > 0 && (
        <div className="wrap ovenpage">
          <section className="hm-sec">
            <div className="hm-head"><div><h2>Popular products</h2><p>A cross-section of what is in stock, from every part of the kitchen.</p></div><Link className="hm-link" href={allHref}>See everything &rarr;</Link></div>
            <Carousel label="Popular products in stock">{range.map((p) => <div key={p.id} className="hm-car-card"><ProductCard product={p} /></div>)}</Carousel>
          </section>
        </div>
      )}

      <div className="wrap ovenpage">
        <section className="hm-sec">
          <div className="hm-head">
            <div><h2>Popular ovens</h2><p>{types.length} oven types, each with its own buying guide and filters.</p></div>
            <Link className="hm-link" href="/ovens">All commercial ovens &rarr;</Link>
          </div>
          <Reveal><GlowArea className="hm-tiles">
            {STRIP.map((slug) => {
              const t = types.find((x) => x.slug === slug);
              if (!t) return null;
              return (
                <Link key={slug} className="hm-tile glow" href={typeHref(slug)}>
                  <span className="pic">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/assets/img/ovens-hub/${slug}.webp`} alt="" loading="lazy" width={370} height={370} />
                  </span>
                  <div>
                    <span className="count">{t.live} available</span>
                    <h3>{t.label}</h3>
                    <p>{t.audience}</p>
                    <span className="go" aria-hidden>Shop now &rarr;</span>
                  </div>
                </Link>
              );
            })}
          </GlowArea></Reveal>
        </section>
      </div>

      <section className="hm-services">
        <div className="wrap">
          <div className="hm-head"><div><h2>More than a box on a pallet</h2><p>Help at every stage, from the first question to the engineer visit.</p></div></div>
          <Reveal><GlowArea className="hm-svc">
            {SERVICES.map((s, n) => (
              <article key={s.title} className="glow">
                <small>0{n + 1}</small>
                <span className="ic"><Icon name={s.icon} size={22} /></span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </article>
            ))}
          </GlowArea></Reveal>
        </div>
      </section>

      <div className="wrap ovenpage">
        <section className="hm-sec">
          <div className="hm-head"><div><h2>Lease from a few pounds a week</h2><p>In stock now across the range, with weekly lease prices shown.</p></div></div>
          {picks.length > 0 && <Carousel label="In stock with lease prices">{picks.map((p) => <div key={p.id} className="hm-car-card"><ProductCard product={p} /></div>)}</Carousel>}
        </section>

        {stories.length > 0 && (
          <section className="hm-sec">
            <div className="hm-head">
              <div><h2>Trusted by kitchens like yours</h2><p>Real customers, from pubs and cafés to schools and laundries.</p></div>
              <Link className="hm-link" href="/case-studies">Read all {caseStudies.length} case studies &rarr;</Link>
            </div>
            <Reveal><div className="hm-stories">
              {stories.map((c) => (
                <Link key={c.title} href="/case-studies" className="hm-story">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={caseStudyImage(c)!} alt="" loading="lazy" />
                  <div><h3>{c.title}</h3><p>{splitStory(c.body, 150).lead}</p></div>
                </Link>
              ))}
            </div></Reveal>
          </section>
        )}

        <section className="hm-cta">
          <div>
            <h2>Not sure what you need?</h2>
            <p>Talk to our team or book a live consultation. We will help you choose the right equipment for your kitchen and budget.</p>
          </div>
          <div className="hm-ctabtns">
            <Link className="btn btn-primary" href="/live-consult">Book a live consultation</Link>
            <Link className="btn btn-ghostdark" href="/contact">Contact the team</Link>
          </div>
        </section>

        {shopRoots().length > 0 && <TypeLinks heading="Shop all departments" types={shopRoots()} />}
        <TypeLinks heading="All oven types" types={types} />
        <WhyCaterkwik />
        <Faqs heading="Questions about buying an oven" faqs={homeFaqs(products, types.length)} />
        <CatalogueKit />
      </div>

      <JsonLd
        data={[
          {
            "@context": "https://schema.org", "@type": "Organization", name: COMPANY.name, url: absolute("/"),
            telephone: COMPANY.phone, foundingDate: String(COMPANY.established), address: COMPANY.address,
          },
          {
            "@context": "https://schema.org", "@type": "WebSite", name: "Caterkwik", url: absolute("/"),
            potentialAction: { "@type": "SearchAction", target: absolute("/search?q={search_term_string}"), "query-input": "required name=search_term_string" },
          },
        ]}
      />
    </main>
  );
}

// Rendered per request from the catalogue in memory, so an admin change shows at once and a restart never serves a stale build.
export const dynamic = "force-dynamic";
