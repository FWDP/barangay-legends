import { describe, expect, it } from "vitest";
import { housing, newGame, rates, type GameState } from "./game";
import { offlineProgress } from "./offline";
import { parseSave, readSavedAt, saveGame, SAVE_KEY } from "./save";
import { at, content, withState } from "./testUtils";

const HOUR = 3600;
const { maxSeconds, minSeconds } = content.rules.offline;

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

/** A working barangay: a field and a camp, fed, room to grow. */
const farm = (patch: Partial<GameState> = {}) =>
  withState({
    villagers: 4,
    resources: { rice: 200, wood: 0 },
    buildings: [at("bahay-kubo", 5, 3), at("bahay-kubo", 6, 3), at("palayan", 1, 4), at("woodcutter-camp", 8, 4)],
    ...patch,
  });

describe("offline progress: the cap", () => {
  it("credits at most 8 hours", () => {
    expect(maxSeconds).toBe(8 * HOUR);
    const { state, report } = offlineProgress(farm(), content, 20 * HOUR);
    expect(report).toMatchObject({ seconds: 8 * HOUR, away: 20 * HOUR });
    expect(state.time).toBe(farm().time + 8 * HOUR);
  });

  it("credits short absences in full, and ignores very short ones", () => {
    expect(offlineProgress(farm(), content, 2 * HOUR).state.time).toBe(farm().time + 2 * HOUR);
    const tiny = offlineProgress(farm(), content, minSeconds - 1);
    expect(tiny.state).toEqual(farm());
    expect(offlineProgress(farm(), content, -50).report.seconds).toBe(0);
    expect(offlineProgress(farm(), content, Number.NaN).report.seconds).toBe(0);
  });
});

describe("offline progress: gentle things happen", () => {
  it("fields and camps produce, villagers eat", () => {
    const s = farm({ villagers: 4 });
    const r = rates(s, content);
    const { state, report } = offlineProgress(s, content, 600);
    expect(report.produced.wood).toBeGreaterThan(0);
    expect(state.resources.wood).toBeCloseTo(report.produced.wood, 5);
    expect(report.eaten).toBeGreaterThan(0);
    expect(state.resources.wood).toBeGreaterThan(r.produced.wood * 600 * 0.4);
  });

  it("newcomers settle while there is room and rice, never beyond the houses", () => {
    const s = farm({ villagers: 3 });
    const { state, report } = offlineProgress(s, content, 4 * HOUR);
    expect(report.arrived).toBe(housing(s, content) - 3);
    expect(state.villagers).toBe(housing(s, content));
  });

  it("the sick recover", () => {
    const { state, report } = offlineProgress(farm({ sick: [30, 40] }), content, 600);
    expect(state.sick).toEqual([]);
    expect(report.recovered).toBe(2);
  });

  it("a clearing job finishes", () => {
    const s = farm({ villagers: 5, clearing: [{ x: 9, y: 4, progress: 0, seconds: 30, paid: { rice: 3, wood: 0 } }] });
    const { state, report } = offlineProgress(s, content, 600);
    expect(report.cleared).toBe(1);
    expect(state.clearing).toEqual([]);
    expect(state.tilesCleared).toBe(s.tilesCleared + 1);
  });

  it("seasons turn with the time", () => {
    const s = farm({ time: 0 });
    expect(offlineProgress(s, content, 400).state.time).toBe(400);
  });

  it("tributaries send tribute and neighbors keep growing", () => {
    const g = newGame(content, 9);
    const region = { ...g.region!, neighbors: g.region!.neighbors.map((n, i) => (i === 0 ? { ...n, status: "tributary" as const, loyalty: 80 } : n)) };
    const s = { ...g, region, resources: { rice: 500, wood: 0 } };
    const { state, report } = offlineProgress(s, content, 2 * HOUR);
    expect(report.tribute.rice + report.tribute.wood).toBeGreaterThan(0);
    const grew = state.region!.neighbors.some((n, i) => n.state.buildings.length > s.region!.neighbors[i].state.buildings.length);
    expect(grew).toBe(true);
  });

  it("a trade boat that waited too long has left, and the story says so", () => {
    const g = newGame(content, 9);
    const from = g.region!.neighbors[0].id;
    const s = { ...g, region: { ...g.region!, offer: { from, give: { resource: "rice" as const, amount: 10 }, want: { resource: "wood" as const, amount: 12 }, expiresAt: g.time + 30 } } };
    const { state, report } = offlineProgress(s, content, HOUR);
    expect(state.region!.offer).toBeNull();
    expect(report.offerExpired).toBe(from);
  });
});

