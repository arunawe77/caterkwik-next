import { catalogueVersion, cookingGroups, shopTypes, types as ovenTypes, typeHref, type OvenType } from "@/lib/catalogue";

// The department menu: department > category > sub category, built from the category tree the shop already holds, so a
// category added or moved in the admin appears in the menu with no second list to keep.

export interface NavNode { label: string; href?: string; count: number; children: NavNode[] }
export interface NavDepartment { label: string; short?: string; href: string; columns: NavNode[] }

const PATH_SEP = " > ";
const SHOP = "/shop/commercial-catering-equipment";

// The departments as the menu bar names them, in order, and the `section` each is made of in the imported tree.
// Cooking and Reconditioned are not sections of that tree: Cooking is the ovens and cooking departments, and
// Reconditioned is a page of its own.
const DEPARTMENTS: { label: string; short?: string; sections: string[] }[] = [
  { label: "Refrigeration & Ice Makers", short: "Refrigeration", sections: ["Refrigeration & Ice Makers"] },
  { label: "Food Prep", sections: ["Food Prep"] },
  { label: "Cooking", sections: [] },
  { label: "Fabrication & Extraction", short: "Fabrication", sections: ["Fabrication & Extraction Canopies"] },
  { label: "Warewashing & Water", short: "Warewashing", sections: ["Warewashing & Water"] },
  { label: "Commercial Laundry", short: "Laundry", sections: ["Commercial Laundry & Cleaning"] },
  { label: "Beverage", sections: ["Beverage"] },
  { label: "Kitchen Essentials", sections: ["Kitchen Essentials, Hotel & Bar Supplies"] },
  { label: "Spares & Accessories", short: "Spares", sections: ["Spares & Accessories"] },
];

function node(label: string): NavNode {
  return { label, count: 0, children: [] };
}

// The path of a category names every level above it ("Food Preparation Equipment > Food Processors & Veg Prep > ..."),
// including levels that have no category of their own, so the menu is built from paths rather than parent links.
function treeOf(list: OvenType[]): NavNode {
  const root = node("");
  for (const t of list) {
    const segments = (t.path ?? t.label).split(PATH_SEP);
    let at = root;
    for (const label of segments) {
      let next = at.children.find((c) => c.label === label);
      if (!next) at.children.push((next = node(label)));
      at = next;
    }
    if (!at.href) { at.href = typeHref(t.slug); at.count = t.total; }
  }
  return root;
}

const sizeOf = (n: NavNode): number => 1 + n.children.reduce((a, c) => a + sizeOf(c), 0);
const trim = (n: NavNode): NavNode => ({ ...n, children: n.children.filter((c) => c.href || c.children.length).map(trim) });

function shopDepartment(label: string, sections: string[]): NavDepartment | null {
  const list = shopTypes.filter((t) => t.section && sections.includes(t.section) && t.path && t.total > 0);
  if (!list.length) return null;
  const top = treeOf(list).children.map(trim);
  // A department is made of one top-level group; a stray category filed under another group becomes a column of its own.
  top.sort((a, b) => sizeOf(b) - sizeOf(a));
  const [main, ...rest] = top;
  const columns = [...main.children, ...rest];
  return { label, href: main.href ?? columns.find((c) => c.href)?.href ?? SHOP, columns };
}

function cookingDepartment(): NavDepartment {
  const ovens: NavNode = { label: "Commercial Ovens", href: "/ovens", count: ovenTypes.reduce((n, t) => n + t.total, 0), children: ovenTypes.filter((t) => t.total > 0).map((t) => ({ label: t.label, href: typeHref(t.slug), count: t.total, children: [] })) };
  const groups: NavNode[] = cookingGroups().map((g) => ({
    label: g.label, href: `/cooking/${g.slug}`, count: g.total,
    children: g.types.filter((t) => t.total > 0).map((t) => ({ label: t.label, href: typeHref(t.slug), count: t.total, children: [] })),
  }));
  return { label: "Cooking", href: "/cooking", columns: [ovens, ...groups] };
}

export const TABLE_CONFIGURATOR_HREF = "/table-configurator";

// The table configurator is a page of its own, not a category with products, so the category tree has no entry for it.
// It goes under Stainless Steel Tables, or at the end of the Fabrication menu if that group is not there.
function addTableConfigurator(departments: NavDepartment[]): void {
  const fabrication = departments.find((d) => d.label === "Fabrication & Extraction");
  if (!fabrication) return;
  const link: NavNode = { label: "Table Configurator", href: TABLE_CONFIGURATOR_HREF, count: 0, children: [] };
  const tables = fabrication.columns.find((c) => c.label === "Stainless Steel Tables");
  if (tables) tables.children = [...tables.children, link];
  else fabrication.columns = [...fabrication.columns, link];
}

let cache: { version: number; value: NavDepartment[] } | null = null;

export function navDepartments(): NavDepartment[] {
  const version = catalogueVersion();
  if (cache?.version === version) return cache.value;
  const value = DEPARTMENTS.flatMap(({ label, short, sections }) => {
    const d = sections.length ? shopDepartment(label, sections) : cookingDepartment();
    return d ? [{ ...d, short }] : [];
  });
  addTableConfigurator(value);
  cache = { version, value };
  return value;
}
