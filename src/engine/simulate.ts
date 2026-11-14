// A balance simulation: plays the engine for a number of game days with a simple, reasonable
// strategy (houses and fields to keep rice positive, Kamalig, clearing land, warriors within the
// cap, a trade now and then) and records the barangay and its AI rivals once per day. Used by
// `npm run simulate` (scripts/simulate.ts) to tune content/rules.json, and by a test that checks
// the balance targets. Pure and deterministic: the same seed gives the same run.
import { RESOURCES, type Content, type Resource } from "./content";
import { apply, buildingCost, canAfford, housing, newGame, owned, rates, tick, warriorCap, type Command, type GameState } from "./game";
import { autoPlaceTile, isUnlocked } from "./map";
import { nearestClearable } from "./clearing";
import { riceCap } from "./storage";
import { nextDatuLevel, datuLevelNeeded } from "./datu";
import { barangayLevel, levelForRenown } from "./kabantugan";
import { dayAt } from "./daynight";
import { nextUpgrade, upgradeCost } from "./upgrades";
import { softCap } from "./stockpile";

export interface DayRow {
  day: number;
  rice: number;
  riceCap: number;
  wood: number;
  gold: number;
  /** The stockpile's soft caps (stockpile.ts): a few times the next big purchase. */
  woodCap: number;
  goldCap: number;
  villagers: number;
  buildings: number;
  level: number;
  renown: number;
  /** Price of the next Bahay Kubo (wood). */
  kuboCost: number;
  /** Seconds of the day spent with no rice. */
  hungrySeconds: number;
  /** Seconds of the day the rice store was full. */
  fullSeconds: number;
  /** The strongest AI rival's buildings, villagers and level. */
  aiBuildings: number;
  aiVillagers: number;
  aiLevel: number;
  aiRenown: number;
  /** Average buildings of all AI barangays. */
  aiAvgBuildings: number;
}

export interface SimResult {
  rows: DayRow[];
  /** Game second each building type was first built, and when the first automated income came. */
  firsts: Record<string, number>;
  firstIncomeAt: number | null;
  /** Game seconds at which a new building became unlocked (for "a new unlock every few minutes"). */
  unlockTimes: number[];
  /** Everything new in the order it came: buildings unlocked, barangay levels, Bahay ng Datu levels. */
  milestones: { t: number; what: string }[];
}

/** Seconds between the bot's decisions. */
const THINK_SECONDS = 5;

