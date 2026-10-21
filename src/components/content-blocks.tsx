import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { typeHref, type OvenType } from "@/lib/catalogue";
import { type Faq, WHY_CATERKWIK } from "@/lib/copy";
import { money } from "@/lib/format";

// Questions and answers, visible on the page and repeated as FAQPage data for search engines.
export function Faqs({ heading, faqs }: { heading: string; faqs: Faq[] }) {
  return (
    <section className="faqs">
      <h2>{heading}</h2>
      {faqs.map((f) => (
        <details key={f.q}>
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      ))}
      <JsonLd
        data={{
          "@context": "https://schema.org", "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }}
      />
    </section>
  );
}

export function WhyCaterkwik() {
  return (
    <section className="argument">
      <h2>Why buy from Caterkwik</h2>
      <div className="agrid">
        {WHY_CATERKWIK.map((w) => (
          <div key={w.title}><b style={{ fontSize: 18 }}>{w.title}</b><span>{w.text}</span></div>
        ))}
      </div>
    </section>
  );
}

// Plain links to other oven types: a crawl path from every page, and a way on for a shopper.
export function TypeLinks({ heading, types }: { heading: string; types: OvenType[] }) {
  return (
    <nav className="typelinks" aria-label={heading}>
      <h2>{heading}</h2>
      <ul>
        {types.map((t) => (
          <li key={t.slug}>
            <Link href={typeHref(t.slug)}>{t.label}</Link>
            <span>{t.fromPrice === null ? `${t.total} listed` : `from ${money(t.fromPrice)}`}</span>
          </li>
        ))}
      </ul>
    </nav>
  );
}
