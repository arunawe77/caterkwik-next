"use client";

import { ActionForm, Field } from "@/components/forms";
import { submitEnquiry } from "@/server/enquiry-actions";

type Kind = "QUOTE" | "CALLBACK" | "GENERAL";

const LABEL: Record<Kind, string> = { QUOTE: "Request a quote", CALLBACK: "Request a call back", GENERAL: "Send a message" };

// One form for quotes, call-backs and general enquiries. On a product page it carries the product.
export function EnquiryForm({ kind, productId, choose }: { kind: Kind; productId?: string; choose?: boolean }) {
  return (
    <ActionForm action={submitEnquiry} submit={choose ? "Send" : LABEL[kind]} success="Thanks. The team has your message and will reply, usually within one working day.">
      {choose ? (
        <label className="field">
          <span>What do you need?</span>
          <select name="kind" defaultValue={kind}>
            {(Object.keys(LABEL) as Kind[]).map((k) => <option key={k} value={k}>{LABEL[k]}</option>)}
          </select>
        </label>
      ) : <input type="hidden" name="kind" value={kind} />}
      {productId && <input type="hidden" name="productId" value={productId} />}
      <div className="two">
        <Field name="name" label="Your name" required autoComplete="name" />
        <Field name="email" label="Email" type="email" required autoComplete="email" />
        <Field name="phone" label="Phone" type="tel" autoComplete="tel" />
        <Field name="company" label="Company" autoComplete="organization" />
      </div>
      <Field name="message" label="Your message" rows={4} required hint={kind === "QUOTE" ? "Quantity, delivery postcode, and anything the team should know." : undefined} />
      {/* Honeypot: hidden from people, filled in by bots. */}
      <div className="hp" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    </ActionForm>
  );
}
