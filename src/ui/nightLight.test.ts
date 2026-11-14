import { describe, expect, it } from "vitest";
import { at, calm, withState } from "../engine/testUtils";
import { barangayLights, darknessAt, LIGHT_LOOK, NIGHT_BLUE, nightColor, tintAt } from "./nightLight";
import { planVillagers, goal } from "./villagers";
import { solidTiles } from "../engine/doors";

describe("the night look", () => {
  it("is one cool blue, white (no change) by day, never orange at dusk", () => {
    expect(nightColor(0)).toEqual({ r: 255, g: 255, b: 255 });
    expect(nightColor(1)).toEqual(NIGHT_BLUE);
    const day = calm.rules.dayNight.daySeconds;
    for (let i = 0; i <= 200; i++) {
      const c = nightColor(darknessAt(calm, (i / 200) * day));
      expect(c.b).toBeGreaterThanOrEqual(c.r);
      expect(c.b).toBeGreaterThanOrEqual(c.g);
    }
    expect(tintAt(calm, 0)).toMatch(/^rgb\(/);
  });

  it("keeps the map readable: green keeps at least 45% of its value at full night", () => {
    expect(NIGHT_BLUE.g / 255).toBeGreaterThanOrEqual(0.45);
    expect(Math.min(NIGHT_BLUE.r, NIGHT_BLUE.g, NIGHT_BLUE.b) / 255).toBeGreaterThanOrEqual(0.35);
  });

  it("has small light pools: the plaza fire the largest at 2.5 tiles, houses and torches 1 to 1.5", () => {
    expect(LIGHT_LOOK.fire.r).toBe(2.5);
    for (const [kind, look] of Object.entries(LIGHT_LOOK)) {
      expect(look.r).toBeLessThanOrEqual(2.5);
      expect(look.a).toBeLessThanOrEqual(1);
      if (kind === "house" || kind === "torch") {
        expect(look.r).toBeGreaterThanOrEqual(1);
        expect(look.r).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it("lights a Kuta's palisade and its lookout", () => {
    const s = withState({ buildings: [at("kuta", 4, 6)], villagers: 2 });
    expect(barangayLights(s, calm).filter((l) => l.kind === "torch")).toHaveLength(3);
  });
});

describe("Mandirigma called to arms", () => {
  it("gather at the Kuta's gate, never on top of it", () => {
    const base = withState({ buildings: [at("bahay-kubo", 5, 3), at("kuta", 4, 6), at("palayan", 2, 2)], villagers: 6, warriors: 4 });
    const s = { ...base, region: { incomingRaid: { from: "x", strikeAt: 999 }, neighbors: [], voyages: [] } as never };
    const solid = solidTiles(s, calm);
    const warriors = planVillagers(s, calm).filter((p) => p.role === "warrior");
    expect(warriors.length).toBe(4);
    for (const p of warriors) {
      const g = goal(p, 10, false, s.map.plaza, false);
      expect(solid[Math.floor(g.p.y) * s.map.width + Math.floor(g.p.x)]).toBe(0);
      expect(Math.hypot(g.p.x - 4.5, g.p.y - 6.5)).toBeLessThan(1.3);
    }
  });
});
