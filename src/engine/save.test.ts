import { describe, expect, it } from "vitest";
import { apply, build, gather, newGame, owned, tick } from "./game";
import { bonusAt, canPlace } from "./map";
import { clearSave, loadGame, migrate, parseSave, SAVE_KEY, saveGame } from "./save";
import { at, content } from "./testUtils";

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const v1Save = {
  version: 1,
  resources: { rice: 220, wood: 140 },
  villagers: 15,
  buildings: { "bahay-kubo": 6, palayan: 4, "woodcutter-camp": 3, castle: 2 },
  migration: 0.25,
};

describe("save", () => {
  it("round-trips a game, including building positions", () => {
    const storage = fakeStorage();
    let s = newGame(content);
    for (let i = 0; i < 15; i++) s = gather(s, content, "wood");
    s = tick(build(s, content, "palayan", 1, 2), content, 3.5);
    saveGame(s, storage);
    expect(loadGame(content, storage)).toEqual(s);
  });

  it("starts a new game when there is no save, a broken save or a future version", () => {
    const storage = fakeStorage();
    expect(loadGame(content, storage)).toEqual(newGame(content));
    storage.setItem(SAVE_KEY, "{not json");
    expect(loadGame(content, storage)).toEqual(newGame(content));
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 999 }));
    expect(loadGame(content, storage)).toEqual(newGame(content));
  });

  it("drops unknown buildings, bad numbers and buildings on invalid tiles", () => {
    const s = parseSave(
      JSON.stringify({
        version: 3,
        barangay: { id: "barangay-7", region: { x: 2, y: -1 } },
        resources: { rice: -5, wood: 7 },
        villagers: 3,
        buildings: [
          at("palayan", 1, 0),
          at("castle", 2, 0),
          at("palayan", 1, 0), // overlaps the first
          at("palayan", 0, 1), // river
          at("woodcutter-camp", 5, 0), // plaza
          at("bahay-kubo", 3, 40), // off the map
          { type: "bahay-kubo", x: "3", y: 1 },
          at("bahay-kubo", 4, 1),
        ],
        migration: 0.5,
      }),
      content,
    );
    expect(s).toMatchObject({
      version: 3,
      barangay: { id: "barangay-7", region: { x: 2, y: -1 } },
      resources: { rice: 10, wood: 7 },
      villagers: 3,
      buildings: [at("palayan", 1, 0), at("bahay-kubo", 4, 1)],
      migration: 0.5,
    });
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
    expect(loadGame(content, broken)).toEqual(newGame(content));
    expect(() => clearSave(broken)).not.toThrow();
  });
});

describe("v1 → v2 → v3 migration", () => {
  const migrated = parseSave(JSON.stringify(v1Save), content)!;

  it("keeps resources, villagers and building counts, and drops unknown buildings", () => {
    expect(migrated.version).toBe(3);
    expect(migrated.resources).toEqual({ rice: 220, wood: 140 });
    expect(migrated.villagers).toBe(15);
    expect(migrated.migration).toBe(0.25);
    expect(owned(migrated, "bahay-kubo")).toBe(6);
    expect(owned(migrated, "palayan")).toBe(4);
    expect(owned(migrated, "woodcutter-camp")).toBe(3);
    expect(migrated.buildings).toHaveLength(13);
    expect(migrated.barangay).toEqual(newGame(content).barangay);
  });

  it("auto-places every building on its own valid land tile", () => {
    const tiles = new Set(migrated.buildings.map((b) => `${b.x},${b.y}`));
    expect(tiles.size).toBe(13);
    migrated.buildings.forEach((b, i) => {
      const before = { ...migrated, buildings: migrated.buildings.slice(0, i) };
      expect(canPlace(before, content, b.x, b.y)).toBe(true);
    });
  });

  it("places fields and camps where they earn their bonus", () => {
    const def = (id: string) => content.buildings.find((b) => b.id === id)!;
    for (const b of migrated.buildings.filter((b) => b.type !== "bahay-kubo")) {
      expect(bonusAt({ ...migrated, buildings: migrated.buildings.filter((o) => o !== b) }, content, def(b.type), b.x, b.y)).toBeGreaterThan(0);
    }
  });

  it("is deterministic", () => {
    expect(parseSave(JSON.stringify(v1Save), content)).toEqual(migrated);
  });

  it("migrates through the table one version at a time", () => {
    expect(migrate({ ...v1Save }, content)?.version).toBe(3);
    expect(migrate({ version: 0 }, content)).toBeNull(); // no migration from v0
  });

  it("produces a save that keeps working with commands", () => {
    const s = apply({ ...migrated, resources: { rice: 0, wood: 999 } }, content, {
      type: "build",
      building: "palayan",
      x: 1,
      y: 3,
    });
    expect(owned(s, "palayan")).toBe(5);
  });
});

describe("v2 → v3 migration (events)", () => {
  const v2Save = {
    version: 2,
    barangay: { id: "barangay-1", region: { x: 0, y: 0 } },
    resources: { rice: 50, wood: 20 },
    villagers: 7,
    buildings: [at("bahay-kubo", 5, -1), at("palayan", 1, 0)],
    migration: 0,
  };

  it("adds the event fields with safe defaults and keeps everything else", () => {
    const s = parseSave(JSON.stringify(v2Save), content)!;
    expect(s).toMatchObject({ ...v2Save, version: 3, time: 0, hunger: 0, sick: [], typhoon: null, nextEventAt: {} });
    expect(Number.isInteger(s.rng)).toBe(true);
  });

  it("gives each old save its own deterministic seed", () => {
    const a = parseSave(JSON.stringify(v2Save), content)!;
    const b = parseSave(JSON.stringify({ ...v2Save, buildings: [at("bahay-kubo", 4, -1)] }), content)!;
    expect(parseSave(JSON.stringify(v2Save), content)!.rng).toBe(a.rng);
    expect(b.rng).not.toBe(a.rng);
  });

  it("round-trips event state: sickness, fire, damage, typhoon and cooldowns", () => {
    const storage = fakeStorage();
    const s = {
      ...newGame(content, 42),
      time: 400,
      hunger: 3,
      sick: [12, 40],
      typhoon: { strikeAt: 430 },
      nextEventAt: { sakit: 500 },
      buildings: [
        { type: "bahay-kubo", x: 5, y: -1, burningSince: 395 },
        { type: "bahay-kubo", x: 4, y: -1, damaged: true },
      ],
    };
    saveGame(s, storage);
    expect(loadGame(content, storage)).toEqual(s);
  });

  it("starts new games from the seed it is given", () => {
    expect(loadGame(content, fakeStorage(), 99).rng).toBe(99);
  });
});
