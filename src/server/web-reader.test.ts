import { describe, expect, it } from "vitest";
import { assertPublicUrl, isPrivateAddress, pageText, readWebPage, WebReadError } from "@/server/web-reader";

const publicHost = async () => [{ address: "93.184.216.34" }];
const page = (body: string, status = 200, headers: Record<string, string> = { "content-type": "text/html" }) => new Response(body, { status, headers });

describe("isPrivateAddress", () => {
  it("rejects loopback, private, link-local, shared and multicast addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("accepts public addresses", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe("assertPublicUrl", () => {
  it("accepts a public https page", async () => {
    expect((await assertPublicUrl("https://www.example.com/p?q=1", publicHost)).hostname).toBe("www.example.com");
  });
  it("refuses everything that is not an ordinary public web page", async () => {
    for (const u of [
      "ftp://example.com/x", "file:///etc/passwd", "https://user:pw@example.com/", "https://example.com:8080/", "http://localhost/", "http://intranet/",
      "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data", "https://app.internal/", "not a url",
    ]) {
      await expect(assertPublicUrl(u, publicHost), u).rejects.toThrow(WebReadError);
    }
  });
  it("refuses a name that resolves to a private address, and one that does not resolve", async () => {
    await expect(assertPublicUrl("https://sneaky.example.com/", async () => [{ address: "10.0.0.5" }])).rejects.toThrow("not a public website");
    await expect(assertPublicUrl("https://mixed.example.com/", async () => [{ address: "93.184.216.34" }, { address: "127.0.0.1" }])).rejects.toThrow("not a public website");
    await expect(assertPublicUrl("https://nowhere.example.com/", async () => { throw new Error("ENOTFOUND"); })).rejects.toThrow("Could not find");
  });
});

describe("pageText", () => {
  it("drops scripts, styles and markup, and decodes entities", () => {
    const t = pageText("<head><title>x</title></head><style>a{}</style><script>evil()</script><h1>Groen &amp; Co</h1><p>Price &pound;1,200&nbsp;ex VAT</p><!-- c --><p>Line two</p>");
    expect(t).toBe("Groen & Co\nPrice £1,200 ex VAT\nLine two");
  });
});

describe("readWebPage", () => {
  const ld = `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Groen DEE4-20", sku: "DEE4-20", offers: { price: "1234.5", priceCurrency: "GBP" } })}</script>`;
  const html = `<html><head><title>Groen DEE4-20 | Falcon</title><meta name="description" content="A steamer"><meta property="og:image" content="https://cdn.example.com/a.jpg">${ld}</head><body><h1>Groen DEE4-20</h1><p>Height 900 mm</p></body></html>`;

  it("returns title, description, product data, images and text", async () => {
    const r = await readWebPage("https://www.example.com/p", { resolve: publicHost, fetchFn: async () => page(html) });
    expect(r).toMatchObject({ title: "Groen DEE4-20 | Falcon", description: "A steamer", images: ["https://cdn.example.com/a.jpg"], truncated: false });
    expect(r.product).toMatchObject({ sku: "DEE4-20", price: 1234.5, currency: "GBP" });
    expect(r.text).toContain("Height 900 mm");
  });

  it("checks every redirect, so a public page cannot bounce the reader to an internal one", async () => {
    const calls: string[] = [];
    const fetchFn = (async (u: URL) => {
      calls.push(String(u));
      return new Response("", { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } });
    }) as unknown as typeof fetch;
    await expect(readWebPage("https://www.example.com/p", { resolve: publicHost, fetchFn })).rejects.toThrow("not a public website");
    expect(calls).toEqual(["https://www.example.com/p"]);
  });

  it("follows a public redirect, and stops after four", async () => {
    let n = 0;
    const ok = (async () => (n++ === 0 ? new Response("", { status: 301, headers: { location: "/final" } }) : page(html))) as unknown as typeof fetch;
    expect((await readWebPage("https://www.example.com/p", { resolve: publicHost, fetchFn: ok })).url).toBe("https://www.example.com/final");
    const loop = (async () => new Response("", { status: 302, headers: { location: "/again" } })) as unknown as typeof fetch;
    await expect(readWebPage("https://www.example.com/p", { resolve: publicHost, fetchFn: loop })).rejects.toThrow("too many times");
  });

  it("says plainly when the site blocks automated reading", async () => {
    await expect(readWebPage("https://www.example.com/p", { resolve: publicHost, fetchFn: async () => page("Just a moment...", 403) })).rejects.toThrow("blocked automated reading");
  });

  it("rejects files and caps long pages", async () => {
    await expect(readWebPage("https://www.example.com/a.pdf", { resolve: publicHost, fetchFn: async () => page("%PDF", 200, { "content-type": "application/pdf" }) })).rejects.toThrow("not a web page");
    const long = await readWebPage("https://www.example.com/p", { resolve: publicHost, fetchFn: async () => page(`<p>${"word ".repeat(10_000)}</p>`) });
    expect(long.text.length).toBe(12_000);
    expect(long.truncated).toBe(true);
  });
});
