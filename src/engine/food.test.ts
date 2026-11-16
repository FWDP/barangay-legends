// Food (V.2, food.ts): Pagkain, Palay and Asin; where food is kept and what spoils; a varied
// diet; worn-out kaingin; seasons, typhoons and over-fishing by crop; the Pista; the v34 migration.
import { describe, expect, it } from "vitest";
import { apply, newGame, rates, tick, type GameState } from "./game";
import { dietHappiness, emptyStore, feed, foodCaps, foodGroups, holdPista, lootableFood, pistaBlocker, restKaingin, updateFoodLand, wornOut, yieldFactor } from "./food";
import { happinessTarget } from "./happiness";
import { seasonAt } from "./events";
import { migrateFoodV34, parseSave } from "./save";
import { storageAt } from "./upgrades";
import { createRegion } from "./region";
import { acquainted, at, calm, content, withState } from "./testUtils";

const f = content.rules.food;
const def = (id: string) => content.buildings.find((d) => d.id === id)!;
/** The first game second in a season. */
const timeIn = (season: string) => {
  for (let t = 0; t < 5000; t += 5) if (seasonAt(content, t)?.season.id === season) return t;
  throw new Error(season);
};
/** Only the food store, nobody eating and nothing brought in: what happens to food left as it is. */
const keep = (s: GameState, seconds: number) => {
  let x = s;
  for (let i = 0; i < seconds; i++) x = feed(x, calm, 1, x.buildings.map(() => 0), 0);
  return x;
};

describe("Pagkain, Palay and Asin", () => {
  it("a new game starts with Pagkain and no Palay; villagers eat Pagkain", () => {
    const s = newGame(content, 3);
    expect(s.resources.food).toBe(content.rules.start.resources.food);
    expect(s.resources.rice).toBe(0);
    const r = rates(s, content);
    expect(r.eaten.food).toBeGreaterThan(0);
    expect(r.eaten.rice).toBe(f.datuRicePerLevel * s.datuLevel);
  });

  it("the Palayan grows Palay, food workplaces Pagkain, the Asinan salt", () => {
    expect(def("palayan").produces).toEqual({ rice: 0.5 });
    expect(def("gabihan").produces?.food).toBeGreaterThan(0);
    expect(def("asinan").produces).toEqual({ salt: expect.any(Number) });
    const s = withState({ villagers: 4, resources: { food: 100, rice: 0 }, buildings: [at("bahay-kubo", 5, 3), at("palayan", 1, 2), at("gabihan", 1, 6)] });
    const r = rates(s, calm);
    expect(r.produced.rice).toBeGreaterThan(0);
    expect(r.produced.food).toBeGreaterThan(0);
  });

  it("with no Pagkain left, villagers eat Palay and waste it", () => {
    const s = withState({ villagers: 5, resources: { food: 0, rice: 100 }, buildings: [at("bahay-kubo", 5, 3)] });
    const next = feed(s, calm, 1, s.buildings.map(() => 0), 0.5);
    expect(next.resources.rice).toBeCloseTo(100 - 0.5 * (f.riceWastePercent / 100));
    expect(next.resources.food).toBe(0);
  });
});

describe("a varied diet", () => {
  it("counts the food groups brought in, and makes people happier the more there are", () => {
    const s = withState({ villagers: 6, buildings: [at("bahay-kubo", 5, 3), at("gabihan", 1, 2), at("fishing-dock", 1, 6), at("niyugan", 6, 6)] });
    const groups = foodGroups(s, content, rates(s, calm).foodByBuilding);
    expect(groups).toEqual(["starch", "fish", "fruit"]);
    expect(dietHappiness({ ...s, dietGroups: 3 }, content)).toBe(2 * f.variety.perGroupHappiness);
    expect(dietHappiness({ ...s, dietGroups: 1 }, content)).toBe(0);
    expect(happinessTarget({ ...s, dietGroups: 3 }, content).diet).toBe(2 * f.variety.perGroupHappiness);
  });

  it("one kind of food for too long lowers happiness and raises the risk of sickness", () => {
    const s = withState({ villagers: 4, monotonyFor: 0, buildings: [at("bahay-kubo", 5, 3), at("gabihan", 1, 2)] });
    const made = rates(s, calm).foodByBuilding;
    const long = updateFoodLand(s, content, f.variety.monotonySeconds, made, 1);
    expect(dietHappiness(long, content)).toBe(f.variety.monotonyHappiness);
    // Two groups again: the clock starts over.
    expect(updateFoodLand(long, content, 1, made, 2).monotonyFor).toBe(0);
  });
});

