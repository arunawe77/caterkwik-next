import { describe, expect, it } from "vitest";
import { buildDossier, hostOf } from "@/lib/dossier";
import { richOf } from "@/lib/rich";
import { webOf } from "@/lib/web";

describe("hostOf", () => {
  it("reads the host of a full address and treats a path on this site as Caterkwik", () => {
    expect(hostOf("https://www.nisbets.co.uk/x")).toBe("www.nisbets.co.uk");
    expect(hostOf("/media/documents/legacy/ct917-user-manual-ct917.pdf")).toBe("www.caterkwik.co.uk");
  });
});

describe("product dossiers", () => {
  // These products cite documents we host ourselves, so their source addresses are paths, not full URLs.
  it.each(["ct253", "g7506", "slr9c", "falcong31016burnergasoven", "electrolux3910136burnergasoven", "rgr36"])("builds for %s", async (id) => {
    const [rich, web] = await Promise.all([richOf(id), webOf(id)]);
    const d = buildDossier(id, rich, web, null);
    for (const s of d.sources) expect(hostOf(s.url)).toBeTruthy();
  });
});
