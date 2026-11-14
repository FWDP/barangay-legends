// Saving to the browser. The only engine module allowed to touch browser APIs,
// and even here the storage is passed in so tests can use a fake.
import { AGE_GROUPS, classFor, GENDERS, syncResidents, type AgeGroup, type Gender, type Resident } from "./residents";
import { linkNamed, parseLife, parseStory } from "./talambuhay";
import { rollAt } from "./rng";
import { makeHousehold } from "./household";
import { clearingShape } from "./plaza";
import { REFUSAL_REASONS, RESOURCES, SOCIAL_CLASSES, type BuildingDef, type Content, type RefusalReason, type Resource, type SocialClass } from "./content";
import { cleanName, newGame, placeAuto, STATE_VERSION, type ClearingJob, type GameState, type PlacedBuilding } from "./game";
import {
  addCoast,
  generateMap,
  inBounds,
  isPlaza,
  isTileCode,
  NEIGHBOURS,
  setTiles,
  standingBridgeTiles,
  tileAt,
  type MapState,
  type Point,
  type Tile,
} from "./map";
import {
  aiContent,
  createRegion,
  newNeighborState,
  type NeighborState,
  type NeighborStatus,
  type Path,
  type RegionState,
  type Report,
  type TradeOffer,
  type Voyage,
  MAX_NEWS,
  strengthOfState,
} from "./region";
import { validProposal, type CounterOffer } from "./trading";
import { generateArchipelago, type Island, type Place } from "./archipelago";
import { generateBlocs, type Politics } from "./politics";
import { MAX_HISTORY, namedGender, type HistoryEntry, type HistoryKind, type NamedVillager } from "./people";
import { forestStage } from "./forest";
import { levelForRenown, renownFromAchievements } from "./kabantugan";
import { newFame, type Fame } from "./ranking";
import { MAX_REMEMBERED, type Remembered } from "./death";
import { updateDoors } from "./doors";
import type { Today } from "./limits";
import { parseExpeditions } from "./expeditions";

export const SAVE_KEY = "barangay-legends/save";

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type RawSave = Record<string, unknown>;

const finiteNonNeg = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isObject = (v: unknown): v is RawSave => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * One migration per save format change: MIGRATIONS[n] turns a version-n save into version n+1.
 * Never change what an old migration produces; add a new one and bump STATE_VERSION.
 * Migrations must not depend on engine code that may change later, so the old map rules a
 * migration needs are frozen in this file.
 */
