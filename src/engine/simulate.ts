// A balance simulation: plays the engine for a number of game days with a simple, reasonable
// strategy (houses and food workplaces to keep Pagkain positive, a few Palayan for Palay, Kamalig, clearing land, warriors within the
// cap, a trade now and then) and records the barangay and its AI rivals once per day. Used by
// `npm run simulate` (scripts/simulate.ts) to tune content/rules.json, and by a test that checks
// the balance targets. Pure and deterministic: the same seed gives the same run.
import { RESOURCES, type Content, type Resource } from "./content";
import { apply, buildingCost, canAfford, housing, newGame, owned, rates, tick, warriorCap, type Command, type GameState } from "./game";
import { pistaBlocker, wornOut } from "./food";
import { homeWarriors } from "./region";
import { currentTask } from "./gawain";
import { canReplant } from "./forest";
import { findPath } from "./paths";
import { isConnected, tileAt } from "./map";
import { inClearing, isReserved } from "./plaza";
import { autoPlaceTile, isUnlocked } from "./map";
import { nearestClearable } from "./clearing";
import { riceCap } from "./storage";
import { nextDatuLevel, datuLevelNeeded } from "./datu";
import { barangayLevel, levelForRenown, renownSources } from "./kabantugan";
import { dayAt } from "./daynight";
import { nextUpgrade, upgradeCost } from "./upgrades";
import { softCap } from "./stockpile";

