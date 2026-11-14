// The Bahay ng Datu's footprint (one tile, then 2 × 2 from level 3), old saves that keep the
// one-tile house, and the gathering spots around it.
import { describe, expect, it } from "vitest";
import { doorOf, hasEntrance, solidTiles, walkReach } from "./doors";
import { apply, type GameState } from "./game";
import { canPlace, canPlaceRoad, tileAt } from "./map";
import { canReplant } from "./forest";
import { gatheringSpots, gatherSpot, houseFootprint, houseFront, inHouse, isBigHouse, isGrandfatheredHouse, isReserved, reservedTiles } from "./plaza";
import { parseSave } from "./save";
import { at, content, withState } from "./testUtils";

const rules = content.rules.plaza;
const kubo = content.buildings.find((b) => b.id === "bahay-kubo")!;
// TEST_MAP: plaza at (5, 4); the big house takes (5..6, 3..4).
const P = { x: 5, y: 4 };
const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
const big = (patch: Partial<GameState> = {}) => withState({ datuLevel: rules.bigFromLevel, villagers: 6, buildings: [at("bahay-kubo", 2, 2), at("palayan", 8, 7)], ...patch });

describe("the Bahay ng Datu's footprint", () => {
  it("is the plaza tile up to level 2, then bigWidth × bigHeight with the plaza as its front-left corner", () => {
    expect(houseFootprint(withState({ datuLevel: 1 }), content)).toEqual([P]);
    expect(houseFootprint(withState({ datuLevel: rules.bigFromLevel - 1 }), content)).toEqual([P]);
    const fp = houseFootprint(big(), content).map(key).sort();
    expect(fp).toHaveLength(rules.bigWidth * rules.bigHeight);
    expect(fp).toEqual(["5,3", "5,4", "6,3", "6,4"]);
    expect(isBigHouse(big(), content)).toBe(true);
    expect(inHouse(big(), content, 6, 3)).toBe(true);
    expect(inHouse(withState({ datuLevel: 1 }), content, 6, 3)).toBe(false);
  });

  it("is solid: every footprint tile is blocked, and nobody's doorway", () => {
    const s = big({ buildings: [at("bahay-kubo", 4, 4), at("bahay-kubo", 7, 3)] });
    const solid = solidTiles(s, content);
    for (const p of houseFootprint(s, content)) expect(solid[p.y * s.map.width + p.x]).toBe(1);
    for (const b of s.buildings) expect(inHouse(s, content, doorOf(s, content, b).x, doorOf(s, content, b).y)).toBe(false);
    // The walk still reaches all around the house (the plaza is where every way starts).
    const reach = walkReach(s, content);
    expect(reach[5 * s.map.width + 6]).toBe(1); // in front of the house's right side
    expect(reach[2 * s.map.width + 6]).toBe(1); // behind it
  });

  it("has its entrance on the footprint's front edge", () => {
    const front = houseFront(big(), content);
    expect(front.y).toBeGreaterThan(P.y + 1);
    expect(front.y).toBeLessThan(P.y + 2);
    expect(front.x).toBeCloseTo(P.x + rules.bigWidth / 2);
    expect(inHouse(big(), content, Math.floor(front.x), Math.floor(front.y))).toBe(false);
  });

  it("keeps the big house's tiles free from reserveFromLevel: no building, Daan or replanting there", () => {
    // Before that they are ordinary land (the first minutes keep all their building land); the plaza never is.
    const early = withState({ datuLevel: rules.reserveFromLevel - 1, resources: { rice: 500, wood: 500, gold: 0 } });
    expect(isReserved(early, content, P.x, P.y)).toBe(true);
    expect(canPlace(early, content, kubo, 6, 3)).toBe(true);
    const s = withState({ datuLevel: rules.reserveFromLevel, resources: { rice: 500, wood: 500, gold: 0 } });
    for (const p of reservedTiles(s.map, content)) {
      expect(isReserved(s, content, p.x, p.y)).toBe(true);
      expect(canPlace(s, content, kubo, p.x, p.y)).toBe(false);
      expect(canPlaceRoad(s, content, p.x, p.y)).toBe(false);
      expect(canReplant(s, content, p.x, p.y)).toBe(false);
    }
    expect(apply(s, content, { type: "build", building: "bahay-kubo", x: 6, y: 3 })).toBe(s);
    // Next to them is fine.
    expect(canPlace(s, content, kubo, 7, 3)).toBe(true);
    expect(tileAt(apply(s, content, { type: "road", tiles: [{ x: 7, y: 4 }] }).map, 7, 4)).toBe("daan");
  });
});

