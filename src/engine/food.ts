// How a barangay eats (rules.food): everyday food (Pagkain) from many sources, kept the way it
// was historically. Root crops stay in the ground until they're needed (no spoiling, safe from
// typhoons); fresh fish, meat and fruit spoil unless they're kept alive in a Baklad or preserved
// (smoked and dried in every house, or salted with Asin) into household jars and the Kamalig.
// People eat fresh food first, then live fish, root crops, and preserved food last; with none
// left they eat Palay, wastefully. Also: a varied diet, worn-out kaingin, over-fishing and
// over-hunting, Pista and rice wine. Pure and deterministic: no React, no browser APIs.
import { FOOD_GROUPS, type BuildingDef, type Content, type FoodGroup } from "./content";
import type { GameState, PlacedBuilding } from "./game";
import { seasonAt } from "./events";
import { levelOf, storageAt } from "./upgrades";
import { rollAt } from "./rng";
import { setTiles, tileAt, type Point } from "./map";

/** Where the barangay's Pagkain is: its total is always resources.food. */
export interface FoodStore {
  /** Root crops still in the ground (Gabihan, Kaingin). */
  ground: number;
  /** Fresh fish, meat, bananas and coconuts: spoils. */
  fresh: number;
  /** Fish kept alive in a Baklad. */
  live: number;
  /** Smoked, dried, salted and fermented food in household jars, and dried goods in the Kamalig. */
  preserved: number;
}

export const emptyStore = (): FoodStore => ({ ground: 0, fresh: 0, live: 0, preserved: 0 });
export const storeTotal = (s: FoodStore) => s.ground + s.fresh + s.live + s.preserved;

const defsOf = (content: Content) => new Map(content.buildings.map((d) => [d.id, d]));
const standing = (b: PlacedBuilding) => !b.damaged && !b.paused;

/** How much each place can hold: the ground (per plot), the Baklad (live fish), the jars and the Kamalig (preserved), Asin. */
export function foodCaps(state: GameState, content: Content): { ground: number; live: number; preserved: number; salt: number } {
  const f = content.rules.food;
  const defs = defsOf(content);
  let ground = 0;
  let live = 0;
  let preserved = content.rules.storage.baseDried;
  let salt = content.rules.storage.baseSalt;
  for (const b of state.buildings) {
    const d = defs.get(b.type);
    if (!d || b.damaged) continue;
    if (d.foodKind === "root") ground += f.groundPerPlot;
    if (d.keepsFishAlive) live += f.livePerBaklad;
    if ((d.housing ?? 0) > 0) preserved += f.jarsPerHouse;
    const store = storageAt(d, levelOf(b));
    preserved += store.food ?? 0;
    salt += store.salt ?? 0;
  }
  // The datu's own kamalig, part of the Bahay ng Datu, grows with its level.
  preserved += (f.datuStorePerLevel.food ?? 0) * state.datuLevel;
  return { ground, live, preserved, salt };
}

/**
 * The store matched to resources.food after anything else changed it: a cost or a raid (taken
 * from preserved food first, then fresh, live and ground), or a gift, reward or gathering
 * (gains go to the jars while there's room, the rest is fresh).
 */
export function syncStore(state: GameState, content: Content): FoodStore {
  const s = { ...(state.foodStore ?? emptyStore()) };
  const want = Math.max(0, state.resources.food);
  let diff = want - storeTotal(s);
  if (Math.abs(diff) < 1e-9) return s;
  if (diff > 0) {
    const room = Math.max(0, foodCaps(state, content).preserved - s.preserved);
    const toJars = Math.min(room, diff);
    s.preserved += toJars;
    s.fresh += diff - toJars;
    return s;
  }
  for (const k of ["preserved", "fresh", "live", "ground"] as const) {
    const take = Math.min(s[k], -diff);
    s[k] -= take;
    diff += take;
    if (diff >= -1e-9) break;
  }
  return s;
}

// ---------- Yields ----------

/** Percent → factor, 100 = as is. */
const pct = (v: number | undefined) => (v === undefined ? 1 : v / 100);

/** Has this kaingin's soil worn out (rest it: restKaingin)? */
export const wornOut = (content: Content, def: BuildingDef | undefined, b: PlacedBuilding) => !!def?.wearsOut && (b.harvested ?? 0) >= content.rules.food.kaingin.fertileHarvest;

/**
 * A building's yield factor beyond its workers and the usual bonuses: the season for its crop
 * (drought, rough seas), the barangay's tradition, an over-worked fishing or hunting ground, a
 * worn-out kaingin, a locust swarm, trampling boar.
 */
