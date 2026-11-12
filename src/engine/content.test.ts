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
    expect(content.buildings.map((b) => b.id)).toEqual(["bahay-kubo", "palayan", "woodcutter-camp", "babaylan-hut"]);
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
    ["unknown resource", { ...good, cost: { gold: 1 } }, /unknown resource "gold"/],
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

  it("rejects a map with no room between river and forest", () => {
    const { buildings, rules } = loadContent();
    const files = Object.fromEntries(buildings.map((b) => [b.id, b]));
    expect(() => buildContent(files, { ...rules, map: { ...rules.map, width: 4 } })).toThrow(/land columns/);
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
