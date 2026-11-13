import { describe, expect, it } from "vitest";
import { apply, tick, type GameState } from "../engine/game";
import { createRegion, neighborDef, type NeighborState } from "../engine/region";
import { generateVillage } from "../engine/village";
import { nextRandom } from "../engine/rng";
import { isWalkable } from "../engine/paths";
import type { Expedition } from "../engine/expeditions";
import { acquainted, at, calm, withState } from "../engine/testUtils";
import { buildReplay, sampleReplay, share } from "./replay";

function seedWhere(pred: (roll: number) => boolean): number {
  for (let seed = 1; ; seed++) if (pred(nextRandom(seed)[0])) return seed;
}
function world(patch: Partial<GameState> = {}): GameState {
  const s = withState({ resources: { rice: 2000, wood: 2000, gold: 0 }, villagers: 30, buildings: [], ...patch });
  return { ...s, region: acquainted(createRegion(calm, s.time, 7)) };
}
const nb = (s: GameState, id: string) => s.region!.neighbors.find((n) => n.id === id)!;
const setNbState = (s: GameState, id: string, patch: Partial<GameState>): GameState => ({
  ...s,
  region: { ...s.region!, neighbors: s.region!.neighbors.map((n): NeighborState => (n.id === id ? { ...n, state: { ...n.state, ...patch } } : n)) },
});

function raidOn(win: boolean, warriors = 10) {
  let s = world({ warriors: 20, villagers: 30, rng: seedWhere((r) => (win ? r < 0.1 : r > 0.99)) });
  s = setNbState(s, "talampas", { warriors: 4, resources: { rice: 400, wood: 200, gold: 0 } });
  const after = apply(s, calm, { type: "raid", neighbor: "talampas", warriors });
  const village = generateVillage(calm, nb(s, "talampas"), neighborDef(calm, "talampas")!, s.time);
  return { s, after, e: after.expeditions.at(-1)!, village };
}

/** Every moment of a script, a tenth of a second apart. */
const frames = (script: ReturnType<typeof buildReplay>) => Array.from({ length: Math.ceil(script.duration * 10) + 2 }, (_, i) => sampleReplay(script, i / 10));

