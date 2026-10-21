import { cleanMessages, runAssistant } from "@/admin-ai/assistant";
import { dependencies } from "@/admin-ai/client";
import { requireStaff } from "@/admin-ai/guard";
import { createRateLimiter } from "@/kit/rate-limit";

const MODELS = {
  primary: process.env.ADMIN_AI_MODEL ?? "claude-opus-5-5",
  fallback: process.env.ADMIN_AI_FALLBACK_MODEL ?? "claude-sonnet-5-5",
};
const limited = createRateLimiter(120, 60 * 60 * 1000);

const json = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const guard = await requireStaff(req);
  if ("error" in guard) return guard.error;
  const { user } = guard;

  const client = dependencies.client();
  if (!client) return json(503, "The assistant is not configured (no ANTHROPIC_API_KEY).");
  if (limited(user.id)) return json(429, "Too many requests for now. Try again shortly.");

  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, "bad json");
  }
  const messages = cleanMessages(body.messages);
  if (!messages.length || messages.at(-1)!.role !== "user") return json(400, "no message");

  const reply = await runAssistant(client, messages, { userId: user.id, actor: { id: user.id, name: `${user.name} via assistant`, source: "AI" } }, MODELS);
  return Response.json(reply);
}
