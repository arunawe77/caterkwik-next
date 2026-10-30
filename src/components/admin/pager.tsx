import Link from "next/link";
import { pageCount } from "@/lib/paging";

/**
 * Previous and next links for a long list. The other query parameters (filters, search) are kept, so paging never
 * loses them. `param` names the page parameter, for a page with more than one list.
 */
export function Pager({ path, query, page, size, total, param = "page" }: {
  path: string; query: Record<string, string | undefined>; page: number; size: number; total: number; param?: string;
}) {
  const pages = pageCount(total, size);
  if (pages < 2) return null;
  const at = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v && k !== param && k !== "error") q.set(k, v);
    if (p > 1) q.set(param, String(p));
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };
  return (
    <nav className="adm-pager" aria-label="Pages">
      <span>Page {page} of {pages} · {total.toLocaleString("en-GB")} in all</span>
      <span className="adm-actions">
        {page > 1 && <Link className="btn btn-ghost btn-sm" href={at(page - 1)}>Previous</Link>}
        {page < pages && <Link className="btn btn-ghost btn-sm" href={at(page + 1)}>Next</Link>}
      </span>
    </nav>
  );
}