describe("expedition replays", () => {
  it("never change GameState or the record", () => {
    const { after, e, village } = raidOn(true);
    const before = JSON.stringify(after);
    const villageBefore = JSON.stringify(village);
    const script = buildReplay(Object.freeze(e) as Expedition, village, calm);
    frames(script);
    expect(JSON.stringify(after)).toBe(before);
    expect(JSON.stringify(village)).toBe(villageBefore);
  });

  it("are the same every time for the same record", () => {
    const { e, village } = raidOn(true);
    expect(buildReplay(e, village, calm)).toEqual(buildReplay(e, village, calm));
  });

  it("show the outcome the record gives: winners carry loot back, losers run with nothing", () => {
    const won = raidOn(true);
    const ws = buildReplay(won.e, won.village, calm);
    expect(ws.phases.map((p) => p.phase)).toContain("loot");
    expect(frames(ws).some((f) => f.people.some((p) => p.bundle))).toBe(true);
    const lost = raidOn(false);
    const ls = buildReplay(lost.e, lost.village, calm);
    expect(ls.phases.map((p) => p.phase)).toContain("retreat");
    expect(frames(ls).some((f) => f.people.some((p) => p.bundle))).toBe(false);
    // Fewer raiders sail home than landed, when the record says some fell.
    const raiders = (t: number) => sampleReplay(ls, t).people.filter((p) => p.look === "warrior").length;
    expect(lost.e.battle!.attackerLosses).toBeGreaterThan(0);
    expect(raiders(ls.clash!.end + 0.1)).toBeLessThan(raiders(ls.clash!.start + 0.1));
  });

  it("label the named warriors who went", () => {
    const named = [1, 2].map((id) => ({ id, name: `Bayani${id}`, story: "test", role: "warrior" as const, since: 0 }));
    let s = world({ warriors: 20, villagers: 30, named, rng: seedWhere((r) => r < 0.1) });
    s = setNbState(s, "talampas", { warriors: 2 });
    const after = apply(s, calm, { type: "raid", neighbor: "talampas", warriors: 5 });
    const script = buildReplay(after.expeditions.at(-1)!, generateVillage(calm, nb(s, "talampas"), neighborDef(calm, "talampas")!, s.time), calm);
    const labels = new Set(script.actors.map((a) => a.label).filter(Boolean));
    expect(labels).toEqual(new Set(["Bayani1", "Bayani2"]));
  });

  it("draw at most rules.expeditions.maxSprites people, with the full count kept for the report", () => {
    const { e, village } = raidOn(true);
    const big: Expedition = { ...e, party: { ...e.party, count: 120 }, battle: { ...e.battle!, defenders: { ...e.battle!.defenders, count: 80, posts: [{ ...e.battle!.defenders.posts[0], warriors: 80 }] } } };
    const script = buildReplay(big, village, calm);
    expect(script.shown).toBeLessThanOrEqual(calm.rules.expeditions.maxSprites);
    const allies = big.battle!.allies.filter((a) => a.arrives).reduce((n, a) => n + a.warriors, 0);
    expect(script.total).toBe(200 + allies);
    for (const f of frames(script)) expect(f.people.length).toBeLessThanOrEqual(calm.rules.expeditions.maxSprites);
    expect(share([120, 80], 40)).toEqual([24, 16]);
    expect(share([3, 0, 1], 40)).toEqual([3, 0, 1]);
  });

  it("walk people over land only (the same paths as everyone), never through the river", () => {
    const { e, village } = raidOn(true);
    const script = buildReplay(e, village, calm);
    for (const a of script.actors) {
      // Every point they walk through after stepping ashore (until boarding again) is on walkable ground.
      for (const k of a.keys.slice(2, a.look === "warrior" ? -1 : undefined)) expect(isWalkable(village.map, Math.floor(k.p.x), Math.floor(k.p.y)) || a.look === "ally").toBe(true);
    }
  });

  it("play a trade: the boat docks, envoys go to the Bahay ng Datu and come back with goods, the boat leaves", () => {
    const s = world();
    const after = apply(s, calm, { type: "trade", neighbor: "malinaw", give: "rice" });
    const e = after.expeditions.at(-1)!;
    const village = generateVillage(calm, nb(s, "malinaw"), neighborDef(calm, "malinaw")!, s.time);
    const script = buildReplay(e, village, calm);
    expect(script.phases.map((p) => p.phase)).toEqual(["arrive", "walk", "datu", "return", "leave"]);
    const envoys = script.actors.filter((a) => a.look === "envoy");
    expect(envoys).toHaveLength(calm.rules.expeditions.envoys);
    const plaza = village.map.plaza;
    for (const a of envoys) {
      const far = Math.min(...a.keys.map((k) => Math.hypot(k.p.x - plaza.x - 0.5, k.p.y - plaza.y - 0.5)));
      expect(far).toBeLessThan(2);
    }
    expect(frames(script).some((f) => f.people.some((p) => p.bundle))).toBe(true);
    expect(sampleReplay(script, script.duration + 1).people).toHaveLength(0);
  });

  it("replay raids on the player in the player's own village", () => {
    const surely = { ...calm, rules: { ...calm.rules, diplomacy: { ...calm.rules.diplomacy, aiRaid: { ...calm.rules.diplomacy.aiRaid, chancePerSecond: 1 } } } };
    let s = world({ resources: { rice: 1000, wood: 1000, gold: 0 }, buildings: [at("bahay-kubo", 5, 3), at("kuta", 4, 6)], warriors: 4, rng: 3 });
    s = { ...s, time: 659.5, region: { ...s.region!, truceUntil: 0, nextAiRaidAt: 9999, incomingRaid: { from: "batong-buhay", strikeAt: 660, landing: { x: 1, y: 4 } } } };
    s = setNbState(s, "batong-buhay", { warriors: 6, villagers: 11 });
    const after = tick(s, surely, 1);
    const e = after.expeditions.at(-1)!;
    const before = JSON.stringify(after);
    const script = buildReplay(e, after, calm);
    frames(script);
    expect(JSON.stringify(after)).toBe(before);
    expect(script.actors.filter((a) => a.look === "raider").length).toBe(6);
    expect(script.actors.some((a) => a.look === "warrior")).toBe(true);
  });
});
