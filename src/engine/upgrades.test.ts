// Kamalig upgrades and the rice store.
import { describe, expect, it } from "vitest";
import { apply, type GameState } from "./game";
import { parseSave } from "./save";
import { riceCap, riceFull } from "./storage";
import { levelOf, nextUpgrade, storageAt, upgradeBlocker } from "./upgrades";
import { at, content, withState } from "./testUtils";

const kamalig = content.buildings.find((b) => b.id === "kamalig")!;
const base = content.rules.storage.baseRice;
const withKamalig = (patch: Partial<GameState> & { resources?: Record<string, number> } = {}) =>
  withState({ buildings: [at("bahay-kubo", 5, 3), at("kamalig", 3, 3)], resources: { wood: 1000, gold: 500 }, ...patch } as Parameters<typeof withState>[0]);

describe("Kamalig upgrades", () => {
  it("has levels 1 to 3, each holding more, costing wood and gold", () => {
    expect(kamalig.upgrades?.map((u) => u.level)).toEqual([2, 3]);
    let last = storageAt(kamalig, 1).rice!;
    for (const u of kamalig.upgrades!) {
      expect(u.storage!.rice!).toBeGreaterThan(last);
      last = u.storage!.rice!;
      expect(u.cost.wood).toBeGreaterThan(0);
      expect(u.cost.gold).toBeGreaterThan(0);
    }
  });

  it("raising one pays its cost, keeps it in place and raises the cap", () => {
    const s = withKamalig();
    expect(riceCap(s, content)).toBe(base + storageAt(kamalig, 1).rice!);
    const up = apply(s, content, { type: "upgradeBuilding", x: 3, y: 3 });
    const k = up.buildings.find((b) => b.type === "kamalig")!;
    expect(levelOf(k)).toBe(2);
    expect({ x: k.x, y: k.y }).toEqual({ x: 3, y: 3 });
    expect(up.resources.wood).toBe(1000 - kamalig.upgrades![0].cost.wood!);
    expect(up.resources.gold).toBe(500 - kamalig.upgrades![0].cost.gold!);
    expect(riceCap(up, content)).toBe(base + kamalig.upgrades![0].storage!.rice!);
    const top = apply(up, content, { type: "upgradeBuilding", x: 3, y: 3 });
    expect(levelOf(top.buildings.find((b) => b.type === "kamalig")!)).toBe(3);
    // No level 4.
    expect(upgradeBlocker(top, content, 3, 3)).toBe("top");
    expect(apply(top, content, { type: "upgradeBuilding", x: 3, y: 3 })).toBe(top);
  });

  it("is refused without the goods, on a damaged Kamalig, or on a building without upgrades", () => {
    const poor = withKamalig({ resources: { wood: 0, gold: 0 } } as Partial<GameState>);
    expect(apply(poor, content, { type: "upgradeBuilding", x: 3, y: 3 })).toBe(poor);
    const damaged = withState({ buildings: [at("bahay-kubo", 5, 3), { ...at("kamalig", 3, 3), damaged: true }], resources: { wood: 1000, gold: 500 } });
    expect(upgradeBlocker(damaged, content, 3, 3)).toBe("damaged");
    const house = withKamalig();
    expect(apply(house, content, { type: "upgradeBuilding", x: 5, y: 3 })).toBe(house);
  });

  it("a damaged Kamalig stores nothing until repaired, and keeps its level", () => {
    const s = withState({ buildings: [at("bahay-kubo", 5, 3), { ...at("kamalig", 3, 3), level: 3, damaged: true }] });
    expect(riceCap(s, content)).toBe(base);
    const fixed = apply({ ...s, resources: { ...s.resources, wood: 100 } }, content, { type: "repair", x: 3, y: 3 });
    expect(riceCap(fixed, content)).toBe(base + storageAt(kamalig, 3).rice!);
  });

  it("the level survives a save; old saves load at level 1; levels above the top are trimmed", () => {
    const s = withState({ buildings: [at("bahay-kubo", 5, 3), { ...at("kamalig", 3, 3), level: 2 }] });
    expect(parseSave(JSON.stringify(s), content)!.buildings.find((b) => b.type === "kamalig")!.level).toBe(2);
    const old = JSON.parse(JSON.stringify({ ...withKamalig(), version: 24 }));
    const back = parseSave(JSON.stringify(old), content)!;
    expect(levelOf(back.buildings.find((b) => b.type === "kamalig")!)).toBe(1);
    expect(nextUpgrade(content, back.buildings.find((b) => b.type === "kamalig")!)?.level).toBe(2);
    const odd = JSON.parse(JSON.stringify(s));
    odd.buildings[1].level = 9;
    expect(parseSave(JSON.stringify(odd), content)!.buildings[1].level).toBe(3);
  });

  it("the store is full at the cap", () => {
    const s = withKamalig();
    expect(riceFull({ ...s, resources: { ...s.resources, rice: riceCap(s, content) } }, content)).toBe(true);
    expect(riceFull({ ...s, resources: { ...s.resources, rice: riceCap(s, content) - 1 } }, content)).toBe(false);
  });
});
