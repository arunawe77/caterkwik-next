"use client";

import { Children, useEffect, useRef, useState } from "react";

// Scroll-snap track with arrows and dots. The track scrolls natively, so touch swipe and keyboard work without extra code.
export function EpickCarousel({ children, labels }: { children: React.ReactNode; labels: string[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const count = Children.count(children);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setAt(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const go = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: Math.max(0, Math.min(count - 1, i)) * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="ecar">
      <div className="ecar-track" ref={track} tabIndex={0} aria-roledescription="carousel">{children}</div>
      {count > 1 && (
        <>
          <button type="button" className="ecar-btn prev" aria-label="Previous recommendations" onClick={() => go(at - 1)} disabled={at === 0}>‹</button>
          <button type="button" className="ecar-btn next" aria-label="Next recommendations" onClick={() => go(at + 1)} disabled={at === count - 1}>›</button>
          <div className="ecar-dots">
            {labels.map((l, i) => <button key={l} type="button" aria-label={l} aria-current={i === at} onClick={() => go(i)} />)}
          </div>
        </>
      )}
    </div>
  );
}
