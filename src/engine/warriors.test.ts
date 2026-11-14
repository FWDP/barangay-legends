import { describe, expect, it } from "vitest";
import { borrowedWorkers, clearingCrews } from "./clearing";
import { apply, assignWorkers, buildingWorkers, healthyWorkers, newGame, rates, riceIsLow, STATE_VERSION, tick, warriorCap, warriorsOffWork, type GameState, type PlacedBuilding } from "./game";
import { tileAt } from "./map";
import { parseSave } from "./save";
import { at, calm, content, TEST_MAP, withState } from "./testUtils";

const military = content.rules.military;
const region = () => newGame(content, 5).region!;
const raidOn = (s: GameState): GameState => ({ ...s, region: { ...(s.region ?? region()), incomingRaid: { from: "batong-buhay", strikeAt: s.time + 60 } } });

/** 6 villagers, 4 of them Mandirigma; a field and a camp (4 slots), a Kuta. */
const village = (patch: Partial<GameState> = {}) =>
  withState({
    villagers: 6,
    warriors: 4,
    // Wood under the stockpile limit (stockpile.ts), so the camp's work shows in the rates.
    resources: { rice: 1000, wood: 300, gold: 0 },
    buildings: [at("bahay-kubo", 5, 3), at("palayan", 1, 1), at("woodcutter-camp", 7, 1), at("kuta", 3, 6)],
    region: region(),
    ...patch,
  });

describe("part-time warriors", () => {
  it("staff buildings between raids", () => {
    const s = village();
    expect(warriorsOffWork(s)).toBe(0);
    expect(healthyWorkers(s)).toBe(6);
    expect(buildingWorkers(s, calm)).toEqual([0, 2, 2, 0]);
    expect(rates(s, calm).produced.rice).toBeGreaterThan(0);
  });

  it("the call to arms empties their workplaces, and they go back after the raid", () => {
    const s = village();
    const warned = raidOn(s);
    expect(warriorsOffWork(warned)).toBe(4);
    // Only the 2 who aren't warriors keep working.
    expect(buildingWorkers(warned, calm).reduce((a, b) => a + b, 0)).toBe(2);
    expect(rates(warned, calm).produced.wood).toBeLessThan(rates(s, calm).produced.wood);
    // When the raid strikes and is over, they're back at work.
    const after = tick({ ...warned, region: { ...warned.region!, incomingRaid: { ...warned.region!.incomingRaid!, strikeAt: warned.time + 1 } } }, calm, 2);
    expect(after.region!.incomingRaid).toBeNull();
    const busy = buildingWorkers(after, calm).reduce((a, b) => a + b, 0);
    expect(busy).toBe(Math.min(4, healthyWorkers(after)));
  });

  it("guards away at a tributary don't work until they return", () => {
    let s = village();
    s = { ...s, region: { ...s.region!, neighbors: s.region!.neighbors.map((n, i) => (i === 0 ? { ...n, status: "tributary" as const, loyalty: 80 } : n)) } };
    const guarded = apply(s, calm, { type: "guard", neighbor: s.region!.neighbors[0].id, warriors: 3 });
    expect(warriorsOffWork(guarded)).toBe(3);
    expect(healthyWorkers(guarded)).toBe(3);
    const back = tick(guarded, calm, content.rules.diplomacy.loyalty.guardSeconds + 1);
    expect(warriorsOffWork(back)).toBe(0);
  });

  it("clearing can borrow a warrior", () => {
    // Everyone is a warrior and everyone works.
    const s = apply(village({ villagers: 4, warriors: 4 }), calm, { type: "clearArea", tiles: [{ x: 9, y: 4 }] });
    expect(s.clearing).toHaveLength(1);
    expect(borrowedWorkers(s, calm)).toBe(1);
    expect(clearingCrews(s, calm)).toBe(1);
    const done = tick(s, calm, s.clearing[0].seconds + 0.5);
    expect(tileAt(done.map, 9, 4)).toBe("cleared");
  });
});

