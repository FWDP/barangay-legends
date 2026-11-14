import { describe, expect, it } from "vitest";
import { apply, buildingWorkers, canStaff, demolishPreview, rates, roadCost, unreachableWorkplaces, type GameState } from "./game";
import { barangayCenter, footReach, isConnected, isFootReachable, tileAt } from "./map";
import { cachedPath, findPath, isWalkable } from "./paths";
import { parseSave } from "./save";
import { at, calm, content, mapFrom, withState } from "./testUtils";

// A river down column 4 with one bridge at row 2; the plaza on the left bank.
const riverMap = mapFrom([
  "....~....",
  "....~....",
  ".P..=....",
  "....~....",
  "....~....",
]);
const noBridge = mapFrom([
  "....~....",
  "....~....",
  ".P..~....",
  "....~....",
  "....~....",
]);
const crosses = (path: { x: number; y: number }[], map: typeof riverMap) => path.some((p) => tileAt(map, p.x, p.y) === "river");

describe("pathfinding (A*)", () => {
  it("never walks on water", () => {
    const path = findPath(riverMap, { x: 0, y: 0 }, { x: 8, y: 4 })!;
    expect(path).not.toBeNull();
    expect(crosses(path, riverMap)).toBe(false);
  });

  it("crosses the river on the bridge", () => {
    const path = findPath(riverMap, { x: 0, y: 4 }, { x: 8, y: 4 })!;
    expect(path.some((p) => p.x === 4 && p.y === 2)).toBe(true);
    expect(path[0]).toEqual({ x: 0, y: 4 });
    expect(path.at(-1)).toEqual({ x: 8, y: 4 });
  });

  it("finds no way across without a bridge", () => {
    expect(findPath(noBridge, { x: 0, y: 0 }, { x: 8, y: 0 })).toBeNull();
  });

  it("goes around water inside the barangay", () => {
    const pond = mapFrom([
      ".....",
      ".~~~.",
      ".~~~.",
      "P....",
    ]);
    const path = findPath(pond, { x: 2, y: 0 }, { x: 2, y: 3 })!;
    expect(crosses(path, pond)).toBe(false);
    expect(path.length).toBeGreaterThan(4);
  });

  it("prefers Daan and avoids forest", () => {
    const m = mapFrom([
      "P#####.",
      ".TTTTT.",
      ".......",
    ]);
    const path = findPath(m, { x: 0, y: 0 }, { x: 6, y: 0 })!;
    expect(path.every((p) => p.y === 0)).toBe(true);
    expect(isWalkable(m, 3, 1)).toBe(true);
    expect(isWalkable(riverMap, 4, 0)).toBe(false);
  });

  it("caches per map, so a changed map gets fresh paths", () => {
    const a = cachedPath(riverMap, { x: 0, y: 0 }, { x: 8, y: 0 });
    expect(cachedPath(riverMap, { x: 0, y: 0 }, { x: 8, y: 0 })).toBe(a);
    expect(cachedPath(noBridge, { x: 0, y: 0 }, { x: 8, y: 0 })).toBeNull();
  });

  it("is fast enough for a full map", () => {
    const s = withState({});
    const big = { ...s.map, width: 60, height: 40, tiles: "c".repeat(60 * 40) };
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) findPath(big, { x: 0, y: i % 40 }, { x: 59, y: 39 - (i % 40) });
    expect(performance.now() - t0).toBeLessThan(300);
  });
});

describe("reachability from the barangay's center", () => {
  it("starts at the plaza", () => {
    expect(barangayCenter(riverMap)).toEqual({ x: 1, y: 2 });
  });

  it("walks over cleared land, Daan and bridges, not forest or river", () => {
    const m = mapFrom([
      "P.#T.~.",
      "...T.=.",
    ]);
    expect(isFootReachable(m, 2, 0)).toBe(true);
    expect(isFootReachable(m, 4, 0)).toBe(false); // behind the forest
    expect(isFootReachable(riverMap, 8, 4)).toBe(true); // over the bridge
    expect(isFootReachable(noBridge, 8, 4)).toBe(false);
    expect(footReach(riverMap)).toBe(footReach(riverMap));
  });

  it("only staffs workplaces with a path", () => {
    const s = withState({ map: noBridge, villagers: 10, resources: { rice: 100, wood: 0, gold: 0 }, buildings: [at("bahay-kubo", 0, 0), at("palayan", 2, 4), at("woodcutter-camp", 7, 2)] });
    const workers = buildingWorkers(s, calm);
    expect(workers[1]).toBeGreaterThan(0);
    expect(workers[2]).toBe(0);
    expect(canStaff(s, content, s.buildings[2])).toBe(false);
    expect(unreachableWorkplaces(s, calm).map((b) => b.type)).toEqual(["woodcutter-camp"]);
    expect(rates(s, calm).produced.wood).toBe(0);
    // With a bridge the camp gets its workers.
    expect(buildingWorkers({ ...s, map: riverMap }, calm)[2]).toBeGreaterThan(0);
  });

  it("warns before a demolished Tulay strands workplaces", () => {
    const s = withState({ map: riverMap, villagers: 10, resources: { rice: 100, wood: 0, gold: 0 }, buildings: [at("bahay-kubo", 0, 0), at("tulay", 4, 2), at("woodcutter-camp", 7, 2)] });
    expect(demolishPreview(s, calm, 4, 2)).toMatchObject({ stranded: 1 });
    expect(demolishPreview(s, calm, 0, 0)).toMatchObject({ stranded: 0 });
  });
});

