import { createHash } from "node:crypto";

// The staging password gate. With SITE_PASSWORD unset the gate is off (local development).
export const PASSWORD = process.env.SITE_PASSWORD ?? "";
export const COOKIE = "ck_access";
export const TOKEN = createHash("sha256").update(`caterkwik|${PASSWORD}`).digest("hex");

// Only same-site paths: "//evil.example" and "/\evil" would otherwise be an open redirect.
export const safeNext = (next: string | null | undefined) =>
  next && /^\/(?![/\\])/.test(next) ? next : "/";
