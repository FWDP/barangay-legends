// How battles between barangays end (W.1), the same in both directions: raids were for wealth,
// captives and prestige, not slaughter. Each side has morale; a battle ends as soon as one side's
// breaks, after its first losses or when its leader or bravest warrior falls, and the losers
// withdraw by land or boat. Most casualties are wounded (they recover, faster with a healer's
// hut); deaths are rare (rules.military.battle.fallenPercent) and always named in the report;
// some defeated warriors are held for ransom and always come home, after a ransom or a set
// time. With no Kuta, villagers flee into the forest from an overwhelming raid. Pure and
// deterministic: rolls are passed in.
import type { Content } from "./content";
import type { GameState } from "./game";
import { healRate } from "./events";

export interface SideLosses {
  /** Hurt: they go home (to the healer's hut) and recover. */
  wounded: number;
  /** Killed. Rare. */
  fallen: number;
  /** Held by the other side until ransomed or let go. */
  captured: number;
}

export const noLosses = (): SideLosses => ({ wounded: 0, fallen: 0, captured: 0 });
export const lossTotal = (l: SideLosses) => l.wounded + l.fallen + l.captured;

export interface BattleEnd {
  attacker: SideLosses;
  defender: SideLosses;
  /** Whose morale broke, and why: their first losses, or their leader (or bravest warrior) falling. */
  broke: "attackers" | "defenders";
  reason: "losses" | "leader";
  /** How the losers left: raiders back to their boats, defenders into the forest or behind the Kuta. */
  withdrew: "boat" | "land";
}

/** Battle numbers (rules.military.battle). */
export interface BattleRules {
  loserCasualtyPercent: number;
  winnerCasualtyPercent: number;
  fallenPercent: number;
  feudFallenPercent: number;
  captivePercent: number;
  leaderBreakPercent: number;
  honorSteadyPercent: number;
  woundSeconds: number;
  captiveSeconds: number;
  ransomGoldPerWarrior: number;
  aiRansomAfterSeconds: number;
  fleeAttackRatio: number;
  hideSeconds: number;
}

/** One side's losses: `share` percent of its warriors are hurt, a few of them killed, some of the beaten held. */
export function sideLosses(warriors: number, beaten: boolean, rolls: [number, number], content: Content, opts: { fierce?: boolean; steady?: number } = {}): SideLosses {
  const b = content.rules.military.battle;
  if (warriors <= 0) return noLosses();
  // Steadier (honored) warriors break later, so a beaten side loses a little less.
  const steady = Math.min(0.5, Math.max(0, opts.steady ?? 0));
  const share = (beaten ? b.loserCasualtyPercent : b.winnerCasualtyPercent) * (1 - steady);
  // Morale breaks after the first losses: a beaten side always has at least one.
  const hurt = Math.min(warriors, Math.max(beaten ? 1 : 0, Math.round((warriors * share) / 100)));
  const deadShare = (opts.fierce ? b.feudFallenPercent : b.fallenPercent) / 100;
  const fallen = Math.min(hurt, Math.floor(hurt * deadShare + rolls[0]));
  const captured = beaten ? Math.min(hurt - fallen, Math.floor((hurt - fallen) * (b.captivePercent / 100) + rolls[1])) : 0;
  return { wounded: hurt - fallen - captured, fallen, captured };
}

/**
 * How a battle ends once its winner is known: who broke and why, how they left, and each side's
 * wounded, fallen and captured. `rolls` are seeded rolls in [0, 1) (at least 5).
 */
export function endBattle(attackerWins: boolean, attackers: number, defenders: number, rolls: number[], content: Content, opts: { fierce?: boolean; attackerSteady?: number; defenderSteady?: number } = {}): BattleEnd {
  const r = (i: number) => rolls[i] ?? 0.5;
  const b = content.rules.military.battle;
  const attacker = sideLosses(attackers, !attackerWins, [r(0), r(1)], content, { fierce: opts.fierce, steady: opts.attackerSteady });
  const defender = sideLosses(defenders, attackerWins, [r(2), r(3)], content, { fierce: opts.fierce, steady: opts.defenderSteady });
  const losers = attackerWins ? defender : attacker;
  return {
    attacker,
    defender,
    broke: attackerWins ? "defenders" : "attackers",
    reason: losers.fallen > 0 && r(4) < b.leaderBreakPercent / 100 ? "leader" : "losses",
    withdrew: attackerWins ? "land" : "boat",
  };
}

// ---------- The wounded ----------

/** Warriors resting from their wounds (they don't fight or work until healed). */
export const woundedCount = (state: GameState) => Math.min(state.warriors, state.wounded?.length ?? 0);

/** New wounded: each needs woundSeconds to heal (less with a healer's hut, see healWounded). */
export function addWounded(state: GameState, content: Content, n: number): GameState {
  if (n <= 0) return state;
  const w = content.rules.military.battle.woundSeconds;
  return { ...state, wounded: [...(state.wounded ?? []), ...Array.from({ length: n }, () => w)].slice(0, Math.max(0, state.warriors)) };
}

/** The wounded heal: faster at a healer's hut (Babaylan's hut), as the sick do. */
export function healWounded(state: GameState, content: Content, dt: number): GameState {
  const list = state.wounded ?? [];
  if (list.length === 0) return state;
  const rate = healRate(state, content);
  const wounded = list.map((s) => s - dt * rate).filter((s) => s > 0).slice(0, Math.max(0, state.warriors));
  return { ...state, wounded };
}

// ---------- Fleeing into the forest ----------

/** With no Kuta to shelter in, villagers flee into the forest from an overwhelming raid. */
export function shouldFlee(state: GameState, content: Content, attack: number, defense: number): boolean {
  const b = content.rules.military.battle;
  const kuta = state.buildings.some((x) => !x.damaged && content.buildings.find((d) => d.id === x.type)?.defense);
  return !kuta && attack >= defense * b.fleeAttackRatio;
}

/** Hiding in the forest: safe, but nobody works until they come back. */
export const isHiding = (state: GameState) => !!state.hiding && state.time < state.hiding.until;

// ---------- Captives and ransom ----------

export interface Captive {
  id: number;
  /** "ours": our warriors held by `neighbor`; "theirs": their warriors held by us. */
  side: "ours" | "theirs";
  neighbor: string;
  count: number;
  /** Taken at, and let go at (they always come home). */
  at: number;
  until: number;
  /** Gold to bring them home. */
  ransom: number;
}

/** The ransom for `count` warriors (gold now; heirlooms later, see blood price). */
export const ransomFor = (content: Content, count: number) => count * content.rules.military.battle.ransomGoldPerWarrior;

/** Our warriors held by other barangays (away from home until they come back). */
export const heldAway = (state: GameState) => (state.region?.captives ?? []).filter((c) => c.side === "ours").reduce((n, c) => n + c.count, 0);