const MIGRATIONS: Record<number, (raw: RawSave, content: Content) => RawSave> = {
  // v1 → v2: buildings were counts ({ palayan: 2 }); now each one has a tile on the v2 map
  // (see LEGACY_V2). Buildings are auto-placed (best bonus, then nearest the plaza), houses
  // first, in content order.
  1: (raw, content) => {
    let buildings: PlacedBuilding[] = [];
    const counts = isObject(raw.buildings) ? raw.buildings : {};
    for (const def of content.buildings) {
      const n = counts[def.id];
      if (!finiteNonNeg(n)) continue;
      for (let i = 0; i < Math.floor(n); i++) buildings = [...buildings, legacyV2AutoPlace(buildings, def)];
    }
    return { ...raw, version: 2, buildings };
  },
  // v2 → v3: events. Adds the game clock, RNG seed, hunger, sickness, typhoon and cooldowns.
  // Old barangays restart the clock at 0, so they also get the disaster-free first minutes.
  // The seed comes from the save's own buildings, so each old save gets its own events.
  2: (raw) => {
    const buildings = Array.isArray(raw.buildings) ? raw.buildings : [];
    const seed = hashString(JSON.stringify(buildings));
    return { ...raw, version: 3, time: 0, rng: seed, hunger: 0, sick: [], typhoon: null, nextEventAt: {} };
  },
  // v3 → v4: the generated map. A map is generated from the save's seed, and the old
  // buildings move onto it around the new plaza, keeping their layout. If the river ends up
  // on the other side, the layout is mirrored so fields stay by the river and camps by the
  // forest. Every building's tile and the tiles around it become cleared land.
  3: (raw, content) => {
    const seed = Number.isInteger(raw.rng) ? (raw.rng as number) >>> 0 : 0;
    let map = generateMap(content, seed);
    const { plaza } = map;
    let riverX = 0;
    while (riverX < map.width && tileAt(map, riverX, plaza.y) !== "river") riverX++;
    const riverOnLeft = riverX < plaza.x;
    const flip = riverOnLeft ? 1 : -1;
    const defs = new Map(content.buildings.map((d) => [d.id, d]));
    const moved: RawSave[] = [];
    const clear: { x: number; y: number; tile: Tile }[] = [];
    const leftOver: string[] = [];
    for (const item of Array.isArray(raw.buildings) ? raw.buildings : []) {
      if (!isObject(item) || typeof item.type !== "string" || !defs.has(item.type)) continue;
      if (typeof item.x !== "number" || typeof item.y !== "number") continue;
      const x = plaza.x + flip * (item.x - LEGACY_V2.plaza.x);
      const y = plaza.y + (item.y - LEGACY_V2.plaza.y);
      if (!inBounds(map, x, y) || isPlaza(map, x, y)) {
        leftOver.push(item.type);
        continue;
      }
      moved.push({ ...item, x, y });
      for (const [dx, dy] of [[0, 0], ...NEIGHBOURS]) {
        const t = tileAt(map, x + dx, y + dy);
        // The building's own tile is always land; around it, only forest is cleared.
        if ((dx === 0 && dy === 0) || t === "forest" || t === "balete") clear.push({ x: x + dx, y: y + dy, tile: "cleared" });
      }
    }
    map = setTiles(map, clear);
    // Anything that fell off the map is auto-placed on cleared land instead.
    let state = { ...newGame(content, seed), map, buildings: moved as unknown as PlacedBuilding[] };
    for (const type of leftOver) state = placeAuto(state, content, type);
    return { ...raw, version: 4, map: state.map, buildings: state.buildings, clearing: null, tilesCleared: 0 };
  },
  // v4 → v5: the region. Adds warriors (none yet). The region itself is left empty here and
  // created from content when the save loads, with the truce starting from the save's clock.
  4: (raw) => ({ ...raw, version: 5, warriors: 0, region: null }),
  // v5 → v6: undo, move and demolish. Adds the last build (nothing to undo after loading).
  // Bridges now store the river tiles they span; older bridges work theirs out when loaded.
  5: (raw) => ({ ...raw, version: 6, lastBuild: null }),
  // v6 → v7: the player can name the barangay and the datu. Older barangays have no names.
  6: (raw) => ({ ...raw, version: 7, barangay: isObject(raw.barangay) ? { ...raw.barangay, name: "", datu: "" } : raw.barangay }),
  // v7 → v8: choice events. Nothing waiting, none seen yet.
  7: (raw) => ({ ...raw, version: 8, choice: null, recentChoices: [] }),
  // v8 → v9: saves record when they were written (savedAt, wall-clock ms from the UI) for offline
  // progress. Older saves have no time, so they get no offline credit.
  8: (raw) => ({ ...raw, version: 9 }),
  // v9 → v10: footpaths. Workplaces now need a path from the plaza to be staffed. Older saves
  // keep the old rule (every workplace staffed) until the player next changes the map.
  9: (raw) => ({ ...raw, version: 10, legacyReach: true }),
  // v10 → v11: several tiles can be cleared at once. The one job (or none) becomes a queue;
  // nothing was paid for it, so nothing is refunded if it's cancelled.
  10: (raw) => ({
    ...raw,
    version: 11,
    clearing: isObject(raw.clearing) ? [{ ...raw.clearing, paid: { rice: 0, wood: 0 } }] : [],
  }),
  // v11 → v12: workplaces can be paused. None are in older saves.
  11: (raw) => ({ ...raw, version: 12 }),
  // v12 → v13: raids land somewhere. A raid already on its way in an older save has no landing
  // stored; it gets the same seeded one when it strikes (see border.ts raidLanding).
  12: (raw) => ({ ...raw, version: 13 }),
  // v13 → v14: Mandirigma became part-time warriors who work between raids, so a barangay of
  // all warriors goes back to work by itself. The hunger clock restarts, so nobody leaves just
  // because this save was loaded before the change (the player gathers rice to get going).
  13: (raw) => ({ ...raw, version: 14, hunger: 0, migration: typeof raw.migration === "number" ? Math.max(0, raw.migration) : 0 }),
  // v14 → v15: bridges cross the river straight, perpendicular to its flow, spanning exactly its
  // width. Every bridge is laid again that way; one that can't cross anywhere it stood is
  // removed and its price refunded, and the player is told once (notices).
  14: (raw, content) => migrateBridgesV15(raw, content),
  // v15 → v16: neighbors resent raids (grudge). An older save's grudge is rebuilt from the
  // raids still in its reports, each faded by the time since, so a recent raider isn't forgiven.
  15: (raw, content) => {
    const region = raw.region;
    if (!isObject(region) || !Array.isArray(region.neighbors)) return { ...raw, version: 16 };
    const g = content.rules.diplomacy.grudge;
    const now = finiteNonNeg(raw.time) ? raw.time : 0;
    const reports = (Array.isArray(region.reports) ? region.reports : []).filter(isObject);
    const neighbors = region.neighbors.map((n) => {
      if (!isObject(n)) return n;
      let grudge = 0;
      for (const r of reports) {
        if (r.kind !== "raid" || r.neighbor !== n.id || !finiteNonNeg(r.time)) continue;
        grudge += Math.max(0, (r.win === true ? g.raidWon : g.raidLost) - (g.decayPerMinute * Math.max(0, now - r.time)) / 60);
      }
      return { ...n, grudge: Math.min(100, grudge), lastRefusal: null };
    });
    return { ...raw, version: 16, region: { ...region, neighbors, counter: null } };
  },
  // v16 → v17: gold (0 to start, for the player and every neighbor), happiness (60, the
  // default), Mga Gawain (none done yet: tasks already met are credited on the next step),
  // named villagers and the barangay history (none yet), and counters for them.
  16: (raw) => {
    const withGold = (s: RawSave): RawSave => ({ ...s, resources: { ...(isObject(s.resources) ? s.resources : {}), gold: 0 } });
    const fresh = { happiness: 60, gawainDone: [], named: [], history: [], stats: { raidsDefended: 0, rolls: 0, named: 0 } };
    const out: RawSave = { ...withGold(raw), ...fresh, version: 17 };
    const region = raw.region;
    if (isObject(region) && Array.isArray(region.neighbors)) {
      out.region = {
        ...region,
        neighbors: region.neighbors.map((n) => (isObject(n) && isObject(n.state) ? { ...n, state: { ...withGold(n.state), ...fresh, version: 17 } } : n)),
      };
    }
    return out;
  },
  // v17 → v18: worship and the forest spirits. No Favor or tradition yet, Forest Balance full,
  // nothing replanting, no Aklat entries found: entries for things the save already met
  // (buildings, raids, sandugo, mangayaw, a balete near the land) unlock on the first step.
  17: (raw) => {
    const st = isObject(raw.stats) ? raw.stats : {};
    return {
      ...raw,
      version: 18,
      stats: { ...st, replanted: 0, permittedClears: 0 },
      favor: 0,
      tradition: null,
      lastRitualAt: null,
      blessings: {},
      sarimanok: null,
      eclipse: null,
      tikbalang: null,
      pranks: [],
      forest: { balance: 100, stage: 0, permission: 0, lastClearAt: null },
      replanting: [],
      aklat: [],
      flags: [],
    };
  },
  // v18 → v19: the Bahay ng Datu stands at the plaza in every barangay, at level 1; nobody has
  // died yet and there is no mourning. Its tile is the plaza's, so paths and the Daan bonus
  // work exactly as before.
  18: (raw) => {
    const st = isObject(raw.stats) ? raw.stats : {};
    return { ...raw, version: 19, stats: { ...st, deaths: 0 }, datuLevel: 1, mourning: 0, sickFor: 0, remembered: [] };
  },
  // v19 → v20: the archipelago. The barangay's map gets a coast: sea along the edge farthest
  // from the plaza, turning only forest, river and balete into sea (never cleared land, paths,
  // bridges, buildings or tiles queued for clearing). No boats yet. The region's islands, blocs
  // and the new barangays are filled in when the region is read (parseRegion); the old
  // neighbors keep their relations, tributaries and history, and stay out of the starting blocs
  // if they are already the player's tributaries or allies.
  19: (raw, content) => {
    const st = isObject(raw.stats) ? raw.stats : {};
    const m = raw.map;
    let map = m;
    if (isObject(m) && typeof m.tiles === "string" && Number.isInteger(m.width) && Number.isInteger(m.height) && isObject(m.plaza)) {
      const ms = m as unknown as MapState;
      const keep = [
        ...(Array.isArray(raw.buildings) ? raw.buildings.filter(isObject).map((b) => ({ x: b.x as number, y: b.y as number })) : []),
        ...(Array.isArray(raw.clearing) ? raw.clearing.filter(isObject).map((j) => ({ x: j.x as number, y: j.y as number })) : []),
      ];
      const edge = ms.plaza.y > ms.height / 2 ? "top" : "bottom";
      // Only a map tall enough for the coast to stay a strip at its edge gets one.
      const depth = content.rules.map.seaDepth ?? 0;
      if (ms.height >= depth * 4) map = { ...m, ...addCoast(ms, edge, depth, keep) };
    }
    return { ...raw, version: 20, map, balangays: 0, stats: { ...st, voyages: 0 } };
  },
  // v20 → v21: Kabantugan (renown) and the barangay level. Renown is worked out from what the
  // save has already achieved (see parseRenown, after the state is read); the levels it already
  // has count as rewarded, so loading doesn't pay out a pile of past rewards.
  20: (raw) => {
    const st = isObject(raw.stats) ? raw.stats : {};
    return { ...raw, version: 21, kabantugan: null, levelRewarded: null, stats: { ...st, trades: 0, bestTens: null } };
  },
  // v21 → v22: the Ranggo. AI barangays get renown from their size and strength now (and count
  // defenses from here on); every stat counts as gained at the save's time, so old ties fall
  // back to a fixed order (the player, then content order). The rank is worked out silently.
  21: (raw) => ({ ...raw, version: 22, achievedAt: null, renownRank: 0 }),
  // v22 → v23: days (Araw), solid buildings, relationship age and daily limits, dev saves.
  // The barangay counts as founded at game time 0 (its days run from its existing time);
  // buildings boxed in by others are grandfathered; neighbors count as met at the start.
  22: (raw) => {
    const neighbors = (rawRegion: unknown) => {
      if (!isObject(rawRegion) || !Array.isArray(rawRegion.neighbors)) return rawRegion;
      return { ...rawRegion, neighbors: rawRegion.neighbors.map((n) => (isObject(n) ? { ...n, metAt: 0, today: null, state: isObject(n.state) ? { ...n.state, grandfatherDoors: true } : n.state } : n)) };
    };
    return { ...raw, version: 23, foundedAt: 0, devSave: false, grandfatherDoors: true, region: neighbors(raw.region) };
  },
  // v23 → v24: expedition records for replays. Older trades and raids weren't written down.
  23: (raw) => ({ ...raw, version: 24, expeditions: [], nextExpeditionId: 1 }),
  // v24 → v25: a Kamalig can be raised (buildings may carry a level; missing means level 1) and
  // an ally can call for help (region.allyCall). Older saves have neither, so nothing changes.
  24: (raw) => ({ ...raw, version: 25 }),
  // v25 → v26: every villager as a person (gender and age group) and named villagers' genders.
  // Older villagers get theirs from the map's seed when the save is read (residents.ts), the
  // same way new arrivals do; named villagers from their name (content/names.json).
  25: (raw) => ({ ...raw, version: 26, residents: [], residentsNext: 1 }),
  // v26 → v27: social classes and the datu's household. Residents without a class get theirs
  // from the seed, and the household is made from the seed and the datu's name, when read.
  26: (raw) => ({ ...raw, version: 27, household: null }),
  // v27 → v28: the plaza becomes a clearing beside the Bahay ng Datu (plaza.ts). It grows from
  // the house's front, where the fire pit stood, moving nothing: tiles already built on (or no
  // longer open ground) are left out, and the clearing is the open tiles that remain.
  27: (raw, content) => {
    const m = raw.map;
    if (!isObject(m) || !isObject(m.plaza) || !Number.isInteger(m.width) || !Number.isInteger(m.height) || typeof m.tiles !== "string") return { ...raw, version: 28 };
    const shape = { width: m.width as number, height: m.height as number, seed: ((m.seed as number) ?? 0) >>> 0, plaza: { x: m.plaza.x as number, y: m.plaza.y as number } };
    const built = new Set((Array.isArray(raw.buildings) ? raw.buildings : []).filter(isObject).map((b) => `${b.x},${b.y}`));
    const growing = new Set((Array.isArray(raw.replanting) ? raw.replanting : []).filter(isObject).map((j) => `${j.x},${j.y}`));
    const tiles = m.tiles as string;
    const gathering = clearingShape(shape, content).filter((p) => {
      const c = tiles[p.y * shape.width + p.x];
      return (c === "c" || c === "d") && !built.has(`${p.x},${p.y}`) && !growing.has(`${p.x},${p.y}`);
    });
    return { ...raw, version: 28, map: { ...m, gathering } };
  },
  // v28 → v29: "kapre" (a colonial word) becomes the Anito ng Balete. Its Aklat entry, the flag
  // that opens it, the history lines that name it and a named villager's story change ids;
  // nothing else changes (content/lore/anito-ng-balete.json).
  28: (raw) => {
    const id = (x: unknown) => (x === "kapre" ? "anito-ng-balete" : x === "kapre-friend" ? "balete-friend" : x);
    const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(id))] : v);
    const out: RawSave = { ...raw, version: 29, aklat: list(raw.aklat), flags: list(raw.flags) };
    if (Array.isArray(raw.history)) out.history = raw.history.map((h) => (isObject(h) && h.kind === "aklat" ? { ...h, entry: id(h.entry) } : h));
    if (Array.isArray(raw.named)) out.named = raw.named.map((v) => (isObject(v) ? { ...v, story: id(v.story) } : v));
    return out;
  },
  // v29 → v30: births and newcomers (population.ts). Everyone keeps their age group; each
  // resident's group "began" partway through it, from the seed, so the children already there
  // grow up over the next few Araw and nobody turns elder all at once. Named villagers are
  // linked to a resident when the save is read (talambuhay.ts). No births are under way yet.
  29: (raw, content) => {
    const time = typeof raw.time === "number" && Number.isFinite(raw.time) ? raw.time : 0;
    const seed = isObject(raw.map) && Number.isInteger(raw.map.seed) ? (raw.map.seed as number) >>> 0 : 0;
    const day = content.rules.dayNight.daySeconds;
    const p = content.rules.population;
    const residents = Array.isArray(raw.residents)
      ? raw.residents.map((r) => {
          if (!isObject(r) || !Number.isInteger(r.id)) return r;
          const span = r.age === "child" ? p.childDays * day : r.age === "adult" ? p.elderAfterDays * day : 0;
          return { ...r, since: time - rollAt(seed, r.id as number, 9306) * span * 0.9 };
        })
      : raw.residents;
    return { ...raw, version: 30, residents, births: 0 };
  },
  // v30 → v31: life stories (talambuhay.ts). The remembered dead may keep their story and children
  // what they learned by the fire; both are new and optional, so older saves only change version.
  // Those already remembered keep their name and how they died.
  30: (raw) => ({ ...raw, version: 31 }),
};

