// Checks a web-research batch against the schema and against its queue file. Prints "ok" or what is wrong.
//
//   node scripts/validate-web.mjs src/data/web/batch-001.json [...]
import fs from "node:fs";
import path from "node:path";
import { WebRecordSchema, ATTRIBUTE } from "../src/lib/product-schema.ts";

let failed = false;
for (const file of process.argv.slice(2)) {
  const problems = [];
  let data;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { console.log(`${file}: not valid JSON (${e.message})`); failed = true; continue; }
  const queueFile = path.join(path.dirname(file), "../web-queue", path.basename(file));
  const queue = fs.existsSync(queueFile) ? JSON.parse(fs.readFileSync(queueFile, "utf8")) : null;
  if (!Array.isArray(data)) { console.log(`${file}: expected an array`); failed = true; continue; }
  if (queue && queue.length !== data.length) problems.push(`has ${data.length} records, queue has ${queue.length}`);
  data.forEach((rec, i) => {
    const r = WebRecordSchema.safeParse(rec);
    if (!r.success) { problems.push(`#${i} ${rec?.id}: ${r.error.issues.slice(0, 3).map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`); return; }
    const v = r.data;
    if (queue && queue[i]?.id !== v.id) problems.push(`#${i} id ${v.id} is not the queued ${queue[i]?.id}`);
    if (v.found && !v.sources.length) problems.push(`#${i} ${v.id}: found but no sources`);
    if (!v.found && v.facts.length) problems.push(`#${i} ${v.id}: not found but has facts`);
    for (const f of v.facts) {
      if (f.source >= v.sources.length) problems.push(`#${i} ${v.id}: fact "${f.label}" points at missing source ${f.source}`);
      if (f.key && !ATTRIBUTE.has(f.key)) problems.push(`#${i} ${v.id}: unknown key "${f.key}" (omit key when none fits)`);
    }
  });
  if (problems.length) { failed = true; console.log(`${file}:\n  ` + problems.join("\n  ")); } else console.log(`${file}: ok (${data.filter((d) => d.found).length}/${data.length} found)`);
}
process.exit(failed ? 1 : 0);
