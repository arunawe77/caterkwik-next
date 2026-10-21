"use client";

import { useEffect, useRef, useState } from "react";

interface Pending {
  id: string;
  summary: string;
  state?: "open" | "working" | "applied" | "discarded" | "failed";
  note?: string;
}
interface Action {
  tool: string;
  ok: boolean;
  note: string;
}
interface Turn {
  role: "user" | "assistant";
  content: string;
  actions?: Action[];
  pending?: Pending[];
}

const SUGGESTIONS = [
  "Which active products have no price?",
  "Show products missing a description",
  "How have sales gone in the last 30 days?",
  "What changed recently?",
];

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

// The staff assistant. It can search, create and edit the catalogue; anything that deletes or touches
// several products comes back as a card here, and nothing happens until a person presses Apply.
export function AssistantDock({ configured }: { configured: boolean }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns, busy]);

  async function send(message: string) {
    const content = message.trim();
    if (!content || busy) return;
    const next: Turn[] = [...turns, { role: "user", content }];
    setTurns(next);
    setText("");
    setBusy(true);
    try {
      const data = await post("/api/admin/assistant", { messages: next.map(({ role, content: c }) => ({ role, content: c })) });
      setTurns([...next, { role: "assistant", content: data.reply, actions: data.actions, pending: data.pending.map((p: Pending) => ({ ...p, state: "open" })) }]);
    } catch (err) {
      setTurns([...next, { role: "assistant", content: err instanceof Error ? err.message : "Something went wrong." }]);
    } finally {
      setBusy(false);
    }
  }

  async function resolve(turn: number, id: string, approve: boolean) {
    const patch = (p: Partial<Pending>) =>
      setTurns((all) => all.map((t, i) => (i === turn ? { ...t, pending: t.pending?.map((x) => (x.id === id ? { ...x, ...p } : x)) } : t)));
    patch({ state: "working" });
    try {
      const out = await post("/api/admin/assistant/confirm", { id, approve });
      patch({ state: approve ? "applied" : "discarded", note: out.message });
    } catch (err) {
      patch({ state: "failed", note: err instanceof Error ? err.message : "Failed." });
    }
  }

  return (
    <>
      {!open && <button className="ai-fab" type="button" onClick={() => setOpen(true)}>Ask the assistant</button>}
      <section className="ai-panel" hidden={!open} aria-label="Admin assistant">
        <div className="ai-top">
          <h2>Assistant</h2>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)}>×</button>
        </div>
        {!configured && <p className="ai-note">The assistant needs ANTHROPIC_API_KEY set on the server.</p>}
        <div className="ai-log" aria-live="polite">
          {!turns.length && (
            <>
              <p className="muted">Ask in plain English. I can find, create and edit products and categories, and read orders and sales. I never guess a figure, and deletes or bulk changes wait for your approval.</p>
              <div className="ai-suggest">
                {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => send(s)}>{s}</button>)}
              </div>
            </>
          )}
          {turns.map((t, i) => (
            <div key={i} className={`ai-msg ${t.role}`}>
              {t.content}
              {!!t.actions?.length && (
                <div className="ai-acts">
                  {t.actions.filter((a) => a.note !== "Looked it up").map((a, j) => <span key={j} className={`ai-chip${a.ok ? "" : " bad"}`}>{a.note}</span>)}
                </div>
              )}
              {t.pending?.map((p) => (
                <div key={p.id} className="ai-pending">
                  <p><b>Needs your approval:</b> {p.summary}</p>
                  {p.state === "open" || p.state === "working" ? (
                    <div className="row">
                      <button className="btn btn-navy btn-sm" type="button" disabled={p.state === "working"} onClick={() => resolve(i, p.id, true)}>Apply</button>
                      <button className="btn btn-ghost btn-sm" type="button" disabled={p.state === "working"} onClick={() => resolve(i, p.id, false)}>Discard</button>
                    </div>
                  ) : (
                    <p className="muted">{p.state === "applied" ? "Applied. " : p.state === "discarded" ? "" : "Not applied. "}{p.note}</p>
                  )}
                </div>
              ))}
            </div>
          ))}
          {busy && <div className="ai-msg assistant muted">Working on it...</div>}
          <div ref={end} />
        </div>
        <form className="ai-form" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
          <textarea
            rows={2} value={text} placeholder="e.g. Put all Lincat 6 burner ovens on 5% off" aria-label="Message"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }}
          />
          <button className="btn btn-navy btn-sm" type="submit" disabled={busy || !text.trim()}>Send</button>
        </form>
      </section>
    </>
  );
}
