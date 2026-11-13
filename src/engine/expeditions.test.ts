import { describe, expect, it } from "vitest";
import type { Content } from "./content";
import { apply, tick, type GameState } from "./game";
import { sameIsland } from "./archipelago";
import { createRegion, defenseOf, neighborDef, type NeighborState } from "./region";
import { generateVillage } from "./village";
import { tileAt } from "./map";
import { nextRandom } from "./rng";
import { parseSave } from "./save";
import { voyageSeconds } from "./sea";
import { acquainted, at, calm, content, withState } from "./testUtils";
import type { NamedVillager } from "./people";

const d = content.rules.diplomacy;
const m = content.rules.military;
const ME = "barangay-1";

function seedWhere(pred: (roll: number) => boolean): number {
  for (let seed = 1; ; seed++) if (pred(nextRandom(seed)[0])) return seed;
}

function world(patch: Partial<GameState> = {}): GameState {
  const s = withState({ resources: { rice: 2000, wood: 2000, gold: 0 }, villagers: 20, buildings: [], ...patch });
  return { ...s, region: patch.region ?? acquainted(createRegion(calm, s.time, 7)) };
}
const nb = (s: GameState, id: string) => s.region!.neighbors.find((n) => n.id === id)!;
const setNb = (s: GameState, id: string, patch: Partial<NeighborState>): GameState => ({
  ...s,
  region: { ...s.region!, neighbors: s.region!.neighbors.map((n) => (n.id === id ? { ...n, ...patch } : n)) },
});
const setNbState = (s: GameState, id: string, patch: Partial<GameState>) => setNb(s, id, { state: { ...nb(s, id).state, ...patch } });

const warrior = (id: number, name: string): NamedVillager => ({ id, name, story: "test", role: "warrior", since: 0 });

describe("expedition records: the player's raids", () => {
  const target = "talampas";
  const ready = (pred: (r: number) => boolean, patch: Partial<GameState> = {}) =>
    setNbState(world({ warriors: 10, rng: seedWhere(pred), ...patch }), target, { warriors: 3, resources: { rice: 400, wood: 200, gold: 0 } });

  it("match the engine's result exactly", () => {
    for (const pred of [(r: number) => r < 0.2, (r: number) => r > 0.99]) {
      const s = ready(pred);
      const after = apply(s, calm, { type: "raid", neighbor: target, warriors: 8 });
      const report = after.region!.reports.at(-1)!;
      const e = after.expeditions.at(-1)!;
      expect(after.expeditions).toHaveLength(1);
      expect(e).toMatchObject({ kind: "raid", side: "out", from: ME, to: target, departAt: s.time, arriveAt: s.time, sea: false, boat: "karakoa", reportId: report.id });
      expect(e.party).toMatchObject({ barangay: ME, count: 8 });
      const b = e.battle!;
      expect(b.attackerWins).toBe(report.win);
      expect(b.attack).toBe(report.attack);
      expect(b.defense).toBe(report.defense);
      expect(b.defense).toBe(defenseOf(nb(s, target).state, calm));
      expect(b.chance).toBe(report.chance);
      expect(b.attackerLosses).toBe(report.ourLosses);
      expect(b.defenderLosses).toBe(report.theirLosses);
      expect(b.loot).toEqual(report.loot);
      // The goods that changed hands are the loot, no more.
      expect(after.resources.rice - s.resources.rice).toBe(report.loot!.rice ?? 0);
      // Every defender is in the log, and the Kuta bonus is what's left of the defense.
      expect(b.defenders.count).toBe(3);
      expect(b.defenders.posts.reduce((n, p) => n + p.warriors, 0)).toBe(3);
      expect(b.kutaBonus).toBe(report.defense! - m.baseDefense - 3 * m.warrior.defense);
      expect(b.allies).toEqual([]);
    }
  });

  it("land on a river bank or beach of the village a visit shows", () => {
    const s = ready((r) => r < 0.5);
    const e = apply(s, calm, { type: "raid", neighbor: target, warriors: 5 }).expeditions.at(-1)!;
    const village = generateVillage(calm, nb(s, target), neighborDef(calm, target)!, s.time);
    expect(e.landing).not.toBeNull();
    const { x, y } = e.landing!;
    expect(["cleared", "forest", "balete", "daan"]).toContain(tileAt(village.map, x, y));
    const nextToWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => ["river", "sea"].includes(tileAt(village.map, x + dx, y + dy) ?? ""));
    expect(nextToWater).toBe(true);
  });

  it("name the named warriors who went, and mark the ones who fell", () => {
    const named = [warrior(1, "Bagani"), warrior(2, "Lakan"), warrior(3, "Sinag")];
    const s = ready((r) => r > 0.99, { named, villagers: 20, warriors: 10 });
    const after = apply(s, calm, { type: "raid", neighbor: target, warriors: 10 });
    const e = after.expeditions.at(-1)!;
    const gone = named.filter((v) => !after.named.some((w) => w.name === v.name)).map((v) => v.name);
    expect(e.party.named.map((v) => v.name).sort()).toEqual(named.map((v) => v.name).sort());
    expect(e.party.named.filter((v) => v.fell).map((v) => v.name).sort()).toEqual(gone.sort());
  });

  it("are deterministic for the same seed", () => {
    const s = ready((r) => r < 0.5);
    const a = apply(s, calm, { type: "raid", neighbor: target, warriors: 5 });
    const b = apply(s, calm, { type: "raid", neighbor: target, warriors: 5 });
    expect(a.expeditions).toEqual(b.expeditions);
    expect(JSON.parse(JSON.stringify(a.expeditions))).toEqual(a.expeditions);
  });

  it("aren't made for a refused raid", () => {
    const s = ready((r) => r < 0.5);
    expect(apply(s, calm, { type: "raid", neighbor: target, warriors: 11 }).expeditions).toEqual([]);
  });
});

