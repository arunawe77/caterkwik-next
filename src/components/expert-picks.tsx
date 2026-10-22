import Link from "next/link";
import { EpickCarousel } from "@/components/epick-carousel";
import { Price } from "@/components/price";
import { money } from "@/lib/format";
import { productHref, type Product } from "@/lib/catalogue";

// Staff from https://www.caterkwik.co.uk/meettheteam.shtml, one per slide.
const TEAM = [
  { name: "Melody", role: "Solutions Manager", photo: "/assets/img/team/melody.jpg" },
  { name: "Mike", role: "Assistant Solutions Manager", photo: "/assets/img/team/mike.jpg" },
  { name: "Courtney", role: "Solutions Coordinator", photo: "/assets/img/team/courtney.jpg" },
  { name: "Kane", role: "Solutions Coordinator", photo: "/assets/img/team/kane.jpg" },
];

const stamp = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/London" }).format(d);

type Tone = "green" | "blue" | "amber";
type Pick = { chip: string; heading: string; why: string; product: Product; tone: Tone };
export type Slide = { kicker: string; blurb: string; picks: Pick[] };

const TONES: Tone[] = ["green", "blue", "amber"];
const inStock = (list: Product[]) => list.filter((p) => p.stock === "in-stock" && p.priceEx !== null);

// Every slide is built from the live catalogue, so each product shown is a real listing and links to its own page.
export function slidesOf(list: Product[], label: string): Slide[] {
  const live = inStock(list);
  if (live.length < 3) return [];
  const byPrice = [...live].sort((a, b) => a.priceEx! - b.priceEx!);
  const mid = byPrice[Math.floor((byPrice.length - 1) / 2)];
  const slides: Slide[] = [{
    kicker: "Across the price range",
    blurb: `Three ${label.toLowerCase()} from the lowest price to the top of the range, so you can see what each budget buys.`,
    picks: [
      { chip: "Best value", heading: "Economy option", why: `The lowest price in this range, from ${money(byPrice[0].priceEx!)} ex VAT.`, product: byPrice[0], tone: "green" },
      { chip: "Mid-range", heading: "Mid-range option", why: "Sits in the middle of the range on price: a sensible place to start.", product: mid, tone: "blue" },
      { chip: "Premium option", heading: "Higher specification", why: "The top of the range, for the busiest kitchens.", product: byPrice[byPrice.length - 1], tone: "amber" },
    ],
  }];

  const narrow = live.filter((p) => p.spec?.width != null).sort((a, b) => a.spec!.width! - b.spec!.width!);
  if (narrow.length >= 3) slides.push({
    kicker: "Compact choices",
    blurb: "Tight on space? These are the narrowest models in the range.",
    picks: narrow.slice(0, 3).map((p, i) => ({ chip: i === 0 ? "Most compact" : "Compact", heading: `${p.spec!.width} mm wide`, why: `Only ${p.spec!.width} mm across.`, product: p, tone: TONES[i] })),
  });

  const power = live.filter((p) => p.spec?.kwTotal != null).sort((a, b) => b.spec!.kwTotal! - a.spec!.kwTotal!);
  if (power.length >= 3) slides.push({
    kicker: "Most powerful",
    blurb: "For busy kitchens: the highest heat output in the range.",
    picks: power.slice(0, 3).map((p, i) => ({ chip: i === 0 ? "Highest output" : "High output", heading: `${p.spec!.kwTotal} kW`, why: `${p.spec!.kwTotal} kW total heat output.`, product: p, tone: TONES[i] })),
  });

  const cheap = byPrice.filter((p) => p !== byPrice[0] && p !== mid).slice(0, 3);
  if (cheap.length === 3) slides.push({
    kicker: "More affordable options",
    blurb: "More ways to get started without a big outlay.",
    picks: cheap.map((p, i) => ({ chip: "Great price", heading: `From ${money(p.priceEx!)}`, why: "One of the lower-priced models in this range.", product: p, tone: TONES[i] })),
  });
  return slides;
}

export function ExpertPicks({ label, products }: { label: string; products: Product[] }) {
  const slides = slidesOf(products, label);
  if (!slides.length) return null;
  const now = new Date();
  return (
    <section className="epicks-wrap" aria-label={`Recommended ${label.toLowerCase()}`}>
      <EpickCarousel labels={slides.map((s) => s.kicker)}>
        {slides.map((s, n) => {
          const who = TEAM[n % TEAM.length];
          return (
          <div className="epicks" key={s.kicker}>
            <div className="epick-who">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="epick-face" src={who.photo} alt={who.name} width={110} height={110} />
              <p className="epick-kicker">Recommended by</p>
              <h2>{who.name}</h2>
              <p className="epick-role">{who.role}</p>
              <p className="epick-note"><b>{s.kicker}:</b> {s.blurb}</p>
              <p className="epick-upd">Updated <time dateTime={now.toISOString()}>{stamp(now)}</time></p>
            </div>
            <div className="epick-cards">
              {s.picks.map(({ chip, heading, why, product: p, tone }) => (
                <article key={p.id} className={`epick epick-${tone}`}>
                  <span className="epick-chip">{chip}</span>
                  <h3>{heading}</h3>
                  <div className="epick-shot">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.image} alt="" loading="lazy" />
                  </div>
                  <h4><Link href={productHref(p)} className="epick-link">{p.name}</Link></h4>
                  <Price product={p} />
                  <p className="epick-why">{why}</p>
                </article>
              ))}
            </div>
          </div>
          );
        })}
      </EpickCarousel>
    </section>
  );
}
