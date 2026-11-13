// A believable village for a barangay that has no full village of its own (an AI neighbor),
// made deterministically from its seed, its real buildings, its level, tradition and trait. It
// shows every building the barangay really has, plus the civic buildings its level implies
// (docks, Kamalig, the babaylan's hut and Dambana, the Libingan; traders get an extra dock),
// packed like a real barangay: houses in clusters around the plaza (a little open space kept
// there), fields along the water, camps at the forest's edge, Kuta toward the shore, docks on
// the water. Forest is cleared only as far as the buildings need, and Daan only joins buildings
// to the plaza. It follows the same rules as the player's barangay: every building keeps a
// doorway, docks only on river or coast, no more Mandirigma than the Kuta allow. The result is
// a GameState serialized like a save, so the visit screen can show a real player's snapshot the
// same way later. Pure: nothing it is given is changed.
import type { Content, NeighborDef } from "./content";
import { newGame, unreachableWorkplaces, warriorCap, type GameState, type PlacedBuilding } from "./game";
import { levelForRenown } from "./kabantugan";
import type { VillageBand } from "./content";
import { entranceOf, solidTiles, updateDoors, walkReach } from "./doors";
import { canPlace, isPlaza, isReachable, setTiles, tileAt, type Point } from "./map";
import { findPath } from "./paths";
import { chooseLanding, kutaCovers } from "./border";
import { type NeighborState } from "./region";

/** The village band for a barangay level (rules.villages). */
export function villageBand(content: Content, level: number): VillageBand {
  const bands = content.rules.villages.bands;
  let band = bands[0];
  for (const b of bands) if (level >= b.minLevel) band = b;
  return band;
}

/** The barangay level a generated village is drawn at: from the barangay's renown, on the player's thresholds. */
export const villageLevel = (content: Content, n: NeighborState) => levelForRenown(content, n.fame.renown);

/** The civic buildings a barangay of this level has, beyond what it built itself. */
const CIVIC = ["kamalig", "fishing-dock", "balangay-dock", "babaylan-hut", "dambana", "libingan"] as const;

/**
 * How many of each building the village shows: every building the barangay really has, and
 * at least the civic buildings its level's band names (traders a dock more). Nothing is capped.
 */
export function villagePlan(content: Content, n: NeighborState, def: NeighborDef, level: number): Record<string, number> {
  const band = villageBand(content, level);
  const shrine = band.shrine && !!n.tradition;
  const real: Record<string, number> = {};
  for (const b of n.state.buildings) if (content.buildings.some((d) => d.id === b.type)) real[b.type] = (real[b.type] ?? 0) + 1;
  const civic: Record<string, number> = {
    kamalig: band.kamalig,
    "fishing-dock": band.fishingDocks + (def.trait === "trader" ? 1 : 0),
    "balangay-dock": band.balangayDock || (def.trait === "trader" && band.fishingDocks > 0) ? 1 : 0,
    "babaylan-hut": shrine ? 1 : 0,
    dambana: shrine ? 1 : 0,
    libingan: band.libingan ? 1 : 0,
  };
  const plan: Record<string, number> = { ...real };
  for (const id of CIVIC) plan[id] = Math.max(real[id] ?? 0, civic[id] ?? 0);
  // At least a house and a field: a barangay is never drawn empty.
  plan["bahay-kubo"] = Math.max(1, plan["bahay-kubo"] ?? 0);
  plan.palayan = Math.max(1, plan.palayan ?? 0);
  return Object.fromEntries(Object.entries(plan).filter(([, k]) => k > 0));
}

/** The Bahay ng Datu level a village of this barangay level has. */
export const villageDatuLevel = (content: Content, level: number) => villageBand(content, level).datuLevel;

/** Steps (8 directions) from every tile to the nearest tile of some kinds, capped: one breadth-first pass. */
function distanceTo(state: GameState, kinds: string[], cap = 12): Float32Array {
  const { width: W, height: H } = state.map;
  const out = new Float32Array(W * H).fill(cap);
  const queue: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (kinds.includes(tileAt(state.map, x, y) ?? "")) {
        out[y * W + x] = 0;
        queue.push(y * W + x);
      }
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const d = out[i] + 1;
    if (d >= cap) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (out[j] > d) {
          out[j] = d;
          queue.push(j);
        }
      }
    }
  }
  return out;
}

/**
 * Clears forest nearest the plaza (never balete, river or sea) until there are `need` tiles of
 * open land the barangay can reach, so the clearing grows with the village.
 */
