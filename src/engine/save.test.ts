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
    const s = withState({ resources: { rice: 1, wood: 7, gold: 0 }, villagers: 3 });
    const saved = {
      ...s,
      resources: { rice: -5, wood: 7, gold: 0 },
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
    expect(loaded.resources).toEqual({ rice: newGame(content).resources.rice, wood: 7, gold: 0 });
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
    resources: { rice: 220, wood: 140, gold: 0 },
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
    expect(s.clearing).toEqual([]);
    expect(s.tilesCleared).toBe(0);
  });

  it("keeps every building, its state and the rest of the save", () => {
    expect(s.buildings).toHaveLength(7);
    expect(owned(s, "bahay-kubo")).toBe(4);
    expect(owned(s, "palayan")).toBe(2);
    expect(owned(s, "woodcutter-camp")).toBe(1);
    expect(s.buildings.filter((b) => b.damaged)).toHaveLength(1);
    expect(s).toMatchObject({ resources: { rice: 220, wood: 140, gold: 0 }, villagers: 15, time: 120, rng: 777 });
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
    resources: { rice: 220, wood: 140, gold: 0 },
    villagers: 15,
    buildings: { "bahay-kubo": 6, palayan: 4, "woodcutter-camp": 3, castle: 2 },
    migration: 0.25,
  };

  it("v1 (building counts) → current", () => {
    const s = roundTrip(v1Save)!;
    expect(s.version).toBe(STATE_VERSION);
    expect(s).toMatchObject({ resources: { rice: 220, wood: 140, gold: 0 }, villagers: 15, migration: 0.25 });
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
      resources: { rice: 50, wood: 20, gold: 0 },
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

describe("v16 → v17: gold, happiness, tasks and named villagers", () => {
  /** A save as v16 wrote it: no gold, no happiness, no tasks or named villagers. */
  function v16(): string {
    const s = newGame(content, 9);
    const raw = { ...s, version: 16, resources: { rice: 42, wood: 7 } } as Record<string, unknown>;
    for (const key of ["happiness", "gawainDone", "named", "history", "stats"]) delete raw[key];
    const region = s.region!;
    raw.region = {
      ...region,
      neighbors: region.neighbors.map((n) => {
        const st = { ...n.state, version: 16, resources: { rice: n.state.resources.rice, wood: n.state.resources.wood } } as Record<string, unknown>;
        for (const key of ["happiness", "gawainDone", "named", "history", "stats"]) delete st[key];
        return { ...n, state: st };
      }),
    };
    return JSON.stringify(raw);
  }

  it("adds gold (0), happiness (60) and empty tasks, villagers and history", () => {
    const s = parseSave(v16(), content)!;
    expect(s.version).toBe(STATE_VERSION);
    expect(s.resources).toEqual({ rice: 42, wood: 7, gold: 0 });
    expect(s.happiness).toBe(60);
    expect(s.gawainDone).toEqual([]);
    expect(s.named).toEqual([]);
    expect(s.history).toEqual([]);
    expect(s.stats).toMatchObject({ raidsDefended: 0, rolls: 0, named: 0 });
    expect(s.region!.neighbors.every((n) => n.state.resources.gold === 0)).toBe(true);
  });

  it("credits tasks an old save had already met on the first step", () => {
    const s = parseSave(v16(), content)!;
    // newGame starts with a Bahay Kubo only: nothing met yet, so the chain starts at the beginning.
    expect(tick(s, calm, 1).gawainDone).toEqual([]);
    const withField = { ...s, buildings: [...s.buildings, at("palayan", s.map.plaza.x + 1, s.map.plaza.y + 1)] };
    expect(tick(withField, calm, 1).gawainDone).toEqual(["first-palayan"]);
  });

  it("round-trips the new fields", () => {
    const storage = fakeStorage();
    const s = withState({
      villagers: 8,
      warriors: 1,
      sick: [20],
      happiness: 71.5,
      resources: { rice: 10, wood: 2, gold: 33 },
      gawainDone: ["first-palayan", "first-camp"],
      named: [
        { id: 1, name: "Diwa", story: "first-child", role: "villager", since: 12, sick: true },
        { id: 2, name: "Malakas", story: "bravest", role: "warrior", since: 40 },
      ],
      history: [
        { at: 12, kind: "named", name: "Diwa", story: "first-child" },
        { at: 30, kind: "task", task: "first-palayan" },
        { at: 35, kind: "left", name: "Ulan", story: "singer", cause: "hunger" },
      ],
      stats: { raidsDefended: 2, rolls: 17, named: 3, replanted: 1, permittedClears: 2 },
    });
    saveGame(s, storage);
    expect({ ...loadGame(content, storage), region: null }).toEqual(s);
  });

  it("drops what doesn't fit: unknown tasks and stories, more named villagers than villagers", () => {
    const s = withState({ villagers: 1, warriors: 0 });
    const raw = {
      ...s,
      happiness: 250,
      gawainDone: ["first-palayan", "made-up", "first-palayan"],
      named: [
        { id: 1, name: "Diwa", story: "first-child", role: "villager", since: 0 },
        { id: 2, name: "Ulan", story: "no-such-story", role: "villager", since: 0 },
        { id: 3, name: "Sigla", story: "singer", role: "villager", since: 0 },
        { id: 4, name: "Malakas", story: "bravest", role: "warrior", since: 0 },
      ],
      history: [{ at: 1, kind: "task", task: "made-up" }, { at: 2, kind: "fled", name: "x" }, { at: 3, kind: "left", name: "Ulan" }],
    };
    const back = roundTrip(raw)!;
    expect(back.happiness).toBe(100);
    expect(back.gawainDone).toEqual(["first-palayan"]);
    // One villager, no warriors: only the newest non-warrior stays.
    expect(back.named.map((v) => v.name)).toEqual(["Sigla"]);
    expect(back.history).toEqual([{ at: 3, kind: "left", name: "Ulan" }]);
    expect(back.stats.named).toBeGreaterThanOrEqual(3);
  });
});
