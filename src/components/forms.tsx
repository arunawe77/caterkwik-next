"use client";

import { useActionState } from "react";
import { Icon, type IconName } from "@/components/icons";
import type { FormState } from "@/server/request";

// A form that posts to a server action and shows what comes back, with or without JavaScript.
export function ActionForm({
  action, submit, success, icon, children,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submit: string;
  success?: string;
  icon?: IconName;
  children: React.ReactNode;
}) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form className="form" action={run}>
      {children}
      {state.error && <p className="alert" role="alert">{state.error}</p>}
      {state.ok && success && <p className="okmsg" role="status">{success}</p>}
      <button className="btn btn-navy" type="submit" disabled={pending}>{icon && <Icon name={icon} />}{pending ? "One moment..." : submit}</button>
    </form>
  );
}

export function Field({
  name, label, type = "text", required, autoComplete, defaultValue, rows, hint,
}: {
  name: string; label: string; type?: string; required?: boolean; autoComplete?: string; defaultValue?: string; rows?: number; hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}{required && <i aria-hidden> *</i>}</span>
      {rows
        ? <textarea name={name} rows={rows} required={required} defaultValue={defaultValue} />
        : <input name={name} type={type} required={required} autoComplete={autoComplete} defaultValue={defaultValue} />}
      {hint && <small>{hint}</small>}
    </label>
  );
}
