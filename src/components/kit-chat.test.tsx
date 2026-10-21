import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CatalogueKit, KitChat } from "@/components/kit-chat";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("KitChat", () => {
  it("renders the approved panel with this page's suggestions and placeholder, escaped", () => {
    const out = html(<KitChat page="x" greeting="g" nudge="n" suggest={["A & B", '<b>"hi"</b>']} placeholder='Ask "now"' />);
    expect(out).toContain('id="chat"');
    expect(out).toContain('<button type="button">A &amp; B</button>');
    expect(out).toContain("&lt;b&gt;&quot;hi&quot;&lt;/b&gt;");
    expect(out).toContain('placeholder="Ask &quot;now&quot;"');
    expect(out).not.toContain('<b>"hi"');
  });

  it("is offered on the catalogue pages with its own greeting", () => {
    const out = html(<CatalogueKit />);
    expect(out).toContain("What is a cook and hold oven for?");
    expect(out).toContain('id="launch"');
  });
});
