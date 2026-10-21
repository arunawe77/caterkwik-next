// A local Postgres for development, with no install: data lives in ./.pgdata.
//
//   node scripts/dev-db.mjs        starts it and keeps it running (Ctrl+C to stop)
//
// DATABASE_URL=postgresql://postgres:postgres@localhost:54320/caterkwik

import { existsSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";

const port = Number(process.env.DEV_DB_PORT ?? 54320);
const pg = new EmbeddedPostgres({ databaseDir: ".pgdata", user: "postgres", password: "postgres", port, persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"] });

const fresh = !existsSync(".pgdata/PG_VERSION");
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase("caterkwik");
console.log(`Postgres ready: postgresql://postgres:postgres@localhost:${port}/caterkwik`);

const stop = async () => { await pg.stop(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