describe("where food is kept", () => {
  it("the Kamalig holds only grains, dried goods and salt", () => {
    for (let l = 1; l <= 3; l++) for (const k of Object.keys(storageAt(def("kamalig"), l))) expect(["rice", "food", "salt"]).toContain(k);
    const without = withState({ buildings: [at("bahay-kubo", 5, 3)] });
    const withK = withState({ buildings: [at("bahay-kubo", 5, 3), at("kamalig", 3, 3)] });
    expect(foodCaps(withK, content).preserved - foodCaps(without, content).preserved).toBe(storageAt(def("kamalig"), 1).food);
    // Fresh bananas don't go into it: with the jars and Kamalig full, they stay fresh (and spoil).
    const full = { ...withK, foodStore: { ...emptyStore(), preserved: foodCaps(withK, content).preserved }, resources: { ...withK.resources, food: foodCaps(withK, content).preserved } };
    const banana = feed({ ...full, buildings: [...full.buildings, at("sagingan", 6, 6)] }, calm, 1, [0, 0, 5], 0);
    expect(banana.foodStore.fresh).toBeGreaterThan(0);
  });

  it("root crops stay in the ground and never spoil", () => {
    const s = withState({ villagers: 0, buildings: [at("gabihan", 1, 2)], resources: { food: 0 } });
    const grown = feed(s, calm, 10, [5], 0);
    expect(grown.foodStore.ground).toBeCloseTo(50);
    expect(keep(grown, 600).foodStore.ground).toBeCloseTo(50);
  });

  it("household jars and the Baklad keep food safe; only fresh food left out spoils", () => {
    const s = withState({ villagers: 0, buildings: [at("baklad", 1, 2)], resources: { food: 0 } });
    const stocked = { ...s, foodStore: { ground: 0, fresh: 100, live: 50, preserved: 30 }, resources: { ...s.resources, food: 180 } };
    const later = keep(stocked, 300);
    expect(later.foodStore.live).toBeCloseTo(50);
    expect(later.foodStore.preserved).toBeCloseTo(30);
    expect(later.foodStore.fresh).toBeLessThan(100 * 0.7);
    expect(later.resources.food).toBeCloseTo(later.foodStore.ground + later.foodStore.fresh + later.foodStore.live + later.foodStore.preserved);
    // Caught fish go into the Baklad alive while there's room.
    const fished = feed({ ...s, buildings: [at("baklad", 1, 2), at("fishing-dock", 1, 6)] }, calm, 1, [0, 10], 0);
    expect(fished.foodStore.live).toBeCloseTo(10);
  });

  it("houses smoke fresh food into their jars, and salting with Asin preserves more, using it up", () => {
    const houses = [at("bahay-kubo", 5, 3), at("bahay-kubo", 4, 3), at("bahay-kubo", 6, 3)];
    const base = withState({ villagers: 0, buildings: houses, resources: { food: 0 } });
    const fresh = { ...base, foodStore: { ...emptyStore(), fresh: 50 }, resources: { ...base.resources, food: 50 } };
    const smoked = feed(fresh, calm, 10, [0, 0, 0], 0);
    const salted = feed({ ...fresh, resources: { ...fresh.resources, salt: 20 } }, calm, 10, [0, 0, 0], 0);
    expect(smoked.foodStore.preserved).toBeCloseTo(3 * f.smokePerHousePerSecond * 10);
    expect(salted.foodStore.preserved).toBeGreaterThan(smoked.foodStore.preserved);
    expect(salted.resources.salt).toBeLessThan(20);
  });

  it("raiders can take only what's preserved, never root crops in the ground or live fish", () => {
    const s = withState({ foodStore: { ground: 100, fresh: 0, live: 40, preserved: 25 } });
    expect(lootableFood(s)).toBe(25);
  });
});

