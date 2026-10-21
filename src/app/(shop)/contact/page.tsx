import type { Metadata } from "next";
import { EnquiryForm } from "@/components/enquiry-form";
import { pageMetadata } from "@/lib/seo";
import { COMPANY } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Contact Caterkwik",
  description: `Ask for a quote, a call back or advice. ${COMPANY.name}, Ulverston, Cumbria. ${COMPANY.phone}.`,
  path: "/contact",
});

export default function ContactPage() {
  return (
    <main className="wrap ovenpage">
      <header className="ohead">
        <h1>Contact the team</h1>
        <p className="sub">Ask for a quote, a call back, or advice on which oven to choose.</p>
      </header>
      <div className="twocol">
        <div className="panel"><EnquiryForm kind="GENERAL" choose /></div>
        <aside className="panel">
          <h2>{COMPANY.name}</h2>
          <p style={{ margin: "0 0 10px" }}>{COMPANY.address}</p>
          <p style={{ margin: "0 0 10px" }}><b>{COMPANY.phone}</b><br />{COMPANY.hours.join(" · ")}</p>
          <p className="muted" style={{ margin: 0 }}>Company registration {COMPANY.companyNumber}. VAT {COMPANY.vat}.</p>
        </aside>
      </div>
    </main>
  );
}
