import { describe, expect, it } from "vitest";
import { workforce } from "./clearing";
import { apply, buildingWorkers, rates, tick, type GameState } from "./game";
import { happinessMultiplier, happinessTarget, housesNearPlaza, nextHappiness } from "./happiness";
import { canPlace } from "./map";
import { offlineProgress } from "./offline";
import { riceCap } from "./storage";
import { at, calm, content, mapFrom, withState } from "./testUtils";

const def = (id: string) => content.buildings.find((b) => b.id === id)!;
const dock = def("fishing-dock");
const kamalig = def("kamalig");
const h = content.rules.happiness;
const base = content.rules.storage.baseRice;

describe("gold", () => {
  it("is a resource every barangay starts with (none yet)", () => {
    expect(withState({}).resources.gold).toBe(0);
  });

  it("can't be gathered by hand: only Fishing Docks bring it in", () => {
    expect(content.rules.gatherable).not.toContain("gold");
    const s = withState({});
    expect(apply(s, calm, { type: "gather", resource: "gold" })).toBe(s);
  });
});

describe("Fishing Dock", () => {
  it("has the numbers from docs/game-design.md", () => {
    expect(dock.cost).toEqual({ wood: 40, rice: 20 });
    // 0.2 in docs/game-design.md at first; halved by the balance pass (npm run simulate).
    expect(dock.produces).toEqual({ gold: 0.1 });
    expect(dock.workers).toBe(3);
    expect(dock.unlock.villagers).toBe(15);
  });

  it("goes only on land next to the river", () => {
    // TEST_MAP: river in column 0, plaza at (5, 4).
    const s = withState({ villagers: 15 });
    expect(canPlace(s, content, dock, 1, 2)).toBe(true);
    expect(canPlace(s, content, dock, 2, 2)).toBe(false);
    const built = apply({ ...s, resources: { rice: 100, wood: 100, gold: 0 } }, calm, { type: "build", building: "fishing-dock", x: 1, y: 2 });
    expect(built.buildings.at(-1)).toMatchObject(at("fishing-dock", 1, 2));
    const refused = { ...s, resources: { rice: 100, wood: 100, gold: 0 } };
    expect(apply(refused, calm, { type: "build", building: "fishing-dock", x: 3, y: 2 })).toBe(refused);
  });

  it("earns 0.1 gold a second per worker", () => {
    const s = withState({ villagers: 3, resources: { rice: 500, wood: 0, gold: 0 }, buildings: [at("fishing-dock", 1, 2)] });
    expect(buildingWorkers(s, calm)).toEqual([3]);
    const steady = { ...s, happiness: h.start };
    expect(rates(steady, calm).produced.gold).toBeCloseTo(0.3);
    expect(tick(steady, calm, 10).resources.gold).toBeCloseTo(3, 1);
  });

  it("follows the workplace rules: pause, reachability and the borrowing order", () => {
    const s = withState({ villagers: 3, resources: { rice: 500, wood: 0, gold: 0 }, buildings: [at("fishing-dock", 1, 2)] });
    const paused = apply(s, calm, { type: "pause", x: 1, y: 2, paused: true });
    expect(buildingWorkers(paused, calm)).toEqual([0]);
    expect(buildingWorkers(apply(paused, calm, { type: "pause", x: 1, y: 2, paused: false }), calm)).toEqual([3]);

    // A dock on a bank nobody can walk to gets nobody.
    const cut = mapFrom([
      "...P..~..",
      "......~..",
    ]);
    const far = withState({ map: cut, villagers: 5, legacyReach: false, buildings: [at("fishing-dock", 7, 0)] });
    expect(buildingWorkers(far, calm)).toEqual([0]);

    // Clearing borrows from the dock before the Woodcutter Camp.
    expect(content.rules.clearing.borrow.order[0]).toBe("fishing-dock");
    const busy = withState({
      map: mapFrom(["TTTTTTT", "~.....T", "~..P..T", "~.....T", "TTTTTTT"]),
      villagers: 5,
      resources: { rice: 500, wood: 0, gold: 0 },
      buildings: [at("woodcutter-camp", 5, 1), at("fishing-dock", 1, 2)],
    });
    const queued = apply(busy, calm, { type: "clearArea", tiles: [{ x: 6, y: 2 }] });
    expect(workforce(queued, calm).borrowed).toEqual([0, 1]);
  });
});

