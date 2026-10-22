"use client";

import { useEffect, useRef, useState } from "react";

export type GalleryImage = { url: string; alt: string };

// The product photos as a slide show: one large image with arrows and a strip of thumbnails.
export function ProductGallery({ images }: { images: GalleryImage[] }) {
  const [index, setIndex] = useState(0);
  const many = images.length > 1;
  const go = (to: number) => setIndex((to + images.length) % images.length);
  const strip = useRef<HTMLUListElement>(null);
  const current = images[index] ?? images[0];

  // Keep the chosen thumbnail in view as the strip scrolls.
  useEffect(() => {
    const el = strip.current?.children[index] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [index]);
  const slide = (dir: number) => strip.current?.scrollBy({ left: dir * strip.current.clientWidth * 0.8, behavior: "smooth" });
  if (!current) return null;

  return (
    <div className="pgal" aria-roledescription="carousel" aria-label="Product photos">
      <div className="gstage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.url} alt={current.alt} />
        {many && (
          <>
            <button type="button" className="gnav prev" onClick={() => go(index - 1)} aria-label="Previous photo">‹</button>
            <button type="button" className="gnav next" onClick={() => go(index + 1)} aria-label="Next photo">›</button>
            <span className="gcount">{index + 1} / {images.length}</span>
          </>
        )}
      </div>
      {many && (
        <div className="gstrip">
          <button type="button" className="gstep" onClick={() => slide(-1)} aria-label="Scroll thumbnails left">‹</button>
          <ul className="gthumbs" ref={strip}>
            {images.map((img, i) => (
              <li key={img.url}>
                <button type="button" onClick={() => setIndex(i)} aria-label={`Show photo ${i + 1}`} aria-current={i === index}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="gstep" onClick={() => slide(1)} aria-label="Scroll thumbnails right">›</button>
        </div>
      )}
    </div>
  );
}
