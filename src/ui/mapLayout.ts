// Turns the engine's map (terrain + placed buildings) into cells to draw, and fills the rest
// of the screen with scenery. Pure and deterministic: no Math.random().
import type { BuildingDef, Content } from "../engine/content";
import type { GameState } from "../engine/game";
import { buildingBonuses, mapRadius, terrainAt } from "../engine/map";

/** "wild" is land outside the map (not buildable yet): beyond its rows, or left of the river. */
export type Ground = "river" | "forest" | "land" | "wild";
export type Decor = "tree" | "palm" | "sprout" | null;

export interface MapCell {
  /** Stable id from the tile position, e.g. "-2:5" (row:column). */
  key: string;
  x: number;
  y: number;
  ground: Ground;
  plaza: boolean;
  building: {
    def: BuildingDef;
    key: string;
    bonus: number;
    damaged: boolean;
    burning: boolean;
    /** e.g. "5 wood". */
    repairText: string;
  } | null;
  decor: Decor;
}

export interface MapLayout {
  cols: number;
  rows: number;
  cells: MapCell[];
}

/** Small integer hash so scenery is varied but identical on every reload. */
function hash(y: number, x: number): number {
  let h = Math.imul(y + 1000, 374761393) ^ Math.imul(x + 7, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % 100;
}

/** Trees only grow in forest and wild land, so a lone tree is never mistaken for the forest. */
function scenery(ground: Ground, y: number, x: number): Decor {
  const h = hash(y, x);
  switch (ground) {
    case "forest":
      return h < 65 ? "tree" : "palm";
    case "wild":
      return h < 12 ? "palm" : h < 26 ? "tree" : h < 38 ? "sprout" : null;
    case "land":
      return h < 12 ? "sprout" : null;
    case "river":
      return null;
  }
}

export const buildingKey = (b: { type: string; x: number; y: number }) => `${b.type}@${b.x},${b.y}`;

function groundAt(content: Content, x: number, y: number, radius: number): { ground: Ground; plaza: boolean } {
  const terrain = terrainAt(content, x, y);
  if (terrain === null) return { ground: x < 0 ? "wild" : "forest", plaza: false };
  if (terrain === "river" || terrain === "forest") return { ground: terrain, plaza: false };
  if (Math.abs(y) > radius) return { ground: "wild", plaza: false };
  return { ground: "land", plaza: terrain === "plaza" };
}

function makeCell(content: Content, x: number, y: number, radius: number): MapCell {
  const { ground, plaza } = groundAt(content, x, y, radius);
  return { key: `${y}:${x}`, x, y, ground, plaza, building: null, decor: plaza ? null : scenery(ground, y, x) };
}

/** The map itself: every column, rows -radius..radius, with buildings where the player put them. */
export function layoutMap(state: GameState, content: Content): MapLayout {
  const radius = mapRadius(state, content);
  const { width } = content.rules.map;
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  const bonuses = buildingBonuses(state, content);
  const placed = new Map<string, MapCell["building"]>();
  state.buildings.forEach((b, i) => {
    const def = defs.get(b.type);
    if (!def) return;
    const repair = Object.entries(def.repairCost).map(([r, n]) => `${n} ${r}`).join(", ");
    placed.set(`${b.y}:${b.x}`, {
      def,
      key: buildingKey(b),
      bonus: bonuses[i],
      damaged: b.damaged === true,
      burning: b.burningSince !== undefined,
      repairText: repair || "free",
    });
  });

  const cells: MapCell[] = [];
  for (let y = -radius; y <= radius; y++) {
    for (let x = 0; x < width; x++) {
      const cell = makeCell(content, x, y, radius);
      const building = placed.get(cell.key);
      cells.push(building ? { ...cell, building, decor: null } : cell);
    }
  }
  return { cols: width, rows: 2 * radius + 1, cells };
}

export interface MapView extends MapLayout {
  /** Tile size in px. */
  tile: number;
}

/**
 * Picks a tile size so the whole map fits in a width × height area (up to `maxTile`), then
 * surrounds it with wild land on the left and forest on the right, and lets the river and
 * forest run on above and below, so the map fills the area. `reserveTop` px at the top are kept
 * clear of the map itself (for banners); the caller shifts the grid down by reserveTop / 2.
 */
export function fillView(
  layout: MapLayout,
  content: Content,
  width: number,
  height: number,
  maxTile = 64,
  reserveTop = 0,
): MapView {
  const fitHeight = Math.max(0, height - reserveTop);
  const tile = Math.max(16, Math.min(maxTile, Math.floor(Math.min(width / layout.cols, fitHeight / layout.rows))));
  const extraCols = Math.max(0, Math.ceil((width / tile - layout.cols) / 2));
  // Shifted down by reserveTop / 2, so cover that much extra on each side.
  const extraRows = Math.max(0, Math.ceil(((height + reserveTop) / tile - layout.rows) / 2));
  const radius = (layout.rows - 1) / 2;
  const inner = new Map(layout.cells.map((c) => [c.key, c]));

  const cells: MapCell[] = [];
  for (let y = -radius - extraRows; y <= radius + extraRows; y++) {
    for (let x = -extraCols; x < layout.cols + extraCols; x++) {
      cells.push(inner.get(`${y}:${x}`) ?? makeCell(content, x, y, radius));
    }
  }
  return { cols: layout.cols + 2 * extraCols, rows: layout.rows + 2 * extraRows, cells, tile };
}
