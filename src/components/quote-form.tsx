"use client";

import { ActionForm, Field } from "@/components/forms";
import { submitQuote } from "@/server/quote-actions";

export function QuoteForm({ defaults = {} }: { defaults?: { name?: string; email?: string; phone?: string; company?: string } }) {
  return (
    <ActionForm action={submitQuote} submit="Send my project list" icon="send">
      <div className="two">
        <Field name="name" label="Your name" required autoComplete="name" defaultValue={defaults.name} />
        <Field name="email" label="Email" type="email" required autoComplete="email" defaultValue={defaults.email} />
        <Field name="phone" label="Phone" type="tel" autoComplete="tel" defaultValue={defaults.phone} />
        <Field name="company" label="Company" autoComplete="organization" defaultValue={defaults.company} />
      </div>
      <Field name="postcode" label="Delivery postcode" autoComplete="postal-code" />
      <Field name="notes" label="Tell us about the project (optional)" rows={4} hint="Site and rooms, timescales, whether you need installation, and anything you couldn't find in the catalogue." />
      <div className="hp" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    </ActionForm>
  );
}
