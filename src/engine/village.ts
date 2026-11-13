// A believable village for a barangay that has no full village of its own (an AI neighbor),
// made deterministically from its seed, size, strength, tradition and trait: traders have more
// docks and fields, aggressive ones more Kuta and warriors. It follows the same rules as the
// player's barangay: a map with the sea edge where the river meets the coast, docks only on
// river or coast tiles, never more Mandirigma than the Kuta allow (and they work, part-time).
// The result is a GameState serialized like a save, so the visit screen can show a real
// player's snapshot the same way later. Pure: nothing it is given is changed.
import type { Content, NeighborDef } from "./content";
import { newGame, unreachableWorkplaces, warriorCap, type GameState, type PlacedBuilding } from "./game";
import { aiLevel } from "./kabantugan";
import { autoPlaceTile, isPlaza, setTiles, tileAt } from "./map";
import { findPath } from "./paths";
import { closestLandings, kutaCovers } from "./border";
import { strengthOfState, type NeighborState } from "./region";

/** How many of each building the village has, from its size, strength, trait and level. */
export function villagePlan(content: Content, n: NeighborState, def: NeighborDef, level: number): Record<string, number> {
  const v = n.state.villagers;
  const w = n.state.warriors;
  const trait = def.trait;
  const perKuta = content.rules.military.warriorsPerKuta;
  const kuta = Math.max(w > 0 ? Math.ceil(w / perKuta) : 0, trait === "aggressive" ? 2 : trait === "proud" ? 1 : 0);
  return {
    "bahay-kubo": Math.max(1, Math.ceil((v - content.rules.baseHousing) / 2)),
    palayan: Math.max(1, Math.round(v / 4)) + (trait === "trader" ? 1 : 0),
    "woodcutter-camp": Math.max(1, Math.round(v / 6)),
    kuta,
    kamalig: v >= 10 ? 1 : 0,
    "fishing-dock": trait === "trader" ? 2 : v >= 15 ? 1 : 0,
    "balangay-dock": trait === "trader" || level >= 8 ? 1 : 0,
    "babaylan-hut": 1,
    dambana: n.tradition ? 1 : 0,
    libingan: v >= 12 ? 1 : 0,
  };
}

/** The Bahay ng Datu level a village of this barangay level would have. */
export const villageDatuLevel = (level: number) => Math.min(5, 1 + Math.floor(level / 4));

/** Clears forest in a square around the plaza (never river, sea or balete). */
function clearAround(state: GameState, radius: number): GameState {
  const { plaza } = state.map;
  const changes: { x: number; y: number; tile: "cleared" }[] = [];
  for (let y = plaza.y - radius; y <= plaza.y + radius; y++) {
    for (let x = plaza.x - radius; x <= plaza.x + radius; x++) if (tileAt(state.map, x, y) === "forest") changes.push({ x, y, tile: "cleared" });
  }
  return { ...state, map: setTiles(state.map, changes) };
}

/** Daan from the plaza toward each workplace, over cleared land only. */
function layPaths(state: GameState, content: Content): GameState {
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  const taken = new Set(state.buildings.map((b) => `${b.x},${b.y}`));
  const changes: { x: number; y: number; tile: "daan" }[] = [];
  for (const b of state.buildings) {
    if (!defs.get(b.type)?.workers) continue;
    const path = findPath(state.map, state.map.plaza, b) ?? [];
    for (const p of path) {
      if (tileAt(state.map, p.x, p.y) === "cleared" && !taken.has(`${p.x},${p.y}`) && !isPlaza(state.map, p.x, p.y)) changes.push({ x: p.x, y: p.y, tile: "daan" });
    }
  }
  return { ...state, map: setTiles(state.map, changes) };
}

/** The village of a neighbor, at game time `time` (so its day and night match the player's). */
export function generateVillage(content: Content, n: NeighborState, def: NeighborDef, time: number): GameState {
  const level = aiLevel(content, n.state);
  const plan = villagePlan(content, n, def, level);
  const total = Object.values(plan).reduce((a, b) => a + b, 0);
  let s: GameState = {
    ...newGame(content, n.state.map.seed, false),
    buildings: [],
    tradition: n.tradition || null,
    datuLevel: villageDatuLevel(level),
    barangay: { id: def.id, region: { x: 0, y: 0 }, name: def.name.replace(/^Barangay /, ""), datu: def.datu.replace(/^(Datu|Dayang) /, "") },
    time,
  };
  s = clearAround(s, Math.min(9, 3 + Math.ceil(Math.sqrt(total))));
  // Order matters: the babaylan's hut before the Dambana that must stand near it; docks last.
  const order = ["bahay-kubo", "babaylan-hut", "dambana", "palayan", "woodcutter-camp", "kamalig", "kuta", "libingan", "fishing-dock", "balangay-dock"];
  for (const id of order) {
    const bdef = content.buildings.find((b) => b.id === id);
    if (!bdef) continue;
    for (let i = 0; i < (plan[id] ?? 0); i++) {
      const tile = autoPlaceTile(s, content, bdef);
      if (!tile) break;
      const placed: PlacedBuilding = { type: id, x: tile.x, y: tile.y };
      s = { ...s, buildings: [...s.buildings, placed] };
    }
  }
  // Like the player's, every workplace can be walked to: drop any cut off (across the river).
  const stranded = new Set(unreachableWorkplaces(s, content));
  if (stranded.size) s = { ...s, buildings: s.buildings.filter((b) => !stranded.has(b)) };
  s = layPaths(s, content);
  // Same rules as anyone: no more Mandirigma than the Kuta allow, no more than the villagers.
  const villagers = n.state.villagers;
  const warriors = Math.min(n.state.warriors, warriorCap(s, content), villagers);
  return { ...s, villagers, warriors, resources: { ...n.state.resources } };
}

/** When a cached village is out of date: its size or strength changed noticeably. */
export function villageKey(content: Content, n: NeighborState): string {
  return `${n.id}:${n.tradition}:${Math.round(n.state.villagers / 3)}:${Math.round(strengthOfState(n.state, content) / 10)}`;
}

const cache = new Map<string, GameState>();
/**
 * A neighbor's village as a snapshot (the save format), cached: made again only when its size
 * or strength changes noticeably. `time` sets the day and night it is shown at.
 */
export function villageSnapshot(content: Content, n: NeighborState, def: NeighborDef, time: number): string {
  const key = villageKey(content, n);
  let village = cache.get(key);
  if (!village) {
    village = generateVillage(content, n, def, 0);
    cache.set(key, village);
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
  }
  return JSON.stringify({ ...village, time: Math.max(0, time) });
}

/**
 * A raid on this village, before it is sent: the shore raiders would most likely land on (the
 * landing nearest the village) and the Kuta that would defend it in full there.
 */
export function raidPreview(village: GameState, content: Content): { landing: { x: number; y: number } | null; covering: PlacedBuilding[] } {
  const landing = closestLandings(village.map, 1)[0] ?? null;
  if (!landing) return { landing: null, covering: [] };
  const forts = new Set(content.buildings.filter((b) => b.defense).map((b) => b.id));
  return { landing, covering: village.buildings.filter((b) => forts.has(b.type) && !b.damaged && kutaCovers(content, b, landing)) };
}
