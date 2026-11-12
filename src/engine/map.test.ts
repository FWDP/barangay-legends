import { describe, expect, it } from "vitest";
import type { Content } from "./content";
import { owned } from "./game";
import { autoPlaceTile, bonusAt, buildingBonuses, canPlace, mapRadius, plazaTile, terrainAt, validTiles } from "./map";
import { at, content, withState } from "./testUtils";

const def = (id: string) => content.buildings.find((b) => b.id === id)!;
const empty = withState({ buildings: [] });

describe("map terrain", () => {
  it("has a river along the left edge and forest along the right", () => {
    for (const y of [-3, 0, 3, 50]) {
      expect(terrainAt(content, 0, y)).toBe("river");
      expect(terrainAt(content, 9, y)).toBe("forest");
      expect(terrainAt(content, 10, y)).toBe("forest");
      expect(terrainAt(content, 1, y)).toBe("land");
    }
    expect(terrainAt(content, -1, 0)).toBeNull();
    expect(terrainAt(content, 11, 0)).toBeNull();
  });

  it("puts the plaza in the middle of the land", () => {
    expect(plazaTile(content)).toEqual({ x: 5, y: 0 });
    expect(terrainAt(content, 5, 0)).toBe("plaza");
  });
});

describe("placement rules", () => {
  const s = withState({ buildings: [at("bahay-kubo", 5, -1)] });

  it("allows empty land inside the map", () => {
    expect(canPlace(s, content, 1, 0)).toBe(true);
    expect(canPlace(s, content, 8, 3)).toBe(true);
  });

  it.each([
    ["the river", 0, 0],
    ["the forest", 9, 0],
    ["the plaza", 5, 0],
    ["an occupied tile", 5, -1],
    ["outside the map's rows", 3, 5],
    ["outside the map's columns", 11, 0],
    ["a fractional tile", 2.5, 0],
  ])("rejects %s", (_label, x, y) => {
    expect(canPlace(s, content, x, y)).toBe(false);
  });

  it("starts with 7 rows and lists every free land tile", () => {
    expect(mapRadius(empty, content)).toBe(3);
    expect(validTiles(empty, content)).toHaveLength(8 * 7 - 1); // 8 land columns, minus the plaza
    expect(validTiles(s, content)).toHaveLength(8 * 7 - 2);
  });

  it("grows by a row on each side when you build on the outer row", () => {
    const edge = withState({ buildings: [at("palayan", 2, 3)] });
    expect(mapRadius(edge, content)).toBe(4);
    expect(canPlace(edge, content, 2, -4)).toBe(true);
    expect(canPlace(edge, content, 2, 5)).toBe(false);
  });
});

describe("adjacency bonuses", () => {
  it("gives a palayan +10% next to the river", () => {
    expect(bonusAt(empty, content, def("palayan"), 1, 0)).toBeCloseTo(0.1);
    expect(bonusAt(empty, content, def("palayan"), 2, 0)).toBe(0);
  });

  it("gives a palayan +10% next to another palayan, and both get it", () => {
    const s = withState({ buildings: [at("palayan", 3, 2)] });
    expect(bonusAt(s, content, def("palayan"), 4, 2)).toBeCloseTo(0.1);
    expect(bonusAt(s, content, def("palayan"), 3, 1)).toBeCloseTo(0.1);
    const pair = withState({ buildings: [at("palayan", 3, 2), at("palayan", 4, 2)] });
    expect(buildingBonuses(pair, content)).toEqual([0.1, 0.1]);
  });

  it("counts only edges, not corners, and not other building types", () => {
    const s = withState({ buildings: [at("palayan", 3, 2), at("bahay-kubo", 6, 2)] });
    expect(bonusAt(s, content, def("palayan"), 4, 3)).toBe(0); // diagonal
    expect(bonusAt(s, content, def("palayan"), 7, 2)).toBe(0); // next to a house
  });

  it("does not stack: river and a palayan neighbour together are still +10%", () => {
    const s = withState({ buildings: [at("palayan", 1, 1)] });
    expect(bonusAt(s, content, def("palayan"), 1, 0)).toBeCloseTo(0.1);
  });

  it("gives a woodcutter camp +10% touching the forest", () => {
    expect(bonusAt(empty, content, def("woodcutter-camp"), 8, 0)).toBeCloseTo(0.1);
    expect(bonusAt(empty, content, def("woodcutter-camp"), 7, 0)).toBe(0);
    expect(bonusAt(empty, content, def("woodcutter-camp"), 1, 0)).toBe(0); // the river is not forest
  });

  it("gives houses no bonus", () => {
    expect(bonusAt(empty, content, def("bahay-kubo"), 1, 0)).toBe(0);
    expect(bonusAt(empty, content, def("bahay-kubo"), 8, 0)).toBe(0);
  });

  it("reads the bonus from content, not code", () => {
    const tweaked: Content = {
      ...content,
      buildings: content.buildings.map((b) =>
        b.id === "palayan" ? { ...b, adjacencyBonus: { nextTo: ["river"], percent: 25 } } : b,
      ),
    };
    const palayan = tweaked.buildings.find((b) => b.id === "palayan")!;
    expect(bonusAt(empty, tweaked, palayan, 1, 0)).toBeCloseTo(0.25);
    const s = withState({ buildings: [at("palayan", 3, 2)] });
    expect(bonusAt(s, tweaked, palayan, 4, 2)).toBe(0); // palayan neighbours no longer count
  });
});

describe("auto-placement (new games and old saves)", () => {
  it("prefers bonus tiles, then the tile nearest the plaza", () => {
    expect(autoPlaceTile(empty, content, def("palayan"))).toEqual({ x: 1, y: 0 });
    expect(autoPlaceTile(empty, content, def("woodcutter-camp"))).toEqual({ x: 8, y: 0 });
    expect(autoPlaceTile(empty, content, def("bahay-kubo"))).toEqual({ x: 5, y: -1 });
  });

  it("always finds a tile, growing the map as it fills", () => {
    let s = empty;
    for (let i = 0; i < 120; i++) {
      const t = autoPlaceTile(s, content, def("bahay-kubo"));
      expect(canPlace(s, content, t.x, t.y)).toBe(true);
      s = withState({ buildings: [...s.buildings, at("bahay-kubo", t.x, t.y)] });
    }
    expect(owned(s, "bahay-kubo")).toBe(120);
    expect(mapRadius(s, content)).toBeGreaterThan(3);
  });
});