// ---------- Frozen v15 bridge rule (for the v14 → v15 migration only) ----------

/** The per-copy price growth when v15 came out (refunds for bridges that no longer fit). */
const FROZEN_COST_GROWTH_V15 = 1.15;

type FrozenTile = "f" | "c" | "r" | "b" | "t" | "d";

function migrateBridgesV15(raw: RawSave, content: Content): RawSave {
  const out: RawSave = { ...raw, version: 15, notices: Array.isArray(raw.notices) ? raw.notices : [] };
  const map = raw.map;
  if (!isObject(map) || typeof map.tiles !== "string" || !Number.isInteger(map.width) || !Array.isArray(raw.buildings)) return out;
  const W = map.width as number;
  const H = (map.tiles as string).length / W;
  const tiles = (map.tiles as string).split("") as FrozenTile[];
  const at = (x: number, y: number): FrozenTile | null => (x >= 0 && y >= 0 && x < W && y < H ? tiles[y * W + x] : null);
  const land = (t: FrozenTile | null) => t === "c" || t === "f" || t === "t" || t === "d";
  const bridges = new Map(content.buildings.filter((d) => d.bridge).map((d) => [d.id, d]));
  const buildings: RawSave[] = [];
  let removed = 0;
  const refund: Record<string, number> = {};
  const seen: Record<string, number> = {};
  for (const item of raw.buildings as unknown[]) {
    if (!isObject(item) || typeof item.type !== "string" || !bridges.has(item.type)) {
      if (isObject(item)) buildings.push(item);
      continue;
    }
    const def = bridges.get(item.type)!;
    const maxSpan = def.bridge!.maxSpan;
    const nth = (seen[item.type] = (seen[item.type] ?? 0) + 1) - 1;
    // Its old tiles turn back into river first: the old span, or every bridge tile touching its anchor in a line.
    const old: { x: number; y: number }[] = Array.isArray(item.span)
      ? item.span.filter(isObject).map((p) => ({ x: p.x as number, y: p.y as number }))
      : [{ x: item.x as number, y: item.y as number }];
    for (const [dx, dy] of NEIGHBOURS) {
      if (Array.isArray(item.span)) break;
      for (let k = 1; at((item.x as number) + dx * k, (item.y as number) + dy * k) === "b"; k++) old.push({ x: (item.x as number) + dx * k, y: (item.y as number) + dy * k });
    }
    for (const p of old) if (at(p.x, p.y) === "b") tiles[p.y * W + p.x] = "r";
    // The straight way across through any of its old tiles: the shorter of across and down, land at both ends.
    let best: { x: number; y: number }[] | null = null;
    let anchor: { x: number; y: number } | null = null;
    for (const start of old) {
      if (at(start.x, start.y) !== "r") continue;
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        let ax = start.x;
        let ay = start.y;
        while (at(ax - dx, ay - dy) === "r") [ax, ay] = [ax - dx, ay - dy];
        const span: { x: number; y: number }[] = [];
        let bx = ax;
        let by = ay;
        while (at(bx, by) === "r") {
          span.push({ x: bx, y: by });
          [bx, by] = [bx + dx, by + dy];
        }
        if (span.length > maxSpan || !land(at(ax - dx, ay - dy)) || !land(at(bx, by))) continue;
        if (!best || span.length < best.length) [best, anchor] = [span, start];
      }
    }
    if (best && anchor) {
      for (const p of best) tiles[p.y * W + p.x] = "b";
      buildings.push({ ...item, x: anchor.x, y: anchor.y, span: best });
    } else {
      removed++;
      for (const [r, n] of Object.entries(def.cost)) refund[r] = (refund[r] ?? 0) + Math.ceil((n ?? 0) * FROZEN_COST_GROWTH_V15 ** nth);
    }
  }
  out.map = { ...map, tiles: tiles.join("") };
  out.buildings = buildings;
  if (removed > 0) {
    const resources = isObject(raw.resources) ? { ...raw.resources } : {};
    for (const [r, n] of Object.entries(refund)) resources[r] = (finiteNonNeg(resources[r]) ? (resources[r] as number) : 0) + n;
    out.resources = resources;
    const goods = Object.entries(refund).map(([r, n]) => `${n} ${r}`).join(" and ");
    (out.notices as string[]).push(
      `Bridges now cross the river straight across. ${removed === 1 ? "One bridge" : `${removed} bridges`} couldn't be laid that way where ${removed === 1 ? "it stood, so it was" : "they stood, so they were"} taken down and you got ${goods} back.`,
    );
  }
  return out;
}

// ---------- Frozen v2 map rules (for the v1 → v2 migration only) ----------

/** The v2 map: river in column 0, land in 1..8, forest in 9..10, plaza at (5, 0), rows from -3. */
const LEGACY_V2 = { width: 11, riverColumns: 1, forestColumns: 2, plaza: { x: 5, y: 0 }, minRadius: 3 };

function legacyV2Terrain(x: number, y: number): "river" | "forest" | "plaza" | "land" | null {
  if (x < 0 || x >= LEGACY_V2.width) return null;
  if (x < LEGACY_V2.riverColumns) return "river";
  if (x >= LEGACY_V2.width - LEGACY_V2.forestColumns) return "forest";
  return x === LEGACY_V2.plaza.x && y === LEGACY_V2.plaza.y ? "plaza" : "land";
}

function legacyV2AutoPlace(buildings: PlacedBuilding[], def: BuildingDef): PlacedBuilding {
  const radius = buildings.reduce((r, b) => Math.max(r, Math.abs(b.y) + 1), LEGACY_V2.minRadius);
  const taken = new Map(buildings.map((b) => [`${b.x},${b.y}`, b.type]));
  const bonusAt = (x: number, y: number) =>
    def.adjacencyBonus &&
    NEIGHBOURS.some(([dx, dy]) => {
      const t = legacyV2Terrain(x + dx, y + dy);
      const other = taken.get(`${x + dx},${y + dy}`);
      return (t !== null && def.adjacencyBonus!.nextTo.includes(t)) || (other !== undefined && def.adjacencyBonus!.nextTo.includes(other));
    })
      ? def.adjacencyBonus.percent
      : 0;
  let best: { x: number; y: number; bonus: number; dist: number } | null = null;
  for (let y = -radius; y <= radius; y++) {
    for (let x = 0; x < LEGACY_V2.width; x++) {
      if (legacyV2Terrain(x, y) !== "land" || taken.has(`${x},${y}`)) continue;
      const bonus = bonusAt(x, y);
      const dist = (x - LEGACY_V2.plaza.x) ** 2 + y ** 2;
      if (!best || bonus > best.bonus || (bonus === best.bonus && dist < best.dist)) best = { x, y, bonus, dist };
    }
  }
  return { type: def.id, x: best!.x, y: best!.y };
}

