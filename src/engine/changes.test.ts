// Undo, move and demolish: changing your mind about a building.
import { describe, expect, it } from "vitest";
import {
  apply,
  assignWorkers,
  availableWorkers,
  buildingCost,
  buildingWorkers,
  canMove,
  demolishPreview,
  demolishRefund,
  housing,
  moveCost,
  owned,
  rates,
  shelter,
  tick,
  undoSecondsLeft,
  STATE_VERSION,
  unreachableWorkplaces,
  type GameState,
} from "./game";
import { canPlace, countTiles, isClearable, isReachable, tileAt } from "./map";
import { parseSave } from "./save";
import { at, calm, content, mapFrom, withState } from "./testUtils";

const def = (id: string) => content.buildings.find((b) => b.id === id)!;
const run = (s: GameState, seconds: number) => tick(s, calm, seconds);
const { undoSeconds, moveCostPercent, demolishRefundPercent } = content.rules.placement;
const leaveEvery = content.rules.secondsPerVillagerLeavingOvercrowded;

describe("placement rules come from content", () => {
  it("has the numbers from the design", () => {
    expect(undoSeconds).toBe(5);
    expect(moveCostPercent).toBe(10);
    expect(demolishRefundPercent).toBe(50);
    expect(leaveEvery).toBe(10);
  });
});

describe("undo", () => {
  const rich = () => withState({ resources: { rice: 100, wood: 100 } });

  it("takes the building back and returns the full cost", () => {
    const before = rich();
    const built = apply(before, calm, { type: "build", building: "palayan", x: 2, y: 5 });
    expect(built.resources.wood).toBe(85);
    expect(undoSecondsLeft(built, calm)).toBe(undoSeconds);
    const undone = apply(built, calm, { type: "undo" });
    expect(undone.resources).toEqual(before.resources);
    expect(undone.buildings).toEqual(before.buildings);
    expect(undone.lastBuild).toBeNull();
  });

  it("returns what was paid, not the current price", () => {
    let s = apply(rich(), calm, { type: "build", building: "bahay-kubo", x: 2, y: 5 });
    const paid = s.lastBuild!.cost.wood;
    expect(paid).toBe(buildingCost(content, def("bahay-kubo"), 1).wood);
    s = apply(s, calm, { type: "undo" });
    expect(s.resources.wood).toBe(100);
  });

  it("works for 5 seconds after placing, then not", () => {
    const built = apply(rich(), calm, { type: "build", building: "palayan", x: 2, y: 5 });
    const later = run(built, undoSeconds - 0.5);
    expect(undoSecondsLeft(later, calm)).toBeCloseTo(0.5);
    expect(owned(apply(later, calm, { type: "undo" }), "palayan")).toBe(0);
    const tooLate = run(built, undoSeconds);
    expect(undoSecondsLeft(tooLate, calm)).toBe(0);
    expect(apply(tooLate, calm, { type: "undo" })).toBe(tooLate);
  });

  it("only undoes the most recent build, once", () => {
    let s = apply(rich(), calm, { type: "build", building: "palayan", x: 2, y: 5 });
    s = apply(s, calm, { type: "build", building: "palayan", x: 2, y: 6 });
    s = apply(s, calm, { type: "undo" });
    expect(s.buildings.map((b) => `${b.x},${b.y}`)).toEqual(["5,3", "2,5"]);
    expect(apply(s, calm, { type: "undo" })).toBe(s);
  });

  it("does nothing once the building was moved or demolished", () => {
    const built = apply(rich(), calm, { type: "build", building: "palayan", x: 2, y: 5 });
    const moved = apply(built, calm, { type: "move", x: 2, y: 5, toX: 2, toY: 6 });
    expect(apply(moved, calm, { type: "undo" })).toBe(moved);
    const gone = apply(built, calm, { type: "demolish", x: 2, y: 5 });
    expect(apply(gone, calm, { type: "undo" })).toBe(gone);
  });
});

