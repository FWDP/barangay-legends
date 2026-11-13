// Worship at the Dambana: the barangay's tradition, offerings that build Favor, rituals that
// spend it (content/blessings), and the beings who come on their own: the Sarimanok, the
// Bakunawa eclipse and the tikbalang. Supreme deities are never a power here: they appear only
// in story text. Pure and deterministic: rolls use rollAt (they never shift the shared RNG),
// and none of this runs during offline catch-up.
import { RESOURCES, type Content, type Resource, type ResourceAmounts, type RitualDef } from "./content";
import { isNightAt } from "./daynight";
import { asCost, canAfford, healthyWorkersBase, rates, type GameState, type PlacedBuilding } from "./game";
import { addHistory } from "./people";
import { rollAt } from "./rng";
import { capGrowth, riceCap } from "./storage";
import type { Point } from "./map";

export interface BlessingTimer {
  /** A lasting ritual's effect ends then. */
  until?: number;
  /** It can be performed again then. */
  readyAt?: number;
}

export interface SarimanokVisit {
  from: Point;
  to: Point;
  at: number;
  until: number;
}

export interface Eclipse {
  endsAt: number;
  taps: number;
}

export interface TikbalangTrick {
  riddle: string;
  /** Workers lost until `until`, or until the riddle is answered. */
  workers: number;
  until: number;
  /** Answered wrong: no second try. */
  wrong?: boolean;
}

const SALT_SARIMANOK = 8101;
const SALT_SARIMANOK_ROW = 8102;
const SALT_SARIMANOK_GIFT = 8103;
const SALT_ECLIPSE = 8104;
const SALT_TIKBALANG = 8105;
const SALT_RIDDLE = 8106;

const defOf = (content: Content, type: string) => content.buildings.find((b) => b.id === type);
const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));

/** The barangay's shrines, standing or not. */
export function shrines(state: GameState, content: Content): PlacedBuilding[] {
  return state.buildings.filter((b) => defOf(content, b.type)?.shrine);
}

/** A standing Dambana where rituals can happen. */
export function standingShrine(state: GameState, content: Content): PlacedBuilding | null {
  return shrines(state, content).find((b) => !b.damaged) ?? null;
}

export const addFlag = (state: GameState, flag: string): GameState => (state.flags.includes(flag) ? state : { ...state, flags: [...state.flags, flag] });

// ---------- Tradition ----------

/** What changing the tradition costs (nothing for the first choice). */
export function traditionChangeCost(state: GameState, content: Content): Record<Resource, number> {
  return state.tradition === null ? asCost({}) : asCost(content.rules.worship.changeTraditionCost);
}

/** Chooses the barangay's tradition: free the first time (after building a Dambana), then at a cost. */
export function chooseTradition(state: GameState, content: Content, id: string): GameState {
  if (shrines(state, content).length === 0 || state.tradition === id || !content.traditions.some((t) => t.id === id)) return state;
  const cost = traditionChangeCost(state, content);
  if (!canAfford(state, cost)) return state;
  const resources = { ...state.resources };
  for (const r of RESOURCES) resources[r] -= cost[r];
  return { ...state, resources, tradition: id, lastRitualAt: state.time };
}

export const traditionOf = (state: GameState, content: Content) => content.traditions.find((t) => t.id === state.tradition) ?? null;

// ---------- Offerings and Favor ----------

/** Favor an offering gives: each resource at its offering value × favorPerValue. */
export function offeringFavor(content: Content, gift: ResourceAmounts): number {
  const w = content.rules.worship;
  return RESOURCES.reduce((sum, r) => sum + Math.max(0, gift[r] ?? 0) * (w.offeringValues[r] ?? 0), 0) * w.favorPerValue;
}

/** Why rituals can't happen now, or null. */
export function worshipBlocker(state: GameState, content: Content): "no-shrine" | "no-tradition" | null {
  if (!standingShrine(state, content)) return "no-shrine";
  if (state.tradition === null) return "no-tradition";
  return null;
}

/** An offering at the Dambana: whole amounts the barangay has, turned into Favor (up to maxFavor). */
export function offer(state: GameState, content: Content, gift: ResourceAmounts): GameState {
  if (worshipBlocker(state, content)) return state;
  const clean = asCost(Object.fromEntries(RESOURCES.map((r) => [r, Number.isInteger(gift?.[r]) && gift[r]! > 0 ? gift[r] : 0])));
  const favor = offeringFavor(content, clean);
  if (favor <= 0 || !canAfford(state, clean) || state.favor >= content.rules.worship.maxFavor) return state;
  const resources = { ...state.resources };
  for (const r of RESOURCES) resources[r] -= clean[r];
  return { ...state, resources, favor: clamp(state.favor + favor, content.rules.worship.maxFavor), lastRitualAt: state.time };
}

// ---------- Rituals ----------

export const ritualDef = (content: Content, id: string): RitualDef | undefined => content.rituals.find((r) => r.id === id);

/** Is a lasting ritual's effect on now? */
export const isActive = (state: GameState, id: string) => (state.blessings[id]?.until ?? -Infinity) > state.time;

