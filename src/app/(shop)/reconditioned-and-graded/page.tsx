import type { Metadata } from "next";
import { EnquiryForm } from "@/components/enquiry-form";
import { Icon } from "@/components/icons";
import { pageMetadata } from "@/lib/seo";
import { COMPANY } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Reconditioned and graded equipment",
  description: `Looking to save on commercial catering equipment? Ask ${COMPANY.name} about reconditioned and graded equipment.`,
  path: "/reconditioned-and-graded",
});

export default function ReconditionedPage() {
  const tel = `tel:${COMPANY.phone.replace(/\s/g, "")}`;
  return (
    <main className="wrap ovenpage">
      <section className="lc-hero">
        <div>
          <p className="kicker">Reconditioned &amp; Graded</p>
          <h1>Reconditioned and graded equipment</h1>
          <p className="sub">
            Looking to save on a new kitchen? Ask us about reconditioned and graded equipment. What we hold changes, so tell us what you are
            looking for and the team will come back with what is available.
          </p>
          <div className="lc-actions">
            <a className="btn btn-navy" href="#ask"><Icon name="send" />Ask about equipment</a>
            <a className="btn btn-ghost" href={tel}><Icon name="phone" />{COMPANY.phone}</a>
          </div>
        </div>
        <aside className="lc-hours">
          <h2>Here for you</h2>
          {COMPANY.hours.map((h) => <p key={h}>{h}</p>)}
        </aside>
      </section>

      <div className="panel" id="ask">
        <h2>Tell us what you need</h2>
        <p className="muted">The make or type of equipment, roughly what you can spend, and when you need it by. A line or two is plenty.</p>
        <EnquiryForm kind="QUOTE" />
      </div>
    </main>
  );
}
