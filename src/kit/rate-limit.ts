// A fixed-window limiter: `limit` hits per key per window. State is per process, which is
// all a single staging server needs.
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; windowStart: number }>();

  return function limited(key: string): boolean {
    const t = now();
    const entry = hits.get(key);
    if (!entry || t - entry.windowStart >= windowMs) {
      hits.set(key, { count: 1, windowStart: t });
      // Expired windows are dropped as new ones open, so the map cannot grow without bound.
      for (const [k, v] of hits) if (t - v.windowStart >= windowMs) hits.delete(k);
      return false;
    }
    entry.count += 1;
    return entry.count > limit;
  };
}
