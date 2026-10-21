import { LegacyScripts } from "@/components/legacy-scripts";
import chat from "@/legacy/chat.json";

interface KitConfig {
  page: string;
  greeting: string;
  nudge: string;
  suggest: string[];
  placeholder: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Kit, the product expert: the approved chat panel, with this page's greeting, suggestions and
// placeholder. `page` is sent with every message so the server grounds him in the right data.
export function KitChat({ page, greeting, nudge, suggest, placeholder }: KitConfig) {
  const chips = suggest.map((s) => `<button type="button">${esc(s)}</button>`).join("\n    ");
  const markup = chat
    .replace(/<div class="suggest" id="suggest">[\s\S]*?<\/div>/, `<div class="suggest" id="suggest">\n    ${chips}\n  </div>`)
    .replace(/placeholder="[^"]*"/, `placeholder="${esc(placeholder)}"`);

  return (
    <>
      <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: markup }} />
      <LegacyScripts scripts={[{ text: `window.CK_CHAT=${JSON.stringify({ page, greeting, nudge })}` }, { src: "/assets/chat.js" }]} />
    </>
  );
}

// Every generated page: hub-level questions about the whole oven catalogue.
export const CatalogueKit = () => (
  <KitChat
    page="catalogue"
    greeting="Hi, I'm Kit. Tell me what you cook and what supply you have and I'll point you at the right oven."
    nudge="Not sure which oven? Tell me what you cook and how many covers you do at your busiest, and I'll narrow it to one or two."
    suggest={["I bake, no gas: which type?", "Busiest service is 200 covers", "What is a cook and hold oven for?"]}
    placeholder="Ask which oven you need..."
  />
);