describe("old saves keep their old rule until the map changes", () => {
  const stranded = (): GameState =>
    withState({ map: noBridge, villagers: 10, resources: { rice: 100, wood: 200, gold: 0 }, buildings: [at("bahay-kubo", 0, 0), at("woodcutter-camp", 7, 2)], legacyReach: true });

  it("v9 saves are migrated with the old rule", () => {
    const v9 = { ...stranded(), version: 9 } as Record<string, unknown>;
    delete v9.legacyReach;
    const loaded = parseSave(JSON.stringify(v9), content)!;
    expect(loaded.legacyReach).toBe(true);
    expect(parseSave(JSON.stringify({ ...stranded(), legacyReach: false }), content)!.legacyReach).toBe(false);
  });

  it("a stranded workplace keeps working until the player changes the map", () => {
    const s = stranded();
    expect(rates(s, calm).produced.wood).toBeGreaterThan(0);
    expect(unreachableWorkplaces(s, calm)).toEqual([]);
    // Gathering doesn't change the map: still the old rule.
    expect(apply(s, calm, { type: "gather", resource: "rice" }).legacyReach).toBe(true);
    // Laying a path does: now the new rule applies.
    const after = apply(s, calm, { type: "road", tiles: [{ x: 3, y: 2 }] });
    expect(after.legacyReach).toBe(false);
    expect(rates(after, calm).produced.wood).toBe(0);
  });

  it("new games use the new rule", () => {
    expect(withState({}).legacyReach).toBe(false);
  });
});

describe("Daan", () => {
  const base = () => withState({ map: riverMap, villagers: 6, resources: { rice: 100, wood: 50, gold: 0 }, buildings: [at("bahay-kubo", 0, 0), at("palayan", 2, 4)] });
  const wood = () => roadCost(calm).wood;

  it("is laid on cleared land only, paid per tile", () => {
    const s = base();
    const after = apply(s, calm, { type: "road", tiles: [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 2 }, { x: 1, y: 2 }, { x: 0, y: 0 }, { x: 3, y: 2 }] });
    expect(tileAt(after.map, 2, 2)).toBe("daan");
    // Once kept for the big Bahay ng Datu (plaza.ts), no Daan there.
    const kept = apply({ ...s, datuLevel: calm.rules.plaza.reserveFromLevel }, calm, { type: "road", tiles: [{ x: 2, y: 2 }] });
    expect(tileAt(kept.map, 2, 2)).toBe("cleared");
    expect(tileAt(after.map, 3, 2)).toBe("daan");
    expect(tileAt(after.map, 3, 3)).toBe("daan");
    expect(tileAt(after.map, 4, 2)).toBe("bridge"); // not on the bridge
    expect(tileAt(after.map, 1, 2)).toBe("cleared"); // not on the plaza
    expect(tileAt(after.map, 0, 0)).toBe("cleared"); // not under a building
    expect(after.resources.wood).toBe(s.resources.wood - 3 * wood());
    expect(apply(s, calm, { type: "road", tiles: [{ x: 4, y: 0 }] })).toBe(s); // not on water
  });

  it("stops when the wood runs out", () => {
    const s = { ...base(), resources: { rice: 100, wood: wood() * 2, gold: 0 } };
    const after = apply(s, calm, { type: "road", tiles: [{ x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }] });
    expect(tileAt(after.map, 0, 2)).toBe("daan");
    expect(tileAt(after.map, 0, 3)).toBe("cleared");
    expect(after.resources.wood).toBe(0);
  });

  it("is removed for free", () => {
    const s = apply(base(), calm, { type: "road", tiles: [{ x: 2, y: 2 }] });
    const after = apply(s, calm, { type: "removeRoad", x: 2, y: 2 });
    expect(tileAt(after.map, 2, 2)).toBe("cleared");
    expect(after.resources).toEqual(s.resources);
    expect(apply(after, calm, { type: "removeRoad", x: 2, y: 2 })).toBe(after);
  });

  it("an unbroken path to the plaza makes a building Connected: +5% output", () => {
    const s = base();
    const before = rates(s, calm).produced.rice;
    // Plaza (1,2) → path (1,3), (1,4) → next to the field at (2,4), which has no other bonus.
    const linked = apply(s, calm, { type: "road", tiles: [{ x: 1, y: 3 }, { x: 1, y: 4 }] });
    expect(isConnected(linked.map, 2, 4)).toBe(true);
    expect(rates(linked, calm).produced.rice).toBeCloseTo(before * (1 + calm.rules.roads.connectedBonusPercent / 100), 5);
    // A gap breaks it.
    const broken = apply(linked, calm, { type: "removeRoad", x: 1, y: 3 });
    expect(isConnected(broken.map, 2, 4)).toBe(false);
    expect(rates(broken, calm).produced.rice).toBeCloseTo(before, 5);
  });

  it("joins across a bridge", () => {
    const m = mapFrom([
      ".P##=#.",
      ".......",
    ]);
    expect(isConnected(m, 6, 0)).toBe(true);
    expect(isConnected(m, 6, 1)).toBe(false);
  });

  it("never crosses water (bridges do that)", () => {
    const s = base();
    expect(apply(s, calm, { type: "road", tiles: [{ x: 4, y: 0 }, { x: 4, y: 1 }] })).toBe(s);
  });
});
