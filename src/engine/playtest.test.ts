// Tests for the pre-playtest polish: days, night, solid buildings and doorways, level-scaled AI
// villages, anti-spam limits, save export/import, clock safety and dev commands.
import { describe, expect, it } from "vitest";
import { dayAt, isNightAt, nightFactor, nightShare } from "./daynight";
import { closesPlaza, entrancesBlockedBy, entranceOf, hasEntrance, isWalkReachable, updateDoors } from "./doors";
import { apply, rates, STATE_VERSION, tick, unreachableWorkplaces, type GameState } from "./game";
import { createRegion, marriageBlocker, sandugoBlocker, type NeighborState } from "./region";
import { offlineProgress } from "./offline";
import { exportCode, exportFile, importSave, parseSave, SAVE_CODE_PREFIX } from "./save";
import { acquainted, at, calm, content, mapFrom, withState } from "./testUtils";
import { generateVillage, villageBand, villagePlan } from "./village";
import { levelForRenown } from "./kabantugan";
import { autoPlaceTile, canPlace, tileAt } from "./map";
import { dailyFactor, relationshipDays, tradeFatigue } from "./limits";
import { decideTrade } from "./trading";

const dn = content.rules.dayNight;
const DAY = dn.daySeconds;
const NIGHT = dn.nightFrom * DAY + 5; // a time well into the first night
const NOON = 0.25 * DAY;
const lim = content.rules.limits;

describe("days (Araw)", () => {
  it("counts days from the founding, starting at Araw 1", () => {
    expect(dayAt(content, 0, 0)).toBe(1);
    expect(dayAt(content, 0, DAY - 0.1)).toBe(1);
    expect(dayAt(content, 0, DAY)).toBe(2);
    expect(dayAt(content, 3 * DAY, 3 * DAY + 10)).toBe(1);
    expect(dayAt(content, 0, 11.5 * DAY)).toBe(12);
  });

  it("old saves count their days from their existing game time", () => {
    const s = withState({ time: 5 * DAY + 3 });
    const raw = JSON.parse(JSON.stringify({ ...s, version: 22 }));
    delete raw.foundedAt;
    const back = parseSave(JSON.stringify(raw), content)!;
    expect(back.version).toBe(STATE_VERSION);
    expect(back.foundedAt).toBe(0);
    expect(dayAt(content, back.foundedAt, back.time)).toBe(6);
  });

  it("the founding day survives a save", () => {
    const s = withState({ time: 900, foundedAt: 480 });
    expect(parseSave(JSON.stringify(s), content)!.foundedAt).toBe(480);
  });
});

describe("night", () => {
  it("lasts about a third of the day", () => {
    expect(dn.nightTo - dn.nightFrom).toBeGreaterThan(0.28);
    expect(dn.nightTo - dn.nightFrom).toBeLessThan(0.38);
    expect(nightShare(content, 0, DAY)).toBeCloseTo(dn.nightTo - dn.nightFrom, 5);
    expect(isNightAt(content, NIGHT)).toBe(true);
    expect(isNightAt(content, NOON)).toBe(false);
  });

  it("slows work by the night factor, except night fishing at the docks", () => {
    const s = withState({ villagers: 12, resources: { rice: 500 }, buildings: [at("bahay-kubo", 5, 3), at("palayan", 3, 3), at("fishing-dock", 1, 2)] });
    const day = rates({ ...s, time: NOON }, calm).produced;
    const night = rates({ ...s, time: NIGHT }, calm).produced;
    expect(day.rice).toBeGreaterThan(0);
    expect(night.rice).toBeCloseTo(day.rice * dn.nightProductionFactor, 6);
    expect(day.gold).toBeGreaterThan(0);
    expect(night.gold).toBeCloseTo(day.gold, 6);
  });

  it("offline progress uses the same day and night share", () => {
    expect(nightFactor(content, 0, DAY)).toBeCloseTo(1 - (dn.nightTo - dn.nightFrom) * (1 - dn.nightProductionFactor), 6);
    // Wood (no season, no granary cap, and here no stockpile limit): four whole days bring in the day rate times the day's average factor.
    const open = { ...calm, rules: { ...calm.rules, stockpile: { ...calm.rules.stockpile, slowPercent: 0, stopMultiple: Infinity } } };
    const s = withState({ villagers: 6, happiness: 60, resources: { rice: 900 }, buildings: [at("bahay-kubo", 5, 3), at("woodcutter-camp", 3, 3)] });
    const dayRate = rates({ ...s, time: NOON }, open).produced.wood;
    const { report } = offlineProgress(s, open, 4 * DAY);
    expect(dayRate).toBeGreaterThan(0);
    expect(report.produced.wood / (4 * DAY)).toBeCloseTo(dayRate * nightFactor(content, 0, DAY), 2);
  });
});

