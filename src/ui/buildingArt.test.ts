import { describe, expect, it } from "vitest";
import review from "../../docs/cultural-review.md?raw";
import { content } from "../engine/testUtils";
import { ART_IMAGES, ART_LORE, artKey, buildingArtUrl, kamaligSvg, mapIcon } from "./buildingArt";

const def = (id: string) => content.buildings.find((d) => d.id === id)!;

describe("how buildings are drawn", () => {
  it("a Tulay has no icon on the map (it is its deck); its toolbar card keeps the icon", () => {
    expect(mapIcon(def("tulay"))).toBeNull();
    expect(def("tulay").icon).toBeTruthy();
    for (const d of content.buildings.filter((x) => !x.bridge)) expect(mapIcon(d)).toBe(d.icon);
  });

  it("the Dambana and Kuta have custom SVG art", () => {
    for (const id of ["dambana", "kuta"]) {
      const url = buildingArtUrl(id)!;
      expect(url.startsWith("data:image/svg+xml")).toBe(true);
      expect(decodeURIComponent(url)).toContain("<svg");
    }
    expect(buildingArtUrl("palayan")).toBeNull();
  });

  it("the art has sourced lore notes, waiting for review, listed in docs/cultural-review.md", () => {
    expect(review).toContain("Dambana art: generic form inspired by raised bamboo shrines (pinag-anituhan); needs a historical source and review; tradition-specific designs pending.");
    for (const id of Object.values(ART_LORE)) {
      const note = content.lore[id];
      expect(note).toBeDefined();
      expect(note.reviewed).toBe(false);
      expect(note.sources.length).toBeGreaterThan(0);
      expect(review).toContain(`content/lore/${id}.json`);
    }
  });

  it("the Kamalig is a raised granary (no basket), larger on more posts at each level", () => {
    const posts = (l: number) => (kamaligSvg(l).match(/y2="59"/g) ?? []).length;
    expect([1, 2, 3].map(posts)).toEqual([3, 4, 5]);
    const width = (l: number) => Number(/<rect x="[\d.]+" y="23" width="([\d.]+)"/.exec(kamaligSvg(l))![1]);
    expect(width(2)).toBeGreaterThan(width(1));
    expect(width(3)).toBeGreaterThan(width(2));
    const urls = [1, 2, 3].map((l) => buildingArtUrl("kamalig", l));
    expect(new Set(urls).size).toBe(3);
    for (const u of urls) expect(decodeURIComponent(u!)).toContain("<svg");
    expect(buildingArtUrl("kamalig", 9)).toBe(urls[2]);
    expect(def("kamalig").icon).not.toBe("🧺");
    // The share card preloads every level.
    for (const l of [1, 2, 3]) expect(ART_IMAGES.some((a) => a.key === artKey("kamalig", l))).toBe(true);
  });

  it("the Kamalig's Aklat entry opens when one is built", () => {
    const e = content.aklat.find((x) => x.id === "kamalig")!;
    expect(e.aklat.unlock).toEqual({ type: "built", building: "kamalig" });
  });
});
