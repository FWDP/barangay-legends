// The barangay map: terrain, where buildings may go, and adjacency bonuses.
// Pure and deterministic, like the rest of the engine.
import type { BuildingDef, Content } from "./content";
import type { GameState, PlacedBuilding } from "./game";

/**
 * Columns, left to right: river | land | forest. Rows are counted from the plaza row (y = 0)
 * and run from -radius to +radius. The plaza sits in the middle of the land.
 */
export type Terrain = "river" | "forest" | "land" | "plaza";

export interface Tile {
  x: number;
  y: number;
}

/** Orthogonal neighbours: "next to" means sharing an edge. */
const NEIGHBOURS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

export function plazaTile(content: Content): Tile {
  const { width, riverColumns, forestColumns } = content.rules.map;
  return { x: riverColumns + Math.floor((width - riverColumns - forestColumns) / 2), y: 0 };
}

/** Terrain at a column, or null outside the map's columns. Rows are unbounded (see mapRadius). */
export function terrainAt(content: Content, x: number, y: number): Terrain | null {
  const { width, riverColumns, forestColumns } = content.rules.map;
  if (x < 0 || x >= width) return null;
  if (x < riverColumns) return "river";
  if (x >= width - forestColumns) return "forest";
  const plaza = plazaTile(content);
  return x === plaza.x && y === plaza.y ? "plaza" : "land";
}

/**
 * The map spans rows -radius..radius. It always keeps one empty row beyond the outermost
 * building, so building on the edge grows the map and there is always free land.
 */
export function mapRadius(state: GameState, content: Content): number {
  return state.buildings.reduce((r, b) => Math.max(r, Math.abs(b.y) + 1), content.rules.map.minRadius);
}

const tileKey = (x: number, y: number) => `${x},${y}`;

/** Building type by tile, for quick neighbour lookups. */
export function occupancy(state: GameState): Map<string, string> {
  return new Map(state.buildings.map((b) => [tileKey(b.x, b.y), b.type]));
}

export function buildingAt(state: GameState, x: number, y: number): PlacedBuilding | undefined {
  return state.buildings.find((b) => b.x === x && b.y === y);
}

/** A building can go on any empty land tile inside the map. */
export function canPlace(state: GameState, content: Content, x: number, y: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (Math.abs(y) > mapRadius(state, content)) return false;
  if (terrainAt(content, x, y) !== "land") return false;
  return !buildingAt(state, x, y);
}

export function validTiles(state: GameState, content: Content): Tile[] {
  const radius = mapRadius(state, content);
  const taken = occupancy(state);
  const tiles: Tile[] = [];
  for (let y = -radius; y <= radius; y++) {
    for (let x = 0; x < content.rules.map.width; x++) {
      if (terrainAt(content, x, y) === "land" && !taken.has(tileKey(x, y))) tiles.push({ x, y });
    }
  }
  return tiles;
}

/**
 * The adjacency bonus (0.1 = +10%) a building of this type gets at (x, y), given what is
 * around it. Works for preview tiles too: the building itself need not be placed yet.
 */
export function adjacencyBonusAt(
  content: Content,
  taken: Map<string, string>,
  def: BuildingDef,
  x: number,
  y: number,
): number {
  const bonus = def.adjacencyBonus;
  if (!bonus) return 0;
  const matches = NEIGHBOURS.some(([dx, dy]) => {
    const nx = x + dx;
    const ny = y + dy;
    const terrain = terrainAt(content, nx, ny);
    if (terrain && bonus.nextTo.includes(terrain)) return true;
    const neighbour = taken.get(tileKey(nx, ny));
    return neighbour !== undefined && bonus.nextTo.includes(neighbour);
  });
  return matches ? bonus.percent / 100 : 0;
}

export function bonusAt(state: GameState, content: Content, def: BuildingDef, x: number, y: number): number {
  return adjacencyBonusAt(content, occupancy(state), def, x, y);
}

/** Bonus for every placed building, in the same order as state.buildings. */
export function buildingBonuses(state: GameState, content: Content): number[] {
  const taken = occupancy(state);
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  return state.buildings.map((b) => {
    const def = defs.get(b.type);
    return def ? adjacencyBonusAt(content, taken, def, b.x, b.y) : 0;
  });
}

/**
 * Picks a tile for a building without asking the player (new games and old saves).
 * Best bonus first, then nearest the plaza, then top-to-bottom, left-to-right.
 */
export function autoPlaceTile(state: GameState, content: Content, def: BuildingDef): Tile {
  const plaza = plazaTile(content);
  const taken = occupancy(state);
  const dist = (t: Tile) => (t.x - plaza.x) ** 2 + (t.y - plaza.y) ** 2;
  const scored = validTiles(state, content).map((t) => ({
    t,
    bonus: adjacencyBonusAt(content, taken, def, t.x, t.y),
    dist: dist(t),
  }));
  scored.sort((a, b) => b.bonus - a.bonus || a.dist - b.dist || a.t.y - b.t.y || a.t.x - b.t.x);
  return scored[0].t; // mapRadius guarantees an empty outer row, so this is never empty
}
