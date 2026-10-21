import { headers } from "next/headers";
import { createRateLimiter } from "@/kit/rate-limit";

// Per-process limits on the actions strangers can call. The window is kept short enough
// that a real person who mistypes is never locked out for long.
const HOUR = 60 * 60 * 1000;
export const limits = {
  login: createRateLimiter(10, 15 * 60 * 1000),
  register: createRateLimiter(5, HOUR),
  reset: createRateLimiter(5, HOUR),
  enquiry: createRateLimiter(5, HOUR),
  checkout: createRateLimiter(20, HOUR),
};

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

// Where a form may send the visitor next: a path on this site, never another address.
export const safePath = (next: FormDataEntryValue | string | null | undefined, fallback = "/") =>
  typeof next === "string" && /^\/(?![/\\])/.test(next) ? next : fallback;

export type FormState = { error?: string; ok?: boolean };
