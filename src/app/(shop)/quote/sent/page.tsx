import Link from "next/link";
import { Icon } from "@/components/icons";
import { utilityMetadata } from "@/lib/seo";

export const metadata = utilityMetadata("Quote requested");

export default function QuoteSentPage() {
  return (
    <main className="wrap ovenpage">
      <header className="ohead">
        <h1><Icon name="check" size={30} /> Thanks, your quote request is with the team</h1>
        <p className="sub">We have emailed you a copy and will reply, usually within one working day.</p>
      </header>
      <Link className="btn btn-navy" href="/">Back to the shop</Link>
    </main>
  );
}