function clearFor(state: GameState, need: number): GameState {
  const { width: W, height: H, plaza } = state.map;
  const dist = (x: number, y: number) => Math.hypot(x - plaza.x, y - plaza.y);
  const open = (s: GameState) => {
    let n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tileAt(s.map, x, y) === "cleared" && isReachable(s.map, x, y) && !isPlaza(s.map, x, y)) n++;
    return n;
  };
  const forest: Point[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tileAt(state.map, x, y) === "forest" && isReachable(state.map, x, y)) forest.push({ x, y });
  forest.sort((a, b) => dist(a.x, a.y) - dist(b.x, b.y) || a.y - b.y || a.x - b.x);
  let have = open(state);
  if (have >= need) return state;
  const changes = forest.slice(0, need - have).map((p) => ({ ...p, tile: "cleared" as const }));
  return { ...state, map: setTiles(state.map, changes) };
}

/** Daan from the plaza to the doorways of workplaces (with roads) and some houses: paths that join buildings, nothing more. */
function layPaths(state: GameState, content: Content, band: VillageBand): GameState {
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  const taken = new Set(state.buildings.map((b) => `${b.x},${b.y}`));
  const solid = solidTiles(state, content);
  let map = state.map;
  const houses = state.buildings.filter((b) => (defs.get(b.type)?.housing ?? 0) > 0).slice(0, band.housePaths);
  const targets = [...(band.roads ? state.buildings.filter((b) => defs.get(b.type)?.workers) : []), ...houses];
  for (const b of targets) {
    const door = entranceOf({ ...state, map }, content, b);
    if (!door) continue;
    // One at a time on the map so far: later paths follow the Daan already laid (it's the quickest ground).
    const changes = (findPath(map, map.plaza, door, solid) ?? [])
      .filter((p) => tileAt(map, p.x, p.y) === "cleared" && !taken.has(`${p.x},${p.y}`) && !isPlaza(map, p.x, p.y))
      .map((p) => ({ ...p, tile: "daan" as const }));
    if (changes.length) map = setTiles(map, changes);
  }
  return { ...state, map };
}

/** The order buildings are placed in: those with the strictest places first. */
const ORDER = ["fishing-dock", "balangay-dock", "babaylan-hut", "dambana", "kuta", "kamalig", "bahay-kubo", "palayan", "woodcutter-camp", "libingan"];

/** The open ring right around the plaza: kept free for the plaza's crowd. */
const byPlaza = (plaza: Point, x: number, y: number) => Math.max(Math.abs(x - plaza.x), Math.abs(y - plaza.y)) <= 1;

/**
 * Places the plan's buildings, each on its best tile by kind (lower scores first), only where
 * the building may stand and keeps every doorway open; clears a little more forest when the
 * open land runs out.
 */
function placeAll(state: GameState, content: Content, plan: Record<string, number>): GameState {
  let s = state;
  const { width: W, plaza } = s.map;
  const water = distanceTo(s, ["river", "sea"]);
  // Distance to the forest's edge, worked out again only when more forest is cleared.
  let forestMap = s.map;
  let forest = distanceTo(s, ["forest", "balete"], 8);
  const types = [...ORDER.filter((id) => plan[id]), ...Object.keys(plan).filter((id) => !ORDER.includes(id)).sort()];
  for (const id of types) {
    const def = content.buildings.find((d) => d.id === id);
    if (!def) continue;
    for (let k = 0; k < plan[id]; k++) {
      let tile: Point | null = null;
      for (let tries = 0; tries < 6 && !tile; tries++) {
        if (forestMap !== s.map) [forest, forestMap] = [distanceTo(s, ["forest", "balete"], 8), s.map];
        const forts = s.buildings.filter((b) => b.type === "kuta");
        const score = (x: number, y: number) => {
          const d = Math.hypot(x - plaza.x, y - plaza.y);
          const w = water[y * W + x];
          switch (id) {
            case "palayan":
              return w * 2 + d * 0.5;
            case "woodcutter-camp":
              return forest[y * W + x] * 2 + d * 0.3;
            case "kuta": {
              // Toward the shore, spread apart.
              const apart = forts.length ? Math.min(...forts.map((f) => Math.hypot(f.x - x, f.y - y))) : 10;
              return w * 1.5 + d * 0.3 - Math.min(apart, 8) * 0.6;
            }
            case "libingan":
              // Away from the houses, at the edge of the clearing.
              return -d + w * 0.2;
            default:
              return d;
          }
        };
        const candidates: { x: number; y: number; v: number }[] = [];
        for (let y = 0; y < s.map.height; y++) {
          for (let x = 0; x < W; x++) {
            if (tileAt(s.map, x, y) !== "cleared" || byPlaza(plaza, x, y)) continue;
            candidates.push({ x, y, v: score(x, y) });
          }
        }
        candidates.sort((a, b) => a.v - b.v || a.y - b.y || a.x - b.x);
        // Only where people can walk to, and never cutting any open land off from the plaza
        // (a ring of houses would otherwise wall the plaza in).
        const reach = walkReach(s, content);
        const reachable = reach.reduce((n, r) => n + r, 0);
        for (const c of candidates) {
          if (!reach[c.y * W + c.x] || !canPlace(s, content, def, c.x, c.y)) continue;
          const after = walkReach({ ...s, buildings: [...s.buildings, { type: id, x: c.x, y: c.y }] }, content);
          if (after.reduce((n, r) => n + r, 0) !== reachable - 1) continue;
          tile = c;
          break;
        }
        // Out of room (or no fitting tile): clear a little more and look again.
        if (!tile) s = clearFor(s, countOpen(s) + 12);
      }
      if (!tile) continue;
      s = updateDoors(null, { ...s, buildings: [...s.buildings, { type: id, x: tile.x, y: tile.y }] }, content);
    }
  }
  return s;
}

