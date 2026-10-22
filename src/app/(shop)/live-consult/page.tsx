import type { Metadata } from "next";
import { EnquiryForm } from "@/components/enquiry-form";
import { Icon, type IconName } from "@/components/icons";
import { pageMetadata } from "@/lib/seo";
import { COMPANY } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Book a live consultation",
  description: `Book a face to face consultation with a member of the ${COMPANY.name} team. We build your quote with you, to suit your budget.`,
  path: "/live-consult",
});

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "send", title: "Tell us what you need", text: "Fill in the short form. A line or two about your kitchen or project is plenty." },
  { icon: "phone", title: "We get in touch", text: "A member of the team contacts you to agree a time that suits you." },
  { icon: "list", title: "Build your quote together", text: "We go through the shop with you and shape the quote around your budget." },
];

const POINTS: { icon: IconName; title: string; text: string }[] = [
  { icon: "user", title: "Unbiased expert advice", text: "Straight answers from people who know the equipment." },
  { icon: "ruler", title: "Kitchen survey and design", text: "Layouts that fit the space and the way you cook." },
  { icon: "truck", title: "In-house logistics", text: "Our own delivery, so we control the whole journey." },
  { icon: "wrench", title: "Certified installation and service", text: "Fitted and looked after by our own engineers." },
];

export default function LiveConsultPage() {
  return (
    <main className="wrap ovenpage">
      <section className="lc-hero">
        <div>
          <p className="kicker">Live consultation</p>
          <h1>Book a face to face consultation with the team</h1>
          <p className="sub">
            We will navigate the shop with you and build your quote to suit your budget, helping at every step.
            Around 40,000 products, parts, spares and accessories to choose from.
          </p>
          <div className="lc-actions">
            <a className="btn btn-navy" href="#book"><Icon name="send" />Book a consultation</a>
            <a className="btn btn-ghost" href={`tel:${COMPANY.phone.replace(/\s/g, "")}`}><Icon name="phone" />{COMPANY.phone}</a>
          </div>
        </div>
        <aside className="lc-hours">
          <h2>Here for you</h2>
          {COMPANY.hours.map((h) => <p key={h}>{h}</p>)}
        </aside>
      </section>

      <ol className="lc-steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="panel">
            <span className="lc-num">{i + 1}</span>
            <h2><Icon name={s.icon} />{s.title}</h2>
            <p>{s.text}</p>
          </li>
        ))}
      </ol>

      <div className="twocol" id="book">
        <div className="panel">
          <h2>Request your consultation</h2>
          <p className="muted">Tell us how we can help and we will contact you to arrange a time.</p>
          <EnquiryForm kind="CALLBACK" />
        </div>
        <aside className="lc-points">
          {POINTS.map((p) => (
            <div key={p.title} className="lc-point">
              <span className="lc-ico"><Icon name={p.icon} /></span>
              <div><h3>{p.title}</h3><p>{p.text}</p></div>
            </div>
          ))}
          <p className="muted">{COMPANY.address}</p>
        </aside>
      </div>
    </main>
  );
}
