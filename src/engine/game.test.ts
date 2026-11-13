import { describe, expect, it } from "vitest";
import {
  apply,
  assignWorkers,
  build,
  buildingCost,
  buildingWorkers,
  cleanName,
  gather,
  housing,
  MAX_NAME_LENGTH,
  newGame,
  owned,
  rates,
  staffedBuildings,
  tick,
  type Command,
} from "./game";
import { tileAt } from "./map";
import { at, content, withState } from "./testUtils";

const def = (id: string) => content.buildings.find((b) => b.id === id)!;

describe("new game", () => {
  it("starts with 5 villagers, 1 bahay kubo by the plaza and 10 rice", () => {
    const s = newGame(content);
    expect(s.villagers).toBe(5);
    const [house] = s.buildings;
    expect(s.buildings).toHaveLength(1);
    expect(house.type).toBe("bahay-kubo");
    expect(Math.abs(house.x - s.map.plaza.x) + Math.abs(house.y - s.map.plaza.y)).toBe(1);
    expect(tileAt(s.map, house.x, house.y)).toBe("cleared");
    expect(s.resources).toEqual({ rice: 10, wood: 0, gold: 0 });
    expect(housing(s, content)).toBe(5);
  });

  it("has a barangay id and regional position", () => {
    expect(newGame(content).barangay).toEqual({ id: "barangay-1", region: { x: 0, y: 0 }, name: "", datu: "" });
  });

  it("keeps the names the player chose, tidied", () => {
    const s = newGame(content, 1, true, { name: "  Bagong   Ilog ", datu: "Lakan\u0007dula" });
    expect(s.barangay).toMatchObject({ name: "Bagong Ilog", datu: "Lakandula" });
    expect(newGame(content, 1, true, { name: "x".repeat(80) }).barangay.name).toHaveLength(MAX_NAME_LENGTH);
    expect(cleanName(42)).toBe("");
  });

  it("names never change how the game plays", () => {
    const a = tick(newGame(content, 5), content, 120);
    const b = tick(newGame(content, 5, true, { name: "Malaya", datu: "Dakila" }), content, 120);
    expect({ ...b, barangay: a.barangay }).toEqual(a);
  });
});

describe("gather", () => {
  it("adds one rice or wood per click without mutating state", () => {
    const s = newGame(content);
    expect(gather(s, content, "rice").resources.rice).toBe(11);
    expect(gather(s, content, "wood").resources.wood).toBe(1);
    expect(s.resources).toEqual({ rice: 10, wood: 0, gold: 0 });
  });
});

describe("costs", () => {
  it("grows by 15% per copy owned, rounded up", () => {
    const kubo = def("bahay-kubo");
    expect(buildingCost(content, kubo, 0).wood).toBe(10);
    expect(buildingCost(content, kubo, 1).wood).toBe(12); // 11.5
    expect(buildingCost(content, kubo, 2).wood).toBe(14); // 13.225
    expect(buildingCost(content, def("woodcutter-camp"), 0)).toEqual({ rice: 10, wood: 0, gold: 0 });
  });
});

describe("build", () => {
  const rich = withState({ resources: { rice: 100, wood: 100, gold: 0 } });

  it("spends resources and places the building on the chosen tile", () => {
    const s = build(withState({ resources: { rice: 0, wood: 20, gold: 0 } }), content, "palayan", 2, 5);
    expect(s.buildings).toContainEqual(at("palayan", 2, 5));
    expect(owned(s, "palayan")).toBe(1);
    expect(s.resources.wood).toBe(5);
  });

  it("does nothing when unaffordable, unknown, or the tile is not free land", () => {
    const poor = withState({ resources: { rice: 0, wood: 14, gold: 0 } });
    expect(build(poor, content, "palayan", 2, 5)).toBe(poor);
    expect(build(rich, content, "dambana", 2, 5)).toBe(rich);
    expect(build(rich, content, "palayan", 0, 5)).toBe(rich); // river
    expect(build(rich, content, "palayan", 9, 5)).toBe(rich); // forest
    expect(build(rich, content, "palayan", 5, 4)).toBe(rich); // plaza
    expect(build(rich, content, "palayan", 5, 3)).toBe(rich); // the starting house
    expect(build(rich, content, "palayan", 2, 13)).toBe(rich); // off the map
  });

  it("only builds on cleared land", () => {
    expect(build(rich, content, "bahay-kubo", 10, 5)).toBe(rich); // forest must be cleared first
  });

  it("raises housing by 2 per bahay kubo", () => {
    expect(housing(build(rich, content, "bahay-kubo", 2, 5), content)).toBe(7);
  });
});

describe("commands", () => {
  it("applies gather and build commands", () => {
    const commands: Command[] = [
      ...Array.from({ length: 15 }, (): Command => ({ type: "gather", resource: "wood" })),
      { type: "build", building: "palayan", x: 1, y: 6 },
    ];
    const s = commands.reduce((st, c) => apply(st, content, c), withState({}));
    expect(s.buildings).toContainEqual(at("palayan", 1, 6));
    expect(s.resources.wood).toBe(0);
  });

  it("are plain data that survive a JSON round trip", () => {
    const cmd: Command = { type: "build", building: "palayan", x: 1, y: 6 };
    const s = withState({ resources: { rice: 0, wood: 15, gold: 0 } });
    expect(apply(s, content, JSON.parse(JSON.stringify(cmd)))).toEqual(apply(s, content, cmd));
  });
});

