import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Pager } from "@/components/admin/pager";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("Pager", () => {
  it("shows nothing when everything fits on one page", () => {
    expect(html(<Pager path="/admin/x" query={{}} page={1} size={25} total={25} />)).toBe("");
  });

  it("links to the next page from the first, keeping filters", () => {
    const out = html(<Pager path="/admin/x" query={{ status: "PAID", q: undefined }} page={1} size={25} total={60} />);
    expect(out).toContain("Page 1 of 3");
    expect(out).toContain('href="/admin/x?status=PAID&amp;page=2"');
    expect(out).not.toContain("Previous");
  });

  it("links back to the bare address from page two, and not on past the last page", () => {
    const out = html(<Pager path="/admin/x" query={{ page: "2" }} page={3} size={25} total={60} />);
    expect(out).toContain('href="/admin/x?page=2"');
    expect(out).not.toContain("Next");
    expect(html(<Pager path="/admin/x" query={{}} page={2} size={25} total={60} />)).toContain('href="/admin/x"');
  });

  it("pages a second list without touching the first", () => {
    const out = html(<Pager path="/admin/s" query={{ page: "4", rpage: "2" }} page={2} size={50} total={200} param="rpage" />);
    expect(out).toContain("page=4");
    expect(out).toContain("rpage=3");
  });
});
