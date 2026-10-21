import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, PASSWORD, TOKEN } from "@/lib/gate";
import { resolveLegacy } from "@/lib/legacy";
import { INDEXABLE } from "@/lib/seo";
import { customRedirect } from "@/server/redirects";

// 1. Old addresses 301 to the new pages, before the gate, so a link in an email still lands.
//    That is the 442 built from the scrape, then any staff added in the admin.
// 2. Trailing slashes are removed.
// 3. Staging gate: with SITE_PASSWORD set, everything else needs the access cookie.
// 4. Staging is never indexed (ALLOW_INDEXING=true lifts that in production).

// The gate page and its form, the health check, robots.txt, and Stripe's webhook (which has no cookie).
const OPEN = new Set(["/gate", "/api/gate", "/api/health", "/robots.txt", "/api/stripe/webhook"]);

export async function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  const legacy = resolveLegacy(pathname, searchParams) ?? (await customRedirect(pathname));
  if (legacy) return NextResponse.redirect(new URL(legacy, req.url), 301);

  if (pathname.length > 1 && pathname.endsWith("/")) {
    const clean = new URL(req.url);
    clean.pathname = pathname.replace(/\/+$/, "");
    return NextResponse.redirect(clean, 308);
  }

  if (PASSWORD && !OPEN.has(pathname) && req.cookies.get(COOKIE)?.value !== TOKEN) {
    const gate = new URL("/gate", req.url);
    gate.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(gate);
  }

  const res = NextResponse.next();
  if (!INDEXABLE) res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

// /api/admin/import takes a workbook of hundreds of megabytes, which the proxy would buffer (and cut at 10 MB). The route checks staff itself. /api/admin/media (images and PDFs up to 25 MB) is left out for the same reason.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|assets/|api/admin/import|api/admin/media).*)"] };