describe("worn-out kaingin", () => {
  it("stops yielding after many harvests; resting it returns the plot to forest and helps Forest Balance", () => {
    const s = withState({ villagers: 2, buildings: [at("bahay-kubo", 5, 3), at("kaingin", 8, 4)], forest: { balance: 50, stage: 0, permission: 0, lastClearAt: 0 } });
    const plot = s.buildings[1];
    expect(yieldFactor(s, content, plot, def("kaingin"))).toBeGreaterThan(0);
    const tired = { ...plot, harvested: f.kaingin.fertileHarvest };
    expect(wornOut(content, def("kaingin"), tired)).toBe(true);
    expect(yieldFactor(s, content, tired, def("kaingin"))).toBe(0);
    // Harvests wear it down.
    const worked = updateFoodLand(s, content, 10, [0, 2], 1);
    expect(worked.buildings[1].harvested).toBeCloseTo(20);
    const rested = apply({ ...s, buildings: [s.buildings[0], tired] }, calm, { type: "restKaingin", x: 8, y: 4 });
    expect(rested.buildings).toHaveLength(1);
    expect(rested.map.tiles[4 * rested.map.width + 8]).toBe(s.map.tiles[0 * s.map.width + 9]); // forest again
    expect(rested.forest.balance).toBe(50 + f.kaingin.fallowBalance);
    expect(restKaingin(s, content, 5, 3)).toBe(s); // only a kaingin can rest
  });
});

describe("seasons, typhoons and over-fishing by crop", () => {
  it("the dry season hurts gabi most and rough seas cut fishing; sago holds up", () => {
    const s = withState({ buildings: [at("gabihan", 1, 2), at("fishing-dock", 1, 6), at("lumbia", 6, 6)] });
    const [gabi, dock, sago] = s.buildings;
    const dry = { ...s, time: timeIn("tag-araw") };
    const wet = { ...s, time: timeIn("tag-ulan") };
    expect(yieldFactor(dry, content, gabi, def("gabihan"))).toBeCloseTo(f.seasonYield["tag-araw"].gabihan / 100);
    expect(yieldFactor(wet, content, dock, def("fishing-dock"))).toBeCloseTo(f.seasonYield["tag-ulan"]["fishing-dock"] / 100);
    expect(yieldFactor(dry, content, sago, def("lumbia"))).toBe(1);
    expect(yieldFactor(wet, content, sago, def("lumbia"))).toBe(1);
  });

  it("a typhoon flattens bananas and rice but never root crops; it spoils fresh food left out, not food in the ground", () => {
    const buildings = [at("gabihan", 1, 2), at("kaingin", 8, 4), at("sagingan", 4, 6), at("palayan", 1, 6)];
    const s = withState({ villagers: 0, time: 359, typhoon: { strikeAt: 360 }, buildings, foodStore: { ground: 100, fresh: 60, live: 0, preserved: 0 }, resources: { food: 160 } });
    const after = tick(s, calm, 2);
    expect(after.typhoon).toBeNull();
    expect(after.buildings.filter((b) => b.type === "gabihan" || b.type === "kaingin").every((b) => !b.damaged)).toBe(true);
    expect(after.buildings.some((b) => b.damaged)).toBe(true);
    expect(after.foodStore.ground).toBeCloseTo(100);
    expect(after.foodStore.fresh).toBeLessThan(60 * (1 - f.typhoonFreshPercent / 100) + 1e-6);
    expect(def("gabihan").typhoonProof && def("kaingin").typhoonProof).toBe(true);
  });

  it("fishing the same waters too hard lowers the catch for a while; resting them restores it", () => {
    const s = withState({ villagers: 3, buildings: [at("fishing-dock", 1, 6), at("fishing-dock", 1, 7)] });
    let worn = s;
    for (let i = 0; i < 60; i++) worn = updateFoodLand(worn, content, 10, [1, 1], 2);
    const dock = worn.buildings[0];
    expect(dock.depletion).toBeGreaterThan(0.2);
    expect(yieldFactor({ ...worn, time: timeIn("tag-araw") }, content, dock, def("fishing-dock"))).toBeLessThan(1);
    let rested = worn;
    for (let i = 0; i < 60; i++) rested = updateFoodLand(rested, content, 60, [0, 0], 2);
    expect(rested.buildings[0].depletion).toBe(0);
  });
});

