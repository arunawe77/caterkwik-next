// Imports a Caterkwik crawl workbook from the command line, the same way Admin > Import products does.
//
//   node --env-file=.env scripts/import-products.mjs <workbook.xlsx> [--check] [--update] [--publish]
//
//   --check     read the workbook and report what would change, writing nothing
//   --update    also overwrite name, prices and descriptions of products already in the catalogue
//   --publish   put new products on the storefront (otherwise they are drafts)
//
// A running site picks the new products up on its next restart, or at once if you import from the admin instead.

import { PrismaClient } from "@prisma/client";
import { applyPlan, summarise } from "../src/server/product-import/apply.ts";
import { buildPlan } from "../src/server/product-import/plan.ts";
import path from "node:path";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: node --env-file=.env scripts/import-products.mjs <workbook.xlsx> [--check] [--update] [--publish]");
  process.exit(1);
}
const options = { updateExisting: args.includes("--update"), publish: args.includes("--publish") };

const db = new PrismaClient();
const started = Date.now();
const seconds = () => `${((Date.now() - started) / 1000).toFixed(0)}s`;
let lastPhase = "";

try {
  const plan = await buildPlan(file, (p) => console.log(`[${seconds()}] ${p}`));
  console.log(`[${seconds()}] ${plan.products.length} products, ${plan.categories.length} categories in the workbook (${plan.skipped} rows skipped)`);
  const summary = args.includes("--check")
    ? await summarise(db, plan, options)
    : await applyPlan(db, plan, options, path.basename(file), (phase, done, total) => {
        if (phase !== lastPhase || done === total) console.log(`[${seconds()}] ${phase} ${done}/${total}`);
        lastPhase = phase;
      });
  console.log(summary);
  if (!args.includes("--check")) {
    await db.auditLog.create({
      data: {
        actorName: "Command line import", source: "STAFF", action: "import", entity: "import", entityId: path.basename(file),
        summary: `Imported ${path.basename(file)}: ${plan.products.length} products, ${plan.categories.length} categories`,
        after: JSON.parse(JSON.stringify({ options, result: summary })),
      },
    });
  }
} finally {
  await db.$disconnect();
}
