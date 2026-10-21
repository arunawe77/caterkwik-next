import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { SITE_URL } from "@/lib/site";

export interface Crumb {
  label: string;
  href: string;
}

export function Crumbs({ trail }: { trail: Crumb[] }) {
  const last = trail.length - 1;
  return (
    <>
      <p className="crumbs">
        {trail.map((c, i) => (
          <span key={c.href}>
            {i > 0 && " / "}
            {i === last ? c.label : <Link href={c.href}>{c.label}</Link>}
          </span>
        ))}
      </p>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: trail.map((c, i) => ({
            "@type": "ListItem", position: i + 1, name: c.label, item: `${SITE_URL}${c.href}`,
          })),
        }}
      />
    </>
  );
}