export function yieldFactor(state: GameState, content: Content, b: PlacedBuilding, def: BuildingDef | undefined): number {
  if (!def) return 1;
  const f = content.rules.food;
  let k = 1;
  const season = seasonAt(content, state.time)?.season.id;
  if (season) k *= pct(f.seasonYield[season]?.[def.id]);
  const tradition = content.traditions.find((t) => t.id === state.tradition);
  k *= pct(tradition?.foodYield?.[def.id]);
  // Where the tradition keeps no pigs, the pen holds chickens only: less meat.
  if (def.id === "babuyan" && tradition?.pigs === false) k *= 0.6;
  if (def.depletes) k *= 1 - Math.min(1, b.depletion ?? 0) * (f.depletion.maxPenaltyPercent / 100);
  if (wornOut(content, def, b)) k = 0;
  const p = state.pest;
  const rules = content.rules.pests;
  if (p?.kind === "locust" && p.strikeAt !== undefined && state.time >= p.strikeAt && state.time < p.until && (def.id === "palayan" || def.wearsOut)) k *= 1 - rules.locustPercent / 100;
  if ((b.trampledUntil ?? 0) > state.time) k *= 1 - rules.boarPercent / 100;
  return k;
}

// ---------- Eating ----------

/**
 * One step of the barangay's food: what was brought in goes where it's kept, fresh food is
 * preserved (smoked and dried by every house, salted with Asin) and spoils, and everyone eats:
 * fresh food first, then live fish, root crops and preserved food; with none left, Palay
 * (riceWastePercent of a share each). AI barangays keep one simple pool and eat Palay 1:1.
 */
export function feed(state: GameState, content: Content, dt: number, foodByBuilding: number[], foodEaten: number): GameState {
  const resources = { ...state.resources };
  const f = content.rules.food;
  if (content.ai) {
    // AI barangays: one simple pool. They eat their Palay first, 1:1 (it's most of their
    // harvest), then Pagkain, so some Pagkain is left for what it pays for (clearing, warriors).
    const made = foodByBuilding.reduce((a, b) => a + b, 0) * dt;
    let need = foodEaten * dt;
    const fromRice = Math.min(Math.max(0, resources.rice - f.aiRiceReserve), need);
    resources.rice -= fromRice;
    need -= fromRice;
    // Kept in their houses' jars (and any Kamalig): beyond that, nothing more is stored.
    const cap = foodCaps(state, content).preserved;
    const food = Math.max(0, Math.min(Math.max(cap, resources.food), resources.food + made - need));
    resources.food = food;
    return { ...state, resources, foodStore: { ...emptyStore(), preserved: food } };
  }
  const caps = foodCaps(state, content);
  const store = syncStore(state, content);
  const defs = defsOf(content);
  // What was brought in, where it's kept.
  state.buildings.forEach((b, i) => {
    const made = (foodByBuilding[i] ?? 0) * dt;
    if (made <= 0) return;
    const d = defs.get(b.type);
    if (d?.foodKind === "root") {
      const into = Math.min(made, Math.max(0, caps.ground - store.ground));
      store.ground += into;
      store.fresh += made - into;
    } else if (d?.foodKind === "dried") {
      const into = Math.min(made, Math.max(0, caps.preserved - store.preserved));
      store.preserved += into;
      store.fresh += made - into;
    } else if (d?.foodGroup === "fish") {
      // Fish go into the Baklad alive while there's room.
      const into = Math.min(made, Math.max(0, caps.live - store.live));
      store.live += into;
      store.fresh += made - into;
    } else store.fresh += made;
  });
  // Preserving: smoked and dried in every house, salted with Asin, into the jars and the Kamalig.
  const houses = state.buildings.filter((b) => standing(b) && (defs.get(b.type)?.housing ?? 0) > 0).length;
  let room = Math.max(0, caps.preserved - store.preserved);
  const smoked = Math.min(store.fresh, houses * f.smokePerHousePerSecond * dt, room);
  store.fresh -= smoked;
  store.preserved += smoked;
  room -= smoked;
  const salted = Math.min(store.fresh, houses * f.saltPerHousePerSecond * dt, resources.salt * f.saltPreservesPerUnit, room);
  store.fresh -= salted;
  store.preserved += salted;
  resources.salt = Math.max(0, resources.salt - salted / f.saltPreservesPerUnit);
  // Fresh food left out spoils.
  store.fresh -= store.fresh * Math.min(1, (f.spoilPercentPerMinute / 100) * (dt / 60));
  // Everyone eats: fresh first, then live fish, root crops, preserved food.
  let need = foodEaten * dt;
  for (const k of ["fresh", "live", "ground", "preserved"] as const) {
    const take = Math.min(store[k], need);
    store[k] -= take;
    need -= take;
  }
  if (need > 1e-12) {
    // No Pagkain left: Palay, wastefully (in full while an old save's grace lasts).
    const waste = state.time < (state.foodGraceUntil ?? 0) ? 1 : f.riceWastePercent / 100;
    resources.rice = Math.max(0, resources.rice - need * waste);
  }
  for (const k of ["ground", "fresh", "live", "preserved"] as const) store[k] = Math.max(0, store[k]);
  resources.food = storeTotal(store);
  return { ...state, resources, foodStore: store };
}