/** FNV-1a: a small, stable string hash. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Brings an older save up to version `to` (the current version by default). Returns null for
 * unknown or future versions.
 */
export function migrate(raw: RawSave, content: Content, to = STATE_VERSION): RawSave | null {
  let data = raw;
  while (typeof data.version === "number" && data.version < to) {
    const step = MIGRATIONS[data.version];
    if (!step) return null;
    data = step(data, content);
  }
  return data.version === to ? data : null;
}

function parseMap(raw: unknown): MapState | null {
  if (!isObject(raw) || !isObject(raw.plaza)) return null;
  const { width, height, seed, tiles } = raw;
  if (!Number.isInteger(width) || !Number.isInteger(height) || !Number.isInteger(seed) || typeof tiles !== "string") return null;
  if (tiles.length !== (width as number) * (height as number) || ![...tiles].every(isTileCode)) return null;
  const map: MapState = {
    width: width as number,
    height: height as number,
    seed: (seed as number) >>> 0,
    tiles,
    plaza: { x: raw.plaza.x as number, y: raw.plaza.y as number },
  };
  if (Array.isArray(raw.gathering)) {
    const seen = new Set<string>();
    map.gathering = raw.gathering.filter((p): p is Point => isObject(p) && inBounds(map, p.x as number, p.y as number) && !seen.has(`${p.x},${p.y}`) && !!seen.add(`${p.x},${p.y}`)).map((p) => ({ x: p.x, y: p.y }));
  }
  return tileAt(map, map.plaza.x, map.plaza.y) === "cleared" ? map : null;
}

/** Turns saved JSON back into a state. Unknown or broken fields fall back to new-game values. */
/**
 * A barangay snapshot (the same serialized format as a save) for the visit screen: read as a
 * player's barangay, with its tradition and Bahay ng Datu, but without a region of its own.
 */
export function parseSnapshot(json: string, content: Content): GameState | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isObject(raw)) return null;
  const data = migrate(raw, content);
  return data ? parseState(data, content, true, false) : null;
}

export function parseSave(json: string, content: Content): GameState | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isObject(raw)) return null;
  const data = migrate(raw, content);
  if (!data) return null;
  return parseState(data, content, true);
}

/**
 * Reads one barangay's state from current-version data: the player's (with its region) or
 * an AI neighbor's (without). Returns null if the map is broken.
 */
function parseState(data: RawSave, content: Content, isPlayer: boolean, withRegion = true): GameState | null {
  const map = parseMap(data.map);
  if (!map) return null;

  const state: GameState = { ...newGame(content, map.seed, false), map };
  const resources = isObject(data.resources) ? data.resources : {};
  for (const r of RESOURCES) {
    const v = resources[r];
    if (finiteNonNeg(v)) state.resources[r] = v;
  }
  if (finiteNonNeg(data.villagers)) state.villagers = Math.floor(data.villagers);
  if (typeof data.migration === "number" && Math.abs(data.migration) < 1) state.migration = data.migration;
  if (typeof data.births === "number" && data.births >= 0 && data.births < 1) state.births = data.births;
  if (finiteNonNeg(data.time)) state.time = data.time;
  if (Number.isInteger(data.rng)) state.rng = (data.rng as number) >>> 0;
  if (finiteNonNeg(data.hunger)) state.hunger = data.hunger;
  if (Array.isArray(data.sick)) {
    const max = content.events.sickness?.sickSeconds ?? 0;
    state.sick = data.sick.filter((t): t is number => finiteNonNeg(t) && t > 0 && t <= max).slice(0, state.villagers);
  }
  if (isObject(data.typhoon) && finiteNonNeg(data.typhoon.strikeAt) && content.events.typhoon) {
    state.typhoon = { strikeAt: data.typhoon.strikeAt };
  }
  if (isObject(data.nextEventAt)) {
    state.nextEventAt = Object.fromEntries(
      Object.entries(data.nextEventAt).filter((e): e is [string, number] => finiteNonNeg(e[1])),
    );
  }
  if (finiteNonNeg(data.tilesCleared)) state.tilesCleared = Math.floor(data.tilesCleared);
  state.legacyReach = data.legacyReach === true;
  if (isPlayer && Array.isArray(data.notices)) state.notices = data.notices.filter((n): n is string => typeof n === "string" && n !== "").slice(0, 5);
  if (Array.isArray(data.recentChoices)) {
    state.recentChoices = data.recentChoices.filter((id): id is string => typeof id === "string" && content.choices.some((c) => c.id === id)).slice(-3);
  }

  const b = data.barangay;
  if (isObject(b) && typeof b.id === "string" && b.id !== "" && isObject(b.region)) {
    const { x, y } = b.region;
    if (Number.isInteger(x) && Number.isInteger(y)) {
      state.barangay = { id: b.id, region: { x: x as number, y: y as number }, name: cleanName(b.name), datu: cleanName(b.datu) };
    }
  }

  // Buildings: known types on a fitting tile (cleared land, or a bridge for bridges), no overlaps.
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  const taken = new Set<string>();
  state.buildings = [];
  for (const item of Array.isArray(data.buildings) ? (data.buildings as unknown[]) : []) {
    if (!isObject(item) || typeof item.type !== "string") continue;
    const def = defs.get(item.type);
    const { x, y } = item;
    if (!def || typeof x !== "number" || typeof y !== "number" || taken.has(`${x},${y}`)) continue;
    const tile = tileAt(map, x, y);
    const fits = def.placeOn === "river" ? tile === "bridge" : tile === "cleared" && !isPlaza(map, x, y);
    if (!fits) continue;
    const building: PlacedBuilding = { type: item.type, x, y };
    if (def.bridge) {
      const span = parseSpan(item.span, map, def.bridge.maxSpan, x, y);
      building.span = span ?? standingBridgeTiles(map, def, x, y);
    }
    if (item.paused === true && def.workers) building.paused = true;
    if (item.legacyDoor === true) building.legacyDoor = true;
    // A raised building's level (upgrades.ts), within the levels its type has.
    if (Number.isInteger(item.level) && (item.level as number) > 1) building.level = Math.min(item.level as number, 1 + (def.upgrades?.length ?? 0));
    if (building.level === 1) delete building.level;
    if (isObject(item.door) && Number.isInteger(item.door.x) && Number.isInteger(item.door.y)) building.door = { x: item.door.x as number, y: item.door.y as number };
    if (item.damaged === true) building.damaged = true;
    else if (finiteNonNeg(item.burningSince) && item.burningSince <= state.time && content.events.fire) {
      building.burningSince = item.burningSince;
    }
    taken.add(`${x},${y}`);
    state.buildings.push(building);
  }

  // The clearing queue: forest tiles, each at most once, with sane numbers.
  if (Array.isArray(data.clearing)) {
    const seen = new Set<string>();
    for (const job of data.clearing.slice(0, 400)) {
      if (!isObject(job) || !inBounds(map, job.x as number, job.y as number)) continue;
      const t = tileAt(map, job.x as number, job.y as number);
      const k = `${job.x},${job.y}`;
      if ((t !== "forest" && t !== "balete") || seen.has(k) || !finiteNonNeg(job.progress) || !finiteNonNeg(job.seconds) || job.seconds <= 0) continue;
      seen.add(k);
      const paidRaw = isObject(job.paid) ? job.paid : {};
      const paid = Object.fromEntries(RESOURCES.map((r) => [r, finiteNonNeg(paidRaw[r]) ? paidRaw[r] : 0])) as Record<Resource, number>;
      state.clearing.push({ x: job.x as number, y: job.y as number, progress: Math.min(job.progress, job.seconds), seconds: job.seconds, paid } satisfies ClearingJob);
    }
  }

  const last = data.lastBuild;
  if (
    isObject(last) &&
    typeof last.type === "string" &&
    finiteNonNeg(last.at) &&
    last.at <= state.time &&
    isObject(last.cost) &&
    state.buildings.some((b) => b.type === last.type && b.x === last.x && b.y === last.y)
  ) {
    const paid = last.cost as RawSave;
    const cost = Object.fromEntries(RESOURCES.map((r) => [r, finiteNonNeg(paid[r]) ? paid[r] : 0])) as Record<Resource, number>;
    state.lastBuild = { type: last.type, x: last.x as number, y: last.y as number, cost, at: last.at };
  }
  if (finiteNonNeg(data.warriors)) state.warriors = Math.min(Math.floor(data.warriors), state.villagers);
  if (finiteNonNeg(data.happiness)) state.happiness = Math.min(100, data.happiness);
  parsePeople(data, content, state, isPlayer);
  if (isPlayer) parseWorship(data, content, state);
  if (isPlayer) parseDatuAndDeaths(data, content, state);
  if (isPlayer && finiteNonNeg(data.balangays)) state.balangays = Math.floor(data.balangays);
  if (isPlayer && withRegion && content.neighbors.length > 0) state.region = parseRegion(data.region, content, state);
  // A waiting choice event: a known event, and a neighbor that still exists (or none).
  const ch = data.choice;
  if (isPlayer && isObject(ch) && typeof ch.id === "string" && content.choices.some((c) => c.id === ch.id) && finiteNonNeg(ch.at)) {
    const neighbor = typeof ch.neighbor === "string" && state.region?.neighbors.some((n) => n.id === ch.neighbor) ? ch.neighbor : null;
    // The other side of an ally's war or raid ({enemy}), if it still exists.
    const enemy = typeof ch.enemy === "string" && state.region?.neighbors.some((n) => n.id === ch.enemy) ? ch.enemy : null;
    state.choice = { id: ch.id, neighbor, at: ch.at, ...(enemy ? { enemy } : {}) };
  }
  if (isPlayer) {
    parseRenown(data, content, state);
    parseRanking(data, state);
  }
  if (finiteNonNeg(data.foundedAt) && data.foundedAt <= state.time) state.foundedAt = data.foundedAt;
  state.devSave = data.devSave === true;
  if (isPlayer) {
    state.expeditions = parseExpeditions(data.expeditions, content);
    const next = Number.isInteger(data.nextExpeditionId) ? (data.nextExpeditionId as number) : 1;
    state.nextExpeditionId = Math.max(next, ...state.expeditions.map((e) => e.id + 1), 1);
  }
  parseResidents(data, content, state, isPlayer);
  // Entrances: worked out again; a save from before solid buildings keeps boxed-in ones working.
  return updateDoors(null, state, content, data.grandfatherDoors === true);
}