describe("solid buildings and doorways", () => {
  // A small field: plaza at (4, 2), a Daan at (6, 3).
  const map = mapFrom(["TTTTTTTTT", "T.......T", "T...P...T", "T.....#.T", "T.......T", "TTTTTTTTT"]);
  const base = (buildings: GameState["buildings"]) => updateDoors(null, withState({ map, buildings }), calm);

  it("are not walked through, and each gets a reachable entrance, a Daan first", () => {
    const s = base([at("palayan", 6, 2)]);
    expect(isWalkReachable(s, calm, 6, 2)).toBe(false);
    expect(isWalkReachable(s, calm, 5, 2)).toBe(true);
    expect(entranceOf(s, calm, s.buildings[0])).toEqual({ x: 6, y: 3 });
    expect(s.buildings[0].door).toEqual({ x: 6, y: 3 });
  });

  it("a workplace boxed in by other buildings can't be reached", () => {
    const s = base([at("palayan", 1, 1), at("bahay-kubo", 2, 1), at("bahay-kubo", 1, 2)]);
    expect(hasEntrance(s, calm, s.buildings[0])).toBe(false);
    expect(unreachableWorkplaces(s, calm)).toEqual([s.buildings[0]]);
  });

  it("placement that would shut the last way into a building is refused", () => {
    const s = base([at("palayan", 1, 1), at("bahay-kubo", 2, 1)]);
    // The camp's only open side left is (1, 2).
    expect(entrancesBlockedBy(s, calm, 1, 2)).toEqual([s.buildings[0]]);
    const kubo = calm.buildings.find((b) => b.id === "bahay-kubo")!;
    expect(canPlace(s, calm, kubo, 1, 2)).toBe(false);
    expect(apply({ ...s, resources: { rice: 100, wood: 100, gold: 0 } }, calm, { type: "build", building: "bahay-kubo", x: 1, y: 2 }).buildings).toHaveLength(2);
    // Elsewhere is fine.
    expect(canPlace(s, calm, kubo, 3, 4)).toBe(true);
  });

  it("a wall that would cut off a part of the land is refused too", () => {
    const corridor = mapFrom(["TTTTTTT", "T.P...T", "TTTT.TT", "TT...TT", "TTTTTTT"]);
    const s = updateDoors(null, withState({ map: corridor, buildings: [at("palayan", 2, 3)] }), calm);
    expect(hasEntrance(s, calm, s.buildings[0])).toBe(true);
    // (4, 2) is the only way down to the field.
    expect(entrancesBlockedBy(s, calm, 4, 2)).toEqual([s.buildings[0]]);
    expect(entrancesBlockedBy(s, calm, 5, 1)).toEqual([]);
  });

  it("the plaza is never closed in, so the barangay keeps growing", () => {
    // Plaza at (4, 2): three sides built on, the last one is refused.
    const s = base([at("bahay-kubo", 3, 2), at("bahay-kubo", 5, 2), at("bahay-kubo", 4, 1)]);
    const kubo = calm.buildings.find((b) => b.id === "bahay-kubo")!;
    expect(closesPlaza(s, calm, 4, 3)).toBe(true);
    expect(canPlace(s, calm, kubo, 4, 3)).toBe(false);
    expect(canPlace(s, calm, kubo, 3, 3)).toBe(true);
    // AI barangays building on their own keep growing past the plaza's sides.
    let ai = withState({ map, buildings: [] });
    for (let i = 0; i < 8; i++) {
      const tile = autoPlaceTile(ai, calm, kubo);
      if (tile) ai = { ...ai, buildings: [...ai.buildings, at("bahay-kubo", tile.x, tile.y)] };
    }
    expect(ai.buildings.length).toBe(8);
    for (const b of ai.buildings) expect(hasEntrance(ai, calm, b)).toBe(true);
  });

  it("entrances follow changes: a Daan laid beside a building becomes its door", () => {
    let s = base([at("palayan", 2, 3)]);
    expect(s.buildings[0].door).toBeDefined();
    s = apply({ ...s, resources: { rice: 100, wood: 100, gold: 10 } }, calm, { type: "road", tiles: [{ x: 3, y: 3 }] });
    expect(s.buildings[0].door).toEqual({ x: 3, y: 3 });
  });

  it("old saves keep boxed-in buildings working until something next to them changes", () => {
    const boxed = withState({ map, buildings: [at("palayan", 1, 1), at("bahay-kubo", 2, 1), at("bahay-kubo", 1, 2)] });
    const raw = JSON.parse(JSON.stringify({ ...boxed, version: 22 }));
    for (const b of raw.buildings) delete b.door;
    const loaded = parseSave(JSON.stringify(raw), content)!;
    const field = loaded.buildings.find((b) => b.type === "palayan")!;
    expect(field.legacyDoor).toBe(true);
    expect(unreachableWorkplaces(loaded, content)).toEqual([]);
    // Still grandfathered after a save round trip and time passing…
    const later = tick(parseSave(JSON.stringify(loaded), content)!, calm, 5);
    expect(later.buildings.find((b) => b.type === "palayan")!.legacyDoor).toBe(true);
    // …but demolishing a neighbor ends it (and here frees a way in).
    const opened = apply(later, calm, { type: "demolish", x: 2, y: 1 });
    const f2 = opened.buildings.find((b) => b.type === "palayan")!;
    expect(f2.legacyDoor).toBeUndefined();
    expect(hasEntrance(opened, calm, f2)).toBe(true);
  });
});

