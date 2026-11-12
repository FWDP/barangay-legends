import { describe, expect, it } from "vitest";
import { apply, gather, newGame, owned, STATE_VERSION, tick } from "./game";
import { bonusAt, countTiles, generateMap, NEIGHBOURS, tileAt } from "./map";
import { clearSave, loadGame, migrate, parseSave, SAVE_KEY, saveGame } from "./save";
import { at, calm, content, withState } from "./testUtils";

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const def = (id: string) => content.buildings.find((b) => b.id === id)!;
const roundTrip = (s: unknown) => parseSave(JSON.stringify(s), content);

describe("save", () => {
  it("round-trips a game, including the map, positions and a clearing job", () => {
    const storage = fakeStorage();
    let s = newGame(content, 5);
    for (let i = 0; i < 20; i++) s = gather(s, content, "rice");
    const { plaza } = s.map;
    const edge = { x: plaza.x, y: plaza.y - content.rules.map.startClearRadius - 1 };
    s = tick(apply(s, calm, { type: "clear", ...edge }), calm, 2.5);
    expect(s.clearing).not.toBeNull();
    saveGame(s, storage);
    expect(loadGame(content, storage)).toEqual(s);
  });

  it("starts a new game when there is no save, a broken save or a future version", () => {
    const storage = fakeStorage();
    expect(loadGame(content, storage, 3)).toEqual(newGame(content, 3));
    storage.setItem(SAVE_KEY, "{not json");
    expect(loadGame(content, storage, 3)).toEqual(newGame(content, 3));
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 999 }));
    expect(loadGame(content, storage, 3)).toEqual(newGame(content, 3));
  });

  it("starts new games from the seed it is given", () => {
    expect(loadGame(content, fakeStorage(), 99).rng).toBe(99);
    expect(loadGame(content, fakeStorage(), 99).map.seed).toBe(99);
  });

  it("drops unknown buildings, bad numbers and buildings on tiles that don't fit", () => {
    const s = withState({ resources: { rice: 1, wood: 7 }, villagers: 3 });
    const saved = {
      ...s,
      resources: { rice: -5, wood: 7 },
      buildings: [
        at("palayan", 1, 4),
        at("castle", 2, 4),
        at("palayan", 1, 4), // overlaps the first
        at("palayan", 0, 5), // river
        at("bahay-kubo", 9, 5), // forest
        at("woodcutter-camp", 5, 4), // plaza
        at("tulay", 3, 3), // a bridge on dry land
        { type: "bahay-kubo", x: "3", y: 1 },
        at("bahay-kubo", 4, 5),
      ],
    };
    const loaded = roundTrip(saved)!;
    expect(loaded.buildings).toEqual([at("palayan", 1, 4), at("bahay-kubo", 4, 5)]);
    expect(loaded.resources).toEqual({ rice: newGame(content).resources.rice, wood: 7 });
  });

  it("rejects a save whose map is broken", () => {
    const s = withState({});
    expect(roundTrip({ ...s, map: { ...s.map, tiles: "xyz" } })).toBeNull();
    expect(roundTrip({ ...s, map: { ...s.map, plaza: { x: 0, y: 0 } } })).toBeNull(); // plaza on the river
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => saveGame(newGame(content), broken)).not.toThrow();
    expect(loadGame(content, broken, 1)).toEqual(newGame(content, 1));
    expect(() => clearSave(broken)).not.toThrow();
  });
});

describe("migration from v3 (before the generated map)", () => {
  // A v3 save: positions on the old 11-column map (river at x = 0, plaza at (5, 0)).
  const v3Save = {
    version: 3,
    barangay: { id: "barangay-1", region: { x: 0, y: 0 } },
    resources: { rice: 220, wood: 140 },
    villagers: 15,
    migration: 0,
    time: 120,
    rng: 777,
    hunger: 0,
    sick: [],
    typhoon: null,
    nextEventAt: {},
    buildings: [
      at("bahay-kubo", 5, -1),
      at("bahay-kubo", 4, -1),
      { ...at("bahay-kubo", 6, -1), damaged: true },
      at("palayan", 1, 0),
      at("palayan", 1, 1),
      at("woodcutter-camp", 8, 0),
      at("bahay-kubo", 3, -9), // far north: still fits on the new map
    ],
  };
  const s = roundTrip(v3Save)!;

  it("generates the map from the save's seed", () => {
    expect(s.version).toBe(STATE_VERSION);
    expect(s.map.seed).toBe(777);
    expect(s.map.plaza).toEqual(generateMap(content, 777).plaza);
    expect(s.clearing).toBeNull();
    expect(s.tilesCleared).toBe(0);
  });

  it("keeps every building, its state and the rest of the save", () => {
    expect(s.buildings).toHaveLength(7);
    expect(owned(s, "bahay-kubo")).toBe(4);
    expect(owned(s, "palayan")).toBe(2);
    expect(owned(s, "woodcutter-camp")).toBe(1);
    expect(s.buildings.filter((b) => b.damaged)).toHaveLength(1);
    expect(s).toMatchObject({ resources: { rice: 220, wood: 140 }, villagers: 15, time: 120, rng: 777 });
  });

  it("keeps the layout around the plaza (mirrored if the river is on the other side)", () => {
    const { plaza } = s.map;
    const offsets = s.buildings.map((b) => [Math.abs(b.x - plaza.x), b.y - plaza.y]);
    expect(offsets).toEqual([
      [0, -1],
      [1, -1],
      [1, -1],
      [4, 0],
      [4, 1],
      [3, 0],
      [2, -9],
    ]);
  });

  it("puts every building on cleared land, and clears the tiles around it", () => {
    for (const b of s.buildings) {
      expect(tileAt(s.map, b.x, b.y)).toBe("cleared");
      for (const [dx, dy] of NEIGHBOURS) expect(["cleared", "river", "bridge"]).toContain(tileAt(s.map, b.x + dx, b.y + dy));
    }
  });

  it("keeps the fields by the river", () => {
    for (const b of s.buildings.filter((b) => b.type === "palayan")) {
      expect(bonusAt(s, def("palayan"), b.x, b.y)).toBeGreaterThan(0);
    }
  });

  it("is deterministic", () => {
    expect(roundTrip(v3Save)).toEqual(s);
  });
});

