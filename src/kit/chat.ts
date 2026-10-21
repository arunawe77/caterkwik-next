import { catalogueFacts } from "@/kit/facts";
import { SYSTEM_PROMPT, systemPrompt } from "@/kit/knowledge";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export type ChatEvent =
  | { type: "delta"; text: string }
  | { type: "error"; error: string }
  | { type: "done" };

// The slice of the Anthropic client Kit uses, so a test can stand in for it.
export interface KitClient {
  messages: {
    stream(params: {
      model: string;
      max_tokens: number;
      output_config: { effort: "low" };
      system: { type: "text"; text: string; cache_control: { type: "ephemeral" } }[];
      messages: Message[];
    }): AsyncIterable<{ type: string; delta?: { type: string; text?: string } }> & {
      finalMessage(): Promise<{ stop_reason: string | null }>;
    };
  };
}

const MAX_TURNS = 24;       // user and assistant messages kept per conversation
const MAX_CHARS = 4000;     // per message

export const PHONE_FALLBACK = "Sorry, I am having trouble answering just now. Try again in a moment, or call the team on 01229 480001.";
export const REFUSAL = "I cannot help with that one. The team can, on 01229 480001.";

// Only well-formed user and assistant turns, the most recent ones, each bounded.
export function cleanMessages(raw: unknown): Message[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Message =>
      !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim() !== "")
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
}

// The G3101 page keeps the single-product prompt. Every other page is grounded in the catalogue.
export const systemFor = (page: unknown): string =>
  page === "product" ? SYSTEM_PROMPT : systemPrompt(catalogueFacts());

interface Attempt {
  model: string;
  waitMs: number;
}

// The API can come back overloaded, and a demo cannot show an error for that: retry the same
// model, then fall back, and only give up after that. Retrying is only safe while nothing has
// been streamed yet; half a reply already on screen is never followed by a second one.
export async function* streamReply(
  client: KitClient,
  system: string,
  messages: Message[],
  models: { primary: string; fallback: string },
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): AsyncGenerator<ChatEvent> {
  const attempts: Attempt[] = [
    { model: models.primary, waitMs: 0 },
    { model: models.primary, waitMs: 900 },
    { model: models.fallback, waitMs: 400 },
  ];
  let sent = 0;
  let failed = false;

  for (const attempt of attempts) {
    if (attempt.waitMs) await sleep(attempt.waitMs);
    try {
      const stream = client.messages.stream({
        model: attempt.model,
        max_tokens: 8000,
        output_config: { effort: "low" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages,
      });
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
          sent += ev.delta.text.length;
          yield { type: "delta", text: ev.delta.text };
        }
      }
      if ((await stream.finalMessage()).stop_reason === "refusal") yield { type: "error", error: REFUSAL };
      failed = false;
      break;
    } catch (err) {
      failed = true;
      console.error(`[kit] attempt failed (${attempt.model}, ${sent} chars sent):`, err instanceof Error ? err.message : err);
      if (sent) break;
    }
  }

  if (failed && !sent) yield { type: "error", error: PHONE_FALLBACK };
  yield { type: "done" };
}