/**
 * Kabantugan and the levels already rewarded. A save from before renown (null, set by the v21
 * migration) gets the renown of what it had already achieved, its battle renown included.
 */
function parseRenown(data: RawSave, content: Content, state: GameState) {
  const tens = Math.floor(state.villagers / 10);
  if (data.kabantugan === null || data.kabantugan === undefined) {
    const region = isObject(data.region) ? data.region : {};
    const battle = finiteNonNeg(region.renown) ? region.renown : 0;
    state.kabantugan = renownFromAchievements(state, content, battle);
    state.levelRewarded = levelForRenown(content, state.kabantugan);
    state.stats.bestTens = tens;
    return;
  }
  if (finiteNonNeg(data.kabantugan)) state.kabantugan = data.kabantugan;
  const level = levelForRenown(content, state.kabantugan);
  state.levelRewarded = Number.isInteger(data.levelRewarded) ? Math.min(content.rules.kabantugan.levelAt.length + 1, Math.max(1, data.levelRewarded as number)) : level;
  if (!isObject(data.stats) || !finiteNonNeg((data.stats as RawSave).bestTens)) state.stats.bestTens = tens;
}

/** An AI barangay's ranked stats; missing (a v21 save) or broken: from its size and strength now. */
function parseFame(raw: unknown, content: Content, state: GameState, time: number): Fame {
  const fresh = newFame(content, state, time);
  if (!isObject(raw)) return fresh;
  const num = (v: unknown, d: number) => (finiteNonNeg(v) ? v : d);
  return {
    renown: num(raw.renown, fresh.renown),
    renownAt: num(raw.renownAt, time),
    peak: num(raw.peak, fresh.peak),
    defended: Number.isInteger(raw.defended) && (raw.defended as number) >= 0 ? (raw.defended as number) : 0,
    defendedAt: num(raw.defendedAt, time),
  };
}

/** Today's trades, gifts and raids with a barangay (limits.ts), or null. */
function parseToday(raw: unknown): Today | null {
  if (!isObject(raw)) return null;
  const n = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0);
  if (!Number.isInteger(raw.day) || (raw.day as number) < 1) return null;
  return { day: raw.day as number, trades: n(raw.trades), gifts: n(raw.gifts), raids: n(raw.raids) };
}

/** When the player's ranked stats last grew, and the renown rank (0: work it out). */
function parseRanking(data: RawSave, state: GameState) {
  const a = isObject(data.achievedAt) ? data.achievedAt : {};
  const at = (v: unknown) => (finiteNonNeg(v) ? v : state.time);
  state.achievedAt = { renown: at(a.renown), defended: at(a.defended), aklat: at(a.aklat) };
  state.renownRank = Number.isInteger(data.renownRank) && (data.renownRank as number) >= 0 ? (data.renownRank as number) : 0;
}

const HISTORY_KINDS: HistoryKind[] = ["named", "left", "fell", "task", "spirits", "aklat", "event", "died", "frail", "datu", "level", "rank"];
const DEATH_CAUSES = ["age", "sickness", "hunger", "raid"];
const EVENTS = ["eclipseWon", "eclipseLost", "sarimanok", "riddleRight"];
const isPoint = (v: unknown): v is { x: number; y: number } => isObject(v) && Number.isFinite(v.x) && Number.isFinite(v.y);

/** The Bahay ng Datu's level, mourning, the long-sickness clock and the remembered dead. */
function parseDatuAndDeaths(data: RawSave, content: Content, state: GameState) {
  const max = content.datuHouse?.datuHouse.levels.length ?? 1;
  if (Number.isInteger(data.datuLevel)) state.datuLevel = Math.min(max, Math.max(1, data.datuLevel as number));
  if (finiteNonNeg(data.mourning)) state.mourning = Math.min(content.rules.mourning.maxSeconds, data.mourning);
  if (finiteNonNeg(data.sickFor) && state.sick.length > 0) state.sickFor = data.sickFor;
  if (Array.isArray(data.remembered)) {
    state.remembered = data.remembered
      .filter((r): r is RawSave => isObject(r) && typeof r.name === "string" && r.name !== "" && r.name.length <= 30 && DEATH_CAUSES.includes(r.cause as string) && finiteNonNeg(r.at))
      .slice(-MAX_REMEMBERED)
      .map((r) => {
        const story = parseStory(r.story);
        return { name: r.name as string, cause: r.cause as Remembered["cause"], at: r.at as number, ...(story ? { story } : {}) };
      });
  }
}

