import type { Metadata } from "next";
import { safeNext } from "@/lib/gate";
import { utilityMetadata } from "@/lib/seo";

export const metadata: Metadata = utilityMetadata("Staging access");

export default async function Gate({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="wrap ovenpage" style={{ maxWidth: 420 }}>
      <form method="post" action="/api/gate" className="ohead" style={{ display: "grid", gap: 12 }}>
        <h1>Caterkwik staging</h1>
        <p className="sub">This preview is password protected.</p>
        <input type="hidden" name="next" value={safeNext(next)} />
        <input className="gateinput" type="password" name="password" placeholder="Password" aria-label="Password" required />
        {error && <p role="alert" style={{ margin: 0, color: "var(--red)" }}>That password is not right.</p>}
        <button className="btn btn-navy" type="submit">Enter</button>
      </form>
    </main>
  );
}
