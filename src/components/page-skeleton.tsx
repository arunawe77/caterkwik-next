import { CookingLoader } from "@/components/cooking-loader";

// Shown at once while a page is fetched, so a click always gets an immediate response.
export function PageSkeleton() {
  return (
    <main className="wrap ovenpage" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="sk sk-banner cooking"><CookingLoader /></div>
      <div className="sk sk-line w30" />
      <div className="sk sk-title" />
      <div className="sk sk-line w50" />
      <div className="sk-browse">
        <div className="sk-side">{Array.from({ length: 8 }, (_, i) => <div key={i} className="sk sk-line" />)}</div>
        <div className="sk-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="sk sk-card" />)}</div>
      </div>
    </main>
  );
}
