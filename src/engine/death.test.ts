import { describe, expect, it } from "vitest";
import { aklatProgress, checkAklat } from "./aklat";
import { workforce } from "./clearing";
import { datuInfluenceMultiplier, datuProductionBonus, hasDatuUnlock, maxDatuLevel, nextDatuLevel } from "./datu";
import { die, hungerDeathAt, mourningRate, sicknessWarning, updateDeaths } from "./death";
import { apply, buildingWorkers, rates, STATE_VERSION, tick, type GameState } from "./game";
import { happinessTarget } from "./happiness";
import { barangayCenter, isConnected } from "./map";
import { offlineProgress } from "./offline";
import { reconcilePeople, type NamedVillager } from "./people";
import { createRegion } from "./region";
import { parseSave } from "./save";
import { at, calm, content, mapFrom, withState } from "./testUtils";

const d = content.rules.death;
const m = content.rules.mourning;
const house = content.datuHouse!.datuHouse;
const rich = { rice: 5000, wood: 5000, gold: 5000 };
const v = (id: number, patch: Partial<NamedVillager> = {}): NamedVillager => ({ id, name: `N${id}`, story: "singer", role: "villager", since: 0, ...patch });

describe("Bahay ng Datu", () => {
  it("stands from the start at level 1, at the plaza (the barangay's center)", () => {
    const s = withState({});
    expect(s.datuLevel).toBe(1);
    expect(content.datuHouse?.id).toBe("bahay-ng-datu");
    // It is never a placeable building.
    expect(content.buildings.some((b) => b.id === "bahay-ng-datu")).toBe(false);
    expect(barangayCenter(s.map)).toEqual(s.map.plaza);
    expect(datuProductionBonus(s, content)).toBe(0);
    expect(datuInfluenceMultiplier(s, content)).toBe(1);
  });

  it("is raised level by level for rice, wood and gold, up to 5", () => {
    expect(maxDatuLevel(content)).toBe(5);
    // Renown enough for every level the upgrades need.
    let s = withState({ resources: rich, kabantugan: 100000 });
    for (let level = 2; level <= 5; level++) {
      const next = nextDatuLevel(s, content)!;
      expect(next.level).toBe(level);
      expect(Object.keys(next.cost).sort()).toEqual(["gold", "rice", "wood"]);
      s = apply(s, calm, { type: "upgradeDatu" });
      expect(s.datuLevel).toBe(level);
      expect(s.history.at(-1)).toMatchObject({ kind: "datu", level });
    }
    expect(nextDatuLevel(s, content)).toBeNull();
    expect(apply(s, calm, { type: "upgradeDatu" })).toBe(s);
    const poor = withState({ resources: { rice: 0, wood: 0, gold: 0 } });
    expect(apply(poor, calm, { type: "upgradeDatu" })).toBe(poor);
  });

  it("adds 5% production and more influence for each level", () => {
    const fields = withState({ villagers: 2, resources: { rice: 100, wood: 0, gold: 0 }, buildings: [at("palayan", 1, 1)] });
    const base = rates(fields, calm).produced.rice;
    const lv3 = { ...fields, datuLevel: 3 };
    expect(house.productionPercentPerLevel).toBe(5);
    expect(rates(lv3, calm).produced.rice).toBeCloseTo(base * 1.1);
    expect(datuInfluenceMultiplier(lv3, content)).toBeCloseTo(1 + (2 * house.influencePercentPerLevel) / 100);
    // A trade's influence grows with it.
    const region = createRegion(calm, 0, 7);
    const s = withState({ resources: { rice: 2000, wood: 2000, gold: 0 }, villagers: 20, buildings: [], region });
    const trade = (x: GameState) => apply(x, calm, { type: "trade", neighbor: "pulang-lupa", give: "rice" });
    const gained = (x: GameState) => trade(x).region!.neighbors.find((n) => n.id === "pulang-lupa")!.influence - x.region!.neighbors.find((n) => n.id === "pulang-lupa")!.influence;
    expect(gained({ ...s, datuLevel: 3 })).toBeCloseTo(gained(s) * datuInfluenceMultiplier(lv3, content));
  });

  it("records unlocks: envoys at 2, the Balangay dock at 3, alliances at 4", () => {
    const s = withState({});
    expect(hasDatuUnlock(s, content, "envoys")).toBe(false);
    expect(hasDatuUnlock({ ...s, datuLevel: 2 }, content, "envoys")).toBe(true);
    expect(hasDatuUnlock({ ...s, datuLevel: 2 }, content, "balangay")).toBe(false);
    expect(hasDatuUnlock({ ...s, datuLevel: 3 }, content, "balangay")).toBe(true);
    expect(hasDatuUnlock({ ...s, datuLevel: 4 }, content, "alliances")).toBe(true);
  });

  it("keeps existing roads working: the Daan bonus counts from the same tile", () => {
    const map = mapFrom(["........", "...P###.", "........"]);
    expect(isConnected(map, 7, 1)).toBe(true);
  });
});