/** Favor, tradition, rituals, the visitors and the forest. Anything that doesn't fit is dropped. */
function parseWorship(data: RawSave, content: Content, state: GameState) {
  const w = content.rules.worship;
  if (finiteNonNeg(data.favor)) state.favor = Math.min(w.maxFavor, data.favor);
  if (typeof data.tradition === "string" && content.traditions.some((t) => t.id === data.tradition)) state.tradition = data.tradition;
  if (finiteNonNeg(data.lastRitualAt) && data.lastRitualAt <= state.time) state.lastRitualAt = data.lastRitualAt;
  if (isObject(data.blessings)) {
    for (const r of content.rituals) {
      const b = data.blessings[r.id];
      if (!isObject(b)) continue;
      const timer: { until?: number; readyAt?: number } = {};
      if (finiteNonNeg(b.until)) timer.until = b.until;
      if (finiteNonNeg(b.readyAt)) timer.readyAt = b.readyAt;
      state.blessings[r.id] = timer;
    }
  }
  const sv = data.sarimanok;
  if (content.visitor && isObject(sv) && isPoint(sv.from) && isPoint(sv.to) && finiteNonNeg(sv.at) && finiteNonNeg(sv.until) && sv.until > state.time) {
    state.sarimanok = { from: { x: sv.from.x, y: sv.from.y }, to: { x: sv.to.x, y: sv.to.y }, at: sv.at, until: sv.until };
  }
  const ec = data.eclipse;
  if (content.eclipse && isObject(ec) && finiteNonNeg(ec.endsAt) && finiteNonNeg(ec.taps)) state.eclipse = { endsAt: ec.endsAt, taps: Math.floor(ec.taps) };
  const tk = data.tikbalang;
  if (content.trickery && isObject(tk) && content.trickery.riddles.some((r) => r.id === tk.riddle) && finiteNonNeg(tk.workers) && finiteNonNeg(tk.until)) {
    state.tikbalang = { riddle: tk.riddle as string, workers: Math.floor(tk.workers), until: tk.until, ...(tk.wrong === true ? { wrong: true } : {}) };
  }
  if (Array.isArray(data.pranks)) {
    state.pranks = data.pranks
      .filter((p): p is RawSave => isObject(p) && Number.isInteger(p.x) && Number.isInteger(p.y) && finiteNonNeg(p.until))
      .slice(0, 5)
      .map((p) => ({ x: p.x as number, y: p.y as number, until: p.until as number }));
  }
  const f = data.forest;
  if (isObject(f)) {
    const balance = finiteNonNeg(f.balance) ? Math.min(100, f.balance) : content.rules.forest.start;
    state.forest = {
      balance,
      stage: forestStage(content, balance),
      permission: finiteNonNeg(f.permission) ? Math.min(content.rules.worship.permission.tiles, Math.floor(f.permission)) : 0,
      lastClearAt: finiteNonNeg(f.lastClearAt) && f.lastClearAt <= state.time ? f.lastClearAt : null,
    };
  }
  if (Array.isArray(data.replanting)) {
    const seen = new Set<string>();
    for (const j of data.replanting.slice(0, 200)) {
      if (!isObject(j) || !Number.isInteger(j.x) || !Number.isInteger(j.y) || !finiteNonNeg(j.progress) || !finiteNonNeg(j.seconds) || j.seconds <= 0) continue;
      const k = `${j.x},${j.y}`;
      if (seen.has(k) || tileAt(state.map, j.x as number, j.y as number) !== "cleared" || state.buildings.some((b) => b.x === j.x && b.y === j.y)) continue;
      seen.add(k);
      state.replanting.push({ x: j.x as number, y: j.y as number, progress: Math.min(j.progress, j.seconds), seconds: j.seconds });
    }
  }
  const entries = new Set(content.aklat.map((e) => e.id));
  if (Array.isArray(data.aklat)) state.aklat = [...new Set(data.aklat.filter((id): id is string => typeof id === "string" && entries.has(id)))];
  if (Array.isArray(data.flags)) state.flags = [...new Set(data.flags.filter((x): x is string => typeof x === "string" && x.length <= 40))].slice(0, 100);
}
const CAUSES = ["hunger", "crowded", "other", "age", "sickness", "raid"];
const count = (v: unknown) => (finiteNonNeg(v) ? Math.floor(v) : 0);

/**
 * Every villager as a person (residents.ts): the stored ones that are valid (one per villager at
 * most), then new ones from the seed for the rest. AI barangays store none.
 */
function parseResidents(data: RawSave, content: Content, state: GameState, isPlayer: boolean) {
  state.residents = [];
  state.residentsNext = 1;
  state.household = null;
  if (!isPlayer) return;
  const seen = new Set<number>();
  for (const p of Array.isArray(data.residents) ? data.residents.slice(0, state.villagers) : []) {
    if (!isObject(p) || !Number.isInteger(p.id) || (p.id as number) < 1 || seen.has(p.id as number)) continue;
    if (!GENDERS.includes(p.gender as Gender) || !AGE_GROUPS.includes(p.age as AgeGroup)) continue;
    seen.add(p.id as number);
    // A v26 resident has no class yet: the seed gives it, as for a new arrival.
    const cls = SOCIAL_CLASSES.includes(p.cls as SocialClass) ? (p.cls as SocialClass) : classFor(content, state.map.seed, p.id as number);
    const r: Resident = { id: p.id as number, gender: p.gender as Gender, age: p.age as AgeGroup, cls };
    if (typeof p.since === "number" && Number.isFinite(p.since)) r.since = p.since;
    if (Number.isInteger(p.spouse)) r.spouse = p.spouse as number;
    if (Array.isArray(p.parents) && p.parents.length <= 2 && p.parents.every((x) => Number.isInteger(x))) r.parents = p.parents as number[];
    if (p.came === "born" || p.came === "arrived" || p.came === "founder") r.came = p.came;
    if (typeof p.why === "string" && p.why.length <= 40) r.why = p.why;
    if (typeof p.from === "string" && p.from.length <= 40) r.from = p.from;
    const lessons = parseLife(p.lessons).filter((e) => e.kind === "learned");
    if (lessons.length) r.lessons = lessons.slice(0, content.rules.population.learning.maxPerChild);
    state.residents.push(r);
  }
  if (Number.isInteger(data.residentsNext)) state.residentsNext = Math.max(1, data.residentsNext as number);
  Object.assign(state, syncResidents(state, content));
  // Named villagers are residents too (their family and life story): link any that aren't.
  Object.assign(state, linkNamed(state, content));
  // The datu's household: stored, or made from the seed and the datu's name (older saves).
  const h = data.household;
  const sp = isObject(h) && isObject(h.spouse) ? h.spouse : null;
  state.household =
    isObject(h) && GENDERS.includes(h.datuGender as Gender) && sp && typeof sp.name === "string" && sp.name.length <= 30 && GENDERS.includes(sp.gender as Gender)
      ? { datuGender: h.datuGender as Gender, spouse: { name: sp.name, gender: sp.gender as Gender } }
      : makeHousehold(content, state.map.seed, state.barangay.datu);
}

/** Tasks done, named villagers, history and counters. Unknown tasks and stories are dropped. */
function parsePeople(data: RawSave, content: Content, state: GameState, isPlayer: boolean) {
  const st = isObject(data.stats) ? data.stats : {};
  state.stats = {
    raidsDefended: count(st.raidsDefended),
    rolls: count(st.rolls),
    named: count(st.named),
    replanted: count(st.replanted),
    permittedClears: count(st.permittedClears),
    deaths: count(st.deaths),
    voyages: count(st.voyages),
    trades: count(st.trades),
    bestTens: count(st.bestTens),
  };
  if (!isPlayer) return;
  const quests = new Set(content.quests.map((q) => q.id));
  if (Array.isArray(data.gawainDone)) {
    state.gawainDone = [...new Set(data.gawainDone.filter((id): id is string => typeof id === "string" && quests.has(id)))];
  }
  const stories = new Map(content.villagers.stories.map((s) => [s.id, s]));
  const named: NamedVillager[] = [];
  for (const v of Array.isArray(data.named) ? data.named.slice(0, 500) : []) {
    if (!isObject(v) || !Number.isInteger(v.id) || typeof v.name !== "string" || v.name === "" || v.name.length > 30 || typeof v.story !== "string") continue;
    const story = stories.get(v.story);
    if (!story || !finiteNonNeg(v.since) || named.some((n) => n.id === v.id)) continue;
    const nv: NamedVillager = { id: v.id as number, name: v.name, story: story.id, role: story.role, since: v.since };
    if (v.sick === true) nv.sick = true;
    if (v.frail === true) nv.frail = true;
    if (Number.isInteger(v.resident)) nv.resident = v.resident as number;
    const life = parseLife(v.life);
    if (life.length) nv.life = life;
    // Saves from before genders: from the name's list, else the seed (people.ts namedGender).
    nv.gender = GENDERS.includes(v.gender as Gender) ? (v.gender as Gender) : namedGender(content, nv, state.map.seed);
    named.push(nv);
  }
  // No more named warriors than warriors, nor other named villagers than other villagers.
  const keep = (list: NamedVillager[], n: number) => (n > 0 ? list.slice(-n) : []);
  const kept = new Set([
    ...keep(named.filter((v) => v.role === "warrior"), state.warriors),
    ...keep(named.filter((v) => v.role !== "warrior"), state.villagers - state.warriors),
  ]);
  state.named = named.filter((v) => kept.has(v));
  let sick = 0;
  state.named = state.named.map((v) => {
    if (!v.sick) return v;
    if (sick++ < state.sick.length) return v;
    const out = { ...v };
    delete out.sick;
    return out;
  });
  state.stats.named = Math.max(state.stats.named, ...state.named.map((v) => v.id), 0);
  const history: HistoryEntry[] = [];
  for (const h of Array.isArray(data.history) ? data.history.slice(-MAX_HISTORY) : []) {
    if (!isObject(h) || !finiteNonNeg(h.at) || !HISTORY_KINDS.includes(h.kind as HistoryKind)) continue;
    const e: HistoryEntry = { at: h.at, kind: h.kind as HistoryKind };
    if (typeof h.name === "string" && h.name.length <= 30) e.name = h.name;
    if (GENDERS.includes(h.gender as Gender)) e.gender = h.gender as Gender;
    if (typeof h.story === "string" && stories.has(h.story)) e.story = h.story;
    if (typeof h.cause === "string" && CAUSES.includes(h.cause)) e.cause = h.cause as HistoryEntry["cause"];
    if (typeof h.task === "string" && quests.has(h.task)) e.task = h.task;
    if (Number.isInteger(h.stage)) e.stage = h.stage as number;
    if (typeof h.entry === "string" && content.aklat.some((a) => a.id === h.entry)) e.entry = h.entry;
    if (typeof h.event === "string" && EVENTS.includes(h.event)) e.event = h.event;
    if (isObject(h.amounts)) e.amounts = Object.fromEntries(RESOURCES.filter((r) => finiteNonNeg((h.amounts as RawSave)[r])).map((r) => [r, (h.amounts as RawSave)[r] as number]));
    if (finiteNonNeg(h.favor)) e.favor = h.favor;
    if (Number.isInteger(h.count) && (h.count as number) > 0) e.count = h.count as number;
    if (Number.isInteger(h.level) && (h.level as number) > 0) e.level = h.level as number;
    const ok =
      e.kind === "task"
        ? !!e.task
        : e.kind === "spirits"
          ? e.stage !== undefined
          : e.kind === "aklat"
            ? !!e.entry
            : e.kind === "event"
              ? !!e.event
              : e.kind === "datu" || e.kind === "level" || e.kind === "rank"
                ? e.level !== undefined
                : e.kind === "died"
                  ? DEATH_CAUSES.includes(e.cause ?? "")
                  : !!e.name;
    if (!ok) continue;
    history.push(e);
  }
  state.history = history;
}

