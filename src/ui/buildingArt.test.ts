import { describe, expect, it } from "vitest";
import review from "../../docs/cultural-review.md?raw";
import { content } from "../engine/testUtils";
import { ART_LORE, buildingArtUrl, mapIcon } from "./buildingArt";

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
    expect(buildingArtUrl("bahay-kubo")).toBeNull();
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
});
