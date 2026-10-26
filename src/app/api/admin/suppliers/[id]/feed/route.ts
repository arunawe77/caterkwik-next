import path from "node:path";
import { currentUser, isAdmin } from "@/server/session";
import { importFeed, SupplierError } from "@/server/suppliers";

// A supplier's price file is posted as the raw request body: it can be tens of megabytes, which the proxy would
// buffer and cut at 10 MB, so this path is left out of the proxy (see proxy.ts). The route checks staff itself.

export const maxDuration = 300;

const json = (status: number, body: object) => Response.json(body, { status });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!isAdmin(user)) return json(401, { error: "Staff only." });
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return json(403, { error: "Cross-site request refused." });
  if (!req.body) return json(400, { error: "No file was sent." });

  const fileName = path.basename(new URL(req.url).searchParams.get("name") ?? "").replace(/[^\w. -]+/g, "_");
  if (!/\.csv$/i.test(fileName)) return json(400, { error: "Choose a CSV file (.csv)." });

  const { id } = await params;
  try {
    const result = await importFeed({ id: user!.id, name: user!.name, source: "STAFF" }, id, fileName, await req.text());
    return json(200, result);
  } catch (err) {
    if (err instanceof SupplierError) return json(400, { error: err.message });
    throw err;
  }
}