describe("generated villages follow the barangay's level", () => {
  const world = createRegion(calm, 0, 7, "barangay-1");
  const n0 = world.neighbors.find((x) => x.id === "pulang-lupa")!;
  const def = calm.neighbors.find((d) => d.id === n0.id)!;
  /** Their real buildings, by kind (where they stand on their own map doesn't matter to the village). */
  const built = (counts: Record<string, number>) => Object.entries(counts).flatMap(([type, k]) => Array.from({ length: k }, (_, i) => ({ type, x: i, y: 0 })));
  const at = (renown: number, villagers = n0.state.villagers, counts: Record<string, number> = { "bahay-kubo": 3, palayan: 2, "woodcutter-camp": 1 }): NeighborState => ({
    ...n0,
    fame: { ...n0.fame, renown },
    state: { ...n0.state, villagers, buildings: built(counts) },
  });
  const townCounts = { "bahay-kubo": 25, palayan: 12, "woodcutter-camp": 6, kuta: 4 };
  const renownFor = (level: number) => (level <= 1 ? 0 : calm.rules.kabantugan.levelAt[level - 2]);

  it("small at levels 1–3, towns at high levels, with the house to match", () => {
    const small = generateVillage(calm, at(renownFor(2), 8), def, 0);
    const town = generateVillage(calm, at(renownFor(18), 60, townCounts), def, 0);
    expect(levelForRenown(calm, renownFor(18))).toBe(18);
    expect(small.datuLevel).toBe(villageBand(calm, 2).datuLevel);
    expect(town.datuLevel).toBeGreaterThanOrEqual(4);
    expect(town.buildings.length).toBeGreaterThan(small.buildings.length * 2);
    const count = (s: GameState, id: string) => s.buildings.filter((b) => b.type === id).length;
    expect(count(small, "kuta")).toBe(0);
    expect(count(town, "kuta")).toBe(4);
    expect(count(town, "bahay-kubo")).toBe(25);
    expect(count(town, "libingan")).toBe(1);
    expect(count(town, "fishing-dock")).toBeGreaterThanOrEqual(1);
    const cleared = (s: GameState) => [...s.map.tiles].filter((c) => c !== "f" && c !== "b" && c !== "r" && c !== "s").length;
    expect(cleared(town)).toBeGreaterThan(cleared(small));
    expect(town.map.tiles.includes("d")).toBe(true);
  });

  it("are the same for the same seed and level, and change with the level", () => {
    const a = generateVillage(calm, at(renownFor(9), 30), def, 0);
    expect(generateVillage(calm, at(renownFor(9), 30), def, 0)).toEqual(a);
    expect(generateVillage(calm, at(renownFor(13), 30), def, 0)).not.toEqual(a);
    expect(villagePlan(calm, at(renownFor(13), 30), def, 13).libingan).toBe(1);
    expect(villagePlan(calm, at(renownFor(3), 30), def, 3).libingan).toBeUndefined();
  });

  it("follow the player's rules: solid buildings with a way in, Mandirigma within the cap", () => {
    for (const level of [2, 6, 10, 14, 19]) {
      const n = at(renownFor(level), 40, townCounts);
      const v = generateVillage(calm, { ...n, state: { ...n.state, warriors: 30 } }, def, 0);
      expect(unreachableWorkplaces(v, calm)).toEqual([]);
      for (const b of v.buildings) if (calm.buildings.find((d) => d.id === b.type)?.workers) expect(b.door).toBeDefined();
      expect(v.warriors).toBeLessThanOrEqual(v.buildings.filter((b) => b.type === "kuta").length * calm.rules.military.warriorsPerKuta);
      expect(v.map.tiles).toContain("s");
    }
  });
});