describe("offline progress: nothing harmful", () => {
  /** A barangay in trouble when the game closed. */
  function trouble(): GameState {
    const g = newGame(content, 21);
    const raider = g.region!.neighbors[0].id;
    return {
      ...g,
      time: 1000,
      villagers: 9, // more than the one house shelters: online, families would leave
      warriors: 2,
      sick: [50],
      resources: { rice: 3, wood: 5 }, // runs out almost at once
      buildings: [
        { ...at("bahay-kubo", g.map.plaza.x + 1, g.map.plaza.y), burningSince: 990 },
        at("bahay-kubo", g.map.plaza.x - 1, g.map.plaza.y),
        at("palayan", g.map.plaza.x, g.map.plaza.y + 1),
      ],
      typhoon: { strikeAt: 1030 },
      region: {
        ...g.region!,
        truceUntil: 0,
        nextAiRaidAt: 0,
        incomingRaid: { from: raider, strikeAt: 1020 },
        neighbors: g.region!.neighbors.map((n, i) => (i === 1 ? { ...n, status: "tributary" as const, loyalty: 21 } : n)),
      },
    };
  }

  it("no deaths or departures, even hungry and overcrowded", () => {
    const s = trouble();
    const { state, report } = offlineProgress(s, content, 8 * HOUR);
    expect(state.villagers).toBeGreaterThanOrEqual(s.villagers);
    expect(state.warriors).toBe(s.warriors);
    expect(report.hungrySeconds).toBeGreaterThan(0);
    expect(state.resources.rice).toBeGreaterThanOrEqual(0);
    // The hunger clock starts fresh, so families don't leave the moment the player is back.
    expect(state.hunger).toBe(0);
  });

  it("no disasters: fires and typhoons wait, nothing is damaged", () => {
    const s = trouble();
    const { state } = offlineProgress(s, content, 8 * HOUR);
    expect(state.buildings.filter((b) => b.damaged)).toHaveLength(0);
    const fire = state.buildings.find((b) => b.burningSince !== undefined)!;
    expect(state.time - fire.burningSince!).toBe(s.time - 990);
    expect(state.typhoon!.strikeAt - state.time).toBe(30);
    expect(state.buildings.filter((b) => b.burningSince !== undefined)).toHaveLength(1);
  });

  it("no raids or rebellions: the raid waits, loyalty holds, no battle reports", () => {
    const s = trouble();
    const { state } = offlineProgress(s, content, 8 * HOUR);
    expect(state.region!.incomingRaid!.strikeAt - state.time).toBe(20);
    expect(state.region!.reports).toEqual(s.region!.reports);
    expect(state.region!.neighbors[1]).toMatchObject({ status: "tributary", loyalty: 21 });
    // Raid timers are paused too: just as far off (or as close) as when the game closed.
    expect(state.region!.nextAiRaidAt - state.time).toBe(s.region!.nextAiRaidAt - s.time);
    expect(state.region!.truceUntil - state.time).toBe(s.region!.truceUntil - s.time);
  });

  it("no new sickness or choice events while away", () => {
    const s = { ...trouble(), sick: [] };
    const { state } = offlineProgress(s, content, 8 * HOUR);
    expect(state.sick).toEqual([]);
    expect(state.choice).toBeNull();
  });

  it("is deterministic and quick for a full 8 hours", () => {
    const s = newGame(content, 33);
    const t0 = performance.now();
    const a = offlineProgress(s, content, 8 * HOUR);
    const ms = performance.now() - t0;
    expect(offlineProgress(s, content, 8 * HOUR)).toEqual(a);
    expect(ms).toBeLessThan(1500);
  });
});

describe("save time for offline progress", () => {
  it("is stored beside the state and read back; the state loads as before", () => {
    const store = memory();
    const s = farm();
    const plain = memory();
    saveGame(s, plain);
    saveGame(s, store, 1_700_000_000_000);
    expect(readSavedAt(store)).toBe(1_700_000_000_000);
    expect(parseSave(store.getItem(SAVE_KEY)!, content)).toEqual(parseSave(plain.getItem(SAVE_KEY)!, content));
  });

  it("older saves have no time, so no offline credit", () => {
    const store = memory();
    saveGame(farm(), store);
    expect(readSavedAt(store)).toBeNull();
    store.setItem(SAVE_KEY, "{oops");
    expect(readSavedAt(store)).toBeNull();
  });
});
