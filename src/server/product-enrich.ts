import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { AdminError, type Actor } from "@/server/catalogue-admin";
import { refreshCatalogue } from "@/server/catalogue-store";
import { db } from "@/server/db";

// The Enrich button on a product: searches the web for the exact model, and adds the specifications and a description
// it finds. It follows scripts/web-research.md: only what a source states, the same model only, nothing from memory.
// It only adds: a specification label or description already on the product is never overwritten, and the sources are
// recorded on the product for staff to check.

interface Findings { found: boolean; facts: { label: string; value: string }[]; description: string | null; sources: string[]; notes: string | null }

const PROMPT = `You are researching UK commercial catering equipment for Caterkwik. Use web search to find every specification the web publishes for this exact model: dimensions, weights, capacities, power and gas ratings, voltage, materials, what is in the box, certifications, warranty, EAN.
Prefer the manufacturer's page or datasheet, then UK catering suppliers. Check the part number matches: a different size, fuel, voltage or series is a different product, so do not use it.
Rules: record only what a page states. No figures from memory or from a similar model. If sources disagree, leave that figure out. A wrong figure on an expensive oven is the failure we cannot have.
The description is 2 to 3 sentences in your own words, never a seller's copy.
Finish with ONLY a JSON object, no other text: {"found": boolean, "facts": [{"label": string, "value": string (with unit)}], "description": string|null, "sources": [urls you opened], "notes": string|null}`;

function parse(text: string): Findings {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new AdminError("The web search did not come back with anything usable. Try again.");
  const j = JSON.parse(m[0]) as Partial<Findings>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  return {
    found: j.found === true,
    facts: (Array.isArray(j.facts) ? j.facts : []).map((f) => ({ label: str(f?.label, 60), value: str(f?.value, 200) })).filter((f) => f.label && f.value).slice(0, 80),
    description: str(j.description, 1000) || null,
    sources: (Array.isArray(j.sources) ? j.sources : []).map((s) => str(s, 300)).filter((s) => /^https?:\/\//.test(s)).slice(0, 10),
    notes: str(j.notes, 500) || null,
  };
}

async function research(query: string): Promise<Findings> {
  if (!process.env.ANTHROPIC_API_KEY) throw new AdminError("Enrich needs ANTHROPIC_API_KEY to be set on the server.");
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: `${PROMPT}\n\nProduct: ${query}` }];
  const model = process.env.ENRICH_MODEL ?? process.env.ADMIN_AI_FALLBACK_MODEL ?? "claude-sonnet-5-5";
  // Searches run on Anthropic's side; a long turn is paused and handed back to continue.
  for (let turn = 0; turn < 5; turn++) {
    const r = await client.messages.create({ model, max_tokens: 4000, messages, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }] });
    if (r.stop_reason !== "pause_turn") return parse(r.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n"));
    messages.push({ role: "assistant", content: r.content });
  }
  throw new AdminError("The web search took too long. Try again.");
}

export interface EnrichResult { found: boolean; added: number; description: boolean; notes: string | null }

export async function enrichProduct(actor: Actor, id: string): Promise<EnrichResult> {
  const p = await db.product.findUnique({ where: { id }, include: { detail: true } });
  if (!p) throw new AdminError(`There is no product "${id}".`);
  const mpn = p.detail?.mpn;
  const f = await research([p.name, p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? `(brand ${p.brand})` : "", mpn ? `manufacturer part number ${mpn}` : ""].filter(Boolean).join(" "));
  if (!f.found || (!f.facts.length && !f.description)) return { found: false, added: 0, description: false, notes: f.notes };

  const attrs = { ...((p.detail?.attributes ?? {}) as Record<string, string>) };
  const have = new Set(Object.keys(attrs).map((k) => k.toLowerCase()));
  let added = 0;
  for (const { label, value } of f.facts) {
    if (have.has(label.toLowerCase())) continue;
    attrs[label] = value;
    have.add(label.toLowerCase());
    added++;
  }
  const flag = `Specifications added from the web (${f.sources.join(", ") || "sources not recorded"}); check against the manufacturer`;
  const flags = [...(p.detail?.dataFlags ?? []).filter((x) => !x.startsWith("Specifications added from the web")), ...(added ? [flag] : [])];
  await db.productDetail.upsert({
    where: { productId: id },
    create: { productId: id, attributes: attrs, dataFlags: flags, sourceFile: "Web enrichment" },
    update: { attributes: attrs, dataFlags: flags },
  });
  const description = !p.description && f.description;
  if (description) await db.product.update({ where: { id }, data: { description } });

  await db.auditLog.create({
    data: {
      actorId: actor.id, actorName: actor.name, source: actor.source, action: "update", entity: "product", entityId: id,
      summary: `Enriched from the web: ${added} specifications${description ? " and a description" : ""} added`,
      after: { sources: f.sources, notes: f.notes } as unknown as Prisma.InputJsonValue,
    },
  });
  await refreshCatalogue();
  return { found: true, added, description: Boolean(description), notes: f.notes };
}

// ---- The queue: ticked products are enriched one after another in the background ------------------------------------------

export interface EnrichQueueState { running: boolean; total: number; done: number; added: number; nothing: number; failed: number; current: string; startedAt: Date | null; finishedAt: Date | null }
const queue: EnrichQueueState = { running: false, total: 0, done: 0, added: 0, nothing: 0, failed: 0, current: "", startedAt: null, finishedAt: null };
export const enrichQueueStatus = (): EnrichQueueState => ({ ...queue });

/** Starts enriching the products one at a time. False if a queue is already running. */
export function startEnrichQueue(actor: Actor, ids: string[]): boolean {
  if (queue.running) return false;
  const todo = [...new Set(ids)].slice(0, 200);
  Object.assign(queue, { running: true, total: todo.length, done: 0, added: 0, nothing: 0, failed: 0, current: "", startedAt: new Date(), finishedAt: null });
  void (async () => {
    for (const id of todo) {
      queue.current = id;
      try {
        const r = await enrichProduct(actor, id);
        if (r.found) queue.added += r.added; else queue.nothing++;
      } catch (err) {
        queue.failed++;
        if (!(err instanceof AdminError)) console.error("enrich failed", id, err);
      }
      queue.done++;
    }
  })().finally(() => { queue.running = false; queue.current = ""; queue.finishedAt = new Date(); });
  return true;
}