describe("the Kuta cap", () => {
  it(`allows ${military.warriorsPerKuta} Mandirigma per Kuta`, () => {
    expect(warriorCap(village(), calm)).toBe(military.warriorsPerKuta);
    expect(warriorCap(village({ buildings: [at("kuta", 1, 1), { ...at("kuta", 2, 1), damaged: true }] }), calm)).toBe(2 * military.warriorsPerKuta);
    expect(warriorCap(village({ buildings: [] }), calm)).toBe(0);
  });

  it("training stops at the cap, and needs a Kuta at all", () => {
    const full = village({ villagers: 20, warriors: military.warriorsPerKuta });
    expect(apply(full, calm, { type: "train" })).toBe(full);
    const room = village({ villagers: 20, warriors: military.warriorsPerKuta - 1 });
    expect(apply(room, calm, { type: "train" }).warriors).toBe(military.warriorsPerKuta);
    const noKuta = village({ villagers: 20, warriors: 0, buildings: [] });
    expect(apply(noKuta, calm, { type: "train" })).toBe(noKuta);
  });

  it("keeps warriors already over the cap", () => {
    const over = village({ villagers: 20, warriors: 15 });
    expect(tick(over, calm, 5).warriors).toBe(15);
  });
});

describe("food first when rice is short", () => {
  it("fills the fields before other workplaces", () => {
    const fields = [at("palayan", 1, 1), at("palayan", 2, 1)];
    const s = withState({ villagers: 4, resources: { rice: 1, wood: 0, gold: 0 }, buildings: [at("woodcutter-camp", 7, 1), ...fields] });
    expect(riceIsLow(s, calm)).toBe(true);
    expect(assignWorkers(s, calm)).toMatchObject({ palayan: 4, "woodcutter-camp": 0 });
    const plenty = { ...s, resources: { rice: 1000, wood: 0, gold: 0 } };
    expect(assignWorkers(plenty, calm)).toMatchObject({ palayan: 2, "woodcutter-camp": 2 });
  });
});

describe("migrating an all-warrior save", () => {
  /** Like the reported save: 29 villagers, all Mandirigma, rice at 0, hungry for a while. */
  function oldSave(): Record<string, unknown> {
    const buildings: PlacedBuilding[] = [];
    // Houses for everyone (3 base + 2 each), fields and camps, and Kutas for the warriors.
    const free: { x: number; y: number }[] = [];
    for (let y = 0; y < TEST_MAP.height; y++) for (let x = 1; x <= 8; x++) if (!(x === TEST_MAP.plaza.x && y === TEST_MAP.plaza.y)) free.push({ x, y });
    const place = (type: string, n: number) => {
      for (let i = 0; i < n; i++) buildings.push(at(type, free[buildings.length].x, free[buildings.length].y));
    };
    place("bahay-kubo", 13);
    place("palayan", 6);
    place("woodcutter-camp", 3);
    place("kuta", 5);
    const s = withState({ villagers: 29, warriors: 29, resources: { rice: 0, wood: 40, gold: 0 }, hunger: 80, buildings, region: region() });
    return { ...s, version: 13 };
  }

  it("keeps every villager and warrior, and restarts the hunger clock", () => {
    const loaded = parseSave(JSON.stringify(oldSave()), content)!;
    expect(loaded.version).toBe(STATE_VERSION);
    expect(loaded).toMatchObject({ villagers: 29, warriors: 29, hunger: 0 });
    // Twenty seconds on, before anyone gathers, still nobody has left.
    expect(tick(loaded, calm, 20).villagers).toBe(29);
  });

  it("goes back to work as soon as there's a little rice, fields first", () => {
    let s = parseSave(JSON.stringify(oldSave()), content)!;
    for (let i = 0; i < 5; i++) s = apply(s, calm, { type: "gather", resource: "rice" });
    const workers = buildingWorkers(s, calm);
    const inFields = s.buildings.reduce((n, b, i) => n + (b.type === "palayan" ? workers[i] : 0), 0);
    expect(inFields).toBe(12); // every field full: rice is short, so food first
    expect(workers.reduce((a, b) => a + b, 0)).toBe(18); // fields and camps, all staffed
    expect(rates(s, calm).net.rice).toBeGreaterThan(0);
    const later = tick(s, calm, 60);
    expect(later.villagers).toBe(29);
    expect(later.resources.rice).toBeGreaterThan(s.resources.rice);
  });
});
