import { startBackgroundCheck } from "@/server/competitor-check";

// Called by the server's scheduler with `Authorization: Bearer <CRON_SECRET>`. It starts a background run and answers
// at once, so the scheduler never waits on the 30 second gaps between requests to a site.
async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET is not set", { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("forbidden", { status: 403 });
  const started = startBackgroundCheck({ id: null, name: "Automatic check", source: "STAFF" }, { max: 40, budgetMs: 45 * 60_000 });
  return Response.json({ started }, { status: started ? 202 : 200, headers: { "Cache-Control": "no-store" } });
}

export const GET = run;
export const POST = run;
