import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const load = async (allow?: string) => {
  vi.resetModules();
  if (allow !== undefined) vi.stubEnv("ALLOW_INDEXING", allow);
  return import("@/lib/seo");
};

describe("indexing switch", () => {
  it("is closed by default and opens only on ALLOW_INDEXING=true", async () => {
    expect((await load()).INDEXABLE).toBe(false);
    expect((await load()).ROBOTS).toEqual({ index: false, follow: false });
    expect((await load("yes")).INDEXABLE).toBe(false);
    const open = await load("true");
    expect(open.INDEXABLE).toBe(true);
    expect(open.ROBOTS).toEqual({ index: true, follow: true });
  });
});

describe("pageMetadata", () => {
  it("gives every page a canonical address, Open Graph and Twitter tags", async () => {
    const { pageMetadata } = await load();
    const m = pageMetadata({ title: "T", description: "D", path: "/ovens/4-burner", image: "/assets/img/x.jpg" });
    expect(m.alternates?.canonical).toBe("http://localhost:3000/ovens/4-burner");
    expect(m.openGraph).toMatchObject({
      title: "T", description: "D", url: "http://localhost:3000/ovens/4-burner", siteName: "Caterkwik", locale: "en_GB",
      images: [{ url: "http://localhost:3000/assets/img/x.jpg" }],
    });
    expect(m.twitter).toMatchObject({ card: "summary_large_image", images: ["http://localhost:3000/assets/img/x.jpg"] });
  });

  it("falls back to the logo as a small card when a page has no picture", async () => {
    const { pageMetadata } = await load();
    const m = pageMetadata({ title: "T", description: "D", path: "/" });
    expect(m.twitter).toMatchObject({ card: "summary", images: ["http://localhost:3000/assets/img/caterkwik-logo.png"] });
  });

  it("keeps utility pages out of the index but lets crawlers follow their links", async () => {
    const { utilityMetadata } = await load("true");
    expect(utilityMetadata("Search")).toEqual({ title: "Search", robots: { index: false, follow: true } });
  });
});
