import { describe, expect, it } from "vitest";
import { borrowedWorkers, clearingCrews, freeVillagers, riceIsSafe, workforce } from "./clearing";
import { apply, buildingWorkers, rates, tick, type GameState } from "./game";
import { tileAt } from "./map";
import { offlineProgress } from "./offline";
import { parseSave } from "./save";
import { at, calm, content, mapFrom, withState } from "./testUtils";

// Plaza at (3, 2); forest all round.
const small = mapFrom([
  "TTTTTTT",
  "T.....T",
  "T..P..T",
  "T.....T",
  "TTTTTTT",
]);
const { protectBelowRiceSeconds } = content.rules.clearing.borrow;
/** Every villager has a job: 4 villagers, a Palayan and a Woodcutter Camp with 2 slots each. */
const busy = (patch: Partial<GameState> = {}) =>
  withState({
    map: small,
    villagers: 4,
    resources: { rice: 500, wood: 0, gold: 0 },
    buildings: [at("palayan", 1, 1), at("woodcutter-camp", 5, 1)],
    ...patch,
  });
const queue = (s: GameState, ...tiles: [number, number][]) => apply(s, calm, { type: "clearArea", tiles: tiles.map(([x, y]) => ({ x, y })) });

describe("a barangay where everyone works can still clear land", () => {
  it("borrows a villager instead of waiting forever", () => {
    const s = queue(busy(), [0, 2]);
    expect(freeVillagers(s, calm)).toBe(0);
    expect(clearingCrews(s, calm)).toBe(1);
    const done = tick(s, calm, s.clearing[0].seconds + 0.5);
    expect(tileAt(done.map, 0, 2)).toBe("cleared");
    expect(done.clearing).toEqual([]);
  });

  it("lends only as many as the waiting jobs need", () => {
    expect(borrowedWorkers(busy(), calm)).toBe(0);
    expect(borrowedWorkers(queue(busy(), [0, 2]), calm)).toBe(1);
    expect(borrowedWorkers(queue(busy(), [0, 2], [6, 2]), calm)).toBe(2);
    // A tile further in waits for its neighbour, so it doesn't borrow anyone yet.
    expect(borrowedWorkers(queue(busy(), [0, 2], [0, 1], [0, 0]), calm)).toBe(2);
  });
});

describe("borrowing order", () => {
  it("takes from Woodcutter Camps first", () => {
    const s = queue(busy(), [0, 2]);
    expect(workforce(s, calm).borrowed).toEqual([0, 1]);
    expect(buildingWorkers(s, calm)).toEqual([2, 1]);
  });

  it("then from the workplace with the most workers", () => {
    // Two fields, no camp: 2 workers in the first, 1 in the second.
    const s = queue(
      busy({ villagers: 3, buildings: [at("palayan", 1, 1), at("palayan", 5, 1)] }),
      [0, 2],
    );
    expect(workforce(busy({ villagers: 3, buildings: [at("palayan", 1, 1), at("palayan", 5, 1)] }), calm).workers).toEqual([2, 1]);
    expect(workforce(s, calm).borrowed).toEqual([1, 0]);
  });

  it("moves on to the next workplace once the camps are empty", () => {
    const s = queue(busy(), [0, 2], [6, 2], [0, 1]);
    // Three jobs, all next to cleared land (a Palayan stands on cleared land): the camp lends both its workers, then the field one.
    expect(workforce(s, calm).borrowed).toEqual([1, 2]);
  });
});

describe("the rice safety rule", () => {
  const eaten = (s: GameState) => s.villagers * content.rules.riceEatenPerVillagerPerSecond;
  const fieldsOnly = (rice: number) =>
    queue(busy({ villagers: 2, resources: { rice, wood: 0, gold: 0 }, buildings: [at("palayan", 1, 1)] }), [0, 2]);

  it(`never borrows from a Palayan with under ${protectBelowRiceSeconds}s of rice`, () => {
    const s = fieldsOnly(500);
    const threshold = protectBelowRiceSeconds * eaten(s);
    const low = queue(busy({ villagers: 2, resources: { rice: threshold + 1, wood: 0, gold: 0 }, buildings: [at("palayan", 1, 1)] }), [0, 2]);
    expect(low.clearing).toHaveLength(1);
    // The job's own rice cost came off first: now below the line.
    expect(low.resources.rice).toBeLessThan(threshold);
    expect(riceIsSafe(low, calm)).toBe(false);
    expect(borrowedWorkers(low, calm)).toBe(0);
    expect(clearingCrews(low, calm)).toBe(0);
    // With plenty of rice, the field lends a hand.
    expect(borrowedWorkers(s, calm)).toBe(1);
  });

  it("still borrows from a camp when rice is short", () => {
    const s = queue(busy({ resources: { rice: 4, wood: 0, gold: 0 } }), [0, 2]);
    expect(riceIsSafe(s, calm)).toBe(false);
    expect(workforce(s, calm).borrowed).toEqual([0, 1]);
  });
});

