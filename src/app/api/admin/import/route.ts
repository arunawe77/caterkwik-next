import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createRun, executeRun } from "@/server/product-import/run";
import { ensureImportDir } from "@/server/product-import/files";
import { afterImport } from "@/server/product-import/publish";
import { db } from "@/server/db";
import { currentUser, isAdmin } from "@/server/session";

// The workbook is posted as the raw request body and streamed straight to disk: it can be hundreds of megabytes,
// so it is never held in memory. This path is left out of the proxy (see proxy.ts), which would buffer the body.

export const maxDuration = 300;

const json = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const user = await currentUser();
  if (!isAdmin(user)) return json(401, "Staff only.");
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return json(403, "Cross-site request refused.");
  if (!req.body) return json(400, "No file was sent.");

  const url = new URL(req.url);
  const fileName = path.basename(url.searchParams.get("name") ?? "").replace(/[^\w. -]+/g, "_");
  if (!/\.xlsx$/i.test(fileName)) return json(400, "Choose an Excel workbook (.xlsx).");

  const filePath = path.join(await ensureImportDir(), `${Date.now()}-${fileName}`);
  await pipeline(Readable.fromWeb(req.body as import("node:stream/web").ReadableStream), createWriteStream(filePath));

  const run = await createRun(db, {
    actorName: user!.name, fileName, filePath, dryRun: true,
    options: { updateExisting: url.searchParams.get("update") === "1", publish: url.searchParams.get("publish") === "1" },
  });
  void executeRun(db, run.id, { afterImport });
  return Response.json({ id: run.id });
}