/** One decision: the first useful thing the bot can do, or the state unchanged. */
export function botDecide(state: GameState, content: Content): GameState {
  const run = (cmd: Command) => apply(state, content, cmd);
  const tryBuild = (id: string): GameState | null => {
    const def = content.buildings.find((b) => b.id === id);
    if (!def || !isUnlocked(state, def) || !canAfford(state, buildingCost(content, def, owned(state, id)))) return null;
    const tile = autoPlaceTile(state, content, def, { keepEdge: true });
    if (!tile) return null;
    const next = run({ type: "build", building: id, x: tile.x, y: tile.y });
    return next === state ? null : next;
  };
  const r = rates(state, content);
  const fields = owned(state, "palayan");
  const camps = owned(state, "woodcutter-camp");
  const docks = owned(state, "fishing-dock");
  const kamalig = owned(state, "kamalig");
  const kuta = owned(state, "kuta");
  const cap = riceCap(state, content);
  // What the next big purchases cost: two houses' worth of wood, the next upgrades' gold.
  const kuboDef = content.buildings.find((b) => b.id === "bahay-kubo")!;
  const woodNeed = 2 * buildingCost(content, kuboDef, owned(state, "bahay-kubo")).wood + 100;
  const goldNeed = 200;
  // Gather by hand only at the very start.
  if (fields === 0 && state.resources.wood < 15) {
    let s = state;
    for (let i = 0; i < 5; i++) s = apply(s, content, { type: "gather", resource: "wood" });
    return s;
  }
  // Out of rice: gather by hand (as a player would tap) until the fields work again.
  if (state.resources.rice < 3) {
    let s = state;
    for (let i = 0; i < 10; i++) s = apply(s, content, { type: "gather", resource: "rice" });
    return s;
  }
  // Fires out, damage repaired, a waiting choice answered (the first option it can pay for).
  const burning = state.buildings.find((b) => b.burningSince !== undefined);
  if (burning) return run({ type: "extinguish", x: burning.x, y: burning.y });
  for (const b of state.buildings) {
    if (!b.damaged) continue;
    const next = run({ type: "repair", x: b.x, y: b.y });
    if (next !== state) return next;
  }
  if (state.choice) {
    const def = content.choices.find((c) => c.id === state.choice!.id);
    for (const o of def?.choices ?? []) {
      const next = run({ type: "choose", option: o.id });
      if (next !== state) return next;
    }
  }
  const steps: (() => GameState | null)[] = [
    () => (r.net.rice < 0.3 ? tryBuild("palayan") : null),
    // Camps and docks when wood or gold runs short for what comes next, as a player would.
    () => (camps === 0 || (camps * 2 < fields && state.resources.wood < woodNeed) ? tryBuild("woodcutter-camp") : null),
    () => (state.villagers >= housing(state, content) - 1 && (r.net.rice > 0.5 || state.resources.rice > cap * 0.5) ? tryBuild("bahay-kubo") : null),
    // A Kamalig for every 7 fields; upgrade one when the store is nearly full.
    () => (kamalig * 7 < fields ? tryBuild("kamalig") : null),
    () => {
      if (state.resources.rice < cap * 0.9) return null;
      const k = state.buildings.find((b) => b.type === "kamalig" && nextUpgrade(content, b) && canAfford(state, upgradeCost(content, b)));
      if (k) {
        const next = run({ type: "upgradeBuilding", x: k.x, y: k.y });
        if (next !== state) return next;
      }
      return null;
    },
    () => ((docks === 0 || state.resources.gold < goldNeed) && docks * 15 < state.villagers ? tryBuild("fishing-dock") : null),
    // Full granaries: rice goes to the anito at the Dambana.
    () => {
      if (state.resources.rice < cap * 0.95 || owned(state, "dambana") === 0) return null;
      if (!state.tradition) {
        const t = content.traditions[0];
        return t ? run({ type: "chooseTradition", tradition: t.id }) : null;
      }
      const next = run({ type: "offer", gift: { rice: Math.floor(state.resources.rice * 0.3) } });
      return next === state ? null : next;
    },
    () => (kuta < 1 + Math.floor(state.villagers / 25) ? tryBuild("kuta") : null),
    () => (state.warriors < Math.min(warriorCap(state, content), Math.floor(state.villagers / 5)) ? (run({ type: "train" }) === state ? null : run({ type: "train" })) : null),
    () => (nextDatuLevel(state, content) && datuLevelNeeded(state, content) === null ? (run({ type: "upgradeDatu" }) === state ? null : run({ type: "upgradeDatu" })) : null),
    () => (owned(state, "babaylan-hut") === 0 && state.villagers >= 12 ? tryBuild("babaylan-hut") : null),
    () => (owned(state, "dambana") === 0 && owned(state, "babaylan-hut") > 0 ? tryBuild("dambana") : null),
    () => (owned(state, "libingan") === 0 && state.villagers >= 20 ? tryBuild("libingan") : null),
    // Trade surplus wood for rice now and then, with a friendly neighbor.
    () => {
      const n = state.region?.neighbors.find((x) => x.status !== "tributary" && x.grudge < 20);
      if (!n || state.resources.wood < woodNeed * 3 || Math.floor(state.time) % 120 >= THINK_SECONDS) return null;
      const next = run({ type: "trade", neighbor: n.id, give: "wood" });
      return next === state ? null : next;
    },
    // More fields when there is spare wood and room for the people.
    () => (r.net.rice < 1 + state.villagers * 0.03 ? tryBuild("palayan") : null),
  ];
  for (const step of steps) {
    const next = step();
    if (next) return next;
  }
  // Clear land when the barangay is running out of room near the plaza.
  const kubo = content.buildings.find((b) => b.id === "bahay-kubo")!;
  if (state.clearing.length === 0 && !autoPlaceTile(state, content, kubo, { keepEdge: true })) {
    const next = run({ type: "clearArea", tiles: nearestClearable(state, 8) });
    if (next !== state) return next;
  }
  // Ahead of need, a few tiles more than the land the house's clearing keeps open (plaza.ts).
  const kept = state.map.gathering?.length ?? 0;
  if (state.clearing.length === 0 && state.tilesCleared < 6 + kept + fields * 2 + state.buildings.length && state.resources.rice > 40) {
    const next = run({ type: "clearArea", tiles: nearestClearable(state, 2) });
    if (next !== state) return next;
  }
  return state;
}

