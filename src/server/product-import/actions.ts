"use server";

import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { currentUser, isAdmin } from "@/server/session";
import { createRun, executeRun, parseOptions } from "./run";
import { afterImport } from "./publish";

// Confirming a checked workbook: a second run on the same stored file, this time writing.
export async function confirmImport(form: FormData): Promise<void> {
  const user = await currentUser();
  if (!isAdmin(user)) redirect("/account/login?next=/admin/import");
  const checked = await db.importRun.findUnique({ where: { id: String(form.get("run") ?? "") } });
  if (!checked || !checked.dryRun || checked.status !== "DONE") redirect("/admin/import");

  const running = await db.importRun.count({ where: { dryRun: false, status: { in: ["QUEUED", "RUNNING"] } } });
  if (running) redirect(`/admin/import?run=${checked.id}`);

  const run = await createRun(db, {
    actorName: user!.name, fileName: checked.fileName, filePath: checked.filePath, dryRun: false,
    options: parseOptions({ updateExisting: form.get("update") === "on", publish: form.get("publish") === "on" }),
  });
  void executeRun(db, run.id, { afterImport });
  redirect(`/admin/import?run=${run.id}`);
}
