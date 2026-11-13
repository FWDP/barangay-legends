import { describe, expect, it } from "vitest";
import { content, withState } from "../engine/testUtils";
import { datuHouseSvg, datuHouseUrl, houseStyleFor } from "./datuHouseArt";

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
