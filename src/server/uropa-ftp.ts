import { Writable } from "node:stream";
import { Client } from "basic-ftp";

// Uropa publishes its stock file, price file and product CSV on a plain FTP server (no TLS is offered).
// Credentials come from the environment (UROPA_FTP_*), which the deploy fills from GitHub secrets.
// Uropa's advice: where files are duplicated, use the one with the latest time stamp; prices (including
// reduced offers) are valid as of the file's date, so the price file is meant to be fetched daily.

export interface RemoteFile { name: string; modifiedAt: Date | undefined; size: number }

/** The newest CSV whose name matches, or null. Names are matched ignoring case. */
export function newestCsv(files: RemoteFile[], pattern?: RegExp): RemoteFile | null {
  const csvs = files.filter((f) => /\.csv$/i.test(f.name) && (!pattern || pattern.test(f.name)));
  csvs.sort((a, b) => (b.modifiedAt?.getTime() ?? 0) - (a.modifiedAt?.getTime() ?? 0));
  return csvs[0] ?? null;
}

export function uropaConfigured(env = process.env): boolean {
  return !!(env.UROPA_FTP_HOST && env.UROPA_FTP_USER && env.UROPA_FTP_PASSWORD);
}

/** Downloads the latest price file (or, failing that, the latest CSV) as text. Throws a readable message on failure. */
export async function fetchUropaPriceFile(env = process.env): Promise<{ fileName: string; text: string; available: string[] }> {
  if (!uropaConfigured(env)) throw new Error("The Uropa FTP login is not set on this server (UROPA_FTP_HOST, UROPA_FTP_USER, UROPA_FTP_PASSWORD).");
  const client = new Client(60_000);
  try {
    await client.access({ host: env.UROPA_FTP_HOST!, user: env.UROPA_FTP_USER!, password: env.UROPA_FTP_PASSWORD!, secure: false });
    const files = (await client.list("/")).filter((f) => f.isFile).map((f) => ({ name: f.name, modifiedAt: f.modifiedAt, size: f.size }));
    const file = newestCsv(files, /price/i) ?? newestCsv(files);
    if (!file) throw new Error(`No CSV file on the Uropa server. It holds: ${files.map((f) => f.name).join(", ") || "nothing"}.`);
    const chunks: Buffer[] = [];
    await client.downloadTo(new Writable({ write(chunk: Buffer, _enc, done) { chunks.push(chunk); done(); } }), file.name);
    return { fileName: file.name, text: Buffer.concat(chunks).toString("utf8"), available: files.map((f) => f.name) };
  } finally {
    client.close();
  }
}
