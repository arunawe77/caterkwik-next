"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// Motion for the home page. Everything here is progressive: without JavaScript the content is simply visible,
// and visitors who prefer reduced motion get no animation and no auto-advance.

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface ShowcaseSlide {
  href: string;
  name: string;
  brand: string | null;
  image: string;
  price: string;
  lease: string | null;
}

export function HeroShowcase({ slides }: { slides: ShowcaseSlide[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = slides.length;

  useEffect(() => {
    if (paused || n < 2 || reducedMotion()) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 5200);
    return () => clearInterval(t);
  }, [paused, n]);

  if (!n) return null;
  return (
    <div className="hm-stage" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
      <div className="hm-stage-main">
        {slides.map((s, k) => (
          <Link key={s.href} href={s.href} className={`hm-slide${k === i ? " on" : ""}`} tabIndex={k === i ? 0 : -1} aria-hidden={k !== i} aria-label={`${s.name}, ${s.price}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.image} alt="" width={420} height={420} loading={k === 0 ? "eager" : "lazy"} />
          </Link>
        ))}
      </div>
      <div className="hm-float f1" key={i} aria-live="polite">
        <span><i className="dot" />{slides[i].brand ?? "In stock"}</span>
        <b>{slides[i].name}</b>
        <em>from {slides[i].price} ex VAT</em>
      </div>
      {slides[i].lease && <div className="hm-float f2"><span>Lease from <b>{slides[i].lease}</b> a week</span></div>}
      <div className="hm-dots" role="tablist" aria-label="Featured products">
        {slides.map((s, k) => (
          <button key={s.href} type="button" role="tab" aria-selected={k === i} aria-label={`Show ${s.name}`} className={k === i ? "on" : ""} onClick={() => setI(k)} />
        ))}
      </div>
    </div>
  );
}

// Fades and lifts its content in the first time it scrolls into view.
export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion() || typeof IntersectionObserver === "undefined") {
      const raf = requestAnimationFrame(() => setSeen(true));
      return () => cancelAnimationFrame(raf);
    }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`reveal${seen ? " in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

// A number that counts up once when it appears. The final figure is in the markup, so crawlers and no-JS visitors see it.
export function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(to);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || typeof IntersectionObserver === "undefined") return;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 1400);
        setShown(Math.round(to * (1 - Math.pow(1 - t, 3))));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      setShown(0);
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <b ref={ref}>{shown.toLocaleString("en-GB")}{suffix}</b>;
}

// A swipeable row of cards with arrows and a slow auto-advance that stops when the visitor touches it.
export function Carousel({ children, label, auto = true }: { children: ReactNode; label: string; auto?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [edge, setEdge] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = track.current;
    if (el) setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  const step = useCallback((dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const by = (card?.offsetWidth ?? 300) + 16;
    if (dir === 1 && el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) el.scrollTo({ left: 0, behavior: "smooth" });
    else el.scrollBy({ left: dir * by, behavior: "smooth" });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);
  useEffect(() => {
    if (!auto || paused || reducedMotion()) return;
    const t = setInterval(() => step(1), 4800);
    return () => clearInterval(t);
  }, [auto, paused, step]);

  return (
    <div className="hm-car" role="region" aria-roledescription="carousel" aria-label={label} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onTouchStart={() => setPaused(true)} onFocusCapture={() => setPaused(true)}>
      <div className="hm-car-track" ref={track} onScroll={measure}>{children}</div>
      <button type="button" className="hm-car-btn prev" aria-label="Previous" disabled={edge.start} onClick={() => step(-1)}>&lsaquo;</button>
      <button type="button" className="hm-car-btn next" aria-label="Next" disabled={edge.end && !auto} onClick={() => step(1)}>&rsaquo;</button>
    </div>
  );
}
