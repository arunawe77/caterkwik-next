import { requireStaff } from "@/admin-ai/guard";
import { resolvePending } from "@/admin-ai/tools";
import { AdminError } from "@/server/catalogue-admin";

const json = (status: number, error: string) => Response.json({ error }, { status });

// The only way a proposed destructive change is applied: a signed-in staff member's click.
export async function POST(req: Request) {
  const guard = await requireStaff(req);
  if ("error" in guard) return guard.error;
  const { user } = guard;

  let body: { id?: unknown; approve?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, "bad json");
  }
  if (typeof body.id !== "string" || typeof body.approve !== "boolean") return json(400, "id and approve are required");

  try {
    const out = await resolvePending(body.id, body.approve, { userId: user.id, actor: { id: user.id, name: `${user.name} via assistant`, source: "AI" } });
    return Response.json(out);
  } catch (err) {
    if (err instanceof AdminError) return json(409, err.message);
    console.error("[admin-ai] confirm failed:", err);
    return json(500, "That change could not be applied.");
  }
}