export interface DayRow {
  day: number;
  /** Pagkain, everyday food. */
  food: number;
  /** Food groups the barangay brings in (variety). */
  diet: number;
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
  /** Seconds of the day spent with no Pagkain and no Palay. */
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
  /** Raids on the barangay: how many came, how many were beaten off, and the rice, food and wood they took. */
  raids: { defenses: number; won: number; lostRice: number; lostWood: number; lostFood: number; ourFallen: number; theirFallen: number; attacks: number; attacksWon: number; attackFallen: number };
  /** Seconds spent eating Palay because there was no Pagkain. */
  eatingRiceSeconds: number;
  pistas: number;
  /** Game second each barangay level was first reached (index 0 = level 1, at 0). */
  levelTimes: number[];
  /** Renown gains in the first hour, with their source ("other": feasts, honor, ally calls). */
  renownLog: { t: number; source: string; amount: number }[];
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
  // Food workplaces (Pagkain), in the order the bot spreads them for a varied diet.
  const FOOD = ["gabihan", "kaingin", "sagingan", "fishing-dock", "pangangalap", "pangangaso", "niyugan", "babuyan", "lumbia"];
  const foodPlaces = FOOD.reduce((n, id) => n + owned(state, id), 0);
  const tryFood = (): GameState | null => {
    // The kind it has fewest of first, among what it can build now.
    const order = [...FOOD].sort((a, b) => owned(state, a) - owned(state, b));
    for (const id of order) {
      const next = tryBuild(id);
      if (next) return next;
    }
    return null;
  };
  const paddies = owned(state, "palayan");
  const fields = foodPlaces + paddies;
  // Hands to spare: a player doesn't build workplaces nobody can staff.
  const slots = state.buildings.reduce((n, b) => n + (content.buildings.find((d) => d.id === b.type)?.workers ?? 0), 0);
  // ...and keeps about a tenth free for evening life, so people don't tire (social.ts).
  const spare = state.villagers - slots - Math.ceil(state.villagers * 0.1);
  const camps = owned(state, "woodcutter-camp");
  const docks = owned(state, "fishing-dock");
  const kamalig = owned(state, "kamalig");
  const kuta = owned(state, "kuta");
  const cap = riceCap(state, content);
  // What the next big purchases cost: two houses' worth of wood, the next upgrades' gold.
  const kuboDef = content.buildings.find((b) => b.id === "bahay-kubo")!;
  const woodNeed = 2 * buildingCost(content, kuboDef, owned(state, "bahay-kubo")).wood + 100;
  const goldNeed = 200;
  // The first task: forage for food by hand, as a new player would.
  if (currentTask(state, content)?.condition.type === "foraged") {
    let s = state;
    for (let i = 0; i < 5; i++) s = apply(s, content, { type: "gather", resource: "food" });
    if (s !== state) return s;
  }
  // Gather by hand only at the very start.
  if (foodPlaces === 0 && state.resources.wood < 15) {
    let s = state;
    for (let i = 0; i < 5; i++) s = apply(s, content, { type: "gather", resource: "wood" });
    return s;
  }
  // Out of food: forage by hand (as a player would tap) until the food workplaces catch up.
  if (state.resources.food < 3) {
    // A new food workplace first, if there are hands for it; else forage.
    const built = r.net.food <= 0 ? tryFood() : null;
    if (built) return built;
    let s = state;
    for (let i = 0; i < 10; i++) s = apply(s, content, { type: "gather", resource: "food" });
    return s;
  }
  // A worn-out kaingin is rested (back to forest); a new one is cleared elsewhere later.
  const tired = state.buildings.find((b) => wornOut(content, content.buildings.find((d) => d.id === b.type), b));
  if (tired) return run({ type: "restKaingin", x: tired.x, y: tired.y });
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
    () => {
      // Short of food: food workplaces are staffed first when food is low (assignWorkers), so build one even with no spare hands.
      if (!(r.net.food < 0.3)) return null;
      const built = tryFood();
      if (built) return built;
      // No room for a food field: clear a little land (it costs Pagkain: forage for it first).
      if (state.clearing.length > 0) return null;
      const cleared = run({ type: "clearArea", tiles: nearestClearable(state, 2) });
      if (cleared !== state) return cleared;
      let s = state;
      for (let i = 0; i < 10; i++) s = apply(s, content, { type: "gather", resource: "food" });
      return s;
    },
    // Camps and docks when wood or gold runs short for what comes next, as a player would.
    () => (camps === 0 || (camps * 2 < fields && state.resources.wood < woodNeed && spare > 0) ? tryBuild("woodcutter-camp") : null),
    () => (state.villagers >= housing(state, content) - 1 && (r.net.food > 0.5 || state.resources.food > 100) ? tryBuild("bahay-kubo") : null),
    // A Palayan for every four food workplaces: Palay for offerings, wine and feasts.
    () => (paddies === 0 || (paddies * 6 < foodPlaces && state.resources.rice < 500 && spare > 0) ? tryBuild("palayan") : null),
    () => (owned(state, "asinan") === 0 && spare > 0 ? tryBuild("asinan") : null),
    () => (owned(state, "baklad") < owned(state, "fishing-dock") && owned(state, "baklad") < 2 ? tryBuild("baklad") : null),
    // Rice wine and a Pista when there's Palay to spare.
    () => (state.resources.wine < content.rules.food.pista.cost.wine! && state.resources.rice > 100 ? run({ type: "brew", amount: 5 }) : null),
    () => (pistaBlocker(state, content) === null ? run({ type: "pista", occasion: "harvest" }) : null),
    // A Kamalig for every 7 fields; upgrade one when the store is nearly full.
    () => (kamalig === 0 || kamalig * 7 < paddies ? tryBuild("kamalig") : null),
    () => {
      if (state.resources.rice < cap * 0.9) return null;
      const k = state.buildings.find((b) => b.type === "kamalig" && nextUpgrade(content, b) && canAfford(state, upgradeCost(content, b)));
      if (k) {
        const next = run({ type: "upgradeBuilding", x: k.x, y: k.y });
        if (next !== state) return next;
      }
      return null;
    },
    () => ((docks === 0 || state.resources.gold < goldNeed) && docks * 15 < state.villagers && spare > 0 ? tryBuild("fishing-dock") : null),
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
    // A Bantayan at the shore once there is a Kuta, as the tasks ask, and a second one later.
    () => (kuta > 0 && owned(state, "bantayan") < Math.min(kuta, 2) ? tryBuild("bantayan") : null),
    () => (state.warriors < Math.min(warriorCap(state, content), Math.floor(state.villagers / 5)) ? (run({ type: "train" }) === state ? null : run({ type: "train" })) : null),
    () => (nextDatuLevel(state, content) && datuLevelNeeded(state, content) === null ? (run({ type: "upgradeDatu" }) === state ? null : run({ type: "upgradeDatu" })) : null),
    () => (owned(state, "babaylan-hut") === 0 && state.villagers >= 12 ? tryBuild("babaylan-hut") : null),
    () => (owned(state, "dambana") === 0 && owned(state, "babaylan-hut") > 0 ? tryBuild("dambana") : null),
    () => (owned(state, "libingan") === 0 && state.villagers >= 20 ? tryBuild("libingan") : null),
    // Now and then, a raid on the weakest independent neighbor with half the warriors at home.
    () => {
      if (state.time < 1800 || Math.floor(state.time) % 900 >= THINK_SECONDS || state.warriors < 6 || state.region?.incomingRaid) return null;
      const n = [...(state.region?.neighbors ?? [])].filter((x) => x.status === "independent" && state.time >= x.raidCooldownUntil).sort((a, b) => a.state.warriors - b.state.warriors)[0];
      if (!n) return null;
      const next = run({ type: "raid", neighbor: n.id, warriors: Math.max(1, Math.floor(homeWarriors(state) / 2)) });
      return next === state ? null : next;
    },
    // Trade surplus wood for rice now and then, with a friendly neighbor.
    () => {
      const n = state.region?.neighbors.find((x) => x.status !== "tributary" && x.grudge < 20);
      if (!n || state.resources.wood < woodNeed * 3 || Math.floor(state.time) % 120 >= THINK_SECONDS) return null;
      const next = run({ type: "trade", neighbor: n.id, give: "wood" });
      return next === state ? null : next;
    },
    // More fields when there is spare wood and room for the people.
    () => (r.net.food < 1 + state.villagers * 0.03 && spare > 0 ? tryFood() : null),
  ];
  for (const step of steps) {
    const next = step();
    if (next) return next;
  }
  // Tasks about the forest: ask the spirits' leave before clearing, replant cleared land.
  const task = currentTask(state, content)?.condition.type;
  if (task === "permittedClears") {
    const asked = run({ type: "askPermission" });
    if (asked !== state) return asked;
    // Not enough Favor yet: an offering at the Dambana (a tradition chosen first).
    if (!state.tradition && content.traditions[0]) return run({ type: "chooseTradition", tradition: content.traditions[0].id });
    const need = content.rules.worship.permission.favorCost - state.favor;
    const wood = Math.ceil(need / content.rules.worship.favorPerValue / (content.rules.worship.offeringValues.wood ?? 1));
    if (need > 0 && state.resources.wood >= wood + 50) {
      const offered = run({ type: "offer", gift: { wood } });
      if (offered !== state) return offered;
    }
  }
  if (task === "replanted" && state.replanting.length < 3) {
    const { plaza } = state.map;
    for (let r = 4; r < 14; r++)
      for (let dy = -r; dy <= r; dy++)
        for (const dx of [-r, r]) {
          const x = plaza.x + dx;
          const y = plaza.y + dy;
          // Only at the forest's edge and away from buildings, so no path is cut off.
          const near = (t: string) => [-1, 0, 1].some((ddy) => [-1, 0, 1].some((ddx) => tileAt(state.map, x + ddx, y + ddy) === t));
          if (!canReplant(state, content, x, y) || !near("forest") || state.buildings.some((o) => Math.abs(o.x - x) <= 1 && Math.abs(o.y - y) <= 1)) continue;
          const next = run({ type: "replant", x, y });
          if (next !== state) return next;
        }
  }
  // A kaingin to rest: plant one by the forest if there's none.
  if (task === "rested" && owned(state, "kaingin") === 0) {
    const def = content.buildings.find((d) => d.id === "kaingin")!;
    const tile = isUnlocked(state, def) && canAfford(state, buildingCost(content, def, 0)) ? autoPlaceTile(state, content, def) : null;
    if (tile) {
      const next = run({ type: "build", building: "kaingin", x: tile.x, y: tile.y });
      if (next !== state) return next;
    }
  }
  // The task asks for buildings joined by a Daan: lay one from the clearing to the nearest
  // workplace not yet joined, as a player following the task would.
  if (currentTask(state, content)?.condition.type === "connected") {
    const { plaza } = state.map;
    const loose = state.buildings
      .filter((b) => (content.buildings.find((d) => d.id === b.type)?.workers ?? 0) > 0 && !isConnected(state.map, b.x, b.y))
      .sort((a, b) => Math.hypot(a.x - plaza.x, a.y - plaza.y) - Math.hypot(b.x - plaza.x, b.y - plaza.y));
    // Around the clearing, tiles kept for the Bahay ng Datu take no Daan: walk around them, and
    // around other buildings.
    const W = state.map.width;
    const blocked = new Uint8Array(W * state.map.height);
    for (let y = 0; y < state.map.height; y++) for (let x = 0; x < W; x++) if (isReserved(state, content, x, y) && !inClearing(state.map, x, y) && !(x === plaza.x && y === plaza.y)) blocked[y * W + x] = 1;
    for (const o of state.buildings) blocked[o.y * W + o.x] = 1;
    for (const b of loose) {
      const path = findPath(state.map, plaza, b, blocked);
      if (!path || path.length <= 2) continue;
      const next = run({ type: "road", tiles: path.slice(1, -1) });
      if (next !== state) return next;
    }
  }
  // Clear land when the barangay is running out of room near the plaza.
  const kubo = content.buildings.find((b) => b.id === "bahay-kubo")!;
  if (state.clearing.length === 0 && !autoPlaceTile(state, content, kubo, { keepEdge: true })) {
    const next = run({ type: "clearArea", tiles: nearestClearable(state, 8) });
    if (next !== state) return next;
  }
  // Ahead of need, a few tiles more than the land the house's clearing keeps open (plaza.ts).
  const kept = state.map.gathering?.length ?? 0;
  if (state.clearing.length === 0 && state.tilesCleared < 6 + kept + fields * 2 + state.buildings.length && state.resources.food > 40) {
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
  const raids = { defenses: 0, won: 0, lostRice: 0, lostWood: 0, lostFood: 0, ourFallen: 0, theirFallen: 0, attacks: 0, attacksWon: 0, attackFallen: 0 };
  let eatingRiceSeconds = 0;
  let seenReport = 0;
  const levelTimes = [0];
  const renownLog: SimResult["renownLog"] = [];
  const end = days * daySeconds;
  // Level times and where the first hour's renown came from.
  const note = (before: GameState, after: GameState) => {
    while (barangayLevel(after, content) > levelTimes.length) levelTimes.push(after.time);
    if (after.time > 3600 || after.kabantugan <= before.kabantugan) return;
    let known = 0;
    for (const [source, amount] of Object.entries(renownSources(before, { ...after, stats: { ...after.stats, bestTens: before.stats.bestTens } }, content))) {
      renownLog.push({ t: after.time, source, amount: amount! });
      known += amount!;
    }
    const other = after.kabantugan - before.kabantugan - known;
    if (other > 0) renownLog.push({ t: after.time, source: "other", amount: other });
  };
  while (s.time < end) {
    let before = s;
    s = botDecide(s, content);
    note(before, s);
    for (let i = 0; i < THINK_SECONDS; i++) {
      before = s;
      s = tick(s, content, 1);
      note(before, s);
      if (s.resources.food <= 0 && s.resources.rice <= 0) hungry++;
      else if (s.resources.food <= 0) eatingRiceSeconds++;
      if (s.resources.rice >= riceCap(s, content) - 0.01) full++;
    }
    for (const r of s.region?.reports ?? []) {
      if (r.id <= seenReport) continue;
      seenReport = r.id;
      // Deaths per raid: the fallen (before W.1 every warrior lost was killed).
      const fallen = r as { fallen?: { ours: number; theirs: number }; ourLosses?: number; theirLosses?: number };
      if (r.kind === "raid") {
        raids.attacks++;
        if (r.win) raids.attacksWon++;
        raids.attackFallen += fallen.fallen?.ours ?? fallen.ourLosses ?? 0;
        continue;
      }
      if (r.kind !== "defense") continue;
      raids.ourFallen += fallen.fallen?.ours ?? fallen.ourLosses ?? 0;
      raids.theirFallen += fallen.fallen?.theirs ?? fallen.theirLosses ?? 0;
      raids.defenses++;
      if (r.win) raids.won++;
      raids.lostRice += r.lost?.rice ?? 0;
      raids.lostWood += r.lost?.wood ?? 0;
      raids.lostFood += r.lost?.food ?? 0;
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
        food: Math.round(s.resources.food),
        diet: s.dietGroups ?? 0,
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
  return { rows, firsts, firstIncomeAt, unlockTimes, milestones, raids, eatingRiceSeconds, pistas: s.stats.pistas ?? 0, levelTimes, renownLog };
}
