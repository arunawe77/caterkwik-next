// Copies the PDFs the product pages link to on the old caterkwik.co.uk site onto the media server
// (documents/legacy/), records old URL -> /media/... in src/data/legacy-documents.json, and (with --rewrite)
// points the catalogue data files at the copies. Safe to re-run: files already on the server with the
// same size are not sent again. Needs the MEDIA_* settings.
//
//   node --env-file=.env scripts/migrate-documents.mjs            # download + upload + write the map
//   node --env-file=.env scripts/migrate-documents.mjs --rewrite  # also rewrite src/data/{rich,web,webrec}/*.json
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDirs = ["src/data/rich", "src/data/web", "src/data/webrec"].map((d) => path.join(root, d));
const mapFile = path.join(root, "src/data/legacy-documents.json");
const NEW = "/media/documents/legacy/";
const OLD_HOST = /^https?:\/\/(www\.)?caterkwik\.co\.uk\//i;
const remoteDir = (process.env.MEDIA_REMOTE_DIR ?? "/mnt/media").replace(/\/+$/, "") + "/documents/legacy";
for (const k of ["MEDIA_SFTP_HOST", "MEDIA_SFTP_USER", "MEDIA_SFTP_PASSWORD", "MEDIA_SFTP_HOST_FINGERPRINT"]) if (!process.env[k]) { console.error(`${k} is not set`); process.exit(1); }
const pinned = process.env.MEDIA_SFTP_HOST_FINGERPRINT.replace(/^SHA256:/, "").replace(/=+$/, "");

const jsonFiles = dataDirs.flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => path.join(d, f)));
const urls = new Set();
for (const f of jsonFiles) for (const m of fs.readFileSync(f, "utf8").matchAll(/https?:\/\/(?:www\.)?caterkwik\.co\.uk\/[^"\\\s]*?\.pdf/gi)) urls.add(m[0]);
console.log(`${urls.size} distinct PDFs linked to the old site`);

// Stable, URL-safe names: the original file name, lower-cased; a short hash of the URL only when two share a name.
const slug = (url) => {
  let name = path.posix.basename(new URL(url).pathname);
  try { name = decodeURIComponent(name); } catch { /* keep as is */ }
  return path.parse(name).name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "document";
};
const map = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, "utf8")) : {};
const taken = new Set(Object.values(map));
for (const url of [...urls].sort()) {
  if (map[url]) continue;
  let key = NEW + slug(url) + ".pdf";
  if (taken.has(key)) key = NEW + slug(url) + "-" + createHash("sha1").update(url).digest("hex").slice(0, 6) + ".pdf";
  taken.add(key);
  map[url] = key;
}

let sftp;
const connect = async () => {
  sftp = new SftpClient();
  sftp.on("error", () => {});
  await sftp.connect({
    host: process.env.MEDIA_SFTP_HOST, port: Number(process.env.MEDIA_SFTP_PORT ?? 22),
    username: process.env.MEDIA_SFTP_USER, password: process.env.MEDIA_SFTP_PASSWORD, readyTimeout: 15000,
    algorithms: { serverHostKey: ["ssh-ed25519"] },
    hostVerifier: (key) => createHash("sha256").update(key).digest("base64").replace(/=+$/, "") === pinned,
  });
};
// A dropped session is replaced (once, however many uploads notice) and the upload retried.
let reconnecting = null;
const reconnect = () => (reconnecting ??= (async () => { await sftp.end().catch(() => {}); await connect(); })().finally(() => { reconnecting = null; }));
const upload = async (buf, name) => {
  for (let attempt = 0; ; attempt++) {
    try {
      await reconnecting;
      await sftp.put(buf, `${remoteDir}/${name}`);
      await sftp.chmod(`${remoteDir}/${name}`, 0o644);
      return;
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      await reconnect().catch(() => {});
    }
  }
};
await connect();
await sftp.mkdir(remoteDir, true);
const have = new Map((await sftp.list(remoteDir)).map((e) => [e.name, e.size]));

const failed = new Map();
const why = {};
const done = new Set();
const queue = [...urls].filter((u) => !done.has(u));
let sent = 0, skipped = 0, n = 0;
const worker = async () => {
  while (queue.length) {
    const url = queue.shift();
    const name = map[url].slice(NEW.length);
    try {
      const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Caterkwik document migration)" }, signal: AbortSignal.timeout(90000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("not a PDF");
      if (have.get(name) === buf.length) skipped++;
      else {
        await upload(buf, name);
        have.set(name, buf.length);
        sent++;
      }
      done.add(url);
    } catch (e) { failed.set(url, e.message); why[e.message] = (why[e.message] ?? 0) + 1; }
    if (++n % 100 === 0) console.log(`${n}/${urls.size} (sent ${sent}, already there ${skipped}, failed ${failed.size})`);
  }
};
await Promise.all([worker(), worker(), worker()]);
const onServer = new Map((await sftp.list(remoteDir)).map((e) => [e.name, e.size]));
await sftp.end();
const verified = [...done].filter((u) => onServer.has(map[u].slice(NEW.length)));
console.log(`sent ${sent}, already there ${skipped}, verified on server ${verified.length}/${urls.size}, failed ${failed.size}`, why);

// Only documents that are really on the server go in the map, so nothing is ever pointed at a missing file.
const good = Object.fromEntries(verified.sort().map((u) => [u, map[u]]));
fs.writeFileSync(mapFile, JSON.stringify(good, null, 1) + "\n");
if (failed.size) fs.writeFileSync(path.join(root, "legacy-documents-failed.txt"), [...failed].map(([u, why]) => `${u}\t${why}`).join("\n") + "\n");

if (process.argv.includes("--rewrite")) {
  const re = /https?:\/\/(?:www\.)?caterkwik\.co\.uk\/[^"\\\s]*?\.pdf/gi;
  let files = 0, links = 0;
  for (const f of jsonFiles) {
    const text = fs.readFileSync(f, "utf8");
    const next = text.replace(re, (u) => (good[u] ? (links++, good[u]) : u));
    if (next !== text) { fs.writeFileSync(f, next); files++; }
  }
  console.log(`rewrote ${links} links in ${files} files; ${failed.size} left pointing at the old site`);
}