describe("move", () => {
  const farm = () =>
    withState({
      buildings: [at("bahay-kubo", 5, 3), at("palayan", 1, 5), at("palayan", 3, 7)],
      resources: { rice: 100, wood: 100 },
      villagers: 5,
    });

  it("costs 10% of the building's current price, rounded up", () => {
    const s = farm();
    const price = buildingCost(content, def("palayan"), owned(s, "palayan")).wood;
    expect(price).toBe(20); // 15 × 1.15² = 19.8
    expect(moveCost(s, content, "palayan").wood).toBe(2);
    const moved = apply(s, calm, { type: "move", x: 3, y: 7, toX: 6, toY: 7 });
    expect(moved.resources.wood).toBe(98);
    expect(moved.buildings[2]).toEqual(at("palayan", 6, 7));
  });

  it("keeps the building's place in the list, so its workers stay assigned", () => {
    const s = farm();
    const moved = apply(s, calm, { type: "move", x: 1, y: 5, toX: 1, toY: 6 });
    expect(moved.buildings.map((b) => b.type)).toEqual(s.buildings.map((b) => b.type));
    expect(buildingWorkers(moved, calm)).toEqual(buildingWorkers(s, calm));
    expect(assignWorkers(moved, calm)).toEqual(assignWorkers(s, calm));
  });

  it("keeps damage when moved", () => {
    const s = { ...farm(), buildings: [at("bahay-kubo", 5, 3), { ...at("palayan", 1, 5), damaged: true }] };
    expect(apply(s, calm, { type: "move", x: 1, y: 5, toX: 2, toY: 5 }).buildings[1]).toEqual({
      ...at("palayan", 2, 5),
      damaged: true,
    });
  });

  it("only goes to a valid tile", () => {
    const s = farm();
    for (const [toX, toY] of [
      [0, 5], // river
      [9, 5], // forest
      [5, 4], // plaza
      [5, 3], // the house
      [1, 5], // where it already is
    ]) {
      expect(canMove(s, content, 1, 5, toX, toY)).toBe(false);
      expect(apply(s, calm, { type: "move", x: 1, y: 5, toX, toY })).toBe(s);
    }
  });

  it("needs the move cost and refuses a burning building", () => {
    const poor = { ...farm(), resources: { rice: 100, wood: 1 } };
    expect(apply(poor, calm, { type: "move", x: 1, y: 5, toX: 1, toY: 6 })).toBe(poor);
    const burning = { ...farm(), buildings: [at("bahay-kubo", 5, 3), { ...at("palayan", 1, 5), burningSince: 0 }] };
    expect(apply(burning, calm, { type: "move", x: 1, y: 5, toX: 1, toY: 6 })).toBe(burning);
  });

  it("recomputes the adjacency bonus at the new tile", () => {
    const s = farm();
    expect(rates(s, calm).produced.rice).toBeCloseTo(2 * 0.5 * 1.1 + 2 * 0.5 * 1); // one by the river
    const moved = apply(s, calm, { type: "move", x: 3, y: 7, toX: 1, toY: 6 }); // by the river and the other field
    expect(rates(moved, calm).produced.rice).toBeCloseTo(4 * 0.5 * 1.1);
  });
});

describe("demolish", () => {
  const camps = () =>
    withState({
      buildings: [at("bahay-kubo", 5, 3), at("palayan", 2, 5), at("palayan", 2, 6)],
      resources: { rice: 100, wood: 0 },
      villagers: 5,
    });

  it("refunds 50% of what the last copy cost, rounded down", () => {
    const s = camps();
    const lastPaid = buildingCost(content, def("palayan"), 1).wood; // the second field: 17.25 → 18
    expect(lastPaid).toBe(18);
    expect(demolishRefund(s, content, "palayan").wood).toBe(9);
    const after = apply(s, calm, { type: "demolish", x: 2, y: 6 });
    expect(after.resources.wood).toBe(9);
    expect(owned(after, "palayan")).toBe(1);
    // The one left was the first copy: 15 × 50% = 7.5 → 7.
    expect(demolishRefund(after, content, "palayan").wood).toBe(7);
  });

  it("returns its workers to the free pool", () => {
    const s = camps();
    const free = (g: GameState) => availableWorkers(g, calm) - Object.values(assignWorkers(g, calm)).reduce((a, b) => a + b, 0);
    expect(free(s)).toBe(1);
    const after = apply(s, calm, { type: "demolish", x: 2, y: 5 });
    expect(free(after)).toBe(3);
    expect(assignWorkers(after, calm).palayan).toBe(2);
  });

  it("leaves cleared land cleared and frees the tile", () => {
    const after = apply(camps(), calm, { type: "demolish", x: 2, y: 5 });
    expect(tileAt(after.map, 2, 5)).toBe("cleared");
    expect(canPlace(after, content, def("palayan"), 2, 5)).toBe(true);
  });

  it("does nothing on an empty tile", () => {
    const s = camps();
    expect(apply(s, calm, { type: "demolish", x: 7, y: 7 })).toBe(s);
    expect(demolishPreview(s, content, 7, 7)).toBeNull();
  });

  it("doesn't bring felled balete trees back", () => {
    const map = mapFrom(["TTTTTTT", "T.....T", "T..P..T", "T.....T", "TTT.TTT"]); // a balete once stood at (3, 4)
    const s = withState({ map, buildings: [at("bahay-kubo", 3, 4)], resources: { rice: 100, wood: 0 } });
    const after = apply(s, calm, { type: "demolish", x: 3, y: 4 });
    expect(tileAt(after.map, 3, 4)).toBe("cleared");
    expect(countTiles(run(after, 600).map, "balete")).toBe(0);
  });
});

