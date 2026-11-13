import { describe, expect, it } from "vitest";
import { activeJobs, affordableTiles, canSelect, clearingCrews, freeVillagers, jobCost, orderSelection, selectionCost } from "./clearing";
import { apply, tick, type GameState } from "./game";
import { tileAt } from "./map";
import { offlineProgress } from "./offline";
import { at, calm, content, mapFrom, withState } from "./testUtils";

// Plaza at (3, 2) in a small clearing; forest all round, a balete at (3, 4).
const small = mapFrom([
  "TTTTTTT",
  "T.....T",
  "T..P..T",
  "T.....T",
  "TTTBTTT",
]);
const { cost, secondsGrowth, baseSeconds, wood } = content.rules.clearing;
const start = (patch: Partial<GameState> = {}) =>
  withState({ map: small, buildings: [], resources: { rice: 500, wood: 0, gold: 0 }, villagers: 3, ...patch });
const run = (s: GameState, seconds: number) => tick(s, calm, seconds);
const T = (x: number, y: number) => ({ x, y });

describe("selection rules", () => {
  it("takes forest next to cleared land, and reaches inward through selected tiles", () => {
    const s = start();
    // (0,1) touches cleared land at (1,1); (0,0) only touches (0,1), which is selected.
    expect(orderSelection(s, [T(0, 0), T(0, 1)])).toEqual([T(0, 1), T(0, 0)]);
  });

  it("drops tiles that connect to nothing", () => {
    expect(orderSelection(start(), [T(0, 0)])).toEqual([]);
    expect(orderSelection(start(), [T(2, 2), T(9, 9)])).toEqual([]); // cleared land, off the map
  });

  it("keeps the player's order within each ring", () => {
    const s = start();
    expect(orderSelection(s, [T(6, 3), T(6, 1), T(0, 3)])).toEqual([T(6, 3), T(6, 1), T(0, 3)]);
  });

  it("counts queued tiles as a way in, but never selects them again", () => {
    const s = apply(start(), calm, { type: "clearArea", tiles: [T(0, 1)] });
    expect(canSelect(s, [], 0, 0)).toBe(true);
    expect(canSelect(s, [], 0, 1)).toBe(false);
  });

  it("needs confirmation for a balete", () => {
    const s = start();
    expect(apply(s, calm, { type: "clearArea", tiles: [T(3, 4), T(2, 4)] })).toBe(s);
    const felled = apply(s, calm, { type: "clearArea", tiles: [T(3, 4), T(2, 4)], confirmBalete: true });
    expect(felled.clearing.map((j) => [j.x, j.y])).toEqual([[3, 4], [2, 4]]);
  });
});

describe("total cost and partial affordability", () => {
  it("each tile costs a bit more than the last", () => {
    const s = start();
    expect(jobCost(s, content).rice).toBe(Math.ceil(cost.rice! * secondsGrowth ** 0));
    expect(jobCost(s, content, 20).rice).toBe(Math.ceil(cost.rice! * secondsGrowth ** 20));
    const total = [0, 1, 2, 3].reduce((n, i) => n + Math.ceil(cost.rice! * secondsGrowth ** i), 0);
    expect(selectionCost(s, content, 4).rice).toBe(total);
  });

  it("prices follow the tiles already cleared and queued", () => {
    const s = start({ tilesCleared: 10 });
    expect(jobCost(s, content).rice).toBe(Math.ceil(cost.rice! * secondsGrowth ** 10));
    const queued = apply(s, calm, { type: "clearArea", tiles: [T(0, 1)] });
    expect(jobCost(queued, content).rice).toBe(Math.ceil(cost.rice! * secondsGrowth ** 11));
  });

  it("is paid upfront for the whole selection", () => {
    const s = start();
    const after = apply(s, calm, { type: "clearArea", tiles: [T(0, 1), T(0, 2), T(0, 3)] });
    expect(after.clearing).toHaveLength(3);
    expect(after.resources.rice).toBe(s.resources.rice - selectionCost(s, content, 3).rice);
  });

  it("clears just the tiles the barangay can afford", () => {
    const s = start({ resources: { rice: selectionCost(start(), content, 2).rice + 1, wood: 0, gold: 0 } });
    expect(affordableTiles(s, content, 5)).toBe(2);
    const after = apply(s, calm, { type: "clearArea", tiles: [T(0, 1), T(0, 2), T(0, 3), T(6, 1), T(6, 2)] });
    expect(after.clearing).toHaveLength(2);
    expect(after.resources.rice).toBe(1);
  });
});

