import { describe, expect, it } from "vitest";
import { at, content, withState } from "../engine/testUtils";
import { datuHouseBox, datuHouseSvg, datuHouseUrl, houseStyleFor } from "./datuHouseArt";

const count = (svg: string, s: string) => svg.split(s).length - 1;

describe("the Bahay ng Datu drawing", () => {
  it("grows and gains ornament with each level", () => {
    const sizes = [1, 2, 3, 4, 5].map((l) => datuHouseSvg(l, "lowland"));
    const posts = sizes.map((s) => count(s, "<rect") );
    for (let i = 1; i < 5; i++) expect(posts[i]).toBeGreaterThan(posts[i - 1]);
    // Carved panels from level 3, decorated roof ends from 4, a second roof tier at 5.
    expect(datuHouseSvg(2, "lowland")).not.toContain("#8b2e16");
    expect(datuHouseSvg(3, "lowland")).toContain("#8b2e16");
    expect(count(datuHouseSvg(5, "lowland"), "stroke-linecap")).toBeGreaterThan(count(datuHouseSvg(4, "lowland"), "stroke-linecap"));
  });

  it("is a raised thatched house: posts, a ladder, a steep thatched roof, no chimney or glass", () => {
    const svg = datuHouseSvg(1, "lowland");
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 120 120"/);
    expect(svg).toContain("#d4a94e"); // thatch
    expect(svg).toContain("#8a5a2b"); // ladder
    expect(svg).not.toMatch(/glass|chimney/i);
  });

  it("follows the tradition: torogan-inspired for Maranao, lowland otherwise or before a choice", () => {
    expect(houseStyleFor(withState({ tradition: null }), content)).toBe("lowland");
    expect(houseStyleFor(withState({ tradition: "tagalog" }), content)).toBe("lowland");
    expect(houseStyleFor(withState({ tradition: "visayan" }), content)).toBe("lowland");
    expect(houseStyleFor(withState({ tradition: "maranao" }), content)).toBe("torogan");
    const t = datuHouseSvg(3, "torogan");
    expect(t).toContain("#15803d"); // okir-style green on the flared beam ends
    expect(t).toContain("#f2c14e");
    expect(datuHouseSvg(3, "lowland")).not.toContain("#15803d");
  });

  it("is one cached data URL per level and style", () => {
    expect(datuHouseUrl(2, "lowland")).toBe(datuHouseUrl(2, "lowland"));
    expect(datuHouseUrl(2, "lowland")).not.toBe(datuHouseUrl(2, "torogan"));
    expect(datuHouseUrl(9, "lowland")).toBe(datuHouseUrl(5, "lowland"));
    expect(datuHouseUrl(1, "lowland").startsWith("data:image/svg+xml")).toBe(true);
  });
});

describe("where the house is drawn on the map", () => {
  const rules = content.rules.plaza;
  it("is centred on its footprint and stands on its front edge", () => {
    const small = withState({ datuLevel: 1 });
    const p = small.map.plaza;
    expect(datuHouseBox(small, content)).toMatchObject({ cx: p.x + 0.5, ground: p.y + 1 });
    const big = withState({ datuLevel: rules.bigFromLevel, buildings: [] });
    const box = datuHouseBox(big, content);
    expect(box.cx).toBeCloseTo(p.x + rules.bigWidth / 2);
    expect(box.ground).toBe(p.y + 1);
    // Fills the footprint: about as wide as it, and bigger than the one-tile house.
    expect(box.size).toBeGreaterThan(datuHouseBox(small, content).size);
    expect(box.size).toBeLessThanOrEqual(rules.bigWidth * 1.4);
  });

  it("an old save keeping the one-tile house at a high level draws it at the one-tile size", () => {
    const kept = withState({ datuLevel: 5, buildings: [at("bahay-kubo", 6, 4)] });
    const box = datuHouseBox(kept, content);
    expect(box.cx).toBe(kept.map.plaza.x + 0.5);
    expect(box.size).toBeLessThanOrEqual(1.3);
    expect(box.level).toBe(5);
  });
});