describe("demolishing a Bahay Kubo with too many villagers", () => {
  // Base housing 3 + two houses × 2 = 7, all full.
  const full = () =>
    withState({
      buildings: [at("bahay-kubo", 5, 3), at("bahay-kubo", 6, 3)],
      villagers: 7,
      resources: { rice: 1000, wood: 0 },
    });

  it("warns how many villagers will have to leave", () => {
    expect(demolishPreview(full(), content, 6, 3)!.villagersLeaving).toBe(2);
    const roomy = { ...full(), villagers: 5 };
    expect(demolishPreview(roomy, content, 6, 3)!.villagersLeaving).toBe(0);
  });

  it("sends the extra villagers away one every 10 seconds, not all at once", () => {
    let s = apply(full(), calm, { type: "demolish", x: 6, y: 3 });
    expect(s.villagers).toBe(7);
    expect(housing(s, calm)).toBe(5);
    s = run(s, leaveEvery - 1);
    expect(s.villagers).toBe(7);
    s = run(s, 1);
    expect(s.villagers).toBe(6);
    s = run(s, leaveEvery - 1);
    expect(s.villagers).toBe(6);
    s = run(s, 1);
    expect(s.villagers).toBe(5);
    s = run(s, leaveEvery * 5);
    expect(s.villagers).toBe(5); // back within capacity: nobody else leaves
  });

  it("takes warriors with them if only warriors are left to go", () => {
    let s = apply({ ...full(), warriors: 7 }, calm, { type: "demolish", x: 6, y: 3 });
    s = run(s, leaveEvery * 2);
    expect(s.villagers).toBe(5);
    expect(s.warriors).toBe(5);
  });

  it("doesn't send anyone away for a damaged house: it can be repaired", () => {
    const s = { ...full(), buildings: [at("bahay-kubo", 5, 3), { ...at("bahay-kubo", 6, 3), damaged: true }] };
    expect(shelter(s, calm)).toBe(7);
    expect(run(s, leaveEvery * 3).villagers).toBe(7);
  });
});

