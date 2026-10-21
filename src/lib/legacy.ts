import { getProduct, getType, productHref, typeHref } from "@/lib/catalogue";

// Old Caterkwik addresses and where they land now. Pure, so the proxy and the match-rate
// report share one implementation.
//
//   /cgi-bin/trolleyed_public.cgi?action=showprod_<TOKEN>  -> the product page
//   /shop/commercial-catering-equipment/commercial-ovens/<segment>/  -> the type page
//
// A discontinued product goes to its type page, and an unknown one to the ovens hub:
// never the home page.

const CGI = "/cgi-bin/trolleyed_public.cgi";
const OVENS_ROOT = "/shop/commercial-catering-equipment/commercial-ovens";

export function resolveLegacy(pathname: string, search: URLSearchParams): string | null {
  if (pathname === CGI) {
    const action = search.get("action") ?? "";
    if (!action.startsWith("showprod_")) return null;
    const product = getProduct(action.slice("showprod_".length));
    if (!product) return "/ovens";
    return product.stock === "discontinued" ? typeHref(product.type) : productHref(product);
  }

  const trimmed = pathname.replace(/\/+$/, "");
  if (trimmed === OVENS_ROOT) return "/ovens";
  if (trimmed.startsWith(`${OVENS_ROOT}/`)) {
    const segment = trimmed.slice(OVENS_ROOT.length + 1);
    return getType(segment) ? typeHref(segment) : "/ovens";
  }
  return null;
}