describe("deaths", () => {
  it("old age: only after a named villager has grown frail (the warning)", () => {
    const s = withState({ villagers: 5, named: [v(1, { since: 0 })], time: d.oldAge.frailAfterSeconds - 1 });
    const young = updateDeaths(s, { ...s, time: s.time + 0.5 }, calm, 0.5);
    expect(young.named[0].frail).toBeUndefined();
    const old = updateDeaths(s, { ...s, time: d.oldAge.frailAfterSeconds + 1 }, calm, 1);
    expect(old.named[0].frail).toBe(true);
    expect(old.history.at(-1)).toMatchObject({ kind: "frail", name: "N1" });
    // With certainty of dying (chance 1), a frail villager dies; the young never do.
    const sure = { ...calm, rules: { ...calm.rules, death: { ...d, oldAge: { ...d.oldAge, chancePerSecond: 1 } } } };
    const gone = updateDeaths(old, { ...old, time: old.time + 1 }, sure, 1);
    expect(gone.villagers).toBe(4);
    expect(gone.named).toEqual([]);
    expect(gone.remembered).toMatchObject([{ name: "N1", cause: "age", at: old.time + 1 }]);
    // Their life story is kept at the Libingan, ending with how they died.
    expect(gone.remembered[0].story?.life.at(-1)).toMatchObject({ kind: "died", cause: "age" });
    const fresh = withState({ villagers: 5, named: [v(1, { since: 100 })], time: 100 });
    expect(updateDeaths(fresh, { ...fresh, time: 101 }, sure, 1).villagers).toBe(5);
  });

  it("long sickness: only once it has lingered with no healer standing", () => {
    const sure = { ...calm, rules: { ...calm.rules, death: { ...d, sickness: { ...d.sickness, chancePerSecond: 1 } } } };
    const s = withState({ villagers: 5, sick: [30], sickFor: d.sickness.afterSeconds - 5, time: 10 });
    expect(updateDeaths(s, { ...s, time: 11 }, sure, 1).villagers).toBe(5);
    const long = { ...s, sickFor: d.sickness.afterSeconds };
    expect(sicknessWarning(long, content)).toBe(true);
    const after = updateDeaths(long, { ...long, time: 11 }, sure, 1);
    expect(after.villagers).toBe(4);
    expect(after.sick).toEqual([]);
    expect(after.history.at(-1)).toMatchObject({ kind: "died", cause: "sickness" });
    // A Babaylan's Hut keeps them alive (and stops the warning).
    const healed = { ...long, buildings: [...long.buildings, at("babaylan-hut", 2, 2)] };
    expect(sicknessWarning(healed, content)).toBe(false);
    expect(updateDeaths(healed, { ...healed, time: 11 }, sure, 1).villagers).toBe(5);
  });

  it("hunger: only after families have already left, then one every everySeconds", () => {
    const at0 = hungerDeathAt(content);
    expect(at0).toBeGreaterThan(content.events.hunger!.graceSeconds + content.events.hunger!.secondsPerVillagerLeaving);
    const s = withState({ villagers: 6, resources: { rice: 0, wood: 0, gold: 0 }, hunger: at0 - 1 });
    expect(updateDeaths(s, { ...s, hunger: at0 - 0.5 }, calm, 0.5).villagers).toBe(6);
    const one = updateDeaths(s, { ...s, hunger: at0 }, calm, 1);
    expect(one.villagers).toBe(5);
    expect(one.stats.deaths).toBe(1);
    const more = updateDeaths(one, { ...one, hunger: at0 + d.hunger.everySeconds }, calm, d.hunger.everySeconds);
    expect(more.villagers).toBe(4);
  });

  it("a lost battle: fallen warriors are deaths, remembered by name and mourned", () => {
    const s = withState({ villagers: 10, warriors: 2, named: [v(1, { role: "warrior", story: "bravest" })] });
    const after = apply(s, calm, { type: "undo" });
    expect(after).toBe(s);
    // Two warriors lost (a battle), not hungry: both are deaths.
    const lost = { ...s, villagers: 8, warriors: 0 };
    const r = reconcilePeople(s, lost, content);
    expect(r.stats.deaths).toBe(2);
    expect(r.remembered.map((x) => x.name)).toEqual(["N1"]);
    expect(r.mourning).toBeGreaterThan(0);
  });

  it("never during offline catch-up", () => {
    const sure = { ...calm, rules: { ...calm.rules, death: { ...d, oldAge: { ...d.oldAge, chancePerSecond: 1 }, sickness: { ...d.sickness, chancePerSecond: 1 } } } };
    const s = withState({ villagers: 5, resources: { rice: 1000, wood: 0, gold: 0 }, named: [v(1, { frail: true })], sick: [60], sickFor: 1000 });
    const { state } = offlineProgress(s, sure, 3600);
    expect(state.stats.deaths).toBe(0);
    expect(state.named).toHaveLength(1);
  });

  it("a death leaves one fewer worker: a clearing job waits, a building's count drops", () => {
    const map = mapFrom(["TTTTTTT", "T.....T", "T..P..T", "T.....T", "TTTTTTT"]);
    const busy = withState({ map, villagers: 4, resources: { rice: 500, wood: 0, gold: 0 }, buildings: [at("palayan", 1, 1), at("woodcutter-camp", 5, 1)] });
    const queued = apply(busy, calm, { type: "clearArea", tiles: [{ x: 0, y: 2 }] });
    expect(workforce(queued, calm).borrowed.reduce((a, b) => a + b, 0)).toBe(1);
    const dead = die(queued, content, "hunger", { second: 1 });
    expect(dead.villagers).toBe(3);
    expect(buildingWorkers(dead, calm).reduce((a, b) => a + b, 0) + workforce(dead, calm).free).toBeLessThanOrEqual(3);
    expect(workforce(dead, calm).crews).toBeLessThanOrEqual(1);
    // A paused building had nobody; it still has nobody, and nothing goes negative.
    const paused = { ...dead, buildings: dead.buildings.map((b, i) => (i === 0 ? { ...b, paused: true } : b)) };
    expect(buildingWorkers(paused, calm)[0]).toBe(0);
    expect(tick(paused, calm, 5).villagers).toBeGreaterThanOrEqual(0);
  });
});

