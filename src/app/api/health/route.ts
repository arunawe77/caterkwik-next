import { db } from "@/server/db";

// `/api/health` answers as soon as the server is up. `/api/health?db=1` also checks the database,
// which is what a deploy waits for before it calls a release good.
export async function GET(req: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (new URL(req.url).searchParams.has("db")) {
    try {
      await db.$queryRaw`SELECT 1`;
    } catch {
      return new Response("database unavailable", { status: 503, headers });
    }
  }
  return new Response("ok", { headers });
}
