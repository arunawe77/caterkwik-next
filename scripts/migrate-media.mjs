// Moves the product images that ship in public/assets/img/products onto the media server, and (with --rewrite-db)
// points the catalogue at them. Safe to re-run: files already on the server with the same size are skipped, and the
// originals under public/ are never deleted. Needs the MEDIA_* settings (and DATABASE_URL for --rewrite-db).
//
//   node --env-file=.env scripts/migrate-media.mjs              # upload, then report what the database would change
//   node --env-file=.env scripts/migrate-media.mjs --rewrite-db # upload, then rewrite Product.image and ProductDetail.images / documents
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "public/assets/img/products");
const OLD = "/assets/img/products/";
const NEW = "/media/products/legacy/";
const rewrite = process.argv.includes("--rewrite-db");
const remoteDir = (process.env.MEDIA_REMOTE_DIR ?? "/mnt/media").replace(/\/+$/, "");
const need = ["MEDIA_SFTP_HOST", "MEDIA_SFTP_USER", "MEDIA_SFTP_PASSWORD", "MEDIA_SFTP_HOST_FINGERPRINT"];
for (const k of need) if (!process.env[k]) { console.error(`${k} is not set`); process.exit(1); }
const pinned = process.env.MEDIA_SFTP_HOST_FINGERPRINT.replace(/^SHA256:/, "").replace(/=+$/, "");

const files = fs.readdirSync(srcDir).filter((f) => /^[a-z0-9][a-z0-9_-]*\.(jpg|png|webp|avif|gif)$/.test(f));
const sftp = new SftpClient();
await sftp.connect({
  host: process.env.MEDIA_SFTP_HOST, port: Number(process.env.MEDIA_SFTP_PORT ?? 22),
  username: process.env.MEDIA_SFTP_USER, password: process.env.MEDIA_SFTP_PASSWORD, readyTimeout: 15000,
  algorithms: { serverHostKey: ["ssh-ed25519"] },
  hostVerifier: (key) => createHash("sha256").update(key).digest("base64").replace(/=+$/, "") === pinned,
});
const dir = `${remoteDir}/products/legacy`;
await sftp.mkdir(dir, true);
const have = new Map((await sftp.list(dir)).map((e) => [e.name, e.size]));
let sent = 0, skipped = 0;
for (const f of files) {
  const buf = fs.readFileSync(path.join(srcDir, f));
  if (have.get(f) === buf.length) { skipped++; continue; }
  await sftp.put(buf, `${dir}/${f}`);
  await sftp.chmod(`${dir}/${f}`, 0o644);
  sent++;
}
const onServer = new Map((await sftp.list(dir)).map((e) => [e.name, e.size]));
const missing = files.filter((f) => onServer.get(f) !== fs.statSync(path.join(srcDir, f)).size);
await sftp.end();
console.log(`uploaded ${sent}, already there ${skipped}, verified ${files.length - missing.length}/${files.length}`);
if (missing.length) { console.error("MISSING or wrong size:", missing.join(", ")); process.exit(1); }

if (!process.env.DATABASE_URL) { console.log("DATABASE_URL not set: skipping the database step"); process.exit(0); }
const db = new PrismaClient();
const swap = (v) => typeof v === "string" ? (v.startsWith(OLD) && onServer.has(v.slice(OLD.length)) ? NEW + v.slice(OLD.length) : v)
  : Array.isArray(v) ? v.map(swap) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)])) : v;
let changed = 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
for (const p of await db.product.findMany({ select: { id: true, image: true } })) {
  const image = swap(p.image);
  if (image === p.image) continue;
  changed++;
  if (rewrite) await db.product.update({ where: { id: p.id }, data: { image } });
}
let detailsChanged = 0;
for (const d of await db.productDetail.findMany({ select: { productId: true, images: true, documents: true } })) {
  const next = { images: swap(d.images), documents: swap(d.documents) };
  if (same(next, { images: d.images, documents: d.documents })) continue;
  detailsChanged++;
  const data = { ...(d.images != null && { images: next.images }), ...(d.documents != null && { documents: next.documents }) };
  if (rewrite) await db.productDetail.update({ where: { productId: d.productId }, data });
}
console.log(`${rewrite ? "rewrote" : "would rewrite"} ${changed} product images and ${detailsChanged} product details${rewrite ? "" : " (add --rewrite-db to apply)"}`);
await db.$disconnect();