/** Is the barangay out of food: no Pagkain and no Palay left? */
export const outOfFood = (state: GameState) => state.resources.food <= 0 && state.resources.rice <= 0 && state.villagers > 0;

// ---------- A varied diet ----------

/** The food groups the barangay is bringing in now (a building at work making food). */
export function foodGroups(state: GameState, content: Content, foodByBuilding: number[]): FoodGroup[] {
  const defs = defsOf(content);
  const groups = new Set<FoodGroup>();
  state.buildings.forEach((b, i) => {
    const g = defs.get(b.type)?.foodGroup;
    if (g && (foodByBuilding[i] ?? 0) > 0) groups.add(g);
  });
  return FOOD_GROUPS.filter((g) => groups.has(g));
}

/** Happiness from the diet: perGroupHappiness for each food group beyond the first, or the monotony penalty. */
export function dietHappiness(state: GameState, content: Content): number {
  const v = content.rules.food.variety;
  if ((state.monotonyFor ?? 0) >= v.monotonySeconds) return v.monotonyHappiness;
  return Math.max(0, (state.dietGroups ?? 0) - 1) * v.perGroupHappiness;
}

/** How much likelier sickness is: more after eating one kind of food for a long time. */
export const dietSicknessFactor = (state: GameState, content: Content) =>
  (state.monotonyFor ?? 0) >= content.rules.food.variety.monotonySeconds ? 1 + content.rules.food.variety.monotonySickPercent / 100 : 1;

// ---------- Worn soil, worked-out grounds, monotony ----------

/**
 * After a step: kaingin soil tires with each harvest; fishing and hunting grounds wear with the
 * catch (more with like buildings nearby) and recover while resting; the diet's monotony clock.
 */
export function updateFoodLand(state: GameState, content: Content, dt: number, foodByBuilding: number[], groups: number): GameState {
  const f = content.rules.food;
  const defs = defsOf(content);
  const buildings = state.buildings.map((b, i) => {
    const d = defs.get(b.type);
    const made = (foodByBuilding[i] ?? 0) * dt;
    let next = b;
    if (d?.wearsOut && made > 0) next = { ...next, harvested: (b.harvested ?? 0) + made };
    if (d?.depletes) {
      const crowd = state.buildings.filter((o) => o !== b && o.type === b.type && Math.hypot(o.x - b.x, o.y - b.y) <= f.depletion.radius).length;
      const worn = (b.depletion ?? 0) + made * f.depletion.perUnit * (1 + crowd) - (f.depletion.recoveryPerMinute / 60) * dt;
      next = { ...next, depletion: Math.min(1, Math.max(0, worn)) };
    }
    if (next.trampledUntil !== undefined && next.trampledUntil <= state.time) {
      next = { ...next };
      delete next.trampledUntil;
    }
    return next;
  });
  const monotonyFor = groups <= 1 && state.villagers > 0 ? (state.monotonyFor ?? 0) + dt : 0;
  return { ...state, buildings, monotonyFor, dietGroups: groups };
}

/** Rest a kaingin: the plot goes back to forest (Forest Balance recovers a little) and a new one can be cleared. */
export function restKaingin(state: GameState, content: Content, x: number, y: number): GameState {
  const i = state.buildings.findIndex((b) => b.x === x && b.y === y);
  const b = state.buildings[i];
  const d = b ? content.buildings.find((x2) => x2.id === b.type) : undefined;
  if (!b || !d?.wearsOut) return state;
  const forest = state.forest;
  return {
    ...state,
    buildings: state.buildings.filter((_, k) => k !== i),
    map: setTiles(state.map, [{ x, y, tile: "forest" }]),
    forest: { ...forest, balance: Math.min(100, forest.balance + content.rules.food.kaingin.fallowBalance) },
    stats: { ...state.stats, kainginRested: (state.stats.kainginRested ?? 0) + 1 },
  };
}