/** A saved bridge span: bridge tiles in a straight line from the bridge's own tile. */
function parseSpan(raw: unknown, map: MapState, maxSpan: number, x: number, y: number): { x: number; y: number }[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > maxSpan) return null;
  const span = raw.filter(isObject).map((p) => ({ x: p.x as number, y: p.y as number }));
  if (span.length !== raw.length || !span.some((p) => p.x === x && p.y === y)) return null;
  // A straight line of bridge tiles, one step at a time, through the bridge's own tile.
  const dx = span.length > 1 ? span[1].x - span[0].x : 0;
  const dy = span.length > 1 ? span[1].y - span[0].y : 0;
  if (span.length > 1 && Math.abs(dx) + Math.abs(dy) !== 1) return null;
  const straight = span.every((p, i) => p.x === span[0].x + dx * i && p.y === span[0].y + dy * i);
  return straight && span.every((p) => tileAt(map, p.x, p.y) === "bridge") ? span : null;
}

const STATUSES: NeighborStatus[] = ["independent", "tributary", "ally"];
const PATHS: Path[] = ["trade", "marriage", "sandugo", "mangayaw"];
const isResource = (v: unknown): v is Resource => (RESOURCES as readonly unknown[]).includes(v);
const pct = (v: unknown, fallback: number) => (finiteNonNeg(v) ? Math.min(100, v) : fallback);

/** Reads the region; anything missing or broken is rebuilt from content. */
/** A saved landing: a land tile on the map, or null. */
function parseLanding(raw: unknown, map: MapState): { x: number; y: number } | null {
  if (!isObject(raw) || !Number.isInteger(raw.x) || !Number.isInteger(raw.y)) return null;
  const t = tileAt(map, raw.x as number, raw.y as number);
  return t && t !== "river" && t !== "bridge" ? { x: raw.x as number, y: raw.y as number } : null;
}

/** A saved counter-offer: a known neighbor, two different resources in sane amounts. */
function parseCounter(raw: unknown, ids: Set<string>, content: Content): CounterOffer | null {
  if (!isObject(raw) || !ids.has(raw.neighbor as string) || !finiteNonNeg(raw.expiresAt) || !isObject(raw.give) || !isObject(raw.want)) return null;
  const goods = (g: RawSave) => ({ resource: g.resource as Resource, amount: g.amount as number });
  const p = { give: goods(raw.give), want: goods(raw.want) };
  return validProposal(p, content) ? { neighbor: raw.neighbor as string, expiresAt: raw.expiresAt, ...p } : null;
}

function parseRegion(raw: unknown, content: Content, player: GameState): RegionState {
  const fresh = createRegion(content, player.time, player.rng, player.barangay.id);
  if (!isObject(raw)) return fresh;
  const saved = new Map(
    (Array.isArray(raw.neighbors) ? raw.neighbors : []).filter(isObject).map((n) => [n.id as string, n as RawSave]),
  );
  const neighbors: NeighborState[] = fresh.neighbors.map((base) => {
    const n = saved.get(base.id);
    if (!n) return base;
    const def = content.neighbors.find((d) => d.id === base.id)!;
    const state = (isObject(n.state) && parseState(n.state, aiContent(content), false)) || newNeighborState(content, def, player.rng);
    const status = STATUSES.includes(n.status as NeighborStatus) ? (n.status as NeighborStatus) : "independent";
    const g = n.guard;
    return {
      ...base,
      state,
      trust: pct(n.trust, base.trust),
      influence: pct(n.influence, base.influence),
      status,
      marriage: n.marriage === true,
      loyalty: pct(n.loyalty, 0),
      guard:
        status === "tributary" && isObject(g) && finiteNonNeg(g.warriors) && finiteNonNeg(g.until)
          ? { warriors: Math.floor(g.warriors), until: g.until }
          : null,
      raidCooldownUntil: finiteNonNeg(n.raidCooldownUntil) ? n.raidCooldownUntil : 0,
      nextDecisionAt: finiteNonNeg(n.nextDecisionAt) ? n.nextDecisionAt : base.nextDecisionAt,
      grudge: pct(n.grudge, 0),
      lastRefusal:
        isObject(n.lastRefusal) && REFUSAL_REASONS.includes(n.lastRefusal.reason as RefusalReason) && finiteNonNeg(n.lastRefusal.at)
          ? { reason: n.lastRefusal.reason as RefusalReason, at: n.lastRefusal.at }
          : null,
      tradition: typeof n.tradition === "string" && content.traditions.some((t) => t.id === n.tradition) ? n.tradition : base.tradition,
      fame: parseFame(n.fame, content, state, player.time),
      metAt: finiteNonNeg(n.metAt) && n.metAt <= player.time ? n.metAt : null,
      today: parseToday(n.today),
    };
  });
  const ids = new Set(neighbors.map((n) => n.id));
  const incoming = raw.incomingRaid;
  const offer = raw.offer;
  const victory = raw.victory;
  const paths = (Array.isArray(raw.paths) ? raw.paths : []).filter((p): p is Path => PATHS.includes(p as Path));
  return {
    ...fresh,
    neighbors,
    renown: finiteNonNeg(raw.renown) ? raw.renown : 0,
    truceUntil: finiteNonNeg(raw.truceUntil) ? raw.truceUntil : fresh.truceUntil,
    incomingRaid:
      isObject(incoming) && ids.has(incoming.from as string) && finiteNonNeg(incoming.strikeAt)
        ? { from: incoming.from as string, strikeAt: incoming.strikeAt, landing: parseLanding(incoming.landing, player.map) }
        : null,
    nextAiRaidAt: finiteNonNeg(raw.nextAiRaidAt) ? raw.nextAiRaidAt : 0,
    allyCall:
      isObject(raw.allyCall) && ids.has(raw.allyCall.ally as string) && ids.has(raw.allyCall.from as string) && finiteNonNeg(raw.allyCall.strikeAt)
        ? { ally: raw.allyCall.ally as string, from: raw.allyCall.from as string, strikeAt: raw.allyCall.strikeAt }
        : null,
    counter: parseCounter(raw.counter, ids, content),
    offer:
      isObject(offer) &&
      ids.has(offer.from as string) &&
      isObject(offer.give) &&
      isObject(offer.want) &&
      isResource(offer.give.resource) &&
      isResource(offer.want.resource) &&
      finiteNonNeg(offer.give.amount) &&
      finiteNonNeg(offer.want.amount) &&
      finiteNonNeg(offer.expiresAt)
        ? (offer as unknown as TradeOffer)
        : null,
    reports: (Array.isArray(raw.reports) ? raw.reports : [])
      .filter((r): r is Report => isObject(r) && finiteNonNeg(r.id) && typeof r.kind === "string" && ids.has(r.neighbor as string))
      .slice(-12),
    nextReportId: finiteNonNeg(raw.nextReportId) ? Math.floor(raw.nextReportId) : 1,
    nextTributeAt: finiteNonNeg(raw.nextTributeAt) ? raw.nextTributeAt : fresh.nextTributeAt,
    paths,
    victory:
      isObject(victory) && finiteNonNeg(victory.time) && Array.isArray(victory.paths)
        ? { time: victory.time, paths: victory.paths.filter((p): p is Path => PATHS.includes(p as Path)) }
        : null,
    ...parseArchipelago(raw, content, player, fresh, neighbors),
  };
}

