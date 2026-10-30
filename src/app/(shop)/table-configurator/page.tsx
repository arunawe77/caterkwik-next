import { TableConfigurator } from "@/components/table-configurator";
import { Icon } from "@/components/icons";
import { currentUser } from "@/server/session";

export const metadata = {
  title: "Stainless steel table configurator",
  description: "Design a made-to-measure stainless steel wall or centre table: size, undershelves, gantry, upstands and castors. Made in-house, quoted within one working day.",
};

const POINTS = [
  { icon: "check", text: "Fully welded 304 stainless steel top, made in-house" },
  { icon: "list", text: "Any size, with undershelves, gantries and upstands" },
  { icon: "truck", text: "Delivery and lead time confirmed with your quote" },
] as const;

export default async function TableConfiguratorPage() {
  const user = await currentUser();
  return (
    <main className="wrap ovenpage">
      <header className="ohead">
        <p className="kicker">Cater-Fabs fabrication</p>
        <h1>Stainless steel table configurator</h1>
        <p className="sub">Design a table to fit your kitchen in six short steps. We make it in-house and send you a firm price.</p>
      </header>
      <ul className="quotepoints">
        {POINTS.map((p) => <li key={p.text}><Icon name={p.icon} size={16} />{p.text}</li>)}
      </ul>
      <TableConfigurator defaults={{ name: user?.name ?? undefined, email: user?.email }} />
    </main>
  );
}