describe("Kamalig and the rice cap", () => {
  it("has the numbers from docs/game-design.md (storage retuned by the balance pass)", () => {
    expect(kamalig.cost).toEqual({ wood: 30 });
    expect(kamalig.storage!.rice).toBeGreaterThan(100);
    expect(kamalig.unlock.villagers).toBe(10);
  });

  it("raises the cap by its storage each (not while damaged)", () => {
    const each = kamalig.storage!.rice!;
    expect(riceCap(withState({ buildings: [] }), content)).toBe(base);
    expect(riceCap(withState({ buildings: [at("kamalig", 2, 2), at("kamalig", 3, 2)] }), content)).toBe(base + 2 * each);
    expect(riceCap(withState({ buildings: [{ ...at("kamalig", 2, 2), damaged: true }] }), content)).toBe(base);
  });

  it("stops production and gathering at the cap", () => {
    const fields = [at("palayan", 1, 1), at("palayan", 1, 3), at("bahay-kubo", 5, 3)];
    const s = withState({ villagers: 4, resources: { rice: base - 1, wood: 0, gold: 0 }, buildings: fields });
    expect(tick(s, calm, 30).resources.rice).toBe(base);
    const full = { ...s, resources: { ...s.resources, rice: base } };
    expect(apply(full, calm, { type: "gather", resource: "rice" })).toBe(full);
    // With a Kamalig there's room for more.
    const roomy = withState({ villagers: 4, resources: { rice: base, wood: 0, gold: 0 }, buildings: [...fields, at("kamalig", 3, 3)] });
    expect(tick(roomy, calm, 10).resources.rice).toBeGreaterThan(base);
  });

  it("never throws away rice already stored above the cap", () => {
    // A trade or a reward can bring more than the cap: it's kept, it just doesn't grow.
    const s = withState({ villagers: 2, resources: { rice: base + 50, wood: 0, gold: 0 }, buildings: [at("palayan", 1, 1), at("palayan", 1, 3)] });
    const later = tick(s, calm, 10);
    expect(later.resources.rice).toBeLessThanOrEqual(base + 50);
    expect(later.resources.rice).toBeGreaterThan(base);
  });

  it("is respected offline too", () => {
    const s = withState({ villagers: 4, resources: { rice: base - 20, wood: 0, gold: 0 }, buildings: [at("palayan", 1, 1), at("palayan", 1, 3), at("bahay-kubo", 5, 3)] });
    const { state, report } = offlineProgress(s, calm, 3600);
    expect(state.resources.rice).toBeLessThanOrEqual(base);
    expect(report.produced.rice - report.eaten).toBeLessThanOrEqual(20 + 1e-6);
  });
});

describe("happiness", () => {
  const plain = (patch: Partial<GameState> = {}) => withState({ buildings: [], villagers: 5, resources: { rice: 100, wood: 0, gold: 0 }, ...patch });

  it("starts at 60, the level that changes nothing", () => {
    expect(h.start).toBe(60);
    const s = plain();
    expect(s.happiness).toBe(60);
    expect(happinessMultiplier(s, content)).toBe(1);
  });

  it("changes production by at most ±10%", () => {
    expect(h.maxEffectPercent).toBe(10);
    expect(happinessMultiplier(plain({ happiness: 100 }), content)).toBeCloseTo(1.1);
    expect(happinessMultiplier(plain({ happiness: 0 }), content)).toBeCloseTo(0.9);
    expect(happinessMultiplier(plain({ happiness: 80 }), content)).toBeCloseTo(1.05);
    const field = [at("palayan", 1, 1)];
    const at100 = rates(plain({ villagers: 2, buildings: field, happiness: 100 }), calm).produced.rice;
    const at60 = rates(plain({ villagers: 2, buildings: field, happiness: 60 }), calm).produced.rice;
    expect(at100 / at60).toBeCloseTo(1.1);
  });

  it("rises with houses near the plaza, slowly", () => {
    // Plaza at (5, 4): two houses beside it, one far away.
    const s = plain({ buildings: [at("bahay-kubo", 5, 3), at("bahay-kubo", 4, 4), at("bahay-kubo", 1, 8)] });
    expect(housesNearPlaza(s, content)).toBe(2);
    expect(happinessTarget(s, content).target).toBe(h.start + 2 * h.perHouseNearPlaza);
    expect(nextHappiness(s, content, 1)).toBeCloseTo(h.start + h.pointsPerSecond);
    expect(tick(s, calm, 120).happiness).toBe(h.start + 2 * h.perHouseNearPlaza);
  });

  it("caps what houses can add", () => {
    const ring = [at("bahay-kubo", 4, 3), at("bahay-kubo", 5, 3), at("bahay-kubo", 6, 3), at("bahay-kubo", 4, 5), at("bahay-kubo", 5, 5), at("bahay-kubo", 6, 5), at("bahay-kubo", 4, 4), at("bahay-kubo", 6, 4)];
    expect(happinessTarget(plain({ buildings: ring }), content).houses).toBe(h.maxFromHouses);
  });

  it("falls with hunger and sickness", () => {
    expect(happinessTarget(plain({ resources: { rice: 0, wood: 0, gold: 0 } }), content).target).toBe(h.start + h.hungry);
    expect(happinessTarget(plain({ sick: [10, 10] }), content).target).toBe(h.start + 2 * h.perSick);
    expect(happinessTarget(plain({ sick: Array(5).fill(10), villagers: 5 }), content).sickness).toBe(Math.max(h.maxFromSick, 5 * h.perSick));
    const hungry = tick(plain({ resources: { rice: 0, wood: 0, gold: 0 } }), calm, 20);
    expect(hungry.happiness).toBeLessThan(h.start);
  });

  it("stays within 0–100", () => {
    const sad = plain({ resources: { rice: 0, wood: 0, gold: 0 }, sick: [99, 99, 99, 99, 99], happiness: 1 });
    expect(tick(sad, calm, 60).happiness).toBeGreaterThanOrEqual(0);
  });
});