describe("anti-spam", () => {
  const world = (): GameState => {
    const s = withState({ villagers: 20, resources: { rice: 5000, wood: 5000, gold: 500 }, time: 10 });
    return { ...s, region: acquainted(createRegion(calm, 0, 7, s.barangay.id)) };
  };
  const nb = (s: GameState, id = "malinaw") => s.region!.neighbors.find((n) => n.id === id)!;
  const trade = (s: GameState, amount = 20) => apply(s, calm, { type: "proposeTrade", neighbor: "malinaw", give: { resource: "rice", amount }, want: { resource: "wood", amount: 5 } });

  it("a trade's trust follows its value, and repeats the same day give sharply less", () => {
    const s = world();
    const t0 = nb(s).trust;
    const one = trade(s);
    const g1 = nb(one).trust - t0;
    expect(g1).toBeGreaterThan(0);
    const big = trade(s, 40);
    expect(nb(big).trust - t0).toBeCloseTo(g1 * 2, 5);
    const two = trade(one);
    expect(nb(two).trust - nb(one).trust).toBeCloseTo(g1 * lim.dailyReturns[1], 5);
    expect(dailyFactor(two, calm, nb(two), "trades")).toBe(lim.dailyReturns[2]);
    // A new day: full value again.
    const tomorrow = { ...two, time: two.time + DAY };
    expect(dailyFactor(tomorrow, calm, nb(tomorrow), "trades")).toBe(1);
  });

  it("trading too often tires them: a better deal first, then a refusal with a reason", () => {
    let s = world();
    for (let i = 0; i < lim.fatigueCounterAt; i++) s = trade(s);
    expect(tradeFatigue(s, calm, nb(s))).toBe("counter");
    for (let i = lim.fatigueCounterAt; i < lim.fatigueRefuseAt; i++) s = { ...s, region: { ...s.region!, neighbors: s.region!.neighbors.map((n) => (n.id === "malinaw" ? { ...n, today: { ...n.today!, trades: n.today!.trades + 1 } } : n)) } };
    expect(tradeFatigue(s, calm, nb(s))).toBe("refuse");
    const refused = trade(s);
    expect(nb(refused).lastRefusal?.reason).toBe("tired");
    expect(calm.rules.diplomacy.refusals.tired).toMatch(/this morning/);
    expect(decideTrade(nb(s), calm, { give: { resource: "rice", amount: 20 }, want: { resource: "wood", amount: 1 } }, 0, "refuse")).toEqual({ outcome: "refuse", reason: "tired" });
  });

  it("Handog gifts the same day count for less too", () => {
    const s = { ...world(), region: { ...world().region!, neighbors: world().region!.neighbors.map((n) => (n.id === "malinaw" ? { ...n, grudge: 90, trust: 10 } : n)) } };
    const gift = (x: GameState) => apply(x, calm, { type: "handog", neighbor: "malinaw", gift: { rice: 20 } });
    const one = gift(s);
    const two = gift(one);
    const first = nb(s).grudge - nb(one).grudge;
    expect(nb(one).grudge - nb(two).grudge).toBeCloseTo(first * lim.dailyReturns[1], 5);
  });

  it("renown from raiding the same barangay again that day falls off", () => {
    let s = world();
    s = { ...s, warriors: 20, buildings: [...s.buildings, at("kuta", 3, 3), at("kuta", 3, 5), at("kuta", 7, 5), at("kuta", 7, 3)] };
    s = { ...s, region: { ...s.region!, neighbors: s.region!.neighbors.map((n) => (n.id === "malinaw" ? { ...n, state: { ...n.state, warriors: 0 }, today: { day: 1, trades: 0, gifts: 0, raids: 1 } } : n)) } };
    const raided = apply(s, calm, { type: "raid", neighbor: "malinaw", warriors: 10 });
    const report = raided.region!.reports.at(-1)!;
    expect(report.win).toBe(true);
    expect(report.renownFactor).toBe(lim.dailyReturns[1]);
    expect(raided.kabantugan - s.kabantugan).toBe(Math.round(calm.rules.kabantugan.perRaidWon * lim.dailyReturns[1]));
  });

  it("marriage needs days since first contact; sandugo needs a marriage or a longer relationship", () => {
    const s = withState({ villagers: 20, resources: { rice: 5000, wood: 5000, gold: 500 }, time: 10 });
    let w: GameState = { ...s, region: createRegion(calm, 0, 7, s.barangay.id) };
    w = { ...w, region: { ...w.region!, neighbors: w.region!.neighbors.map((n) => (n.id === "malinaw" ? { ...n, trust: 90 } : n)) } };
    expect(nb(w).metAt).toBeNull();
    expect(marriageBlocker(w, calm, "malinaw")).toBe("young");
    // First contact: a gift.
    w = apply(w, calm, { type: "handog", neighbor: "malinaw", gift: { rice: 20 } });
    expect(nb(w).metAt).toBe(10);
    expect(relationshipDays(w, calm, nb(w))).toBe(0);
    const later = { ...w, time: 10 + lim.marriageMinDays * DAY };
    expect(marriageBlocker(later, calm, "malinaw")).toBeNull();
    expect(sandugoBlocker(later, calm, "malinaw")).toBe("young");
    expect(sandugoBlocker({ ...w, time: 10 + lim.sandugoMinDays * DAY }, calm, "malinaw")).toBeNull();
    const married = apply(later, calm, { type: "marry", neighbor: "malinaw" });
    expect(nb(married).marriage).toBe(true);
    expect(sandugoBlocker(married, calm, "malinaw")).toBeNull();
  });
});

