import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import SftpClient from "ssh2-sftp-client";

// Product images, PDFs and other uploads live on the media server (MEDIA_SFTP_* in .env), under MEDIA_REMOTE_DIR,
// and are served by the app itself at /media/... (src/app/media), which reads them back over SFTP. Nothing is written
// under public/. Set MEDIA_BASE_URL only if the files are served some other way.

export const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/avif": ".avif", "image/gif": ".gif",
  "application/pdf": ".pdf",
};
export const MAX_BYTES = 25 * 1024 * 1024;

const remoteDir = () => (process.env.MEDIA_REMOTE_DIR ?? "/mnt/media").replace(/\/+$/, "");

export const mediaConfigured = () =>
  Boolean(process.env.MEDIA_SFTP_HOST && process.env.MEDIA_SFTP_USER && process.env.MEDIA_SFTP_PASSWORD);

export const publicUrl = (key: string) => `${(process.env.MEDIA_BASE_URL ?? "/media").replace(/\/+$/, "")}/${key}`;

// The only shapes of key this module writes (and, under products/legacy/ and products/site/, the scripts/ migrations), so the only
// shapes it will read: no dots but the extension, no traversal, no odd names.
const KEY = /^((products|documents)\/\d{4}\/[a-z0-9-]{1,60}-[0-9a-f]{8}|products\/legacy\/[a-z0-9][a-z0-9_-]{0,80}|documents\/legacy\/[a-z0-9][a-z0-9-]{0,110}|products\/site\/(products|fullsize|thumbs)\/[a-z0-9][a-z0-9_-]{0,80})\.(jpg|png|webp|avif|gif|pdf)$/;
const TYPE_BY_EXT = Object.fromEntries(Object.entries(ALLOWED_TYPES).map(([type, ext]) => [ext, type]));
export const isMediaKey = (key: string) => KEY.test(key);
export const contentTypeOf = (key: string) => TYPE_BY_EXT[path.posix.extname(key)];

// A declared type is only a claim, so the file's own opening bytes have to agree with it.
export function matchesType(data: Buffer, contentType: string): boolean {
  const at = (i: number, s: string) => data.subarray(i, i + s.length).toString("latin1") === s;
  switch (contentType) {
    case "image/jpeg": return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    case "image/png": return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/gif": return at(0, "GIF87a") || at(0, "GIF89a");
    case "image/webp": return at(0, "RIFF") && at(8, "WEBP");
    case "image/avif": return at(4, "ftyp") && (at(8, "avif") || at(8, "avis"));
    case "application/pdf": return at(0, "%PDF-");
    default: return false;
  }
}

const slug = (name: string) =>
  path.parse(name).name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";

// A folder per kind keeps the share browsable: products/, documents/.
export const keyFor = (fileName: string, contentType: string, now = new Date()) => {
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) throw new Error("Unsupported file type.");
  const folder = contentType === "application/pdf" ? "documents" : "products";
  return `${folder}/${now.getUTCFullYear()}/${slug(fileName)}-${randomBytes(4).toString("hex")}${ext}`;
};

// The server's SSH host key is pinned (MEDIA_SFTP_HOST_FINGERPRINT, "SHA256:..." as ssh-keygen -lf prints it), so the
// password is never offered to an impostor. Without it the connection is refused in production.
function connection() {
  const pinned = process.env.MEDIA_SFTP_HOST_FINGERPRINT?.replace(/^SHA256:/, "");
  if (!pinned && process.env.NODE_ENV === "production") throw new Error("MEDIA_SFTP_HOST_FINGERPRINT is required in production.");
  return {
    host: process.env.MEDIA_SFTP_HOST,
    port: Number(process.env.MEDIA_SFTP_PORT ?? 22),
    username: process.env.MEDIA_SFTP_USER,
    password: process.env.MEDIA_SFTP_PASSWORD,
    readyTimeout: 15000,
    // The ed25519 key is the one pinned, so it is the only one offered.
    algorithms: { serverHostKey: ["ssh-ed25519" as const] },
    ...(pinned && { hostVerifier: (key: Buffer) => createHash("sha256").update(key).digest("base64").replace(/=+$/, "") === pinned.replace(/=+$/, "") }),
  };
}

export async function storeMedia(data: Buffer, fileName: string, contentType: string): Promise<{ key: string; url: string }> {
  if (!mediaConfigured()) throw new Error("Media storage is not configured.");
  if (data.length > MAX_BYTES) throw new Error("File is too large.");
  if (!matchesType(data, contentType)) throw new Error("The file does not match its type.");
  const key = keyFor(fileName, contentType);
  const remote = `${remoteDir()}/${key}`;
  const sftp = new SftpClient();
  try {
    await sftp.connect(connection());
    await sftp.mkdir(path.posix.dirname(remote), true);
    await sftp.put(data, remote);
    await sftp.chmod(remote, 0o644);
  } finally {
    await sftp.end().catch(() => {});
  }
  return { key, url: publicUrl(key) };
}

// Reads share one SFTP session (a page of images must not open a login each, which the server would start refusing)
// and recent files are kept in memory. A failed read drops the session so the next one reconnects.
let session: Promise<SftpClient> | null = null;
const sharedSession = () => {
  session ??= (async () => {
    const sftp = new SftpClient();
    sftp.on("close", () => { session = null; });
    sftp.on("error", () => { session = null; });
    await sftp.connect(connection());
    return sftp;
  })().catch((err) => { session = null; throw err; });
  return session;
};

const CACHE_BYTES = 64 * 1024 * 1024;
const cache = new Map<string, { data: Buffer; contentType: string }>();
let cached = 0;
const remember = (key: string, file: { data: Buffer; contentType: string }) => {
  if (file.data.length > CACHE_BYTES / 8) return;
  cache.set(key, file);
  cached += file.data.length;
  for (const [old, f] of cache) { // oldest first
    if (cached <= CACHE_BYTES) break;
    cache.delete(old);
    cached -= f.data.length;
  }
};

// One stored file, or null when the key is not one of ours or the file is missing or the server cannot be reached.
export async function readMedia(key: string): Promise<{ data: Buffer; contentType: string } | null> {
  if (!mediaConfigured() || !isMediaKey(key)) return null;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const sftp = await sharedSession();
    const file = { data: (await sftp.get(`${remoteDir()}/${key}`)) as Buffer, contentType: contentTypeOf(key) };
    remember(key, file);
    return file;
  } catch (err) {
    if ((err as { code?: number }).code !== 2) { // 2 is "no such file": the session is fine
      const dead = session;
      session = null;
      void dead?.then((c) => c.end()).catch(() => {});
    }
    return null;
  }
}
