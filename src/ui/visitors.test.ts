import { describe, expect, it } from "vitest";
import { content, TEST_MAP } from "../engine/testUtils";
import { along, boatArriving, boatLeaving, dockIndex, dockPoint, fromTop, LANDING_SHARE, LEAVE_SECONDS, raidApproach, raiderCount, riverPath, SAIL_SECONDS } from "./visitors";

// TEST_MAP: river in column 0, plaza at (5, 4), 9 rows.
const path = riverPath(TEST_MAP);
const plaza = TEST_MAP.plaza;

describe("boats on the river", () => {
  it("follows the middle of the river, from off the top to off the bottom", () => {
    expect(path).toHaveLength(TEST_MAP.height + 2);
    expect(path[0].y).toBeLessThan(0);
    expect(path.at(-1)!.y).toBeGreaterThan(TEST_MAP.height);
    expect(path.slice(1, -1).every((p) => p.x === 0.5)).toBe(true);
  });

  it("docks on the bank nearest the plaza", () => {
    expect(path[dockIndex(path, plaza)].y).toBe(4.5);
    expect(dockPoint(path, plaza).x).toBeGreaterThan(0.5);
  });

  it("sails in from the edge and docks after SAIL_SECONDS", () => {
    const start = boatArriving(path, plaza, true, 0);
    expect(start.p.y).toBeLessThan(0);
    expect(start.docked).toBe(false);
    const end = boatArriving(path, plaza, true, SAIL_SECONDS);
    expect(end.docked).toBe(true);
    expect(end.p).toEqual(dockPoint(path, plaza));
    expect(boatArriving(path, plaza, false, 0).p.y).toBeGreaterThan(TEST_MAP.height);
  });

  it("sails away the way it came, then is gone", () => {
    expect(boatLeaving(path, plaza, true, 0)!.p).toEqual(dockPoint(path, plaza));
    expect(boatLeaving(path, plaza, true, LEAVE_SECONDS * 0.99)!.p.y).toBeLessThan(0);
    expect(boatLeaving(path, plaza, true, LEAVE_SECONDS)).toBeNull();
  });

  it("comes from upstream neighbors at the top", () => {
    const up = [...content.neighbors].sort((a, b) => a.river.position - b.river.position)[0];
    expect(fromTop(content, up.id)).toBe(true);
  });
});

describe("raiders", () => {
  const kuta = { x: 7, y: 6 };
  it("stay on the water until the karakoa lands", () => {
    const early = raidApproach(path, plaza, kuta, true, LANDING_SHARE / 2, 4);
    expect(early.raiders).toHaveLength(0);
    expect(early.karakoa.p.x).toBe(0.5);
  });

  it("reach the Kuta as the warning runs out", () => {
    const end = raidApproach(path, plaza, kuta, true, 1, 4);
    expect(end.raiders).toHaveLength(4);
    for (const r of end.raiders) expect(Math.hypot(r.x - 7.5, r.y - 6.9)).toBeLessThan(1.2);
  });

  it("draws a band of 3 to 8", () => {
    expect(raiderCount(1)).toBe(3);
    expect(raiderCount(5)).toBe(5);
    expect(raiderCount(40)).toBe(8);
  });

  it("measures distance along a line", () => {
    const line = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }];
    expect(along(line, 0.5).p).toEqual({ x: 2, y: 0 });
    expect(along(line, 0.75).p).toEqual({ x: 2, y: 1 });
    expect(along(line, 2).p).toEqual({ x: 2, y: 2 });
  });
});
