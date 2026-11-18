// Where a stranded workplace's route to the Bahay ng Datu breaks. Villagers walk from the plaza
// over cleared land, Daan and bridges (doors.ts walkReach), around solid buildings. A building
// with "No path" has no reachable side; this finds the cheapest way to fix that and returns the
// first tile on it that is in the way: forest or a balete to clear, open river that needs a
// Tulay, or a building standing in the way. Pure and deterministic, for the UI to highlight.
import type { Content } from "./content";
import type { GameState, PlacedBuilding } from "./game";
import { inBounds, NEIGHBOURS, TILE_CODE, type Point } from "./map";
import { solidTiles, walkReach } from "./doors";

export type BreakKind = "forest" | "balete" | "river" | "building";

export interface RouteBreak {
  /** The first tile in the way. */
  at: Point;
  /** The last reachable tile before it (where the route stops). */
  from: Point;
  kind: BreakKind;
}

/** What it costs to get past a tile in the way (lower = the likelier fix): forest is cleared, a river bridged. */
const FIX_COST: Record<BreakKind, number> = { forest: 3, balete: 6, building: 8, river: 10 };

function kindOf(tile: string, solid: boolean): BreakKind | "open" | null {
  if (solid) return "building";
  if (tile === TILE_CODE.cleared || tile === TILE_CODE.daan || tile === TILE_CODE.bridge) return "open";
  if (tile === TILE_CODE.forest) return "forest";
  if (tile === TILE_CODE.balete) return "balete";
  if (tile === TILE_CODE.river) return "river";
  return null; // the sea: no way through
}

/**
 * The nearest break in the route from the plaza to a building's door, or null when the building
 * can already be reached (or no fix exists). Every reachable tile is a start; the walk ends on any
 * side tile of the building.
 */
export function routeBreak(state: GameState, content: Content, b: Pick<PlacedBuilding, "x" | "y">): RouteBreak | null {
  const map = state.map;
  const W = map.width;
  const reach = walkReach(state, content);
  const solid = solidTiles(state, content);
  const target = b.y * W + b.x;
  const plaza = map.plaza.y * W + map.plaza.x;
  const goals = new Set<number>();
  for (const [dx, dy] of NEIGHBOURS) {
    const nx = b.x + dx;
    const ny = b.y + dy;
    if (inBounds(map, nx, ny) && ny * W + nx !== plaza) goals.add(ny * W + nx);
  }
  // Already reachable: nothing breaks.
  for (const g of goals) if (reach[g]) return null;
  const n = W * map.height;
  const cost = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  // A simple Dijkstra (maps are small): every reachable tile starts at 0.
  const open: number[] = [];
  for (let i = 0; i < n; i++) if (reach[i] && i !== target) {
    cost[i] = 0;
    open.push(i);
  }
  const done = new Uint8Array(n);
  let end = -1;
  while (open.length) {
    let k = 0;
    for (let q = 1; q < open.length; q++) if (cost[open[q]] < cost[open[k]] || (cost[open[q]] === cost[open[k]] && open[q] < open[k])) k = q;
    const i = open[k];
    open[k] = open[open.length - 1];
    open.pop();
    if (done[i]) continue;
    done[i] = 1;
    if (goals.has(i)) {
      end = i;
      break;
    }
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const j = ny * W + nx;
      if (j === target || j === plaza || done[j]) continue;
      const kind = kindOf(map.tiles[j], solid[j] === 1);
      if (kind === null) continue;
      const c = cost[i] + (kind === "open" ? 1 : FIX_COST[kind]);
      if (c < cost[j]) {
        cost[j] = c;
        came[j] = i;
        open.push(j);
      }
    }
  }
  if (end < 0) return null;
  // Walk back to the start; the first tile past the reachable land is the break.
  const path: number[] = [];
  for (let i = end; i !== -1; i = came[i]) path.push(i);
  path.reverse();
  for (let k = 1; k < path.length; k++) {
    if (reach[path[k]]) continue;
    const j = path[k];
    const kind = kindOf(map.tiles[j], solid[j] === 1);
    // An open tile cut off only by the building itself: the break is the building beside it.
    if (kind === "open" || kind === null) continue;
    const p = (i: number) => ({ x: i % W, y: Math.floor(i / W) });
    return { at: p(j), from: p(path[k - 1]), kind };
  }
  return null;
}
