import { db } from "@/server/db";

// Redirects staff add in the admin, looked up by the proxy on every request. They are held in
// memory and refreshed every 15 seconds, so a page view costs no query, a new redirect is live
// within 15 seconds, and a database outage never takes the site down: the lookup just finds nothing.
// (The proxy runs apart from the admin's server actions, so they cannot clear its cache directly.)

const TTL_MS = 15_000;
let cache: { at: number; map: Map<string, string> } | null = null;

export const clearRedirectCache = () => {
  cache = null;
};

export async function customRedirect(path: string, now = Date.now()): Promise<string | null> {
  if (!cache || now - cache.at > TTL_MS) {
    try {
      const rows = await db.customRedirect.findMany({ select: { fromPath: true, toPath: true } });
      cache = { at: now, map: new Map(rows.map((r) => [r.fromPath, r.toPath])) };
    } catch {
      cache = { at: now, map: cache?.map ?? new Map() };
    }
  }
  return cache.map.get(path) ?? null;
}
