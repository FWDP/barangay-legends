import { describe, expect, it } from "vitest";
import type { Content } from "./content";
import { apply, tick, type GameState } from "./game";
import { sameIsland } from "./archipelago";
import { createRegion, neighborDef, type NeighborState } from "./region";
import { borderBattle, raidKey, raidSetup } from "./battle";
import { parseSnapshot } from "./save";
import { raidPreview, villageSnapshot } from "./village";
import { nextRandom } from "./rng";
import { acquainted, at, calm, withState } from "./testUtils";

const ME = "barangay-1";
const d = calm.rules.diplomacy;
const m = calm.rules.military;

function world(patch: Partial<GameState> = {}, seed = 7): GameState {
  const s = withState({ resources: { rice: 2000, wood: 2000, gold: 0 }, villagers: 30, warriors: 20, buildings: [], ...patch });
  return { ...s, region: acquainted(createRegion(calm, s.time, seed)) };
}
const nb = (s: GameState, id: string) => s.region!.neighbors.find((n) => n.id === id)!;
const setNb = (s: GameState, id: string, patch: Partial<NeighborState>): GameState => ({
  ...s,
  region: { ...s.region!, neighbors: s.region!.neighbors.map((n) => (n.id === id ? { ...n, ...patch } : n)) },
});
const setNbState = (s: GameState, id: string, patch: Partial<GameState>) => setNb(s, id, { state: { ...nb(s, id).state, ...patch } });
/** Independent neighbors on the player's own island. */
const homeTargets = (s: GameState) => s.region!.neighbors.filter((n) => n.status === "independent" && sameIsland(s.region!.places, ME, n.id)).map((n) => n.id);
/** No blocs, so allies only come where a test puts them. */
const noBlocs = (s: GameState): GameState => ({ ...s, region: { ...s.region!, politics: { ...s.region!.politics, blocs: [], wars: [] } } });

describe("the player's raids use the border battle", () => {
  it("land where the visit preview shows, with the Kuta coverage it shows", () => {
    for (const seed of [1, 7, 42]) {
      let s = noBlocs(world({ rng: seed, time: 2000 + seed * 977 }, seed));
      s = { ...s, time: 2000 + seed * 977 };
      for (const id of homeTargets(s)) {
        s = setNbState(s, id, { warriors: 4 });
        // The preview exactly as the visit screen makes it: from the snapshot, keyed by the day.
        const village = parseSnapshot(villageSnapshot(calm, nb(s, id), neighborDef(calm, id)!, s.time), calm)!;
        const preview = raidPreview(village, calm, raidKey(s, calm));
        const after = apply(s, calm, { type: "raid", neighbor: id, warriors: 5 });
        const report = after.region!.reports.at(-1)!;
        expect(report.landing).toEqual(preview.landing);
        expect(report.covered).toBe(preview.covering.length > 0);
        expect(after.expeditions.at(-1)!.landing).toEqual(preview.landing);
      }
    }
  });

  it("the preview holds through the day (the landing is rolled per Araw)", () => {
    const s = noBlocs(world({ time: 100 }));
    const id = homeTargets(s)[0];
    const later = { ...s, time: 100 + calm.rules.dayNight.daySeconds / 3 };
    expect(raidSetup(later, calm, id)!.landing).toEqual(raidSetup(s, calm, id)!.landing);
  });

  it("the target's bloc mates join when they arrive in time, and not when they don't", () => {
    let s = noBlocs(world({ rng: seedWhere((r) => r > 0.5) }));
    const [target, mate] = homeTargets(s);
    s = setNbState(setNbState(s, target, { warriors: 2 }), mate, { warriors: 10, villagers: 20 });
    s = { ...s, region: { ...s.region!, politics: { ...s.region!.politics, blocs: [{ id: "bloc-1", leader: target, members: [target, mate] }] } } };
    const after = apply(s, calm, { type: "raid", neighbor: target, warriors: 6 });
    const report = after.region!.reports.at(-1)!;
    expect(report.allies).toEqual([mate]);
    const alone = apply(noBlocs(s), calm, { type: "raid", neighbor: target, warriors: 6 }).region!.reports.at(-1)!;
    expect(report.defense! - alone.defense!).toBeCloseTo((10 * m.warrior.defense * d.sandugo.allyDefensePercent) / 100, 9);
    const record = after.expeditions.at(-1)!.battle!;
    expect(record.allies.find((a) => a.id === mate)).toMatchObject({ arrives: true, warriors: 10 });
    // With almost no warning, they can't get there in time.
    const short: Content = { ...calm, rules: { ...calm.rules, diplomacy: { ...d, aiRaid: { ...d.aiRaid, warningSeconds: 1 } } } };
    const late = apply(s, short, { type: "raid", neighbor: target, warriors: 6 });
    expect(late.region!.reports.at(-1)!.allies).toBeUndefined();
    expect(late.expeditions.at(-1)!.battle!.allies.find((a) => a.id === mate)?.arrives).toBe(false);
  });

  it("are the same for the same seed", () => {
    const s = world({ rng: 99 });
    const id = homeTargets(s)[0];
    expect(apply(s, calm, { type: "raid", neighbor: id, warriors: 5 })).toEqual(apply(s, calm, { type: "raid", neighbor: id, warriors: 5 }));
  });
});

describe("one battle function for both directions", () => {
  it("decides the player's raid: same defense, chance and result as borderBattle with the raid's roll", () => {
    const s = world({ rng: 1234 });
    const id = homeTargets(s)[0];
    const setup = raidSetup(s, calm, id)!;
    const roll = nextRandom(s.rng)[0];
    const fight = borderBattle(setup.village, calm, setup.landing, 5, setup.allies, roll);
    const report = apply(s, calm, { type: "raid", neighbor: id, warriors: 5 }).region!.reports.at(-1)!;
    expect(report).toMatchObject({ attack: fight.attack, defense: fight.defense, chance: fight.battle.chance, win: fight.battle.attackerWins, landing: fight.landing });
  });

  it("decides AI raids on the player the same way", () => {
    const surely: Content = { ...calm, rules: { ...calm.rules, diplomacy: { ...d, aiRaid: { ...d.aiRaid, chancePerSecond: 1 } } } };
    let s = world({ resources: { rice: 1000, wood: 1000, gold: 0 }, buildings: [at("bahay-kubo", 5, 3), at("kuta", 4, 6)], warriors: 4, rng: 5 });
    s = { ...s, time: 659.5, region: { ...s.region!, truceUntil: 0, nextAiRaidAt: 9999, incomingRaid: { from: "batong-buhay", strikeAt: 660, landing: { x: 1, y: 4 } } } };
    s = setNbState(s, "batong-buhay", { warriors: 6, villagers: 11 });
    const after = tick(s, surely, 1);
    const report = after.region!.reports.at(-1)!;
    // The same function, given the player's barangay at the strike and the landing.
    const fight = borderBattle(s, surely, { x: 1, y: 4 }, 6, [], 0);
    expect(report.attack).toBe(fight.attack);
    expect(report.defense).toBeCloseTo(fight.defense, 9);
    expect(report.covered).toBe(fight.muster!.covered);
    expect(report.late).toBe(fight.muster!.late);
  });
});

function seedWhere(pred: (roll: number) => boolean): number {
  for (let seed = 1; ; seed++) if (pred(nextRandom(seed)[0])) return seed;
}