describe("older saves still load through every migration", () => {
  const v1Save = {
    version: 1,
    resources: { rice: 220, wood: 140 },
    villagers: 15,
    buildings: { "bahay-kubo": 6, palayan: 4, "woodcutter-camp": 3, castle: 2 },
    migration: 0.25,
  };

  it("v1 (building counts) → current", () => {
    const s = roundTrip(v1Save)!;
    expect(s.version).toBe(STATE_VERSION);
    expect(s).toMatchObject({ resources: { rice: 220, wood: 140 }, villagers: 15, migration: 0.25 });
    expect([owned(s, "bahay-kubo"), owned(s, "palayan"), owned(s, "woodcutter-camp")]).toEqual([6, 4, 3]);
    expect(new Set(s.buildings.map((b) => `${b.x},${b.y}`)).size).toBe(13);
    for (const b of s.buildings) expect(tileAt(s.map, b.x, b.y)).toBe("cleared");
    expect(roundTrip(v1Save)).toEqual(s);
  });

  it("v1 → v2 still produces the original v2 layout (the migration's map rules are frozen)", () => {
    const v2 = migrate({ ...v1Save }, content, 2)!;
    const where = (type: string) =>
      (v2.buildings as { type: string; x: number; y: number }[])
        .filter((b) => b.type === type)
        .map((b) => `${b.x},${b.y}`)
        .sort();
    // The layout the v2 engine produced for this save (river at x = 0, plaza at (5, 0)).
    expect(where("bahay-kubo")).toEqual(["4,-1", "4,0", "5,-1", "5,1", "6,-1", "6,0"]);
    expect(where("palayan")).toEqual(["1,0", "2,0", "3,-1", "3,0"]);
    expect(where("woodcutter-camp")).toEqual(["8,-1", "8,0", "8,1"]);
  });

  it("v2 → current keeps buildings and adds events, the map and the region", () => {
    const v2Save = {
      version: 2,
      barangay: { id: "barangay-1", region: { x: 0, y: 0 } },
      resources: { rice: 50, wood: 20 },
      villagers: 7,
      buildings: [at("bahay-kubo", 5, -1), at("palayan", 1, 0)],
      migration: 0,
    };
    const s = roundTrip(v2Save)!;
    expect(s).toMatchObject({ version: STATE_VERSION, lastBuild: null, time: 0, hunger: 0, sick: [], typhoon: null, tilesCleared: 0, warriors: 0 });
    expect(s.region?.neighbors).toHaveLength(content.neighbors.length);
    expect(s.buildings).toHaveLength(2);
    expect(countTiles(s.map, "cleared")).toBeGreaterThanOrEqual((2 * content.rules.map.startClearRadius + 1) ** 2);
  });

  it("returns null for versions it has no migration for", () => {
    expect(migrate({ version: 0 }, content)).toBeNull();
  });
});

describe("event state round trip", () => {
  it("keeps sickness, fire, damage, typhoon and cooldowns", () => {
    const storage = fakeStorage();
    const s = withState({
      time: 400,
      hunger: 3,
      sick: [12, 40],
      typhoon: { strikeAt: 430 },
      nextEventAt: { sakit: 500 },
      buildings: [
        { ...at("bahay-kubo", 5, 3), burningSince: 395 },
        { ...at("bahay-kubo", 4, 3), damaged: true },
      ],
    });
    saveGame(s, storage);
    // A player save always gets a region (rebuilt from content when missing).
    expect({ ...loadGame(content, storage), region: null }).toEqual(s);
  });
});
