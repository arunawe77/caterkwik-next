import { cleanMessages, streamReply, systemFor } from "@/kit/chat";
import { dependencies } from "@/kit/client";
import { createRateLimiter } from "@/kit/rate-limit";

const MODELS = {
  primary: process.env.KIT_MODEL ?? "claude-opus-5-5",
  fallback: process.env.KIT_FALLBACK_MODEL ?? "claude-sonnet-5-5",
};
const limited = createRateLimiter(80, 60 * 60 * 1000);

const json = (status: number, error: string) => Response.json({ error }, { status });
const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

export async function POST(req: Request) {
  const client = dependencies.client();
  if (!client) return json(503, "The assistant is not configured (no API key).");
  if (limited(clientIp(req))) return json(429, "Too many messages for now. Try again shortly.");

  let body: { messages?: unknown; page?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, "bad json");
  }

  const messages = cleanMessages(body.messages);
  if (!messages.length || messages.at(-1)!.role !== "user") return json(400, "no message");

  const encoder = new TextEncoder();
  const events = streamReply(client, systemFor(body.page), messages, MODELS);

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        controller.close();
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    },
  );
}
