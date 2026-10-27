import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { factText, hostOf } from "@/lib/dossier";
import { getProduct, productHref } from "@/lib/catalogue";
import { money } from "@/lib/format";
import type { Dossier, Section } from "@/lib/product-schema";
import type { Rich } from "@/lib/rich";

const SECTION_ICON: Record<Section, IconName> = {
  Identity: "info", Capacity: "list", Performance: "flame", Electrical: "zap", Gas: "flame", "Water & drainage": "droplet",
  "Ventilation & siting": "wrench", Dimensions: "ruler", "Weight & packaging": "truck", Construction: "wrench",
  "Controls & features": "check", "Safety & compliance": "check", "Cleaning & maintenance": "refresh", "Warranty & service": "info",
};
const KIND: Record<string, string> = { caterkwik: "Caterkwik product page", datasheet: "Specification sheet or manual", manufacturer: "Manufacturer", retailer: "Retailer listing", other: "Other source" };

const docKind = (label: string, kind?: string) =>
  kind === "checklist" ? "Checklist" : /manual|instruction/i.test(label) ? "User manual" : /spec|data/i.test(label) ? "Specification sheet" : /brochure|catalogue/i.test(label) ? "Brochure" : "Document";

const Cite = ({ n, dossier }: { n: number; dossier: Dossier }) => (
  <sup className="cite"><a href={`#src-${n + 1}`} title={`${KIND[dossier.sources[n]?.kind] ?? "Source"}: ${dossier.sources[n]?.title ?? dossier.sources[n]?.url}`}>{n + 1}</a></sup>
);

