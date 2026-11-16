// Ritual specialists, women and men (V.4): an Aklat entry, sourced and waiting for review.
import { describe, expect, it } from "vitest";
import review from "../../docs/cultural-review.md?raw";
import { content } from "./testUtils";

describe("ritual specialists, women and men", () => {
  it("has a sourced Aklat entry, waiting for review, listed for the historian", () => {
    const e = content.aklat.find((x) => x.id === "ritual-specialists-gender")!;
    expect(e.reviewed).toBe(false);
    expect(e.sources.length).toBeGreaterThanOrEqual(2);
    expect(e.aklat.lore.en).toMatch(/asog/);
    expect(e.aklat.lore.en).toMatch(/bayoguin/);
    expect(e.aklat.lore.fil).toMatch(/asog/);
    expect(review).toContain("content/lore/ritual-specialists-gender.json");
  });
});