// ---------- Pests and animals ----------

export interface PestEvent {
  kind: "rats" | "locust" | "boar";
  /** When it was seen (and, for rats, when it struck). */
  at: number;
  /** Locusts: when the swarm reaches the fields. */
  strikeAt?: number;
  /** When it's over (and its notice goes). */
  until: number;
  /** Rats: the Palay eaten. */
  amount?: number;
  /** Boar: the field they trampled. */
  x?: number;
  y?: number;
}

const SALT_PEST = 8801;
const SALT_PEST_KIND = 8802;
const SALT_PEST_FIELD = 8803;

/** Palay held outside any Kamalig (above what the Kamaligs and the datu's store keep safe): rats can reach it. */
export function unprotectedRice(state: GameState, content: Content): number {
  const defs = defsOf(content);
  const safe = state.buildings.reduce((n, b) => n + (b.damaged ? 0 : (storageAt(defs.get(b.type), levelOf(b)).rice ?? 0)), 0) + (content.rules.food.datuStorePerLevel.rice ?? 0) * state.datuLevel;
  return Math.max(0, state.resources.rice - safe);
}

/** Fields boar could trample: food fields next to the forest with no Bantayan or hunters' camp nearby. */
export function boarFields(state: GameState, content: Content): PlacedBuilding[] {
  const defs = defsOf(content);
  const r = content.rules.pests.boarGuardRadius;
  const guards = state.buildings.filter((b) => !b.damaged && (defs.get(b.type)?.watch || b.type === "pangangaso"));
  const nearForest = (p: Point) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => tileAt(state.map, p.x + dx, p.y + dy) === "forest"));
  return state.buildings.filter((b) => {
    const d = defs.get(b.type);
    if (!d || b.damaged || !(d.foodKind === "root" || d.id === "palayan" || d.id === "sagingan")) return false;
    return nearForest(b) && !guards.some((g) => Math.hypot(g.x - b.x, g.y - b.y) <= r);
  });
}

/**
 * Pests and animals, rolled once per game second crossed (online only, the player's barangay):
 * rats in the Palay outside a Kamalig, a locust swarm (seen coming first), wild boar in a field
 * by the forest. One at a time, with a cooldown; each is told in a notice and passes.
 */
export function updatePests(state: GameState, content: Content, t0: number, t1: number): GameState {
  const r = content.rules.pests;
  let s = state;
  for (let second = Math.floor(t0 + 1e-9) + 1; second <= Math.floor(t1 + 1e-9); second++) {
    if (s.pest && second >= s.pest.until) s = { ...s, pest: null };
    if (s.pest || second < r.startsAfterSeconds || second < (s.nextEventAt.pests ?? 0)) continue;
    const seed = s.map.seed;
    const roll = rollAt(seed, second, SALT_PEST);
    const total = r.ratsChancePerSecond + r.locustChancePerSecond + r.boarChancePerSecond;
    if (roll >= total) continue;
    const which = rollAt(seed, second, SALT_PEST_KIND) * total;
    let pest: PestEvent | null = null;
    if (which < r.ratsChancePerSecond) {
      const lost = Math.floor((unprotectedRice(s, content) * r.ratsPercent) / 100);
      if (lost > 0) {
        s = { ...s, resources: { ...s.resources, rice: s.resources.rice - lost } };
        pest = { kind: "rats", at: second, until: second + 30, amount: lost };
      }
    } else if (which < r.ratsChancePerSecond + r.locustChancePerSecond) {
      if (s.buildings.some((b) => b.type === "palayan" || content.buildings.find((d) => d.id === b.type)?.wearsOut)) {
        pest = { kind: "locust", at: second, strikeAt: second + r.locustWarningSeconds, until: second + r.locustWarningSeconds + r.locustSeconds };
      }
    } else {
      const fields = boarFields(s, content);
      if (fields.length) {
        const field = fields[Math.floor(rollAt(seed, second, SALT_PEST_FIELD) * fields.length)];
        const until = second + r.boarSeconds;
        s = { ...s, buildings: s.buildings.map((b) => (b === field ? { ...b, trampledUntil: until } : b)) };
        // Root crops dug up and eaten.
        if (content.buildings.find((d) => d.id === field.type)?.foodKind === "root") {
          const store = syncStore(s, content);
          const lost = Math.min(store.ground, r.boarStock);
          store.ground -= lost;
          s = { ...s, foodStore: store, resources: { ...s.resources, food: storeTotal(store) } };
        }
        pest = { kind: "boar", at: second, until, x: field.x, y: field.y };
      }
    }
    if (pest) s = { ...s, pest, nextEventAt: { ...s.nextEventAt, pests: second + r.cooldownSeconds } };
  }
  return s;
}