describe("old saves with buildings where the big house would stand", () => {
  const old = () => withState({ datuLevel: 4, villagers: 6, buildings: [at("bahay-kubo", 6, 4), at("palayan", 5, 3), at("bahay-kubo", 2, 2)] });

  it("keep the one-tile house (grandfathered), and those buildings keep working", () => {
    const s = old();
    expect(isBigHouse(s, content)).toBe(false);
    expect(isGrandfatheredHouse(s, content)).toBe(true);
    expect(houseFootprint(s, content)).toEqual([P]);
    for (const b of s.buildings) expect(hasEntrance(s, content, b)).toBe(true);
  });

  it("still load, with every building where it was", () => {
    const save = { ...old(), version: 25 };
    const loaded = parseSave(JSON.stringify(save), content)!;
    expect(loaded).not.toBeNull();
    expect(loaded.datuLevel).toBe(4);
    expect(loaded.buildings.map((b) => `${b.type}@${b.x},${b.y}`).sort()).toEqual(["bahay-kubo@2,2", "bahay-kubo@6,4", "palayan@5,3"]);
    expect(houseFootprint(loaded, content)).toEqual([P]);
    for (const b of loaded.buildings) expect(hasEntrance(loaded, content, b)).toBe(true);
  });

  it("the house grows to its big footprint once the tiles are free", () => {
    const s = old();
    const cleared = { ...s, buildings: s.buildings.filter((b) => !isReserved(s, content, b.x, b.y)) };
    expect(isBigHouse(cleared, content)).toBe(true);
  });
});

describe("gathering spots at the Bahay ng Datu", () => {
  const check = (s: GameState) => {
    const { spots, waiting } = gatheringSpots(s, content);
    const reach = walkReach(s, content);
    const solid = solidTiles(s, content);
    const fp = houseFootprint(s, content);
    const x0 = Math.min(...fp.map((p) => p.x));
    const x1 = Math.max(...fp.map((p) => p.x));
    const y0 = Math.min(...fp.map((p) => p.y));
    const y1 = Math.max(...fp.map((p) => p.y));
    const ring = (p: { x: number; y: number }) => Math.max(x0 - Math.floor(p.x), Math.floor(p.x) - x1, y0 - Math.floor(p.y), Math.floor(p.y) - y1);
    expect(spots.length).toBeGreaterThan(0);
    expect(spots.length).toBeLessThanOrEqual(rules.gatherMax);
    for (const p of [...spots, ...waiting]) {
      const j = Math.floor(p.y) * s.map.width + Math.floor(p.x);
      // A walkable plaza tile: reachable on foot, not under the house or any building.
      expect(reach[j]).toBe(1);
      expect(solid[j]).toBe(0);
      expect(inHouse(s, content, Math.floor(p.x), Math.floor(p.y))).toBe(false);
      expect(["cleared", "daan", "bridge"]).toContain(tileAt(s.map, Math.floor(p.x), Math.floor(p.y)));
    }
    for (const p of spots) expect(ring(p)).toBe(1);
    for (const p of waiting) expect(ring(p)).toBeGreaterThanOrEqual(1);
    // Spread out: no two people on one spot.
    expect(new Set([...spots, ...waiting].map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)).size).toBe(spots.length + waiting.length);
    return { spots, waiting };
  };

  it("are open, walkable tiles around the one-tile and the big house, never on them", () => {
    check(withState({ datuLevel: 1 }));
    check(big());
    // With buildings close by, those tiles are skipped.
    check(big({ buildings: [at("bahay-kubo", 4, 4), at("bahay-kubo", 4, 5), at("bahay-kubo", 7, 5)] }));
    check(withState({ datuLevel: 4, buildings: [at("bahay-kubo", 6, 4), at("palayan", 5, 3)] }));
  });

  it("hold at most gatherMax at once; the rest wait one ring out", () => {
    const g = check(big());
    const first = Array.from({ length: rules.gatherMax }, (_, n) => gatherSpot(g, n, rules.gatherMax)!);
    for (const p of first) expect(g.spots).toContainEqual(p);
    const extra = gatherSpot(g, rules.gatherMax + 3, rules.gatherMax)!;
    expect(g.waiting).toContainEqual(extra);
  });
});