describe("save export and import", () => {
  it("round-trips a game through a save code and a save file", () => {
    const s = tick({ ...withState({ villagers: 8, resources: { rice: 300, wood: 40, gold: 2 }, barangay: { id: "b-1", region: { x: 0, y: 0 }, name: "Sapang Ñino", datu: "Lakas" } }), region: createRegion(calm, 0, 7, "b-1") }, calm, 30);
    const code = exportCode(s);
    expect(code.startsWith(SAVE_CODE_PREFIX)).toBe(true);
    expect(importSave(code, content)).toEqual(parseSave(JSON.stringify(s), content));
    expect(importSave(`  ${code}\n`, content)!.barangay.name).toBe("Sapang Ñino");
    expect(importSave(exportFile(s), content)).toEqual(parseSave(JSON.stringify(s), content));
  });

  it("migrates older saves and refuses broken or future ones", () => {
    const old = { ...withState({}), version: 20 } as Record<string, unknown>;
    delete old.kabantugan;
    expect(importSave(JSON.stringify(old), content)!.version).toBe(STATE_VERSION);
    expect(importSave(`${SAVE_CODE_PREFIX}@@not base64@@`, content)).toBeNull();
    expect(importSave("hello", content)).toBeNull();
    expect(importSave(JSON.stringify({ ...withState({}), version: STATE_VERSION + 1 }), content)).toBeNull();
  });
});

