// Copies the product images the catalogue links to on www.caterkwik.co.uk (Product.image and the gallery in
// ProductDetail.images) onto the media server under products/site/<folder>/<name>, then (with --rewrite-db) points
// the catalogue at the copies. Resumable: files already on the server are skipped, and a URL that cannot be fetched
// is left pointing at the original. Failures are listed in mirror-failures.txt.
//
//   node --env-file=.env scripts/mirror-images.mjs [--limit N] [--rewrite-db]
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import SftpClient from "ssh2-sftp-client";
import { PrismaClient } from "@prisma/client";

const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1] ?? true; };
const limit = Number(arg("--limit")) || Infinity;
const rewrite = process.argv.includes("--rewrite-db");
const CONCURRENCY = 6; // each worker has its own SFTP session: the link is latency-bound, not bandwidth-bound
const HOST = "www.caterkwik.co.uk";
const remoteDir = (process.env.MEDIA_REMOTE_DIR ?? "/mnt/media").replace(/\/+$/, "");
for (const k of ["MEDIA_SFTP_HOST", "MEDIA_SFTP_USER", "MEDIA_SFTP_PASSWORD", "MEDIA_SFTP_HOST_FINGERPRINT", "DATABASE_URL"])
  if (!process.env[k]) { console.error(`${k} is not set`); process.exit(1); }
const pinned = process.env.MEDIA_SFTP_HOST_FINGERPRINT.replace(/^SHA256:/, "").replace(/=+$/, "");

const db = new PrismaClient();
const keyOf = (u) => {
  let x; try { x = new URL(u); } catch { return null; }
  if (x.host !== HOST) return null;
  const parts = x.pathname.split("/").filter(Boolean);
  const folder = parts.at(-2), file = parts.at(-1)?.toLowerCase().replace(/\.jpeg$/, ".jpg");
  if (!["products", "fullsize", "thumbs"].includes(folder) || !/^[a-z0-9][a-z0-9_-]{0,80}\.(jpg|png|webp|gif)$/.test(file ?? "")) return null;
  return `products/site/${folder}/${file}`;
};
const isImage = (b) => (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) || b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ||
  b.subarray(0, 3).toString("latin1") === "GIF" || (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP");

const products = await db.product.findMany({ select: { id: true, image: true } });
const details = await db.productDetail.findMany({ select: { productId: true, images: true } });
const urls = new Map(); // url -> key
const add = (u) => { if (typeof u === "string" && u.startsWith("http")) { const k = keyOf(u); if (k) urls.set(u, k); } };
for (const p of products) add(p.image);
for (const d of details) for (const i of d.images ?? []) { add(i.url); add(i.thumb); }
console.log(`${urls.size} images to mirror`);

const open = async () => {
  const sftp = new SftpClient();
  await sftp.connect({
    host: process.env.MEDIA_SFTP_HOST, port: Number(process.env.MEDIA_SFTP_PORT ?? 22), username: process.env.MEDIA_SFTP_USER,
    password: process.env.MEDIA_SFTP_PASSWORD, readyTimeout: 20000, keepaliveInterval: 15000,
    algorithms: { serverHostKey: ["ssh-ed25519"] },
    hostVerifier: (key) => createHash("sha256").update(key).digest("base64").replace(/=+$/, "") === pinned,
  });
  return sftp;
};
let sftp = await open();
const have = new Set();
for (const f of ["products", "fullsize", "thumbs"]) {
  await sftp.mkdir(`${remoteDir}/products/site/${f}`, true);
  for (const e of await sftp.list(`${remoteDir}/products/site/${f}`)) if (e.size > 0) have.add(`products/site/${f}/${e.name}`);
}
console.log(`${have.size} already on the server`);

const failures = [];
const todo = [...urls].filter(([, k]) => !have.has(k)).slice(0, limit);
let done = 0, ok = 0, bytes = 0, next = 0;
const started = Date.now();
// Files take the server's default permissions (world-readable), so no chmod round trip per file.
// A dropped connection can leave a call waiting forever, so every upload is given a deadline and then retried on a new session.
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("upload timed out")), ms))]);
async function upload(session, buf, key) {
  for (let a = 0; ; a++) {
    try { await withTimeout(session.c.put(buf, `${remoteDir}/${key}`), 45000); return; }
    catch (e) { if (a >= 2) throw e; session.c.end().catch(() => {}); session.c = await withTimeout(open(), 30000); }
  }
}
async function worker() {
  const session = { c: await open() };
  while (next < todo.length) {
    const [url, key] = todo[next++];
    try {
      let buf;
      for (let a = 0; ; a++) {
        try {
          const res = await fetch(url, { headers: { "User-Agent": "caterkwik-media-migration" }, signal: AbortSignal.timeout(30000) });
          if (res.status === 404 || res.status === 410) throw Object.assign(new Error("404"), { final: true });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          buf = Buffer.from(await res.arrayBuffer());
          break;
        } catch (e) { if (e.final || a >= 2) throw e; await new Promise((r) => setTimeout(r, 1000 * (a + 1))); }
      }
      if (buf.length < 100 || buf.length > 25 * 1024 * 1024 || !isImage(buf)) throw new Error("not an image");
      await upload(session, buf, key);
      ok++; bytes += buf.length;
    } catch (e) { failures.push(`${url}\t${e.message}`); }
    if (++done % 500 === 0) console.log(`${done}/${todo.length} (${ok} ok, ${failures.length} failed, ${(bytes / 1e6).toFixed(0)} MB, ${Math.round((Date.now() - started) / 1000)}s)`);
  }
  await session.c.end().catch(() => {});
}
// If nothing has been stored for two minutes a connection has gone stale: exit with 2 so the caller starts it again
// (the run is resumable). Without this a dead worker can stall the whole run silently.
let lastStored = Date.now(), lastOk = -1;
setInterval(() => { if (ok !== lastOk) { lastOk = ok; lastStored = Date.now(); } else if (Date.now() - lastStored > 120000 && next < todo.length) { console.log("stalled, restarting"); process.exit(2); } }, 10000).unref();
process.on("uncaughtException", (e) => console.log("ignored connection error:", e.message));
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
fs.writeFileSync("mirror-failures.txt", failures.join("\n") + (failures.length ? "\n" : ""));
console.log(`downloaded and stored ${ok}, failed ${failures.length}${failures.length ? " (see mirror-failures.txt)" : ""}`);

// What is on the server now decides which links may be rewritten.
const onServer = new Set();
for (const f of ["products", "fullsize", "thumbs"]) for (const e of await sftp.list(`${remoteDir}/products/site/${f}`)) if (e.size > 0) onServer.add(`products/site/${f}/${e.name}`);
await sftp.end();
const swap = (u) => { const k = typeof u === "string" ? urls.get(u) : null; return k && onServer.has(k) ? `/media/${k}` : u; };
let pc = 0, dc = 0;
for (const p of products) {
  const image = swap(p.image);
  if (image === p.image) continue;
  pc++; if (rewrite) await db.product.update({ where: { id: p.id }, data: { image } });
}
for (const d of details) {
  if (!Array.isArray(d.images)) continue;
  const images = d.images.map((i) => ({ ...i, url: swap(i.url), thumb: swap(i.thumb) }));
  if (JSON.stringify(images) === JSON.stringify(d.images)) continue;
  dc++; if (rewrite) await db.productDetail.update({ where: { productId: d.productId }, data: { images } });
}
console.log(`${rewrite ? "rewrote" : "would rewrite"} ${pc} product images and ${dc} galleries${rewrite ? "" : " (add --rewrite-db to apply)"}`);
await db.$disconnect();
