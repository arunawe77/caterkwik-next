import { currentUser, isAdmin } from "@/server/session";
import { ALLOWED_TYPES, MAX_BYTES, mediaConfigured, storeMedia } from "@/server/media-store";

export const maxDuration = 60;

const json = (status: number, error: string) => Response.json({ error }, { status });

// Staff upload of a product image or PDF to the media server. Returns the public URL to put in the image field.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!isAdmin(user)) return json(401, "Staff only.");
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return json(403, "Cross-site request refused.");
  if (!mediaConfigured()) return json(503, "Media storage is not configured.");

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return json(400, "Send a multipart form with a file.");
  }
  if (!(file instanceof File)) return json(400, "No file.");
  if (!ALLOWED_TYPES[file.type]) return json(415, "Use a JPG, PNG, WebP, AVIF, GIF or PDF.");
  if (file.size > MAX_BYTES) return json(413, "File is too large (25 MB max).");

  try {
    const stored = await storeMedia(Buffer.from(await file.arrayBuffer()), file.name, file.type);
    return Response.json(stored);
  } catch (err) {
    console.error("media upload failed", err);
    return json(502, "Could not save to the media server.");
  }
}
