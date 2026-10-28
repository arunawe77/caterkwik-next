import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { caseStudies, caseStudyDocument, caseStudyImage, splitStory } from "@/lib/case-studies";
import { pageMetadata } from "@/lib/seo";
import { COMPANY } from "@/lib/site";
import "@/styles/home.css";

export const metadata: Metadata = pageMetadata({
  title: "Case studies",
  description: `${caseStudies.length} real customers, from a single dishwasher to a full kitchen refit. Since ${COMPANY.established}, Caterkwik has supplied, installed and looked after their equipment.`,
  path: "/case-studies",
});

export default function CaseStudiesPage() {
  return (
    <main className="wrap ovenpage">
      <header className="ohead">
        <p className="eyebrow">Customer stories</p>
        <h1>Case studies</h1>
        <p className="sub cs-intro">
          Since {COMPANY.established} we have focused on outstanding customer service, expert advice and the right solution at a market
          leading price, from a gastronorm pan next day to a full kitchen and extraction refit. It is easy to talk the talk, so here are
          real examples of customers we have had the privilege of working with.
        </p>
      </header>

      <div className="cs-grid">
        {caseStudies.map((c) => {
          const img = caseStudyImage(c);
          const doc = caseStudyDocument(c);
          const { lead, rest } = splitStory(c.body, 230);
          return (
            <article key={c.title + c.image} className="cs-card">
              {img && (
                <div className="cs-shot">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt="" loading="lazy" />
                </div>
              )}
              <div className="cs-body">
                <h2>{c.title}</h2>
                <p className="cs-text">{lead}</p>
                {rest && (
                  <details className="cs-more">
                    <summary>Read the full story</summary>
                    <p className="cs-text">{rest}</p>
                  </details>
                )}
                {doc && (
                  <a className="cs-doc" href={doc} target="_blank" rel="noopener noreferrer">
                    <Icon name="file" size={16} />View project details
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <section className="hm-cta cs-cta">
        <div>
          <h2>Planning your own project?</h2>
          <p>Tell us what you need and we will work out the right equipment, delivery and installation.</p>
        </div>
        <div className="hm-ctabtns">
          <Link className="btn btn-primary" href="/quote">Get a quote</Link>
          <Link className="btn btn-ghostdark" href="/contact">Contact the team</Link>
        </div>
      </section>
    </main>
  );
}
