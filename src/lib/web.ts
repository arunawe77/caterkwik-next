import { webLoaders } from "@/data/webrec";
import type { WebRecord } from "@/lib/product-schema";

const loaded = new Map<string, Promise<Record<string, WebRecord>>>();

/** The web-research record for a product, or null when none has been researched yet. */
export async function webOf(id: string): Promise<WebRecord | null> {
  const key = id.toLowerCase();
  const shard = key[0].replace(/[^a-z0-9]/, "_");
  const load = webLoaders[shard];
  if (!load) return null;
  if (!loaded.has(shard)) loaded.set(shard, load().then((m) => m.default as Record<string, WebRecord>));
  return (await loaded.get(shard)!)[key] ?? null;
}
