import type { Prisma, PrismaClient } from "@prisma/client";
import { applyPlan, summarise, type ImportOptions } from "./apply.ts";
import { buildPlan } from "./plan.ts";

// An import is a row in ImportRun: it is created when a workbook is uploaded (a check that writes nothing), and again
// when staff confirm it (the real thing). The page polls the row for progress, so a request never has to wait on 19,000 products.

export interface RunHooks {
  /** Called after a real import has been written, to push the new catalogue to the storefront. */
  afterImport?: () => Promise<void>;
}

export const parseOptions = (value: unknown): ImportOptions => {
  const o = (value ?? {}) as Partial<ImportOptions>;
  return { updateExisting: !!o.updateExisting, publish: !!o.publish };
};

export async function createRun(db: PrismaClient, run: { actorName: string; fileName: string; filePath: string; dryRun: boolean; options: ImportOptions }) {
  return db.importRun.create({ data: { ...run, options: run.options as unknown as Prisma.InputJsonValue } });
}

export async function executeRun(db: PrismaClient, id: string, hooks: RunHooks = {}): Promise<void> {
  const run = await db.importRun.findUniqueOrThrow({ where: { id } });
  const options = parseOptions(run.options);

  // Progress is written at most once a second: the page only needs to look alive.
  let last = 0;
  const report = (phase: string, done = 0, total = 0) => {
    const now = Date.now();
    if (now - last < 1000 && done < total) return;
    last = now;
    void db.importRun.update({ where: { id }, data: { phase, done, total } }).catch(() => {});
  };

  await db.importRun.update({ where: { id }, data: { status: "RUNNING", phase: "Starting", done: 0, total: 0 } });
  try {
    const plan = await buildPlan(run.filePath, (phase) => report(phase));
    let result: unknown;
    if (run.dryRun) {
      report("Comparing with the catalogue");
      result = await summarise(db, plan, options);
    } else {
      result = await applyPlan(db, plan, options, run.fileName, report);
      await db.auditLog.create({
        data: {
          actorName: run.actorName, source: "STAFF", action: "import", entity: "import", entityId: run.id,
          summary: `Imported ${run.fileName}: ${plan.products.length} products, ${plan.categories.length} categories`,
          after: JSON.parse(JSON.stringify({ options, result })),
        },
      });
      await hooks.afterImport?.();
    }
    await db.importRun.update({
      where: { id },
      data: { status: "DONE", phase: run.dryRun ? "Checked" : "Imported", finishedAt: new Date(), result: JSON.parse(JSON.stringify(result)) },
    });
  } catch (err) {
    await db.importRun.update({
      where: { id },
      data: { status: "FAILED", phase: "Failed", finishedAt: new Date(), error: err instanceof Error ? err.message : String(err) },
    });
  }
}