describe("demolishing a Tulay", () => {
  // Plaza at (2, 2). A two-tile river; a camp already stands on the cleared far bank.
  // The river runs the full height, as on a generated map.
  const riverside = mapFrom([
    "TTTT~~TTT",
    "T...~~..T",
    "T.P.~~..T",
    "T...~~..T",
    "TTTT~~TTT",
  ]);
  const bridged = () => {
    const s = withState({
      map: riverside,
      buildings: [at("bahay-kubo", 1, 1)],
      villagers: 20,
      resources: { rice: 1000, wood: 500 },
    });
    let b = apply(s, calm, { type: "build", building: "tulay", x: 4, y: 2 });
    b = apply(b, calm, { type: "build", building: "woodcutter-camp", x: 6, y: 2 });
    return b;
  };

  it("stores the river tiles the bridge spans", () => {
    expect(bridged().buildings[1].span).toEqual([
      { x: 4, y: 2 },
      { x: 5, y: 2 },
    ]);
  });

  it("warns that land will be cut off", () => {
    const s = bridged();
    expect(demolishPreview(s, content, 4, 2)!.cutsOffLand).toBe(true);
    expect(demolishPreview(s, content, 6, 2)!.cutsOffLand).toBe(false);
  });

  it("turns the bridge back into river, and the far bank can't grow until a new bridge is built", () => {
    const s = bridged();
    expect(isClearable(s.map, 7, 0)).toBe(true);
    const after = apply(s, calm, { type: "demolish", x: 4, y: 2 });
    expect(tileAt(after.map, 4, 2)).toBe("river");
    expect(tileAt(after.map, 5, 2)).toBe("river");
    expect(isReachable(after.map, 6, 2)).toBe(false);
    expect(isClearable(after.map, 7, 0)).toBe(false);
    expect(canPlace(after, content, def("palayan"), 7, 1)).toBe(false);
    expect(apply(after, calm, { type: "clear", x: 7, y: 0 })).toBe(after);
    // The far bank stays cleared.
    expect(tileAt(after.map, 7, 1)).toBe("cleared");
    // A new bridge opens it again.
    const rebuilt = apply(after, calm, { type: "build", building: "tulay", x: 4, y: 1 });
    expect(isClearable(rebuilt.map, 7, 0)).toBe(true);
    expect(canPlace(rebuilt, content, def("palayan"), 7, 1)).toBe(true);
  });

  it("strands the workplaces on the far bank: no path, no workers (and the warning says so)", () => {
    const s = bridged();
    expect(rates(s, calm).produced.wood).toBeGreaterThan(0);
    expect(demolishPreview(s, calm, 4, 2)!.stranded).toBeGreaterThan(0);
    const after = apply(s, calm, { type: "demolish", x: 4, y: 2 });
    expect(rates(after, calm).produced.wood).toBe(0);
    expect(unreachableWorkplaces(after, calm).length).toBeGreaterThan(0);
  });

  it("stops a clearing job on the far bank", () => {
    const s = apply(bridged(), calm, { type: "clear", x: 7, y: 0 });
    expect(s.clearing).not.toBeNull();
    expect(apply(s, calm, { type: "demolish", x: 4, y: 2 }).clearing).toBeNull();
  });

  it("can be undone right after building, which removes the crossing", () => {
    const s = withState({ map: riverside, buildings: [], villagers: 20, resources: { rice: 0, wood: 500 } });
    const b = apply(s, calm, { type: "build", building: "tulay", x: 4, y: 2 });
    const undone = apply(b, calm, { type: "undo" });
    expect(undone.map).toEqual(s.map);
    expect(undone.resources).toEqual(s.resources);
  });

  it("can be moved to another crossing", () => {
    const s = bridged();
    const moved = apply(s, calm, { type: "move", x: 4, y: 2, toX: 4, toY: 3 });
    expect(tileAt(moved.map, 4, 2)).toBe("river");
    expect(tileAt(moved.map, 4, 3)).toBe("bridge");
    expect(tileAt(moved.map, 5, 3)).toBe("bridge");
    expect(moved.buildings[1].span).toEqual([
      { x: 4, y: 3 },
      { x: 5, y: 3 },
    ]);
    expect(isReachable(moved.map, 6, 2)).toBe(true);
  });
});

describe("saving", () => {
  it("keeps the undo window and bridge spans", () => {
    const riverside = mapFrom(["TTTTTTTT", "T...~~.T", "T.P.~~.T", "TTTTTTTT"]);
    const s = apply(
      withState({ map: riverside, buildings: [], villagers: 20, resources: { rice: 0, wood: 500 } }),
      calm,
      { type: "build", building: "tulay", x: 4, y: 2 },
    );
    const loaded = parseSave(JSON.stringify(s), content)!;
    expect(loaded.lastBuild).toEqual(s.lastBuild);
    expect(loaded.buildings[0].span).toEqual(s.buildings[0].span);
  });

  it("works out spans for bridges saved without one", () => {
    const riverside = mapFrom(["TTTTTTTT", "T...==.T", "T.P.~~.T", "TTTTTTTT"]);
    const s = withState({ map: riverside, buildings: [at("tulay", 4, 1)] });
    const loaded = parseSave(JSON.stringify(s), content)!;
    expect(loaded.buildings[0].span).toEqual([
      { x: 4, y: 1 },
      { x: 5, y: 1 },
    ]);
  });

  it("migrates v5 saves with nothing to undo", () => {
    const v5 = { ...withState({}), version: 5 } as Record<string, unknown>;
    delete v5.lastBuild;
    const loaded = parseSave(JSON.stringify(v5), content)!;
    expect(loaded.version).toBe(STATE_VERSION);
    expect(loaded.lastBuild).toBeNull();
  });

  it("migrates v6 saves to unnamed barangays, and keeps names through a save", () => {
    const v6 = { ...withState({}), version: 6, barangay: { id: "barangay-1", region: { x: 0, y: 0 } } };
    const loaded = parseSave(JSON.stringify(v6), content)!;
    expect(loaded.version).toBe(STATE_VERSION);
    expect(loaded.barangay).toEqual({ id: "barangay-1", region: { x: 0, y: 0 }, name: "", datu: "" });
    const named = withState({ barangay: { id: "barangay-1", region: { x: 0, y: 0 }, name: "Malaya", datu: "Dakila" } });
    expect(parseSave(JSON.stringify(named), content)!.barangay).toMatchObject({ name: "Malaya", datu: "Dakila" });
  });
});
