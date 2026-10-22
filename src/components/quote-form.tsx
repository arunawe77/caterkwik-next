"use client";

import { ActionForm, Field } from "@/components/forms";
import { submitQuote } from "@/server/quote-actions";

export function QuoteForm() {
  return (
    <ActionForm action={submitQuote} submit="Send my project list" icon="send">
      <div className="two">
        <Field name="name" label="Your name" required autoComplete="name" />
        <Field name="email" label="Email" type="email" required autoComplete="email" />
        <Field name="phone" label="Phone" type="tel" autoComplete="tel" />
        <Field name="company" label="Company" autoComplete="organization" />
      </div>
      <Field name="postcode" label="Delivery postcode" autoComplete="postal-code" />
      <Field name="notes" label="Tell us about the project (optional)" rows={4} hint="Site and rooms, timescales, whether you need installation, and anything you couldn't find in the catalogue." />
      <div className="hp" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    </ActionForm>
  );
}
