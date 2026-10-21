import { execute, TOOLS, type ToolContext } from "@/admin-ai/tools";
import { AdminError } from "@/server/catalogue-admin";

// The admin assistant: staff describe a catalogue job in plain English and Claude does it through
// the tools in tools.ts. This file is the loop that runs one staff message to a reply.

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface PendingCard {
  id: string;
  summary: string;
}

export interface ActionRecord {
  tool: string;
  ok: boolean;
  note: string;
}

export interface AssistantReply {
  reply: string;
  actions: ActionRecord[];
  pending: PendingCard[];
}

// The slice of the Anthropic client used here, so a test can stand in for it.
type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: string };
type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export interface AssistantClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system: string;
      tools: { name: string; description: string; input_schema: object }[];
      messages: { role: "user" | "assistant"; content: string | Block[] | ToolResultBlock[] }[];
      output_config: { effort: "low" | "medium" | "high" };
    }): Promise<{ content: Block[]; stop_reason: string | null }>;
  };
}

export const SYSTEM_PROMPT = `You are the catalogue assistant inside the Caterkwik admin. Caterkwik sells commercial catering equipment, mostly ovens, to professional kitchens in the UK. You work for the staff who run the shop and you act through tools that read and change the catalogue.

How to work:
- Look before you change. Find the real product with search_products or get_product, and never invent an id. If a request could match several products and the choice matters, say which ones and ask.
- Do the whole job. When asked for a batch of similar edits, make them, then summarise what changed in a short list.
- Report only what the tools returned. If a tool errors, say so plainly and what you would try instead.
- Changes that delete, or touch more than one product, are not applied when you call the tool: staff get a confirm card. After you propose one, say what you proposed and that it waits for their approval. Never say it is done.
- Single-product changes apply at once and are logged; staff can undo them. Mention the product and the exact change you made.

Data rules, which matter more than anything else here:
- Never guess. A wrong specification or price on a five thousand pound oven is the failure Caterkwik cannot have. If a figure, dimension, power rating, fuel type, warranty or price is not given by staff or already stored, leave it null. Do not fill gaps from memory of what a model "usually" has.
- A specification needs a source. Only write one when staff gave you the figures or they came from the stored record, and name that in spec.source.
- Prices are in pounds ex VAT unless told otherwise. UK VAT is 20%.
- Descriptions and SEO text must use only facts already on the product. Plain, specific, no hype. seoTitle is at most 70 characters, seoDescription at most 170.
- Never touch ratings or reviews. There are none to edit.

Orders are read only for you. If asked to change an order, explain that staff do that in the Orders screen.
Write in plain British English. Be brief.`;

const MAX_STEPS = 10;
const MAX_TURNS = 20;
const MAX_CHARS = 4000;

export function cleanMessages(raw: unknown): Message[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Message => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim() !== "")
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
}

const text = (blocks: Block[]) =>
  blocks.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text).join("\n").trim();

const TOOL_LIST = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));

export async function runAssistant(
  client: AssistantClient,
  history: Message[],
  ctx: ToolContext,
  models: { primary: string; fallback: string },
): Promise<AssistantReply> {
  const messages: { role: "user" | "assistant"; content: string | Block[] | ToolResultBlock[] }[] = history.map((m) => ({ ...m }));
  const actions: ActionRecord[] = [];
  const pending: PendingCard[] = [];
  let model = models.primary;

  for (let step = 0; step < MAX_STEPS; step++) {
    let response;
    try {
      response = await client.messages.create({ model, max_tokens: 8000, system: SYSTEM_PROMPT, tools: TOOL_LIST, messages, output_config: { effort: "medium" } });
    } catch (err) {
      console.error(`[admin-ai] ${model} failed:`, err instanceof Error ? err.message : err);
      if (model === models.fallback) return { reply: "The assistant is unavailable just now. Try again in a moment.", actions, pending };
      model = models.fallback;
      step--; // the retry on the fallback does not use up a step
      continue;
    }

    if (response.stop_reason === "refusal") return { reply: "I cannot help with that request.", actions, pending };

    const uses = response.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || !uses.length) {
      const note = response.stop_reason === "max_tokens" ? "\n\n(That reply was cut short. Ask me to carry on.)" : "";
      return { reply: (text(response.content) || "Done.") + note, actions, pending };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: ToolResultBlock[] = [];
    for (const use of uses) {
      try {
        const outcome = await execute(use.name, use.input, ctx);
        if (outcome.kind === "pending") {
          pending.push({ id: outcome.pendingId, summary: outcome.summary });
          actions.push({ tool: use.name, ok: true, note: `Waiting for approval: ${outcome.summary}` });
          results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify({ status: "awaiting_staff_approval", summary: outcome.summary, note: "Not applied yet. Tell staff it needs their approval." }) });
        } else {
          actions.push({ tool: use.name, ok: true, note: summarise(use.name, outcome.data) });
          results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(outcome.data) });
        }
      } catch (err) {
        // Validation problems are for the model to read and fix; anything else is not worth showing in full.
        const message = err instanceof AdminError || (err instanceof Error && err.name === "ZodError") ? friendly(err) : "That tool failed unexpectedly.";
        if (!(err instanceof AdminError)) console.error(`[admin-ai] tool ${use.name}:`, err);
        actions.push({ tool: use.name, ok: false, note: message });
        results.push({ type: "tool_result", tool_use_id: use.id, content: message, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }

  return { reply: "I stopped after too many steps. Say what is left and I will carry on.", actions, pending };
}

function friendly(err: Error): string {
  if (err.name !== "ZodError") return err.message;
  const issues = (err as unknown as { issues: { path: PropertyKey[]; message: string }[] }).issues;
  return issues.map((i) => `${i.path.map(String).join(".") || "input"}: ${i.message}`).join("; ");
}

const READS = new Set(["search_products", "get_product", "list_categories", "list_orders", "sales_summary", "recent_changes"]);

function summarise(tool: string, data: unknown): string {
  if (READS.has(tool)) return "Looked it up";
  const d = data as Record<string, { id?: string; name?: string; slug?: string; label?: string }> | string;
  if (typeof d === "object") {
    for (const key of ["created", "updated"]) {
      const o = d[key];
      if (o) return `${key === "created" ? "Created" : "Updated"} ${o.name ?? o.label ?? o.id ?? o.slug}`;
    }
  }
  return "Done";
}