describe("clock safety", () => {
  it("ignores time going backwards and never credits more than the cap", () => {
    const s = withState({ villagers: 5, resources: { rice: 100 } });
    expect(offlineProgress(s, calm, -3600).report.seconds).toBe(0);
    expect(offlineProgress(s, calm, -3600).state.time).toBe(s.time);
    expect(offlineProgress(s, calm, Number.NaN).report.seconds).toBe(0);
    const year = offlineProgress(s, calm, 365 * 24 * 3600);
    expect(year.report.seconds).toBe(calm.rules.offline.maxSeconds);
    expect(year.state.time - s.time).toBeCloseTo(calm.rules.offline.maxSeconds, 3);
  });
});

describe("dev commands", () => {
  it("are normal commands that mark the save, and keep it loadable", () => {
    const s = withState({ villagers: 5, resources: { rice: 100 } });
    const more = apply(s, calm, { type: "dev", action: "addResources", amounts: { rice: 50 } });
    expect(more.resources.rice).toBe(150);
    expect(more.devSave).toBe(true);
    expect(parseSave(JSON.stringify(more), content)!.devSave).toBe(true);
    expect(apply(s, calm, { type: "dev", action: "addResources", amounts: {} })).toBe(s);
  });

  it("fast-forward plays whole days; set time stops at dusk or dawn", () => {
    const s = withState({ villagers: 5, resources: { rice: 500 } });
    const ff = apply(s, calm, { type: "dev", action: "fastForward", days: 2 });
    expect(ff.time).toBeCloseTo(s.time + 2 * DAY, 3);
    const night = apply(s, calm, { type: "dev", action: "setTime", phase: "night" });
    expect(isNightAt(content, night.time)).toBe(true);
    const day = apply(night, calm, { type: "dev", action: "setTime", phase: "day" });
    expect(isNightAt(content, day.time)).toBe(false);
  });

  it("can start events and raids", () => {
    const s = { ...withState({ villagers: 30, resources: { rice: 500 } }), region: createRegion(calm, 0, 7, "barangay-1") };
    expect(apply(s, calm, { type: "dev", action: "trigger", event: "fire" }).buildings.some((b) => b.burningSince !== undefined)).toBe(true);
    expect(apply(s, calm, { type: "dev", action: "trigger", event: "raid" }).region!.incomingRaid).not.toBeNull();
    expect(apply(s, calm, { type: "dev", action: "trigger", event: "eclipse" }).eclipse).not.toBeNull();
    expect(apply(s, calm, { type: "dev", action: "trigger", event: "choice:kaingin" }).choice?.id).toBe("kaingin");
  });

  it("clearing the forest keeps balete, river and sea, and the Forest Balance", () => {
    const s = withState({ map: mapFrom(["~..TB", "~.P.T", "~TTTT"]) });
    const c = apply(s, calm, { type: "dev", action: "clearForest" });
    expect(tileAt(c.map, 3, 0)).toBe("cleared");
    expect(tileAt(c.map, 4, 0)).toBe("balete");
    expect(tileAt(c.map, 0, 1)).toBe("river");
    expect(c.forest).toEqual(s.forest);
  });
});

describe("onboarding", () => {
  it("no neighbor offers a trade in a new barangay's first day", () => {
    const quiet = { ...calm, rules: { ...calm.rules, diplomacy: { ...calm.rules.diplomacy, offers: { ...content.rules.diplomacy.offers, chancePerSecond: 1 } } } };
    const s: GameState = { ...withState({ villagers: 5, resources: { rice: 500 } }), region: createRegion(quiet, 0, 7, "barangay-1") };
    expect(tick(s, quiet, content.rules.diplomacy.offers.startsAfterSeconds - 2).region!.offer).toBeNull();
    expect(tick(s, quiet, content.rules.diplomacy.offers.startsAfterSeconds + 2).region!.offer).not.toBeNull();
  });
});