/** Islands, places, blocs and wars, the Balita and boats at sea. Missing (an older save): made from the seed. */
function parseArchipelago(raw: RawSave, content: Content, player: GameState, fresh: RegionState, neighbors: NeighborState[]): Pick<RegionState, "islands" | "places" | "politics" | "news" | "nextNewsId" | "voyages" | "nextVoyageId"> {
  const me = player.barangay.id;
  const ids = new Set([me, ...neighbors.map((n) => n.id)]);
  // Islands and places: kept only if every barangay has a spot on a known island.
  const islands = (Array.isArray(raw.islands) ? raw.islands : []).filter(
    (i): i is RawSave => isObject(i) && typeof i.id === "string" && typeof i.name === "string" && [i.x, i.y, i.r].every((v) => typeof v === "number" && Number.isFinite(v)),
  ) as unknown as Island[];
  const placesRaw = isObject(raw.places) ? raw.places : {};
  const islandIds = new Set(islands.map((i) => i.id));
  const placesOk = islands.length > 0 && [...ids].every((id) => {
    const p = placesRaw[id];
    return isObject(p) && islandIds.has(p.island as string) && typeof p.x === "number" && typeof p.y === "number";
  });
  const generated = generateArchipelago(content, player.map.seed, me);
  const islandsOut = placesOk ? islands : generated.islands;
  const places: Record<string, Place> = placesOk
    ? Object.fromEntries([...ids].map((id) => [id, { island: (placesRaw[id] as RawSave).island as string, x: (placesRaw[id] as RawSave).x as number, y: (placesRaw[id] as RawSave).y as number }]))
    : generated.places;
  // Blocs: members must be known barangays; missing (an older save), they are made from the seed,
  // leaving out the player's tributaries and allies.
  const pol = raw.politics;
  let politics: Politics;
  if (isObject(pol) && Array.isArray(pol.blocs)) {
    const blocs = pol.blocs
      .filter((b): b is RawSave => isObject(b) && typeof b.id === "string" && typeof b.leader === "string" && Array.isArray(b.members))
      .map((b) => ({ id: b.id as string, leader: b.leader as string, members: [...new Set((b.members as unknown[]).filter((m): m is string => typeof m === "string" && ids.has(m)))] }))
      .filter((b) => b.members.length > 0 && b.members.includes(b.leader));
    const seen = new Set<string>();
    const unique = blocs.map((b) => ({ ...b, members: b.members.filter((m) => !seen.has(m) && (seen.add(m), true)) })).filter((b) => b.members.includes(b.leader));
    const blocIds = new Set(unique.map((b) => b.id));
    const wars = (Array.isArray(pol.wars) ? pol.wars : [])
      .filter((w): w is RawSave => isObject(w) && blocIds.has(w.a as string) && blocIds.has(w.b as string) && w.a !== w.b && finiteNonNeg(w.since))
      .map((w) => ({ a: w.a as string, b: w.b as string, since: w.since as number }));
    politics = {
      blocs: unique,
      wars,
      nextBlocId: Number.isInteger(pol.nextBlocId) ? Math.max(pol.nextBlocId as number, unique.length + 1) : unique.length + 1,
      lastEventAt: finiteNonNeg(pol.lastEventAt) ? pol.lastEventAt : null,
      nextWarTickAt: finiteNonNeg(pol.nextWarTickAt) ? pol.nextWarTickAt : fresh.politics.nextWarTickAt,
    };
  } else {
    const free = neighbors.filter((n) => n.status === "independent").map((n) => n.id);
    const strength = (id: string) => strengthOfState(neighbors.find((n) => n.id === id)!.state, content);
    politics = { ...generateBlocs(content, free, strength, player.map.seed), nextWarTickAt: Math.floor(player.time) + content.rules.politics.warTickSeconds };
  }
  const news = (Array.isArray(raw.news) ? raw.news : [])
    .filter((n): n is RawSave => isObject(n) && finiteNonNeg(n.id) && finiteNonNeg(n.time) && typeof n.key === "string")
    .slice(-MAX_NEWS)
    .map((n) => ({
      id: n.id as number,
      time: n.time as number,
      key: n.key as string,
      ...(typeof n.barangay === "string" ? { barangay: n.barangay } : {}),
      ...(typeof n.bloc === "string" ? { bloc: n.bloc } : {}),
      ...(typeof n.other === "string" ? { other: n.other } : {}),
    }));
  const voyages = (Array.isArray(raw.voyages) ? raw.voyages : [])
    .filter((v): v is RawSave => isObject(v) && finiteNonNeg(v.id) && (v.leg === "out" || v.leg === "home") && ids.has(v.target as string) && finiteNonNeg(v.departAt) && finiteNonNeg(v.arriveAt) && finiteNonNeg(v.warriors))
    .filter((v) => v.leg === "home" || (isObject(v.command) && typeof v.command.type === "string"))
    .slice(0, player.balangays)
    .map((v) => ({
      id: v.id as number,
      leg: v.leg as "out" | "home",
      target: v.target as string,
      command: v.leg === "out" ? (v.command as Voyage["command"]) : null,
      departAt: v.departAt as number,
      arriveAt: v.arriveAt as number,
      warriors: Math.min(Math.floor(v.warriors as number), player.warriors),
      ...(v.waiting === true ? { waiting: true } : {}),
    }));
  return {
    islands: islandsOut,
    places,
    politics,
    news,
    nextNewsId: finiteNonNeg(raw.nextNewsId) ? Math.max(Math.floor(raw.nextNewsId), (news.at(-1)?.id ?? 0) + 1) : (news.at(-1)?.id ?? 0) + 1,
    voyages,
    nextVoyageId: finiteNonNeg(raw.nextVoyageId) ? Math.max(Math.floor(raw.nextVoyageId), ...voyages.map((v) => v.id + 1), 1) : voyages.length + 1,
  };
}

/**
 * Writes the game. `savedAt` is the wall-clock time in ms, passed in by the UI (the engine never
 * reads the clock); it lets offline progress credit the time away on the next load.
 */
export function saveGame(state: GameState, storage: KeyValueStore = localStorage, savedAt?: number): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(savedAt !== undefined && Number.isFinite(savedAt) ? { ...state, savedAt } : state));
  } catch {
    // Storage full or blocked (private mode): the game still plays, it just won't persist.
  }
}

/** Loads the saved game, or starts a new one with `seed` if there is none. */
export function loadGame(content: Content, storage: KeyValueStore = localStorage, seed?: number): GameState {
  try {
    const json = storage.getItem(SAVE_KEY);
    if (json) return parseSave(json, content) ?? newGame(content, seed);
  } catch {
    // Storage blocked: start fresh.
  }
  return newGame(content, seed);
}

/** When the save was written (wall-clock ms), or null for older saves or none. */
export function readSavedAt(storage: KeyValueStore = localStorage): number | null {
  try {
    const json = storage.getItem(SAVE_KEY);
    const raw = json ? JSON.parse(json) : null;
    return isObject(raw) && finiteNonNeg(raw.savedAt) ? raw.savedAt : null;
  } catch {
    return null;
  }
}

export function clearSave(storage: KeyValueStore = localStorage): void {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

// ---------- Export and import ----------

/** Save codes start with this, so a pasted code is easy to recognise. */
export const SAVE_CODE_PREFIX = "BLSAVE1:";

/**
 * The game as a save code: the save (with its version) as UTF-8 JSON in base64, behind a
 * prefix. Pasting it into Import brings the game back, migrated if it is from an older version.
 */
export function exportCode(state: GameState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return SAVE_CODE_PREFIX + btoa(bin);
}

/** The game as a save file's text (plain JSON, as stored in the browser). */
export const exportFile = (state: GameState): string => JSON.stringify(state);

/**
 * Reads a save code or a save file's text, checks it and migrates it to the current version.
 * Null if it isn't a save this game can read (broken, or from a newer version).
 */
export function importSave(text: string, content: Content): GameState | null {
  const trimmed = text.trim();
  let json = trimmed;
  if (trimmed.startsWith(SAVE_CODE_PREFIX)) {
    try {
      const bin = atob(trimmed.slice(SAVE_CODE_PREFIX.length).replace(/\s+/g, ""));
      json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    } catch {
      return null;
    }
  }
  return parseSave(json, content);
}
