import { LegacyScripts, type LegacyScript } from "@/components/legacy-scripts";
import { localise } from "@/lib/legacy-html";

export interface Fragment {
  ld: string[];
  main: string;
  markup: string;
  scripts: LegacyScript[];
}

// `display: contents` keeps the wrapper out of the layout, so the markup sits where it did originally.
const Html = ({ html }: { html: string }) => (
  <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: localise(html) }} />
);

export function LegacyPage({ fragment }: { fragment: Fragment }) {
  return (
    <>
      {fragment.ld.map((json, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: localise(json) }} />
      ))}
      <Html html={fragment.main} />
      <Html html={fragment.markup} />
      <LegacyScripts scripts={fragment.scripts} />
    </>
  );
}
