import { currentUser, isAdmin, type SessionUser } from "@/server/session";

const json = (status: number, error: string) => Response.json({ error }, { status });

// Staff only, and only from this site's own pages: a JSON body with a matching Origin, so another
// site cannot make a signed-in staff member's browser drive the assistant.
export async function requireStaff(req: Request): Promise<{ user: SessionUser } | { error: Response }> {
  const user = await currentUser();
  if (!isAdmin(user)) return { error: json(401, "Staff only.") };
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return { error: json(403, "Cross-site request refused.") };
  if (!req.headers.get("content-type")?.includes("application/json")) return { error: json(415, "Send JSON.") };
  return { user: user! };
}
