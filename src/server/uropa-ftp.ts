import { Writable } from "node:stream";
import { Client } from "basic-ftp";

// Uropa publishes its stock file, price file and product CSV on a plain FTP server (no TLS is offered).
// Credentials come from the environment (UROPA_FTP_*), which the deploy fills from GitHub secrets.
// Uropa's advice: where files are duplicated, use the one with the latest time stamp; prices (including
// reduced offers) are valid as of the file's date, so the price file is meant to be fetched daily.

// Uropa's product and stock file is also published at a public address (no login), which is what the one-click fetch uses.
// It holds product code, web price, promo prices, stock level and a dropped-line flag, and nothing else.
export const UROPA_FEED_URL = "https://media.nisbets.com/static/content/uropa_uk_product_stock.csv";

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

/** Downloads the public Uropa product and stock file (UROPA_FEED_URL overrides the address). Falls back to the FTP login if that is set and the download fails. */
export async function fetchUropaFeed(env = process.env): Promise<{ fileName: string; text: string }> {
  const url = env.UROPA_FEED_URL || UROPA_FEED_URL;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000), headers: { "user-agent": "Mozilla/5.0 (Caterkwik feed fetch)" } });
    if (!res.ok) throw new Error(`Uropa's feed answered HTTP ${res.status}.`);
    const text = await res.text();
    if (!/^"?[A-Za-z]/.test(text.replace(/^﻿/, "")) || !text.includes("\n")) throw new Error("Uropa's feed did not look like a CSV file.");
    return { fileName: decodeURIComponent(new URL(url).pathname.split("/").pop() || "uropa-feed.csv"), text };
  } catch (err) {
    if (!uropaConfigured(env)) throw err instanceof Error ? err : new Error("Could not download Uropa's feed.");
    return fetchUropaPriceFile(env);
  }
}