/** Why a ritual can't be performed now, or null. */
export function ritualBlocker(state: GameState, content: Content, id: string): "no-shrine" | "no-tradition" | "favor" | "cooldown" | "active" | "no-mourning" | "unknown" | null {
  const def = ritualDef(content, id);
  if (!def) return "unknown";
  const w = worshipBlocker(state, content);
  if (w) return w;
  if (isActive(state, id)) return "active";
  if (def.mourningShortenPercent && state.mourning <= 0) return "no-mourning";
  if ((state.blessings[id]?.readyAt ?? -Infinity) > state.time) return "cooldown";
  if (state.favor < def.favorCost) return "favor";
  return null;
}

/**
 * The babaylan leads a ritual: Favor is spent, the effect starts (a production boost for a
 * while, or minutes of rice at once), the forest is soothed a little, and the cooldown begins.
 */
export function perform(state: GameState, content: Content, id: string): GameState {
  const def = ritualDef(content, id);
  if (!def || ritualBlocker(state, content, id) !== null) return state;
  let s: GameState = { ...state, favor: state.favor - def.favorCost, lastRitualAt: state.time };
  const timer: BlessingTimer = {};
  if (def.productionPercent && def.durationSeconds) timer.until = state.time + def.durationSeconds;
  if (def.cooldownSeconds > 0) timer.readyAt = state.time + def.cooldownSeconds;
  s = { ...s, blessings: { ...s.blessings, [id]: timer } };
  if (def.riceMinutes) {
    const gain = rates(state, content).produced.rice * 60 * def.riceMinutes;
    s = { ...s, resources: { ...s.resources, rice: capGrowth(s.resources.rice, s.resources.rice + gain, riceCap(s, content)) } };
  }
  if (def.mourningShortenPercent) s = { ...s, mourning: s.mourning * (1 - def.mourningShortenPercent / 100) };
  if (def.forestRestore > 0) s = { ...s, forest: { ...s.forest, balance: clamp(s.forest.balance + def.forestRestore, 100) } };
  if (def.lore) s = addFlag(s, def.lore);
  return s;
}

/** All production bonus from lasting rituals now (0.2 = +20%). */
export function ritualProductionBonus(state: GameState, content: Content): number {
  return content.rituals.reduce((sum, r) => sum + (r.productionPercent && isActive(state, r.id) ? r.productionPercent / 100 : 0), 0);
}

/** Asking the spirits' permission before clearing: costs Favor; the next tiles cleared hurt the forest less. */
export function askPermission(state: GameState, content: Content): GameState {
  const p = content.rules.worship.permission;
  if (worshipBlocker(state, content) || state.favor < p.favorCost || state.forest.permission > 0) return state;
  return addFlag({ ...state, favor: state.favor - p.favorCost, lastRitualAt: state.time, forest: { ...state.forest, permission: p.tiles } }, "forest-spirits");
}

/** Happiness lost to a neglected Dambana: nothing for neglectAfterSeconds, then slowly more, never past neglectMax. */
export function neglectPenalty(state: GameState, content: Content): number {
  const w = content.rules.worship;
  if (state.lastRitualAt === null || shrines(state, content).length === 0) return 0;
  const over = state.time - state.lastRitualAt - w.neglectAfterSeconds;
  return over > 0 ? -Math.min(w.neglectMax, (over / 60) * w.neglectPerMinute) : 0;
}

// ---------- Visitors and events ----------

/** Villagers lost to a tikbalang right now. */
export const lostToTikbalang = (state: GameState) => (state.tikbalang && state.tikbalang.until > state.time ? state.tikbalang.workers : 0);

/** The Sarimanok's place along its flight at time t (tile coordinates), or null when it's gone. */
export function sarimanokAt(v: SarimanokVisit, t: number): Point | null {
  if (t < v.at || t >= v.until) return null;
  const f = (t - v.at) / (v.until - v.at);
  return { x: v.from.x + (v.to.x - v.from.x) * f, y: v.from.y + (v.to.y - v.from.y) * f };
}

/** Tapping the Sarimanok: a gift of one resource, chosen and sized by a seeded roll. */
export function catchSarimanok(state: GameState, content: Content): GameState {
  const v = state.sarimanok;
  const def = content.visitor;
  if (!v || !def || state.time >= v.until) return state;
  const options = RESOURCES.filter((r) => def.rewards[r]);
  const second = Math.floor(state.time);
  const r = options[Math.floor(rollAt(state.map.seed, second, SALT_SARIMANOK_GIFT) * options.length)];
  const [min, max] = def.rewards[r]!;
  const amount = Math.round(min + rollAt(state.map.seed, second, SALT_SARIMANOK_GIFT + 1) * (max - min));
  const s = { ...state, sarimanok: null, resources: { ...state.resources, [r]: state.resources[r] + amount } };
  return addHistory(addFlag(s, def.lore ?? def.id), { at: state.time, kind: "event", event: "sarimanok", amounts: { [r]: amount } });
}

