// The clearing beside the Bahay ng Datu (plaza.ts): an irregular patch of open tiles in front of
// the house, with the fire pit in it, never built on; gatherings stand there first; new maps
// start with it open, and old saves get it without anything moving.
import { describe, expect, it } from "vitest";
import { solidTiles, walkReach } from "./doors";
import { apply, newGame, tick, type GameState } from "./game";
import { canPlace, canPlaceRoad, isConnected, setTiles, tileAt, type MapState } from "./map";
import { canReplant } from "./forest";
import { clearingShape, clearingTiles, firePit, gatheringSpots, houseFootprint, inHouse, isReserved } from "./plaza";
import { parseSave } from "./save";
import { at, content, TEST_MAP, withState } from "./testUtils";
import { generateVillage } from "./village";

const rules = content.rules.plaza;
const kubo = content.buildings.find((b) => b.id === "bahay-kubo")!;
const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
// TEST_MAP (plaza at (5, 4)) with its clearing, as a new map would have it.
const MAP: MapState = { ...TEST_MAP, gathering: clearingShape(TEST_MAP, content) };
const withClearing = (patch: Partial<GameState> = {}) => withState({ map: MAP, buildings: [at("bahay-kubo", 2, 2)], ...patch });

/** Are the tiles one patch (joined edge to edge)? */
function joined(tiles: { x: number; y: number }[]): boolean {
  const left = new Set(tiles.map(key));
  const queue = [tiles[0]];
  left.delete(key(tiles[0]));
  while (queue.length) {
    const p = queue.pop()!;
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const k = `${p.x + dx},${p.y + dy}`;
      if (left.delete(k)) queue.push({ x: p.x + dx, y: p.y + dy });
    }
  }
  return left.size === 0;
}

describe("the clearing's shape", () => {
  const seeds = Array.from({ length: 24 }, (_, i) => i * 7919 + 1);

  it.each(seeds)("seed %i: clearingMin..clearingMax joined tiles in front of the house, its doorway onto it, not a square", (seed) => {
    const map = newGame(content, seed).map;
    const c = map.gathering!;
    expect(c.length).toBeGreaterThanOrEqual(rules.clearingMin);
    expect(c.length).toBeLessThanOrEqual(rules.clearingMax);
    expect(joined(c)).toBe(true);
    // The doorway (the tile right in front of the house) opens onto it.
    expect(c).toContainEqual({ x: map.plaza.x, y: map.plaza.y + 1 });
    // Never on the house's tiles, now or once it grows.
    for (const p of c) expect(p.y).toBeGreaterThanOrEqual(map.plaza.y);
    for (const p of c) expect(p.x === map.plaza.x && p.y === map.plaza.y).toBe(false);
    // Irregular: it doesn't fill the box around it.
    const w = Math.max(...c.map((p) => p.x)) - Math.min(...c.map((p) => p.x)) + 1;
    const h = Math.max(...c.map((p) => p.y)) - Math.min(...c.map((p) => p.y)) + 1;
    if (w > 1 && h > 1) expect(c.length).toBeLessThan(w * h);
    // A new game starts with all of it open and cleared.
    for (const p of c) expect(tileAt(map, p.x, p.y)).toBe("cleared");
  });

  it("differs from barangay to barangay, and is the same for the same seed", () => {
    const maps = seeds.slice(0, 10).map((s) => newGame(content, s).map);
    const shapes = new Set(maps.map((m) => m.gathering!.map((p) => `${p.x - m.plaza.x},${p.y - m.plaza.y}`).sort().join(";")));
    expect(shapes.size).toBeGreaterThan(4);
    expect(newGame(content, seeds[0]).map.gathering).toEqual(maps[0].gathering);
  });
});

