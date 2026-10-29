import type { Metadata } from "next";
import Link from "next/link";
import { CaseStudyGrid } from "@/components/case-study-grid";
import { caseStudies, caseStudyDocument, caseStudyImage, sectorOf } from "@/lib/case-studies";
import { pageMetadata } from "@/lib/seo";
import { COMPANY } from "@/lib/site";
import "@/styles/home.css";

export const metadata: Metadata = pageMetadata({
  title: "Case studies",
  description: `${caseStudies.length} real customers, from a single dishwasher to a full kitchen refit. Since ${COMPANY.established}, Caterkwik has supplied, installed and looked after their equipment.`,
  path: "/case-studies",
});

export default function CaseStudiesPage() {
  const stories = caseStudies.map((c) => ({
    title: c.title,
    text: c.body,
    image: caseStudyImage(c),
    document: caseStudyDocument(c),
    sector: sectorOf(c),
  }));
  const years = new Date().getFullYear() - COMPANY.established;

  return (
    <main className="cs-page">
      <header className="cs-hero">
        <div className="wrap">
          <p className="eyebrow">Customer stories</p>
          <h1>Real kitchens. <em>Real results.</em></h1>
          <p className="sub">
            From a gastronorm pan next day to a full kitchen and extraction refit, here are the customers we have had the privilege of
            working with.
          </p>
          <ul className="cs-stats">
            <li><b>{caseStudies.length}</b><span>customer stories</span></li>
            <li><b>{years}+</b><span>years since {COMPANY.established}</span></li>
          </ul>
        </div>
      </header>

      <div className="wrap ovenpage">
        <CaseStudyGrid stories={stories} />

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
      </div>
    </main>
  );
}