describe("borrowed workers go back", () => {
  it("when the job finishes", () => {
    const s = queue(busy(), [0, 2]);
    expect(buildingWorkers(s, calm)).toEqual([2, 1]);
    const done = tick(s, calm, s.clearing[0].seconds + 0.5);
    expect(buildingWorkers(done, calm)).toEqual([2, 2]);
    expect(borrowedWorkers(done, calm)).toBe(0);
  });

  it("when the job is cancelled", () => {
    const s = tick(queue(busy(), [0, 2]), calm, 1);
    const cancelled = apply(s, calm, { type: "cancelClearing", x: 0, y: 2 });
    expect(buildingWorkers(cancelled, calm)).toEqual([2, 2]);
  });

  it("a borrowed worker produces nothing while away", () => {
    const s = busy();
    const lending = queue(s, [0, 2]);
    expect(rates(lending, calm).produced.wood).toBeLessThan(rates(s, calm).produced.wood);
  });
});

describe("pause and resume", () => {
  it("a paused workplace produces nothing and its workers go to the free pool", () => {
    const s = busy();
    const paused = apply(s, calm, { type: "pause", x: 5, y: 1, paused: true });
    expect(paused.buildings[1].paused).toBe(true);
    expect(buildingWorkers(paused, calm)).toEqual([2, 0]);
    expect(rates(paused, calm).produced.wood).toBe(0);
    expect(freeVillagers(paused, calm)).toBe(2);
  });

  it("freed workers clear land without borrowing", () => {
    const s = queue(apply(busy(), calm, { type: "pause", x: 5, y: 1, paused: true }), [0, 2]);
    expect(borrowedWorkers(s, calm)).toBe(0);
    expect(clearingCrews(s, calm)).toBe(2);
  });

  it("resumes, and only workplaces can be paused", () => {
    const paused = apply(busy(), calm, { type: "pause", x: 5, y: 1, paused: true });
    const resumed = apply(paused, calm, { type: "pause", x: 5, y: 1, paused: false });
    expect(resumed.buildings[1].paused).toBeUndefined();
    expect(buildingWorkers(resumed, calm)).toEqual([2, 2]);
    const house = withState({});
    expect(apply(house, calm, { type: "pause", x: 5, y: 3, paused: true })).toBe(house);
    expect(apply(resumed, calm, { type: "pause", x: 5, y: 1, paused: false })).toBe(resumed);
  });

  it("is saved, and a repair doesn't lose it", () => {
    const paused = apply(busy(), calm, { type: "pause", x: 5, y: 1, paused: true });
    expect(parseSave(JSON.stringify(paused), content)!.buildings[1].paused).toBe(true);
    const damaged = { ...paused, resources: { rice: 500, wood: 500, gold: 0 }, buildings: paused.buildings.map((b, i) => (i === 1 ? { ...b, damaged: true } : b)) };
    const repaired = apply(damaged, calm, { type: "repair", x: 5, y: 1 });
    expect(repaired.buildings[1]).toMatchObject({ type: "woodcutter-camp", x: 5, y: 1, paused: true });
  });

  it("v11 saves load with nothing paused", () => {
    const v11 = { ...busy(), version: 11 };
    expect(parseSave(JSON.stringify(v11), content)!.buildings.every((b) => !b.paused)).toBe(true);
  });
});

describe("offline progress borrows the same way", () => {
  it("finishes clearing in a barangay where everyone works", () => {
    const s = queue(busy(), [0, 2], [6, 2]);
    const { state, report } = offlineProgress(s, content, 120);
    expect(report.cleared).toBe(2);
    expect(state.clearing).toEqual([]);
    expect(buildingWorkers(state, calm)).toEqual([2, 2]);
  });

  it("respects the rice safety rule while away", () => {
    // Just enough rice for the tile, leaving the granary low: the field won't lend its workers.
    const s = queue(busy({ villagers: 2, resources: { rice: content.rules.clearing.cost.rice!, wood: 0, gold: 0 }, buildings: [at("palayan", 1, 1)] }), [0, 2]);
    expect(s.clearing).toHaveLength(1);
    const { report } = offlineProgress(s, content, 60);
    expect(report.cleared).toBe(0);
  });
});
