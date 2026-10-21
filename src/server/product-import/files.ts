import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Uploaded workbooks are kept here until the import is confirmed. Set IMPORT_DIR to somewhere that survives a deploy.
export const importDir = () => process.env.IMPORT_DIR ?? path.join(tmpdir(), "caterkwik-imports");

export async function ensureImportDir() {
  await mkdir(importDir(), { recursive: true });
  return importDir();
}
