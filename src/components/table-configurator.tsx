"use client";

import { useState } from "react";
import { ActionForm, Field } from "@/components/forms";
import { Icon } from "@/components/icons";
import {
  CHAMFERS, DEFAULT_SPEC, GANTRIES, LIMITS, MAX_TABLES, TABLE_TYPES, UNDERSHELVES, UPSTANDS, parseSpec, specLines,
  type TableSpec,
} from "@/lib/table-spec";
import { submitTableQuote } from "@/server/table-actions";

type Draft = { [K in keyof TableSpec]: K extends "width" | "depth" | "height" | "quantity" ? string : TableSpec[K] };

const STEPS = ["Table", "Size", "Undershelf", "Gantry", "Extras", "Review"] as const;

const start: Draft = {
  ...DEFAULT_SPEC,
  width: String(DEFAULT_SPEC.width), depth: String(DEFAULT_SPEC.depth), height: String(DEFAULT_SPEC.height), quantity: String(DEFAULT_SPEC.quantity),
};

function Choice<T extends string>({ name, value, options, onChange }: {
  name: string; value: T; options: readonly { value: T; label: string; note?: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="tcchoices" role="radiogroup">
      {options.map((o) => (
        <label key={o.value} className={o.value === value ? "tcchoice on" : "tcchoice"}>
          <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
          <b>{o.label}</b>
          {o.note && <small>{o.note}</small>}
        </label>
      ))}
    </div>
  );
}

// Builds a made-to-measure stainless steel table one decision at a time, then sends the specification to the team to price.
export function TableConfigurator({ defaults = {} }: { defaults?: { name?: string; email?: string; phone?: string; company?: string } }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(start);
  const [error, setError] = useState("");
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft((d) => ({ ...d, [key]: value })); setError(""); };

  const parsed = parseSpec(draft);
  const last = step === STEPS.length - 1;

  // The size step is the only one that can be wrong, so it is the only one that stops you moving on.
  const next = () => {
    if (step === 1 && !parsed.ok) { setError(parsed.error); return; }
    setStep(step + 1);
  };

  return (
    <div className="tc">
      <ol className="tcsteps" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? "on" : i < step ? "done" : undefined} aria-current={i === step ? "step" : undefined}>
            <button type="button" onClick={() => (i <= step || parsed.ok) && setStep(i)} disabled={i > step && !parsed.ok}>
              <span>{i < step ? <Icon name="check" size={14} /> : i + 1}</span>{label}
            </button>
          </li>
        ))}
      </ol>

      <div className="tcgrid">
        <section className="panel tcpanel" aria-live="polite">
          {step === 0 && (
            <>
              <h2>1. Wall table or centre table?</h2>
              <Choice name="type" value={draft.type} options={TABLE_TYPES} onChange={(v) => set("type", v)} />
            </>
          )}
          {step === 1 && (
            <>
              <h2>2. How big?</h2>
              <p className="muted">Whole millimetres. Our standard tables are 600 to 1800mm wide, 600 to 800mm deep and 900mm high; bespoke sizes are made to order.</p>
              <div className="tcsizes">
                {(["width", "depth", "height"] as const).map((k) => (
                  <label key={k} className="field">
                    <span>{k[0].toUpperCase() + k.slice(1)} (mm)</span>
                    <input type="number" inputMode="numeric" value={draft[k]} min={LIMITS[k].min} max={LIMITS[k].max} step={1} onChange={(e) => set(k, e.target.value)} />
                    <small>{LIMITS[k].min} to {LIMITS[k].max}</small>
                  </label>
                ))}
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <h2>3. Undershelf</h2>
              <Choice name="undershelf" value={draft.undershelf} options={UNDERSHELVES} onChange={(v) => set("undershelf", v)} />
            </>
          )}
          {step === 3 && (
            <>
              <h2>4. Gantry</h2>
              <p className="muted">A shelf above the table for plates and pass-through service.</p>
              <Choice name="gantry" value={draft.gantry} options={GANTRIES} onChange={(v) => set("gantry", v)} />
            </>
          )}
          {step === 4 && (
            <>
              <h2>5. Optional extras</h2>
              <h3>Chamfered corners</h3>
              <Choice name="chamfer" value={draft.chamfer} options={CHAMFERS} onChange={(v) => set("chamfer", v)} />
              <h3>Upstand</h3>
              <Choice name="upstand" value={draft.upstand} options={UPSTANDS} onChange={(v) => set("upstand", v)} />
              <h3>Feet</h3>
              <Choice name="castors" value={draft.castors ? "yes" : "no"} options={[{ value: "no", label: "Adjustable feet" }, { value: "yes", label: "Castors" }]} onChange={(v) => set("castors", v === "yes")} />
            </>
          )}
          {last && (
            <>
              <h2>6. Check it and send it</h2>
              <p className="muted">We price every table to order and reply with a quote, usually within one working day. Nothing is charged by sending this.</p>
              <ActionForm action={submitTableQuote} submit="Send my table for a quote" icon="send">
                {(Object.keys(draft) as (keyof Draft)[]).map((k) => (
                  <input key={k} type="hidden" name={k} value={String(draft[k] === true ? "on" : draft[k] === false ? "" : draft[k])} />
                ))}
                <label className="field">
                  <span>Quantity</span>
                  <input type="number" inputMode="numeric" value={draft.quantity} min={1} max={MAX_TABLES} onChange={(e) => set("quantity", e.target.value)} />
                </label>
                <div className="two">
                  <Field name="name" label="Your name" required autoComplete="name" defaultValue={defaults.name} />
                  <Field name="email" label="Email" type="email" required autoComplete="email" defaultValue={defaults.email} />
                  <Field name="phone" label="Phone" type="tel" autoComplete="tel" defaultValue={defaults.phone} />
                  <Field name="company" label="Company" autoComplete="organization" defaultValue={defaults.company} />
                </div>
                <Field name="postcode" label="Delivery postcode" autoComplete="postal-code" />
                <Field name="notes" label="Anything else? (optional)" rows={3} hint="Sinks, cut-outs, fixings, a drawing you can email us, or a deadline." />
                <div className="hp" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
              </ActionForm>
            </>
          )}

          {error && <p className="alert" role="alert">{error}</p>}
          <div className="tcnav">
            {step > 0 && <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>Back</button>}
            {!last && <button type="button" className="btn btn-navy" onClick={next}>Next step</button>}
          </div>
        </section>

        <aside className="panel tcsummary" aria-label="Your table">
          <h2>Your table</h2>
          {parsed.ok ? (
            <dl>{specLines(parsed.spec).map((l) => <div key={l.label}><dt>{l.label}</dt><dd>{l.value}</dd></div>)}</dl>
          ) : (
            <p className="muted">{parsed.error}</p>
          )}
          <p className="muted">Fully welded, 1.2mm 304 stainless steel top, 430 grade legs and undershelves. Made in-house.</p>
        </aside>
      </div>
    </div>
  );
}