const countOpen = (s: GameState) => {
  let n = 0;
  for (let y = 0; y < s.map.height; y++) for (let x = 0; x < s.map.width; x++) if (tileAt(s.map, x, y) === "cleared" && isReachable(s.map, x, y)) n++;
  return n;
};

/** The village of a neighbor, at game time `time` (so its day and night match the player's). */
export function generateVillage(content: Content, n: NeighborState, def: NeighborDef, time: number): GameState {
  const level = villageLevel(content, n);
  const band = villageBand(content, level);
  const plan = villagePlan(content, n, def, level);
  const total = Object.values(plan).reduce((a, b) => a + b, 0);
  let s: GameState = {
    ...newGame(content, n.state.map.seed, false),
    buildings: [],
    tradition: n.tradition || null,
    datuLevel: band.datuLevel,
    barangay: { id: def.id, region: { x: 0, y: 0 }, name: def.name.replace(/^Barangay /, ""), datu: def.datu.replace(/^(Datu|Dayang) /, "") },
    time,
  };
  // Land for the buildings, the paths between them and a little room to move: mostly built on.
  s = clearFor(s, Math.ceil(total * 1.6) + 8);
  s = placeAll(s, content, plan);
  // Like the player's, every workplace can be walked to: drop any cut off (across the river).
  const stranded = new Set(unreachableWorkplaces(s, content));
  if (stranded.size) s = { ...s, buildings: s.buildings.filter((b) => !stranded.has(b)) };
  s = layPaths(updateDoors(null, s, content), content, band);
  s = updateDoors(null, s, content);
  // Same rules as anyone: no more Mandirigma than the Kuta allow, no more than the villagers.
  const villagers = n.state.villagers;
  const warriors = Math.min(n.state.warriors, warriorCap(s, content), villagers);
  return { ...s, villagers, warriors, resources: { ...n.state.resources } };
}

/** When a cached village is out of date: its level, people or buildings changed. */
export function villageKey(content: Content, n: NeighborState): string {
  // The map seed too: another game (a new one, or a loaded save) has other maps under the same ids.
  const counts: Record<string, number> = {};
  for (const b of n.state.buildings) counts[b.type] = (counts[b.type] ?? 0) + 1;
  const built = Object.keys(counts).sort().map((k) => `${k}=${counts[k]}`).join(",");
  return `${n.id}:${n.state.map.seed}:${n.tradition}:${villageLevel(content, n)}:${n.state.villagers}:${n.state.warriors}:${built}`;
}

const cache = new Map<string, GameState>();
/**
 * A neighbor's village as a snapshot (the save format), cached: made again only when its size
 * or strength changes noticeably. `time` sets the day and night it is shown at.
 */
export function villageSnapshot(content: Content, n: NeighborState, def: NeighborDef, time: number): string {
  return JSON.stringify({ ...cachedVillage(content, n, def), time: Math.max(0, time) });
}

/** The village (generated once per villageKey). */
export function cachedVillage(content: Content, n: NeighborState, def: NeighborDef): GameState {
  const key = villageKey(content, n);
  let village = cache.get(key);
  if (!village) {
    village = generateVillage(content, n, def, 0);
    cache.set(key, village);
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
  }
  return village;
}

/** How many buildings a neighbor's village shows: what the diplomacy panel gives. */
export const villageBuildingCount = (content: Content, n: NeighborState, def: NeighborDef) => cachedVillage(content, n, def).buildings.length;

/**
 * A raid on this village, before it is sent: where the raiders land (one of the landing spots
 * nearest the village, picked with the seeded roll for `key`: see battle.ts raidKey, the same
 * pick the raid itself makes) and the Kutas that would defend it in full there.
 */
export function raidPreview(village: GameState, content: Content, key: number): { landing: { x: number; y: number } | null; covering: PlacedBuilding[] } {
  const landing = chooseLanding(village, content, key);
  if (!landing) return { landing: null, covering: [] };
  const forts = new Set(content.buildings.filter((b) => b.defense).map((b) => b.id));
  return { landing, covering: village.buildings.filter((b) => forts.has(b.type) && !b.damaged && kutaCovers(content, b, landing)) };
}