describe("workers and production", () => {
  // Tiles away from the river, forest and each other: no bonuses.
  const plain = [at("palayan", 3, 6), at("woodcutter-camp", 3, 2)];

  it("fills worker slots round-robin between types and caps at slots", () => {
    expect(assignWorkers(withState({ villagers: 5, buildings: plain }), content)).toEqual({
      palayan: 2,
      "woodcutter-camp": 2,
      "fishing-dock": 0,
    });
    const few = withState({ villagers: 3, buildings: [...plain, at("palayan", 6, 6)] });
    expect(assignWorkers(few, content)).toEqual({ palayan: 2, "woodcutter-camp": 1, "fishing-dock": 0 });
  });

  it("produces 0.5 rice/s and 0.4 wood/s per worker, minus 0.1 rice/s per villager", () => {
    const r = rates(withState({ villagers: 4, buildings: plain }), content);
    expect(r.produced.rice).toBeCloseTo(1);
    expect(r.produced.wood).toBeCloseTo(0.8);
    expect(r.eaten.rice).toBeCloseTo(0.4);
    expect(r.net.rice).toBeCloseTo(0.6);
  });

  it("adds +10% rice for a palayan next to the river", () => {
    const r = rates(withState({ villagers: 2, buildings: [at("palayan", 1, 6)] }), content);
    expect(r.produced.rice).toBeCloseTo(1.1);
  });

  it("adds +10% rice to both of two neighbouring palayan", () => {
    const r = rates(withState({ villagers: 4, buildings: [at("palayan", 3, 6), at("palayan", 4, 6)] }), content);
    expect(r.produced.rice).toBeCloseTo(2.2);
  });

  it("adds +10% wood for a woodcutter camp touching the forest", () => {
    const r = rates(withState({ villagers: 2, buildings: [at("woodcutter-camp", 8, 6)] }), content);
    expect(r.produced.wood).toBeCloseTo(0.88);
  });

  it("sends workers to bonus buildings first", () => {
    const s = withState({ villagers: 2, buildings: [at("palayan", 3, 6), at("palayan", 1, 2)] });
    expect(buildingWorkers(s, content)).toEqual([0, 2]);
    expect(rates(s, content).produced.rice).toBeCloseTo(1.1);
  });

  it("counts buildings with at least one worker as staffed", () => {
    const many = Array.from({ length: 8 }, (_, i) => at("palayan", 1 + i, 2));
    // Plenty of rice, so no food-first: plain round-robin.
    const s = withState({ villagers: 5, resources: { rice: 1000, wood: 0, gold: 0 }, buildings: [...many, at("woodcutter-camp", 3, 2), at("bahay-kubo", 5, 3)] });
    // Round-robin: the camp takes 2, the palayan fields take 3 (one full, one half).
    expect(staffedBuildings(s, content)).toEqual({ palayan: 2, "woodcutter-camp": 1, "fishing-dock": 0 });
    expect(staffedBuildings(withState({ villagers: 0, buildings: many }), content)).toEqual({
      palayan: 0,
      "woodcutter-camp": 0,
      "fishing-dock": 0,
    });
  });
});

describe("tick", () => {
  it("villagers eat 0.1 rice/s each", () => {
    const s = tick(withState({}), content, 10);
    expect(s.resources.rice).toBeCloseTo(5); // 10 - 5 villagers × 0.1 × 10s
  });

  it("adds production over time", () => {
    const s = tick(withState({ villagers: 2, buildings: [at("woodcutter-camp", 3, 2)] }), content, 5);
    expect(s.resources.wood).toBeCloseTo(4);
  });

  it("gives the same result for one long tick and many short ones", () => {
    const start = withState({
      villagers: 3,
      resources: { rice: 50, wood: 0, gold: 0 },
      buildings: [at("palayan", 1, 5), at("bahay-kubo", 5, 3), at("bahay-kubo", 4, 3)],
      // Already as happy as two houses by the plaza make them, so production is steady.
      happiness: content.rules.happiness.start + 2 * content.rules.happiness.perHouseNearPlaza,
    });
    let small = start;
    for (let i = 0; i < 300; i++) small = tick(small, content, 0.1);
    const big = tick(start, content, 30);
    expect(small.villagers).toBe(big.villagers);
    expect(small.resources.rice).toBeCloseTo(big.resources.rice, 5);
  });

  it("never lets rice go negative", () => {
    const s = tick(withState({ resources: { rice: 1, wood: 0, gold: 0 } }), content, 15);
    expect(s.resources.rice).toBe(0);
  });

  it("brings new villagers when there is room and rice", () => {
    const s = withState({ resources: { rice: 100, wood: 0, gold: 0 }, buildings: [at("bahay-kubo", 5, 3), at("bahay-kubo", 4, 3)] });
    expect(housing(s, content)).toBe(7);
    expect(tick(s, content, 10).villagers).toBe(6);
    expect(tick(s, content, 100).villagers).toBe(7);
  });

  it("ignores negative time", () => {
    const s = newGame(content);
    expect(tick(s, content, -5)).toEqual(s);
  });
});
