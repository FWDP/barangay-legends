import { describe, expect, it } from "vitest";
import { buildContent, loadContent, validateBuilding } from "./content";

const good = {
  id: "palayan",
  name: "Palayan",
  description: "A rice field.",
  icon: "🌾",
  cost: { wood: 15 },
  repairCost: { wood: 8 },
  produces: { rice: 0.5 },
  workers: 2,
  unlock: { start: true },
  sources: ["a source"],
};

describe("content", () => {
  it("loads every building file in content/ and passes the schema check", () => {
    const content = loadContent();
    // In menu order ("order" in each file), not file-name order.
    expect(content.buildings.map((b) => b.id)).toEqual(["bahay-kubo", "palayan", "woodcutter-camp", "babaylan-hut", "dambana", "kamalig", "tulay", "kuta", "fishing-dock"]);
  });

  it("matches the Week 1 numbers in docs/game-design.md", () => {
    const { buildings, rules } = loadContent();
    const byId = Object.fromEntries(buildings.map((b) => [b.id, b]));
    expect(byId["bahay-kubo"]).toMatchObject({ cost: { wood: 10 }, housing: 2 });
    expect(byId["palayan"]).toMatchObject({ cost: { wood: 15 }, produces: { rice: 0.5 }, workers: 2 });
    expect(byId["woodcutter-camp"]).toMatchObject({ cost: { rice: 10 }, produces: { wood: 0.4 }, workers: 2 });
    expect(rules.riceEatenPerVillagerPerSecond).toBe(0.1);
    expect(rules.costGrowth).toBe(1.15);
    expect(byId["palayan"].adjacencyBonus).toEqual({ nextTo: ["river", "palayan"], percent: 10 });
    expect(byId["woodcutter-camp"].adjacencyBonus).toEqual({ nextTo: ["forest"], percent: 10 });
    expect(byId["babaylan-hut"].heals).toEqual({ percentFaster: 100 });
    for (const b of buildings) expect(b.repairCost.wood).toBeGreaterThan(0); // every loss can be repaired with wood
    expect(rules.start).toMatchObject({ villagers: 5, resources: { rice: 10 }, buildings: { "bahay-kubo": 1 } });
  });

  it("accepts a valid building", () => {
    expect(validateBuilding(good)).toEqual(good);
  });

  it.each([
    ["missing id", { ...good, id: undefined }, /"id"/],
    ["bad id", { ...good, id: "Rice Field" }, /a-z/],
    ["unknown resource", { ...good, cost: { silver: 1 } }, /unknown resource "silver"/],
    ["negative cost", { ...good, cost: { wood: -1 } }, />= 0/],
    ["producer without workers", { ...good, workers: undefined }, /needs "workers"/],
    ["no sources", { ...good, sources: [] }, /sources/],
    ["no repair cost", { ...good, repairCost: undefined }, /repairCost/],
    ["a bad heal bonus", { ...good, heals: { percentFaster: -1 } }, /heals/],
    ["an empty bonus list", { ...good, adjacencyBonus: { nextTo: [], percent: 10 } }, /nextTo/],
    ["a negative bonus", { ...good, adjacencyBonus: { nextTo: ["river"], percent: -5 } }, /percent/],
  ])("rejects a building with %s", (_label, raw, message) => {
    expect(() => validateBuilding(raw, "test.json")).toThrow(message);
  });

  it("rejects a bonus next to unknown terrain or buildings", () => {
    const { rules } = loadContent();
    const bad = { ...good, adjacencyBonus: { nextTo: ["volcano"], percent: 10 } };
    expect(() => buildContent({ "a.json": bad }, rules)).toThrow(/unknown terrain or building "volcano"/);
  });

  it("rejects a map too small for the start area, river and forest", () => {
    const { buildings, rules } = loadContent();
    const files = Object.fromEntries(buildings.map((b) => [b.id, b]));
    expect(() => buildContent(files, { ...rules, map: { ...rules.map, width: 12 } })).toThrow(/too small/);
  });

  it("has map, clearing and Tulay values in content", () => {
    const { buildings, rules, lore } = loadContent();
    expect(rules.map).toMatchObject({ width: 60, height: 40, startClearRadius: 3 });
    expect(rules.clearing).toMatchObject({ baseSeconds: 6, workers: 1, wood: 3, cost: { rice: 3 } });
    expect(buildings.find((b) => b.id === "tulay")).toMatchObject({ placeOn: "river", unlock: { villagers: 20 }, bridge: { maxSpan: 3 } });
    expect(lore.balete.sources.length).toBeGreaterThan(0);
  });

  it("rejects a river building that is not a bridge, and lore without sources", () => {
    const { buildings, rules } = loadContent();
    const files = Object.fromEntries(buildings.map((b) => [b.id, b]));
    expect(() => buildContent({ "x.json": { ...good, placeOn: "river" } }, rules)).toThrow(/bridge/);
    expect(() => buildContent(files, rules, {}, { "l.json": { id: "l", name: "L", description: "d", sources: [] } })).toThrow(/source/);
  });

  it("rejects duplicate ids", () => {
    const { rules } = loadContent();
    expect(() => buildContent({ "a.json": good, "b.json": good }, rules)).toThrow(/Duplicate/);
  });
});