describe("worker limits and queueing", () => {
  it("runs as many jobs as there are free villagers", () => {
    const s = apply(start({ villagers: 2 }), calm, { type: "clearArea", tiles: [T(0, 1), T(0, 2), T(0, 3)] });
    expect(clearingCrews(s, calm)).toBe(2);
    expect(activeJobs(s, calm).map((j) => j.y)).toEqual([1, 2]);
    const later = run(s, 3);
    expect(later.clearing.map((j) => j.progress)).toEqual([3, 3, 0]);
  });

  it("buildings get their workers first; clearing uses the rest", () => {
    const s = start({ villagers: 3, buildings: [at("palayan", 5, 3)] });
    expect(freeVillagers(s, calm)).toBe(1);
    expect(clearingCrews(s, calm)).toBe(1);
  });

  it("starts the next job as a crew frees up, within the same tick", () => {
    const s = apply(start({ villagers: 1 }), calm, { type: "clearArea", tiles: [T(0, 1), T(0, 2)] });
    const first = s.clearing[0].seconds;
    const later = run(s, first + 2);
    expect(tileAt(later.map, 0, 1)).toBe("cleared");
    expect(later.clearing).toHaveLength(1);
    expect(later.clearing[0].progress).toBeCloseTo(2, 5);
    expect(later.resources.wood).toBe(wood);
  });

  it("a tile further in waits for the one in front of it", () => {
    const s = apply(start({ villagers: 3 }), calm, { type: "clearArea", tiles: [T(0, 1), T(0, 0)] });
    expect(activeJobs(s, calm).map((j) => [j.x, j.y])).toEqual([[0, 1]]);
    const opened = run(s, s.clearing[0].seconds);
    expect(activeJobs(opened, calm).map((j) => [j.x, j.y])).toEqual([[0, 0]]);
  });

  it("each tile still gives wood, and later tiles take longer", () => {
    const s = apply(start({ villagers: 3 }), calm, { type: "clearArea", tiles: [T(0, 1), T(0, 2), T(0, 3)] });
    expect(s.clearing.map((j) => j.seconds)).toEqual([0, 1, 2].map((i) => baseSeconds * secondsGrowth ** i));
    const done = run(s, 10);
    expect(done.clearing).toEqual([]);
    expect(done.resources.wood).toBe(3 * wood);
    expect(done.tilesCleared).toBe(3);
  });
});

describe("cancelling", () => {
  it("refunds in full before work starts", () => {
    const s = apply(start({ villagers: 1 }), calm, { type: "clearArea", tiles: [T(0, 1), T(0, 2)] });
    const paid = s.clearing[1].paid.rice;
    const after = apply(s, calm, { type: "cancelClearing", x: 0, y: 2 });
    expect(after.clearing).toHaveLength(1);
    expect(after.resources.rice).toBe(s.resources.rice + paid);
  });

  it("refunds half once work has started", () => {
    const s = run(apply(start({ villagers: 1 }), calm, { type: "clearArea", tiles: [T(0, 1)] }), 1);
    const paid = s.clearing[0].paid.rice;
    const after = apply(s, calm, { type: "cancelClearing", x: 0, y: 1 });
    expect(after.clearing).toEqual([]);
    expect(after.resources.rice).toBe(s.resources.rice + Math.floor(paid / 2));
  });

  it("also cancels tiles that only connected through the cancelled one", () => {
    const s = apply(start(), calm, { type: "clearArea", tiles: [T(0, 1), T(0, 0)] });
    const after = apply(s, calm, { type: "cancelClearing", x: 0, y: 1 });
    expect(after.clearing).toEqual([]);
    expect(after.resources.rice).toBe(start().resources.rice);
  });

  it("ignores a tile that isn't queued", () => {
    const s = start();
    expect(apply(s, calm, { type: "cancelClearing", x: 0, y: 1 })).toBe(s);
  });
});

describe("offline", () => {
  it("finishes every job that would have completed while away", () => {
    const s = apply(start({ villagers: 1 }), calm, { type: "clearArea", tiles: [T(0, 1), T(0, 2), T(0, 3)] });
    const { state, report } = offlineProgress(s, content, 600);
    expect(report.cleared).toBe(3);
    expect(state.clearing).toEqual([]);
    expect(state.resources.wood).toBeGreaterThanOrEqual(3 * wood);
    expect([1, 2, 3].every((y) => tileAt(state.map, 0, y) === "cleared")).toBe(true);
  });

  it("leaves the rest of a long queue for later", () => {
    // The whole ring of forest (not the balete): far more than a minute of work for one crew.
    const ring = [];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) if (tileAt(small, x, y) === "forest") ring.push(T(x, y));
    const s = apply(start({ villagers: 1 }), calm, { type: "clearArea", tiles: ring });
    expect(s.clearing.length).toBe(ring.length);
    const { state, report } = offlineProgress(s, content, 61);
    expect(report.cleared).toBeGreaterThan(0);
    expect(report.cleared).toBeLessThan(ring.length);
    expect(state.clearing.length).toBe(ring.length - report.cleared);
  });

  it("is deterministic", () => {
    const s = apply(start(), calm, { type: "clearArea", tiles: [T(0, 1), T(0, 0), T(6, 2)] });
    expect(run(s, 13)).toEqual(run(s, 13));
  });
});