describe("the clearing on the map", () => {
  it("is walkable and nothing can be built, paved or replanted on it", () => {
    const s = withClearing({ datuLevel: 1, resources: { rice: 500, wood: 500, gold: 0 } });
    const reach = walkReach(s, content);
    const solid = solidTiles(s, content);
    for (const p of MAP.gathering!) {
      expect(isReserved(s, content, p.x, p.y)).toBe(true);
      expect(canPlace(s, content, kubo, p.x, p.y)).toBe(false);
      expect(canPlaceRoad(s, content, p.x, p.y)).toBe(false);
      expect(canReplant(s, content, p.x, p.y)).toBe(false);
      expect(reach[p.y * s.map.width + p.x]).toBe(1);
      expect(solid[p.y * s.map.width + p.x]).toBe(0);
      expect(apply(s, content, { type: "build", building: "bahay-kubo", x: p.x, y: p.y }).buildings).toEqual(s.buildings);
    }
  });

  it("has the fire pit on it, beside the house and not in its doorway", () => {
    for (const level of [1, rules.bigFromLevel]) {
      const s = withClearing({ datuLevel: level });
      const f = firePit(s, content);
      const tile = { x: Math.floor(f.x), y: Math.floor(f.y) };
      expect(MAP.gathering!).toContainEqual(tile);
      expect(inHouse(s, content, tile.x, tile.y)).toBe(false);
    }
  });

  it("is where gatherings stand first, spread out, never on the house", () => {
    const s = withClearing({ datuLevel: rules.bigFromLevel, villagers: 30 });
    const { spots } = gatheringSpots(s, content);
    const open = new Set(clearingTiles(s, content).map(key));
    // The first spots are all on the clearing (it holds spotsPerTile a tile, away from the fire).
    const first = spots.slice(0, open.size);
    for (const p of first) expect(open.has(key({ x: Math.floor(p.x), y: Math.floor(p.y) }))).toBe(true);
    for (const p of spots) expect(inHouse(s, content, Math.floor(p.x), Math.floor(p.y))).toBe(false);
    expect(new Set(spots.map((p) => `${p.x},${p.y}`)).size).toBe(spots.length);
  });

  it("joins paths: a Daan starting at the clearing connects a workplace, but standing beside the clearing alone doesn't", () => {
    // A field two tiles out from the clearing's edge, with a Daan between them.
    const edge = MAP.gathering!.find((p) => !MAP.gathering!.some((q) => q.x === p.x && q.y === p.y + 1))!;
    const road = { x: edge.x, y: edge.y + 1 };
    const map = setTiles(MAP, [{ ...road, tile: "daan" }]);
    expect(isConnected(map, road.x + 1, road.y)).toBe(true);
    // Right beside the clearing, no Daan: not connected.
    const beside = MAP.gathering!.find((p) => tileAt(MAP, p.x - 1, p.y) === "cleared" && !MAP.gathering!.some((q) => q.x === p.x - 1 && q.y === p.y))!;
    expect(isConnected(MAP, beside.x - 1, beside.y)).toBe(false);
  });

  it("is in AI barangays too, kept free of their buildings", () => {
    const n = newGame(content, 5).region!.neighbors[0];
    const v = generateVillage(content, n, content.neighbors.find((d) => d.id === n.id)!, 0);
    expect(v.map.gathering!.length).toBeGreaterThanOrEqual(rules.clearingMin);
    for (const p of v.map.gathering!) expect(v.buildings.some((b) => b.x === p.x && b.y === p.y)).toBe(false);
    expect(clearingTiles(v, content).length).toBe(v.map.gathering!.length);
  });
});

describe("old saves (before v28)", () => {
  /** An old save: the state as it was saved, without the clearing. */
  const old = (s: GameState) => {
    const { gathering: _, ...map } = s.map;
    return JSON.stringify({ ...s, version: 27, map });
  };

  it("get the clearing in front of the house, moving nothing", () => {
    const s = newGame(content, 3);
    const loaded = parseSave(old(s), content)!;
    expect(loaded.map.gathering).toEqual(s.map.gathering);
    expect(loaded.buildings).toEqual(s.buildings);
  });

  it("leave out the tiles already built on: the clearing is the open tiles that remain", () => {
    const g = newGame(content, 3);
    const taken = g.map.gathering![g.map.gathering!.length - 1];
    const s: GameState = { ...g, buildings: [...g.buildings, { type: "bahay-kubo", x: taken.x, y: taken.y }] };
    const loaded = parseSave(old(s), content)!;
    expect(loaded.buildings).toContainEqual(expect.objectContaining({ type: "bahay-kubo", x: taken.x, y: taken.y }));
    expect(loaded.map.gathering).not.toContainEqual(taken);
    expect(loaded.map.gathering!.length).toBe(g.map.gathering!.length - 1);
    // Still a valid clearing: no building on it, nothing under the house.
    for (const p of clearingTiles(loaded, content)) expect(houseFootprint(loaded, content)).not.toContainEqual(p);
  });

  it("round-trip with the clearing kept as saved", () => {
    const s = newGame(content, 11);
    expect(parseSave(JSON.stringify(s), content)!.map.gathering).toEqual(s.map.gathering);
  });
});

describe("the Aklat entry on how settlements were laid out", () => {
  it("opens when the player visits the Bahay ng Datu", () => {
    const s = withClearing({ aklat: [] });
    const entry = content.lore["settlement-layout"];
    expect(entry.reviewed).toBe(false);
    expect(entry.sources.length).toBeGreaterThan(0);
    expect(tick(s, content, 1).aklat).not.toContain(entry.id);
    // A command, so it's saved and replayable; the book opens on the next tick.
    const after = tick(apply(s, content, { type: "visitHouse" }), content, 1);
    expect(after.aklat).toContain(entry.id);
  });
});