// One long page for one product: every figure any source published, grouped, each with its source number.
// Caterkwik's own page outranks a spec sheet, which outranks the open web; where sources disagree the
// higher-ranked value is shown and the other is listed beneath it, never silently dropped.
export function ProductDossier({ dossier, rich }: { dossier: Dossier; rich: Rich | null }) {
  const count = dossier.sections.reduce((n, s) => n + s.facts.length, 0) + dossier.other.length;
  const requirements = rich ? [...rich.power, ...rich.special] : [];
  const nav = [
    dossier.highlights.length && ["features", "Features"],
    count && ["spec", "Specification"],
    (requirements.length || rich?.icons.length) && ["install", "Installation"],
    dossier.included.length && ["box", "In the box"],
    dossier.documents.length && ["docs", "Downloads"],
    dossier.images.length && ["photos", "Photos"],
    rich?.related.length && ["related", "Accessories"],
    dossier.faqs.length && ["faq", "Questions"],
    ["sources", `Sources (${dossier.sources.length})`],
  ].filter((x): x is [string, string] => Array.isArray(x));

  return (
    <div className="dossier">
      <nav className="dnav" aria-label="On this page">
        {nav.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>

      {dossier.highlights.length > 0 && (
        <section className="rsec" id="features">
          <h2><Icon name="check" /> Key features</h2>
          <ul className="ticks">
            {dossier.highlights.map((h) => <li key={h.text}>{h.text}{h.source > 0 && <Cite n={h.source} dossier={dossier} />}</li>)}
          </ul>
        </section>
      )}

      {count > 0 && (
        <section className="rsec" id="spec">
          <h2><Icon name="list" /> Technical specification <small className="count">{count} details</small></h2>
          {dossier.sections.map((s) => (
            <div key={s.section} className="sgroup">
              <h3><Icon name={SECTION_ICON[s.section]} size={16} /> {s.section}</h3>
              <div className="specgrid">
                {s.facts.map((f) => (
                  <div key={f.key ?? f.label}>
                    <span>{f.label}</span>
                    <span>
                      {factText(f.value, f.unit)}<Cite n={f.source} dossier={dossier} />
                      {f.alternatives?.map((a) => (
                        <em key={`${a.source}-${String(a.value)}`} className="alt" title="Another source gives a different figure">
                          also reported: {factText(a.value, f.unit)}<Cite n={a.source} dossier={dossier} />
                        </em>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {dossier.other.length > 0 && (
            <div className="sgroup">
              <h3><Icon name="info" size={16} /> More details</h3>
              <div className="specgrid">
                {dossier.other.map((f) => (
                  <div key={`${f.label}|${String(f.value)}`}><span>{f.label}</span><span>{factText(f.value, f.unit)}<Cite n={f.source} dossier={dossier} /></span></div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {(requirements.length > 0 || (rich?.icons.length ?? 0) > 0) && (
        <section className="rsec" id="install">
          <h2><Icon name="wrench" /> Installation &amp; requirements</h2>
          {requirements.length > 0 && <ul className="plain">{requirements.map((d) => <li key={d}>{d}</li>)}</ul>}
          {rich && rich.icons.length > 0 && <ul className="chips">{rich.icons.map((i) => <li key={i}>{i}</li>)}</ul>}
        </section>
      )}

      {dossier.included.length > 0 && (
        <section className="rsec" id="box">
          <h2><Icon name="truck" /> In the box</h2>
          <ul className="ticks">{dossier.included.map((i) => <li key={i}>{i}</li>)}</ul>
        </section>
      )}

      {dossier.documents.length > 0 && (
        <section className="rsec" id="docs">
          <h2><Icon name="download" /> Downloads</h2>
          <ul className="docs">
            {dossier.documents.map((d) => (
              <li key={d.url}>
                <a href={d.url} target="_blank" rel="noopener noreferrer nofollow">
                  <Icon name="file" size={20} />
                  <span><b>{d.label}</b><small>{docKind(d.label, d.kind)} · PDF</small></span>
                  <Icon name="download" size={16} />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dossier.images.length > 0 && (
        <section className="rsec" id="photos">
          <h2><Icon name="eye" /> Manufacturer photos</h2>
          <ul className="gallery">
            {dossier.images.map((img) => (
              <li key={img.url}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.alt ?? ""} loading="lazy" referrerPolicy="no-referrer" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {rich && rich.related.length > 0 && (
        <section className="rsec" id="related">
          <h2><Icon name="basket" /> Customers also bought</h2>
          <ul className="plain related">
            {rich.related.map((r) => {
              const known = getProduct(r.token);
              return (
                <li key={r.token}>
                  {known ? <Link href={productHref(known)}>{r.name}</Link> : <span>{r.name}</span>}
                  <small>{r.price === null ? "Price on application" : `${money(r.price)} ex VAT`}</small>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {dossier.faqs.length > 0 && (
        <section className="rsec" id="faq">
          <h2><Icon name="info" /> Questions people ask</h2>
          {dossier.faqs.map((q) => (
            <details key={q.q} className="qa"><summary>{q.q}</summary><p>{q.a}{q.source !== undefined && <Cite n={q.source} dossier={dossier} />}</p></details>
          ))}
        </section>
      )}

      {dossier.alternatives.length > 0 && (
        <p className="muted idline">Sources name these as the successor or replacement: {dossier.alternatives.join(", ")}.</p>
      )}

      <section className="rsec" id="sources">
        <h2><Icon name="file" /> Sources</h2>
        <ol className="srcs">
          {dossier.sources.map((s, i) => (
            <li key={s.url} id={`src-${i + 1}`}>
              <b>{KIND[s.kind]}</b>{s.title ? `: ${s.title}` : ""}{" "}
              <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">{hostOf(s.url).replace(/^www\./, "")}</a>
              {s.read ? ` · read ${s.read}` : ""}
            </li>
          ))}
        </ol>
        <p className="muted idline">
          Caterkwik&apos;s own page outranks a specification sheet, which outranks other websites. A figure no source states is left out rather than estimated.
          Check the model number before ordering, and confirm gas and electrical requirements with the team.
        </p>
      </section>
    </div>
  );
}
