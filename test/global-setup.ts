import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

// Server tests run against a real Postgres, so queries, constraints and transactions are
// exercised for real. In CI, TEST_DATABASE_URL points at the job's Postgres service; locally
// a throwaway instance starts on port 54329 and is deleted afterwards.
export default async function setup() {
  const given = process.env.TEST_DATABASE_URL;
  let stop = async () => {};

  if (!given) {
    const dir = mkdtempSync(join(tmpdir(), "ck-pg-"));
    const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "postgres", port: 54329, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"] });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase("test");
    stop = async () => {
      await pg.stop();
      rmSync(dir, { recursive: true, force: true });
    };
  }

  const url = given ?? "postgresql://postgres:postgres@localhost:54329/test";
  process.env.DATABASE_URL = url;
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });

  return stop;
}