describe("the Pista", () => {
  const rich = (patch: Partial<GameState> = {}) =>
    withState({ villagers: 10, resources: { food: 500, rice: 500, wine: 50 }, region: acquainted(createRegion(calm, 0, 7)), ...patch });

  it("spends Palay, rice wine and Pagkain; raises happiness and renown; invited allies trust you more", () => {
    let s = rich();
    const ally = s.region!.neighbors[0];
    s = { ...s, region: { ...s.region!, neighbors: s.region!.neighbors.map((n, i) => (i === 0 ? { ...n, status: "ally" as const, trust: 50 } : n)) } };
    const after = apply(s, calm, { type: "pista", occasion: "harvest" });
    const cost = f.pista.cost;
    expect(after.resources.rice).toBe(500 - cost.rice!);
    expect(after.resources.wine).toBe(50 - cost.wine!);
    expect(after.resources.food).toBe(500 - cost.food!);
    expect(after.kabantugan).toBe(s.kabantugan + f.pista.renown);
    expect(happinessTarget(after, content).pista).toBe(f.pista.happiness);
    expect(after.region!.neighbors.find((n) => n.id === ally.id)!.trust).toBe(50 + f.pista.trust);
    expect(after.pista?.guests).toContain(ally.id);
    expect(after.flags).toContain("pista");
    // Not again until the cooldown passes.
    expect(pistaBlocker(after, content)).toBe("cooldown");
  });

  it("can't be held during a raid or a famine, or without enough to share", () => {
    const s = rich();
    expect(pistaBlocker({ ...s, region: { ...s.region!, incomingRaid: { from: s.region!.neighbors[0].id, strikeAt: 99 } } }, content)).toBe("raid");
    expect(pistaBlocker({ ...s, hunger: 5 }, content)).toBe("hunger");
    expect(pistaBlocker({ ...s, resources: { ...s.resources, wine: 0 } }, content)).toBe("cost");
    expect(holdPista({ ...s, hunger: 5 }, content, "harvest").pista ?? null).toBeNull();
    // Only an occasion that fits: no victory without one.
    expect(apply(s, calm, { type: "pista", occasion: "victory" })).toBe(s);
  });

  it("rice wine is brewed from Palay", () => {
    const s = rich({ resources: { food: 500, rice: 30, wine: 0, wood: 0, gold: 0, salt: 0 } });
    const b = apply(s, calm, { type: "brew", amount: 5 });
    expect(b.resources.wine).toBe(5);
    expect(b.resources.rice).toBe(30 - 5 * f.brew.ricePerWine);
    expect(apply(s, calm, { type: "brew", amount: 50 })).toBe(s);
  });
});

describe("migrating an old save (v33 → v34)", () => {
  it("splits the stored rice into Pagkain and Palay, and nobody starves because of it", () => {
    const raw = migrateFoodV34({ version: 33, time: 100, resources: { rice: 100, wood: 5, gold: 0 } }, content);
    expect(raw.resources).toMatchObject({ food: f.migration.foodSharePercent, rice: 100 - f.migration.foodSharePercent, wood: 5 });
    expect(raw.foodGraceUntil).toBe(100 + f.migration.graceSeconds);

    // An old rice-only barangay: Palayan, no food workplace yet.
    const old = withState({ villagers: 8, time: 100, resources: { rice: 400, food: 0 }, buildings: [at("bahay-kubo", 5, 3), at("bahay-kubo", 4, 3), at("bahay-kubo", 6, 3), at("palayan", 1, 2), at("palayan", 1, 6)] });
    const saved = { ...old, version: 33, resources: { rice: 400, wood: 0, gold: 0 } } as Record<string, unknown>;
    delete saved.foodStore;
    const loaded = parseSave(JSON.stringify(saved), content)!;
    expect(loaded.resources.food + loaded.resources.rice).toBe(400);
    let s = loaded;
    for (let i = 0; i < 300; i++) {
      s = tick(s, calm, 1);
      expect(s.hunger).toBe(0);
    }
    expect(s.villagers).toBeGreaterThanOrEqual(8);
  });
});