/** One beat of the gongs during an eclipse. */
export function gong(state: GameState, content: Content): GameState {
  const e = state.eclipse;
  if (!e || !content.eclipse || state.time >= e.endsAt || e.taps >= content.eclipse.gongsNeeded * 2) return state;
  return { ...state, eclipse: { ...e, taps: e.taps + 1 } };
}

/** The answer to the tikbalang's riddle: right brings the workers home at once; wrong leaves them lost. */
export function answerRiddle(state: GameState, content: Content, option: number): GameState {
  const t = state.tikbalang;
  const riddle = content.trickery?.riddles.find((r) => r.id === t?.riddle);
  if (!t || !riddle || t.wrong || state.time >= t.until) return state;
  if (option === riddle.answer) return addHistory({ ...state, tikbalang: null }, { at: state.time, kind: "event", event: "riddleRight" });
  return { ...state, tikbalang: { ...t, wrong: true } };
}

function resolveEclipse(state: GameState, content: Content, second: number): GameState {
  const def = content.eclipse!;
  const e = state.eclipse!;
  if (e.taps >= def.gongsNeeded) {
    const s = {
      ...state,
      eclipse: null,
      favor: clamp(state.favor + def.success.favor, content.rules.worship.maxFavor),
      resources: { ...state.resources, gold: state.resources.gold + def.success.gold },
    };
    return addHistory(s, { at: second, kind: "event", event: "eclipseWon", amounts: { gold: def.success.gold }, favor: def.success.favor });
  }
  const lost = Math.floor((state.resources.rice * def.failure.ricePercent) / 100);
  const s = { ...state, eclipse: null, resources: { ...state.resources, rice: state.resources.rice - lost } };
  return addHistory(s, { at: second, kind: "event", event: "eclipseLost", amounts: { rice: lost } });
}

/**
 * The beings who come on their own, rolled once per whole game second crossed: the
 * Sarimanok (more often for the Maranao tradition), the Bakunawa eclipse (at night, from
 * minVillagers) and the tikbalang (from minVillagers, more often when the forest is hurt).
 * Never called for AI barangays or during offline catch-up.
 */
export function updateVisitors(state: GameState, content: Content, t0: number, t1: number): GameState {
  let s = state;
  const seed = s.map.seed;
  const ready = (id: string, second: number) => second >= (s.nextEventAt[id] ?? 0);
  for (let second = Math.floor(t0 + 1e-9) + 1; second <= Math.floor(t1 + 1e-9); second++) {
    // Sarimanok
    const v = content.visitor;
    if (s.sarimanok && second >= s.sarimanok.until) s = { ...s, sarimanok: null };
    if (v && !s.sarimanok && s.villagers >= v.minVillagers && ready(v.id, second)) {
      const chance = v.chancePerSecond * (traditionOf(s, content)?.sarimanokChance ?? 1);
      if (rollAt(seed, second, SALT_SARIMANOK) < chance) {
        const row = rollAt(seed, second, SALT_SARIMANOK_ROW);
        const y = 1 + row * Math.max(1, s.map.height - 3);
        const ltr = row < 0.5;
        const from = { x: ltr ? -1 : s.map.width + 1, y };
        const to = { x: ltr ? s.map.width + 1 : -1, y: Math.max(1, y - 3) };
        s = { ...s, sarimanok: { from, to, at: second, until: second + v.visibleSeconds }, nextEventAt: { ...s.nextEventAt, [v.id]: second + v.cooldownSeconds } };
      }
    }
    // Bakunawa eclipse
    const e = content.eclipse;
    if (e && s.eclipse && second >= s.eclipse.endsAt) s = resolveEclipse(s, content, second);
    if (e && !s.eclipse && s.villagers >= e.minVillagers && isNightAt(content, second) && ready(e.id, second) && rollAt(seed, second, SALT_ECLIPSE) < e.chancePerSecond) {
      s = addFlag({ ...s, eclipse: { endsAt: second + e.durationSeconds, taps: 0 }, nextEventAt: { ...s.nextEventAt, [e.id]: second + e.cooldownSeconds } }, e.lore ?? e.id);
    }
    // Tikbalang
    const k = content.trickery;
    if (s.tikbalang && second >= s.tikbalang.until) s = { ...s, tikbalang: null };
    if (k && !s.tikbalang && s.villagers >= k.minVillagers && ready(k.id, second)) {
      const chance = k.chancePerSecond * (s.forest.stage >= 1 ? k.lowForestMultiplier : 1);
      if (rollAt(seed, second, SALT_TIKBALANG) < chance) {
        const riddle = k.riddles[Math.floor(rollAt(seed, second, SALT_RIDDLE) * k.riddles.length)];
        const workers = Math.min(k.workersLost, healthyWorkersBase(s));
        if (workers > 0) {
          s = addFlag(
            { ...s, tikbalang: { riddle: riddle.id, workers, until: second + k.lostSeconds }, nextEventAt: { ...s.nextEventAt, [k.id]: second + k.cooldownSeconds } },
            k.lore ?? k.id,
          );
        }
      }
    }
  }
  return s;
}
