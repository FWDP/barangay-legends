import { describe, expect, it } from "vitest";
import { moonPhaseAt } from "../engine/daynight";
import { content } from "../engine/testUtils";
import nightSource from "./NightLayer.tsx?raw";
import mapSource from "./BarangayMap.tsx?raw";
import daysSource from "./Days.tsx?raw";
import { moonPath } from "./Moon";

describe("the moon", () => {
  it("is never drawn over the map: not on the night layer or the map, only in the HUD beside Araw N", () => {
    // The night layer draws on a canvas laid over the map's tiles: no moon there any more.
    expect(nightSource).not.toMatch(/\bmx\b|\bmy\b|const mr\b/);
    expect(nightSource).not.toMatch(/<Moon\b/);
    expect(mapSource).not.toMatch(/<Moon\b/);
    expect(daysSource).toMatch(/<Moon\b/);
  });

  it("goes through its phases every moonCycleDays Araw", () => {
    const { daySeconds, moonCycleDays } = content.rules.dayNight;
    const cycle = daySeconds * moonCycleDays;
    expect(moonPhaseAt(content, 0, 0)).toBeCloseTo(0.25);
    expect(moonPhaseAt(content, 0, cycle)).toBeCloseTo(0.25);
    expect(moonPhaseAt(content, 0, cycle / 4)).toBeCloseTo(0.5);
    for (let t = 0; t < cycle * 2; t += 37) {
      const p = moonPhaseAt(content, 0, t);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });

  it("draws a lit shape for every phase", () => {
    for (const p of [0.05, 0.25, 0.5, 0.75, 0.95]) expect(moonPath(p)).toMatch(/^M .* Z$/);
  });
});
