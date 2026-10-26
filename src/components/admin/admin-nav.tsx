"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = [href: string, label: string, exact?: boolean];
const GROUPS: { title: string; items: Item[] }[] = [
  { title: "Overview", items: [["/admin", "Dashboard"], ["/admin/analytics", "Analytics"]] },
  { title: "Catalogue", items: [["/admin/products", "Products"], ["/admin/products/new", "Add product", true], ["/admin/categories", "Categories"], ["/admin/import", "Import products"], ["/admin/inventory", "Inventory"]] },
  { title: "Sales", items: [["/admin/orders", "Orders"], ["/admin/enquiries", "Quotes and enquiries"], ["/admin/customers", "Customers"]] },
  { title: "Market and supply", items: [["/admin/competitors", "Competitors", true], ["/admin/competitors/prices", "Price comparison"], ["/admin/suppliers", "Suppliers"]] },
  { title: "Site", items: [["/admin/redirects", "Redirects"], ["/admin/users", "Staff and roles"], ["/admin/activity", "Activity log"]] },
];

export function AdminNav() {
  const path = usePathname() ?? "";
  const active = (href: string, exact?: boolean) => {
    if (href === "/admin" || exact) return path === href;
    if (href === "/admin/products" && path === "/admin/products/new") return false;
    return path === href || path.startsWith(`${href}/`);
  };
  return (
    <nav aria-label="Admin">
      {GROUPS.map((g) => (
        <div key={g.title} className="adm-group">
          <p>{g.title}</p>
          {g.items.map(([href, label, exact]) => (
            <Link key={href} href={href} aria-current={active(href, exact) ? "page" : undefined}>{label}</Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