describe("expedition records: trades", () => {
  it("record the goods exactly as they changed hands", () => {
    const s = world();
    const after = apply(s, calm, { type: "trade", neighbor: "malinaw", give: "rice" });
    const e = after.expeditions.at(-1)!;
    expect(e).toMatchObject({ kind: "trade", side: "out", from: ME, to: "malinaw", boat: "bangka", sea: false, landing: null, departAt: s.time, arriveAt: s.time });
    expect(e.trade!.gave).toEqual({ resource: "rice", amount: s.resources.rice - after.resources.rice });
    expect(e.trade!.got).toEqual({ resource: "wood", amount: after.resources.wood - s.resources.wood });
    expect(e.party.count).toBe(content.rules.expeditions.envoys);
    expect(e.battle).toBeUndefined();
  });

  it("by Balangay keep the voyage's departure and arrival", () => {
    let s = withState({ resources: { rice: 5000, wood: 5000, gold: 500 }, villagers: 20, buildings: [at("balangay-dock", 1, 2)], datuLevel: 3, balangays: 1 });
    s = { ...s, region: acquainted(createRegion(calm, s.time, 7, ME)) };
    const far = s.region!.neighbors.find((n) => !sameIsland(s.region!.places, ME, n.id))!.id;
    s = setNb(s, far, { trust: 90, grudge: 0, state: { ...nb(s, far).state, resources: { rice: 1000, wood: 1000, gold: 0 } } });
    const sailing = apply(s, calm, { type: "proposeTrade", neighbor: far, give: { resource: "rice", amount: 20 }, want: { resource: "wood", amount: 10 } });
    expect(sailing.expeditions).toEqual([]);
    const t = voyageSeconds(s, calm, far);
    const arrived = tick(sailing, calm, t + 1);
    const e = arrived.expeditions.at(-1)!;
    expect(e).toMatchObject({ kind: "trade", to: far, sea: true, boat: "balangay", departAt: s.time });
    expect(e.arriveAt).toBeCloseTo(s.time + t, 5);
    expect(e.trade).toEqual({ gave: { resource: "rice", amount: 20 }, got: { resource: "wood", amount: 10 } });
  });

  it("keep only the newest few (rules.expeditions.keep)", () => {
    const keep = 3;
    const few: Content = { ...calm, rules: { ...calm.rules, expeditions: { ...calm.rules.expeditions, keep } } };
    let s = world();
    // Spread over neighbors on the home island, so none tires of trading.
    const home = s.region!.neighbors.filter((n) => sameIsland(s.region!.places, ME, n.id)).map((n) => n.id);
    for (let i = 0; i < 5; i++) s = apply({ ...s, time: s.time + 1 }, few, { type: "trade", neighbor: home[i % home.length], give: i % 2 ? "wood" : "rice" });
    expect(s.expeditions).toHaveLength(keep);
    const last = s.nextExpeditionId - 1;
    expect(last).toBeGreaterThan(keep);
    expect(s.expeditions.map((e) => e.id)).toEqual([last - 2, last - 1, last]);
  });
});