describe("mourning and the Libingan", () => {
  it("a death brings mourning, which lowers happiness slightly and passes", () => {
    const s = die(withState({ villagers: 5 }), content, "hunger", { second: 1 });
    expect(s.mourning).toBe(m.seconds);
    expect(happinessTarget(s, content).mourning).toBe(m.happiness);
    const later = tick(s, calm, m.seconds + 1);
    expect(later.mourning).toBe(0);
    expect(happinessTarget(later, content).mourning).toBe(0);
  });

  it("passes twice as fast with a Libingan", () => {
    const s = withState({ villagers: 5, mourning: 100, buildings: [at("bahay-kubo", 5, 3), at("libingan", 2, 2)] });
    expect(mourningRate(s, content)).toBe(2);
    expect(tick(s, calm, 10).mourning).toBeCloseTo(80);
    expect(mourningRate({ ...s, buildings: [at("bahay-kubo", 5, 3)] }, content)).toBe(1);
  });

  it("a rite at the Dambana shortens it", () => {
    const rite = content.rituals.find((r) => r.id === "mourning-rite")!;
    const s = withState({ villagers: 5, mourning: 200, favor: 100, tradition: "tagalog", buildings: [at("babaylan-hut", 2, 2), at("dambana", 2, 3)] });
    const after = apply(s, calm, { type: "ritual", ritual: "mourning-rite" });
    expect(after.mourning).toBe(200 * (1 - rite.mourningShortenPercent! / 100));
    expect(after.favor).toBe(100 - rite.favorCost);
    // Not without mourning.
    const calmS = { ...s, mourning: 0 };
    expect(apply(calmS, calm, { type: "ritual", ritual: "mourning-rite" })).toBe(calmS);
  });

  it("its look follows the tradition (jars by default) and unlocks the matching Aklat entry", () => {
    const s = withState({ buildings: [at("libingan", 2, 2)], aklat: [] });
    expect(checkAklat(s, content).aklat).toContain("burial-jars");
    const visayan = checkAklat({ ...s, tradition: "visayan" }, content);
    expect(visayan.aklat).toContain("longon");
    expect(visayan.aklat).not.toContain("burial-jars");
    expect(aklatProgress(visayan, content).total).toBe(content.aklat.length);
  });
});

describe("save migration v18 → v19", () => {
  it("gives every barangay its Bahay ng Datu at level 1, no deaths, no mourning", () => {
    const s = withState({ time: 50 });
    const raw = { ...s, version: 18, stats: { raidsDefended: 0, rolls: 0, named: 0, replanted: 0, permittedClears: 0 } } as Record<string, unknown>;
    for (const k of ["datuLevel", "mourning", "sickFor", "remembered"]) delete raw[k];
    const back = parseSave(JSON.stringify(raw), content)!;
    expect(back.version).toBe(STATE_VERSION);
    expect(back.datuLevel).toBe(1);
    expect(back.mourning).toBe(0);
    expect(back.remembered).toEqual([]);
    expect(back.stats.deaths).toBe(0);
  });

  it("round-trips the new state", () => {
    const s = withState({
      datuLevel: 3,
      mourning: 120,
      sick: [20],
      sickFor: 40,
      remembered: [{ name: "Diwa", cause: "age", at: 30 }],
      named: [v(1, { frail: true })],
      stats: { ...withState({}).stats, named: 1 },
      history: [
        { at: 5, kind: "died", cause: "hunger" },
        { at: 6, kind: "died", cause: "raid", count: 2 },
        { at: 7, kind: "frail", name: "N1", story: "singer" },
        { at: 8, kind: "datu", level: 2 },
      ],
    });
    const back = parseSave(JSON.stringify(s), content)!;
    expect({ ...back, region: null }).toEqual(s);
  });
});
