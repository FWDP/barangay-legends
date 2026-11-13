import { describe, expect, it } from "vitest";
import { tileAt } from "../engine/map";
import { isWalkable } from "../engine/paths";
import { at, content, mapFrom, TEST_MAP, withState } from "../engine/testUtils";
import { bandAt, isWater, lootTarget, lootWalk, sailToLanding } from "./visitors";
import { along, boatArriving, boatLeaving, dockIndex, dockPoint, fromTop, LEAVE_SECONDS, raiderCount, riverPath, SAIL_SECONDS } from "./visitors";

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


describe("raiders at the border", () => {
  // The river down columns 4–5; the barangay to the west; a field at (1, 3).
  const m = mapFrom([
    "....~~....",
    "....~~....",
    ".P..~~....",
    ".T..~~....",
    "....~~....",
  ]);
  const river = riverPath(m);

  it("the karakoa beaches beside the landing, coming from its end of the river", () => {
    const landing = { x: 3, y: 3 };
    const sail = sailToLanding(river, landing, true);
    expect(sail[0].y).toBeLessThan(0);
    expect(sail.at(-1)).toEqual({ x: 5, y: 3.5 });
    expect(sailToLanding(river, landing, false)[0].y).toBeGreaterThan(m.height);
  });

  it("raiders stand on the landing tile, never in the water", () => {
    for (const p of bandAt({ x: 3, y: 3 }, 8)) {
      expect(Math.floor(p.x)).toBe(3);
      expect(Math.floor(p.y)).toBe(3);
    }
  });

  it("winners go for the first loot target the barangay has (fields while there's no Kamalig)", () => {
    const s = withState({ map: m, buildings: [at("palayan", 0, 4), at("palayan", 2, 4)] });
    expect(content.rules.diplomacy.aiRaid.lootTargets[0]).toBe("kamalig");
    expect(lootTarget(s, content, { x: 3, y: 4 })).toMatchObject({ x: 2, y: 4 });
    expect(lootTarget(withState({ map: m, buildings: [] }), content, { x: 3, y: 4 })).toEqual(m.plaza);
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

  it("their loot walk stays on land", () => {
    const walk = lootWalk(m, { x: 3, y: 0 }, { x: 0, y: 4 })!;
    expect(walk.every((p) => tileAt(m, Math.floor(p.x), Math.floor(p.y)) !== "river")).toBe(true);
    expect(walk.at(-1)).toEqual({ x: 0.5, y: 4.5 });
  });
});

describe("boats pass under a Tulay", () => {
  // A two-wide river with a bridge across it at row 3.
  const m = mapFrom([
    "...~~...",
    "...~~...",
    ".P.~~...",
    "...==...",
    "...~~...",
    "...~~...",
  ]);
  const path = riverPath(m);

  it("a bridge tile is water to a boat and land to people", () => {
    expect(isWater(m, 3, 3)).toBe(true);
    expect(isWalkable(m, 3, 3)).toBe(true);
    expect(isWalkable(m, 3, 2)).toBe(false);
  });

  it("the river path runs unbroken under the bridge", () => {
    // One point per row, every row, including the bridge's, straight down the middle.
    expect(path).toHaveLength(m.height + 2);
    expect(path.find((p) => p.y === 3.5)).toEqual({ x: 4, y: 3.5, bridge: true });
    expect(path.slice(1, -1).every((p) => p.x === 4)).toBe(true);
  });

  it("a bangka sails from the top edge past the bridge to the bottom edge", () => {
    const below = { x: 1, y: 5 }; // a plaza-like point below the bridge: the dock is under it
    const arriving = boatArriving(path, below, true, SAIL_SECONDS);
    expect(arriving.docked).toBe(true);
    expect(arriving.p.y).toBeGreaterThan(3.5);
    // Leaving downstream, it goes under the bridge and off the bottom of the map.
    const leaving = boatLeaving(path, { x: 1, y: 1 }, false, LEAVE_SECONDS * 0.99)!;
    expect(leaving.p.y).toBeGreaterThan(m.height);
  });

  it("ties up beside a bridge, not under it, so the boat can be seen and tapped", () => {
    expect(path[dockIndex(path, { x: 1, y: 3 })].bridge).toBeUndefined();
    expect(Math.abs(path[dockIndex(path, { x: 1, y: 3 })].y - 3.5)).toBe(1);
  });

  it("is the same when the bridge spans the whole river", () => {
    const full = mapFrom(["..~~..", "P.==..", "..~~.."]);
    expect(riverPath(full).slice(1, -1).map((p) => p.x)).toEqual([3, 3, 3]);
  });
});