// ---------- Rice wine and the Pista ----------

/** Brew rice wine (tapay) from Palay: ricePerWine Palay a jar. */
export function brewWine(state: GameState, content: Content, amount: number): GameState {
  const n = Math.floor(amount);
  const cost = n * content.rules.food.brew.ricePerWine;
  if (n <= 0 || state.resources.rice < cost) return state;
  return { ...state, resources: { ...state.resources, rice: state.resources.rice - cost, wine: state.resources.wine + n } };
}

export const PISTA_OCCASIONS = ["harvest", "victory", "marriage", "peace", "mourning"] as const;
export type PistaOccasion = (typeof PISTA_OCCASIONS)[number];

/** What a Pista can mark now: a harvest always; a recent victory, a marriage alliance, a sandugo, mourning ended. */
export function pistaOccasions(state: GameState, content: Content): PistaOccasion[] {
  const out: PistaOccasion[] = ["harvest"];
  const day = content.rules.dayNight.daySeconds;
  const region = state.region;
  if (region?.reports.some((r) => r.win && (r.kind === "defense" || r.kind === "raid") && state.time - r.time <= day)) out.push("victory");
  if (region?.neighbors.some((n) => n.marriage)) out.push("marriage");
  if (region?.neighbors.some((n) => n.status === "ally")) out.push("peace");
  if (state.stats.deaths > 0 && state.mourning <= 0 && state.remembered.length > 0) out.push("mourning");
  return out;
}

export type PistaBlocker = "raid" | "hunger" | "cooldown" | "cost" | null;

/** Why a Pista can't be held now: during a raid or famine, too soon after the last, or not enough to share. */
export function pistaBlocker(state: GameState, content: Content): PistaBlocker {
  const p = content.rules.food.pista;
  if (state.region?.incomingRaid) return "raid";
  if (state.hunger > 0 || outOfFood(state)) return "hunger";
  if (state.lastPistaAt !== null && state.lastPistaAt !== undefined && state.time - state.lastPistaAt < p.cooldownSeconds) return "cooldown";
  for (const [r, n] of Object.entries(p.cost)) if ((state.resources[r as keyof typeof state.resources] ?? 0) < (n ?? 0)) return "cost";
  return null;
}

/**
 * A Pista at the Bahay ng Datu: spends Palay, rice wine and Pagkain; happiness rises for a while,
 * renown grows, and invited allies and bloc mates trust the barangay more.
 */
export function holdPista(state: GameState, content: Content, occasion: PistaOccasion): GameState {
  if (pistaBlocker(state, content) || !pistaOccasions(state, content).includes(occasion)) return state;
  const p = content.rules.food.pista;
  const resources = { ...state.resources };
  for (const [r, n] of Object.entries(p.cost)) resources[r as keyof typeof resources] -= n ?? 0;
  let region = state.region;
  const guests: string[] = [];
  if (region) {
    const me = state.barangay.id;
    const bloc = region.politics.blocs.find((b) => b.members.includes(me));
    region = {
      ...region,
      neighbors: region.neighbors.map((n) => {
        if (n.status !== "ally" && !bloc?.members.includes(n.id)) return n;
        guests.push(n.id);
        return { ...n, trust: Math.min(100, n.trust + p.trust) };
      }),
    };
  }
  return {
    ...state,
    resources,
    region,
    pista: { occasion, at: state.time, until: state.time + p.happinessSeconds, guests },
    lastPistaAt: state.time,
    kabantugan: state.kabantugan + p.renown,
    stats: { ...state.stats, pistas: (state.stats.pistas ?? 0) + 1 },
    // The Aklat entry on feasts and rice wine (content/lore/pista-tapay.json).
    flags: state.flags.includes("pista") ? state.flags : [...state.flags, "pista"],
  };
}

/** Happiness while a Pista is remembered. */
export const pistaHappiness = (state: GameState, content: Content) => (state.pista && state.time < state.pista.until ? content.rules.food.pista.happiness : 0);

/** Food winning raiders can take: only what's preserved in jars and the Kamalig, never root crops in the ground or fish in a Baklad. */
export const lootableFood = (state: GameState) => (state.foodStore ? state.foodStore.preserved : state.resources.food);
