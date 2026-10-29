"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { SECTORS, type Sector } from "@/lib/case-studies";

export type StoryCard = { title: string; text: string; image: string | null; document: string | null; sector: Sector };

export function CaseStudyGrid({ stories }: { stories: StoryCard[] }) {
  const [sector, setSector] = useState<Sector | "All">("All");
  const [open, setOpen] = useState<string | null>(null);
  const count = (s: Sector) => stories.filter((x) => x.sector === s).length;
  const shown = sector === "All" ? stories : stories.filter((s) => s.sector === sector);
  const filters: (Sector | "All")[] = ["All", ...SECTORS.filter((s) => count(s) > 0)];

  return (
    <>
      <div className="cs-filters" role="group" aria-label="Filter by sector">
        {filters.map((s) => (
          <button key={s} type="button" aria-pressed={sector === s} onClick={() => setSector(s)}>
            {s}<span>{s === "All" ? stories.length : count(s)}</span>
          </button>
        ))}
      </div>

      <div className="cs-board"><div className="cs-grid">
        {shown.map((c, i) => {
          const long = c.text.length > 230;
          const isOpen = open === c.title;
          return (
            <article key={c.title + c.image} className="cs-card" style={{ "--d": `${Math.min(i, 8) * 60}ms` } as React.CSSProperties}>
              <span className="cs-pin" aria-hidden />
              {c.image && (
                <div className="cs-shot">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.image} alt="" loading="lazy" />
                  <span className="cs-tag">{c.sector}</span>
                </div>
              )}
              <div className="cs-body">
                <h2>{c.title}</h2>
                <p className={`cs-text${long && !isOpen ? " clipped" : ""}`}>{c.text}</p>
                <div className="cs-foot">
                  {long && (
                    <button type="button" className="cs-toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.title)}>
                      {isOpen ? "Show less" : "Read the full story"}
                    </button>
                  )}
                  {c.document && (
                    <a className="cs-doc" href={c.document} target="_blank" rel="noopener noreferrer">
                      <Icon name="file" size={15} />Project details
                    </a>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div></div>
    </>
  );
}