describe("expedition records: raids on the player", () => {
  const surely: Content = { ...calm, rules: { ...calm.rules, diplomacy: { ...d, aiRaid: { ...d.aiRaid, chancePerSecond: 1 } } } };
  const strike = (seed: number) => {
    let s = world({ resources: { rice: 1000, wood: 1000, gold: 0 }, buildings: [at("bahay-kubo", 5, 3), at("kuta", 4, 6)], warriors: 4, rng: seed });
    s = { ...s, time: 659.5, region: { ...s.region!, truceUntil: 0, nextAiRaidAt: 9999, incomingRaid: { from: "batong-buhay", strikeAt: 660, landing: { x: 1, y: 4 } } } };
    s = setNbState(s, "batong-buhay", { warriors: 6, villagers: 11 });
    return { s, after: tick(s, surely, 1) };
  };

  it("match the defense report and the muster at the landing", () => {
    const { after } = strike(3);
    const report = after.region!.reports.at(-1)!;
    const e = after.expeditions.at(-1)!;
    expect(report.kind).toBe("defense");
    expect(e).toMatchObject({ kind: "raid", side: "in", from: "batong-buhay", to: ME, boat: "karakoa", landing: { x: 1, y: 4 }, reportId: report.id, arriveAt: 660, departAt: 660 - d.aiRaid.warningSeconds });
    const b = e.battle!;
    expect(b.attackerWins).toBe(!report.win);
    expect(b.defense).toBe(report.defense);
    expect(b.attack).toBe(report.attack);
    expect(b.chance).toBeCloseTo(1 - report.chance!, 10);
    expect(b.defenderLosses).toBe(report.ourLosses);
    expect(b.attackerLosses).toBe(report.theirLosses);
    expect(b.loot).toEqual(report.lost);
    expect(b.defenders.late).toBe(report.late);
    expect(b.covered).toBe(report.covered);
    expect(b.defenders.posts.length).toBeGreaterThan(0);
    expect(b.allies.filter((a) => a.arrives).map((a) => a.id)).toEqual(report.allies ?? []);
    expect(e.party.count).toBe(6);
  });

  it("are deterministic for the same seed", () => {
    expect(strike(5).after.expeditions).toEqual(strike(5).after.expeditions);
  });
});

describe("expedition records in saves", () => {
  it("old saves load with an empty expedition list", () => {
    const s = world();
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.expeditions;
    delete raw.nextExpeditionId;
    raw.version = 23;
    const loaded = parseSave(JSON.stringify(raw), content)!;
    expect(loaded).not.toBeNull();
    expect(loaded.expeditions).toEqual([]);
    expect(loaded.nextExpeditionId).toBe(1);
  });

  it("survive a save round trip, and malformed ones are dropped", () => {
    let s = setNbState(world({ warriors: 10, rng: seedWhere((r) => r < 0.3) }), "talampas", { warriors: 2 });
    s = apply(s, calm, { type: "raid", neighbor: "talampas", warriors: 5 });
    s = apply(s, calm, { type: "trade", neighbor: "malinaw", give: "rice" });
    const loaded = parseSave(JSON.stringify(s), content)!;
    expect(loaded.expeditions).toEqual(s.expeditions);
    expect(loaded.nextExpeditionId).toBe(s.nextExpeditionId);
    const broken = { ...JSON.parse(JSON.stringify(s)), expeditions: [{ id: 9, kind: "raid" }, ...s.expeditions] };
    expect(parseSave(JSON.stringify(broken), content)!.expeditions).toEqual(s.expeditions);
  });
});