/** Plays `days` game days from a new game with the given seed. */
export function simulate(content: Content, days: number, seed = 12345): SimResult {
  const daySeconds = content.rules.dayNight.daySeconds;
  let s = newGame(content, seed);
  const rows: DayRow[] = [];
  const firsts: Record<string, number> = {};
  let firstIncomeAt: number | null = null;
  const unlocked = new Set(content.buildings.filter((b) => isUnlocked(s, b)).map((b) => b.id));
  const unlockTimes: number[] = [];
  const milestones: { t: number; what: string }[] = [];
  let lastLevel = barangayLevel(s, content);
  let lastDatu = s.datuLevel;
  let hungry = 0;
  let full = 0;
  const end = days * daySeconds;
  while (s.time < end) {
    s = botDecide(s, content);
    for (let i = 0; i < THINK_SECONDS; i++) {
      s = tick(s, content, 1);
      if (s.resources.rice <= 0) hungry++;
      if (s.resources.rice >= riceCap(s, content) - 0.01) full++;
    }
    for (const b of s.buildings) if (firsts[b.type] === undefined) firsts[b.type] = s.time;
    if (firstIncomeAt === null && RESOURCES.some((r: Resource) => rates(s, content).produced[r] > 0)) firstIncomeAt = s.time;
    for (const b of content.buildings) {
      if (!unlocked.has(b.id) && isUnlocked(s, b)) {
        unlocked.add(b.id);
        unlockTimes.push(s.time);
        milestones.push({ t: s.time, what: `unlock ${b.id}` });
      }
    }
    if (barangayLevel(s, content) > lastLevel) milestones.push({ t: s.time, what: `level ${(lastLevel = barangayLevel(s, content))}` });
    if (s.datuLevel > lastDatu) milestones.push({ t: s.time, what: `datu ${(lastDatu = s.datuLevel)}` });
    if (s.time >= (rows.length + 1) * daySeconds) {
      const ai = s.region?.neighbors ?? [];
      // The strongest rival by renown, as the Ranggo ranks them.
      const strongest = ai.reduce<(typeof ai)[number] | null>((a, n) => (!a || n.fame.renown > a.fame.renown ? n : a), null);
      const kubo = content.buildings.find((b) => b.id === "bahay-kubo")!;
      rows.push({
        day: dayAt(content, s.foundedAt, s.time) - 1,
        rice: Math.round(s.resources.rice),
        riceCap: riceCap(s, content),
        wood: Math.round(s.resources.wood),
        gold: Math.round(s.resources.gold),
        woodCap: softCap(s, content, "wood"),
        goldCap: softCap(s, content, "gold"),
        villagers: s.villagers,
        buildings: s.buildings.length,
        level: barangayLevel(s, content),
        renown: s.kabantugan,
        kuboCost: buildingCost(content, kubo, owned(s, "bahay-kubo")).wood,
        hungrySeconds: hungry,
        fullSeconds: full,
        aiBuildings: strongest?.state.buildings.length ?? 0,
        aiVillagers: strongest?.state.villagers ?? 0,
        aiLevel: strongest ? levelForRenown(content, strongest.fame.renown) : 0,
        aiRenown: Math.round(strongest?.fame.renown ?? 0),
        aiAvgBuildings: ai.length ? Math.round(ai.reduce((n, x) => n + x.state.buildings.length, 0) / ai.length) : 0,
      });
      hungry = 0;
      full = 0;
    }
  }
  return { rows, firsts, firstIncomeAt, unlockTimes, milestones };
}
