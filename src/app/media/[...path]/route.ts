import { readFile } from "node:fs/promises";
import nodePath from "node:path";
import { contentTypeOf, isMediaKey, readMedia } from "@/server/media-store";

const LEGACY = "products/legacy/";

// The originals of the migrated product images still ship in public/, so if the media server cannot be reached
// they are served from there rather than showing a broken image.
async function localCopy(key: string) {
  if (!key.startsWith(LEGACY) || !isMediaKey(key)) return null;
  try {
    return { data: await readFile(nodePath.join(process.cwd(), "public/assets/img/products", key.slice(LEGACY.length))), contentType: contentTypeOf(key) };
  } catch {
    return null;
  }
}

// Product images and PDFs live on the media server; this streams them to the browser. Stored names carry a random
// suffix and are never rewritten, so a cached copy is always right. Only keys the upload code produces are served.
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  let key: string;
  try {
    key = path.map(decodeURIComponent).join("/");
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const file = (await readMedia(key)) ?? (await localCopy(key));
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.data.length),
      // Random-suffixed uploads never change; the legacy names could be replaced, so they are cached for a day.
      "Cache-Control": key.startsWith(LEGACY) || key.startsWith("documents/legacy/") ? "public, max-age=86400" : "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // Nothing here is a page: if one were ever opened, it may not run script or load anything.
      // (Left off PDFs, whose built-in viewer a sandbox policy would break.)
      ...(file.contentType !== "application/pdf" && { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" }),
    },
  });
}
