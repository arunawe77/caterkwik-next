import Link from "next/link";
import { utilityMetadata } from "@/lib/seo";

export const metadata = utilityMetadata("Not in this preview");

export default function NotInPreview() {
  return (
    <main className="wrap ovenpage">
      <header className="ohead">
        <p className="eyebrow">Staging preview</p>
        <h1>This department is not in the preview</h1>
        <p className="sub">This first build covers Caterkwik&apos;s commercial ovens. The rest of the catalogue follows.</p>
      </header>
      <Link className="btn btn-navy" href="/ovens">Browse commercial ovens</Link>
    </main>
  );
}
