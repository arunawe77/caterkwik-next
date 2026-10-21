import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, PASSWORD, TOKEN, safeNext } from "@/lib/gate";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

function matches(given: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(PASSWORD);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const next = safeNext(form.get("next")?.toString());

  if (!PASSWORD || !matches(form.get("password")?.toString().trim() ?? "")) {
    return NextResponse.redirect(new URL(`/gate?error=1&next=${encodeURIComponent(next)}`, req.url), 303);
  }

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(COOKIE, TOKEN, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: THIRTY_DAYS,
    secure: req.headers.get("x-forwarded-proto") === "https",
  });
  return res;
}
