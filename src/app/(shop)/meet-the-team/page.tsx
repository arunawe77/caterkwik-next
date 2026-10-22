import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { pageMetadata } from "@/lib/seo";
import { COMPANY } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Meet the team",
  description: `The people behind ${COMPANY.name}: expert advice on commercial catering equipment, from first call to installation.`,
  path: "/meet-the-team",
});

// Placeholder people and text until the real team details are supplied.
const TEAM = [
  { name: "Sam Example", role: "Sales Director", expertise: "Cooking and refrigeration" },
  { name: "Alex Sample", role: "Senior Sales Consultant", expertise: "Kitchen design" },
  { name: "Jamie Placeholder", role: "Sales Consultant", expertise: "Food prep and warewashing" },
  { name: "Taylor Demo", role: "Installation Manager", expertise: "Installation and service" },
  { name: "Morgan Dummy", role: "Customer Care", expertise: "Orders and delivery" },
  { name: "Jordan Test", role: "Estimator", expertise: "Quotes and costings" },
];
const LOREM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua, ut enim ad minim veniam.";

export default function MeetTheTeamPage() {
  return (
    <main className="wrap ovenpage">
      <header className="ohead">
        <h1>Meet the team</h1>
        <p className="sub">{LOREM}</p>
      </header>
      <div className="teamgrid">
        {TEAM.map((m) => (
          <article key={m.name} className="panel teamcard">
            <div className="avatar" aria-hidden>{m.name.split(" ").map((w) => w[0]).join("")}</div>
            <h2>{m.name}</h2>
            <p className="role">{m.role}</p>
            <p>{LOREM}</p>
            <p className="muted"><b>Expertise:</b> {m.expertise}</p>
          </article>
        ))}
      </div>
      <p><Link className="btn btn-navy" href="/contact"><Icon name="mail" />Contact the team</Link></p>
    </main>
  );
}