describe("event content", () => {
  const { buildings, rules, events } = loadContent();
  const files = Object.fromEntries(buildings.map((b) => [b.id, b]));

  it("loads every event file in content/events with the numbers from the brief", () => {
    expect(events.hunger).toMatchObject({ graceSeconds: 30, secondsPerVillagerLeaving: 10 });
    expect(events.seasons?.seasons.map((s) => [s.id, s.durationSeconds, s.productionPercent])).toEqual([
      ["tag-ulan", 300, {}],
      ["tag-araw", 300, { rice: 50 }],
    ]);
    expect(events.sickness).toMatchObject({ sickSeconds: 60, startsAfterSeconds: 300 });
    expect(events.fire).toMatchObject({ target: "bahay-kubo", startsAfterSeconds: 300 });
    expect(events.typhoon).toMatchObject({ warningSeconds: 60, startsAfterSeconds: 300 });
  });

  it.each([
    ["an unknown type", { id: "x", type: "volcano", name: "X", description: "d" }, /unknown event type/],
    ["a typhoon with min > max", { ...events.typhoon, damagedBuildings: { min: 3, max: 1 } }, /damagedBuildings/],
    ["a season with zero length", { ...events.seasons, seasons: [{ ...events.seasons!.seasons[0], durationSeconds: 0 }] }, /durationSeconds/],
    ["hunger with no leaving rate", { ...events.hunger, secondsPerVillagerLeaving: 0 }, /secondsPerVillagerLeaving/],
    ["sickness without crowding", { ...events.sickness, crowding: undefined }, /crowding/],
  ])("rejects %s", (_label, raw, message) => {
    expect(() => buildContent(files, rules, { "e.json": raw })).toThrow(message);
  });

  it("rejects events that point at unknown buildings, or two of the same type", () => {
    expect(() => buildContent(files, rules, { "f.json": { ...events.fire, target: "castle" } })).toThrow(/not a building/);
    expect(() =>
      buildContent(files, rules, { "s.json": { ...events.sickness, crowding: { building: "castle", percentPerAdjacentPair: 5 } } }),
    ).toThrow(/not a building/);
    expect(() => buildContent(files, rules, { "a.json": events.fire, "b.json": events.fire })).toThrow(/already a "fire"/);
  });
});

describe("cultural fields", () => {
  it("every being, ritual and lore entry needs a tradition, sources and reviewed", async () => {
    const { validateBlessing, validateTradition } = await import("./content");
    const real = loadContent();
    const anito = real.rituals[0];
    expect(() => validateBlessing({ ...anito, reviewed: undefined })).toThrow(/reviewed/);
    expect(() => validateBlessing({ ...anito, sources: [] })).toThrow(/source/);
    expect(() => validateBlessing({ ...anito, tradition: "" })).toThrow(/tradition/);
    expect(() => validateTradition({ ...real.traditions[0], forestSpirit: { ...real.traditions[0].forestSpirit, sources: [] } })).toThrow(/forestSpirit/);
  });
});
