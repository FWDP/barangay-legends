// A believable village for a barangay that has no full village of its own (an AI neighbor),
// made deterministically from its seed, size, strength, tradition and trait: traders have more
// docks and fields, aggressive ones more Kuta and warriors. It follows the same rules as the
// player's barangay: a map with the sea edge where the river meets the coast, docks only on
// river or coast tiles, never more Mandirigma than the Kuta allow (and they work, part-time).
// The result is a GameState serialized like a save, so the visit screen can show a real
// player's snapshot the same way later. Pure: nothing it is given is changed.
import type { Content, NeighborDef } from "./content";
import { newGame, unreachableWorkplaces, warriorCap, type GameState, type PlacedBuilding } from "./game";
import { levelForRenown } from "./kabantugan";
import type { VillageBand } from "./content";
import { entranceOf, solidTiles, updateDoors } from "./doors";
import { autoPlaceTile, isPlaza, setTiles, tileAt } from "./map";
import { findPath } from "./paths";
import { chooseLanding, kutaCovers } from "./border";
import { strengthOfState, type NeighborState } from "./region";

/** The village band for a barangay level (rules.villages). */
export function villageBand(content: Content, level: number): VillageBand {
  const bands = content.rules.villages.bands;
  let band = bands[0];
  for (const b of bands) if (level >= b.minLevel) band = b;
  return band;
}

/** The barangay level a generated village is drawn at: from the barangay's renown. */
export const villageLevel = (content: Content, n: NeighborState) => levelForRenown(content, n.fame.renown);

/**
 * How many of each building the village has: the level's band sets the least of each kind and
 * the most in all; size adds houses, fields and camps; the trait adds its own (traders a field
 * and a dock, aggressive barangays a Kuta).
 */
export function villagePlan(content: Content, n: NeighborState, def: NeighborDef, level: number): Record<string, number> {
  const band = villageBand(content, level);
  const v = n.state.villagers;
  const trait = def.trait;
  const shrine = band.shrine && !!n.tradition;
  const plan: Record<string, number> = {
    "bahay-kubo": Math.max(1, Math.ceil((v - content.rules.baseHousing) / 2)),
    palayan: Math.max(1, Math.round(v / 4)) + (trait === "trader" ? 1 : 0),
    "woodcutter-camp": Math.max(1, Math.round(v / 6)),
    kuta: band.kuta + (trait === "aggressive" && band.kuta > 0 ? 1 : 0),
    kamalig: band.kamalig,
    "fishing-dock": band.fishingDocks + (trait === "trader" ? 1 : 0),
    "balangay-dock": band.balangayDock || (trait === "trader" && band.fishingDocks > 0) ? 1 : 0,
    "babaylan-hut": shrine ? 1 : 0,
    dambana: shrine ? 1 : 0,
    libingan: band.libingan ? 1 : 0,
  };
  // Within the band's size: the essentials stay; houses, fields and camps give way evenly
  // (always the most numerous of them), so a town keeps its mix.
  let over = Object.values(plan).reduce((a, b) => a + b, 0) - band.maxBuildings;
  const flexible = ["bahay-kubo", "palayan", "woodcutter-camp"];
  while (over > 0) {
    const most = flexible.reduce((m, id) => (plan[id] > plan[m] ? id : m), flexible[0]);
    if (plan[most] <= 1) break;
    plan[most]--;
    over--;
  }
  return plan;
}

/** The Bahay ng Datu level a village of this barangay level has. */
export const villageDatuLevel = (content: Content, level: number) => villageBand(content, level).datuLevel;

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
function layPaths(state: GameState, content: Content, band: VillageBand): GameState {
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  const taken = new Set(state.buildings.map((b) => `${b.x},${b.y}`));
  const solid = solidTiles(state, content);
  const changes: { x: number; y: number; tile: "daan" }[] = [];
  const pave = (x: number, y: number) => {
    if (tileAt(state.map, x, y) === "cleared" && !taken.has(`${x},${y}`) && !isPlaza(state.map, x, y)) changes.push({ x, y, tile: "daan" });
  };
  // Daan from the plaza around the buildings to each doorway: workplaces (with roads), then some houses.
  const houses = state.buildings.filter((b) => (defs.get(b.type)?.housing ?? 0) > 0).slice(0, band.housePaths);
  const targets = [...(band.roads ? state.buildings.filter((b) => defs.get(b.type)?.workers) : []), ...houses];
  for (const b of targets) {
    const door = entranceOf(state, content, b);
    if (door) for (const p of findPath(state.map, state.map.plaza, door, solid) ?? []) pave(p.x, p.y);
  }
  // A paved ring around the plaza.
  if (band.plazaRing) {
    const { x: px, y: py } = state.map.plaza;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === 2) pave(px + dx, py + dy);
  }
  return { ...state, map: setTiles(state.map, changes) };
}

/** The village of a neighbor, at game time `time` (so its day and night match the player's). */
export function generateVillage(content: Content, n: NeighborState, def: NeighborDef, time: number): GameState {
  const level = villageLevel(content, n);
  const band = villageBand(content, level);
  const plan = villagePlan(content, n, def, level);
  let s: GameState = {
    ...newGame(content, n.state.map.seed, false),
    buildings: [],
    tradition: n.tradition || null,
    datuLevel: band.datuLevel,
    barangay: { id: def.id, region: { x: 0, y: 0 }, name: def.name.replace(/^Barangay /, ""), datu: def.datu.replace(/^(Datu|Dayang) /, "") },
    time,
  };
  s = clearAround(s, band.clearRadius);
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
  s = layPaths(updateDoors(null, s, content), content, band);
  s = updateDoors(null, s, content);
  // Same rules as anyone: no more Mandirigma than the Kuta allow, no more than the villagers.
  const villagers = n.state.villagers;
  const warriors = Math.min(n.state.warriors, warriorCap(s, content), villagers);
  return { ...s, villagers, warriors, resources: { ...n.state.resources } };
}

/** When a cached village is out of date: its size or strength changed noticeably. */
export function villageKey(content: Content, n: NeighborState): string {
  // The map seed too: another game (a new one, or a loaded save) has other maps under the same ids.
  return `${n.id}:${n.state.map.seed}:${n.tradition}:${villageLevel(content, n)}:${Math.round(n.state.villagers / 3)}:${Math.round(strengthOfState(n.state, content) / 10)}`;
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
