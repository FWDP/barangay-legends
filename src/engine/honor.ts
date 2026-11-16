// Warriors and honor (W.4). Named warriors earn honor by fighting well: beating off a raid,
// winning a raid, standing with an ally. Honor shows in their life story, adds to the barangay's
// renown, and makes honored warriors steadier in battle (the side breaks later: warfare.ts). In
// Visayan barangays honored warriors earn batok (tattoos), drawn on their sprites as they earn
// more; other traditions show it through dress or ornaments (content/traditions honorMark,
// flagged for review). Pure: no React, no browser APIs.
import type { Content } from "./content";
import type { GameState } from "./game";
import type { NamedVillager } from "./people";

/** Honor numbers (rules.honor). */
export interface HonorRules {
  /** Honor for a raid won, a raid beaten off, an ally defended. */
  raidWon: number;
  defenseWon: number;
  allyDefended: number;
  /** Honor at which each level (1, 2, 3...) of batok or ornament is earned. */
  levels: number[];
  /** Renown for each level a warrior reaches. */
  renownPerLevel: number;
}

/** A warrior's honor level (0 = none yet), from rules.honor.levels. */
export const honorLevel = (content: Content, honor: number | undefined) => content.rules.honor.levels.filter((l) => (honor ?? 0) >= l).length;

/** Honor gained for a battle: a raid won, a raid beaten off. Nothing for a loss (no shame either). */
export function honorFor(content: Content, kind: "raid" | "defense", won: boolean): number {
  if (!won) return 0;
  return kind === "raid" ? content.rules.honor.raidWon : content.rules.honor.defenseWon;
}

/** Adds honor to a named warrior; returns the warrior and the levels gained. */
export function addHonor(content: Content, v: NamedVillager, amount: number): { v: NamedVillager; levels: number } {
  if (amount <= 0) return { v, levels: 0 };
  const before = honorLevel(content, v.honor);
  const honor = (v.honor ?? 0) + amount;
  return { v: { ...v, honor }, levels: honorLevel(content, honor) - before };
}

/**
 * How much steadier the barangay's warriors are (0..honorSteadyPercent/100): the share of its
 * warriors who are honored, scaled. Feeds warfare.ts (a beaten side loses less before breaking).
 */
export function steadiness(state: GameState, content: Content): number {
  if (state.warriors <= 0) return 0;
  const honored = state.named.filter((v) => v.role === "warrior" && honorLevel(content, v.honor) > 0).length;
  return Math.min(1, honored / state.warriors) * (content.rules.military.battle.honorSteadyPercent / 100);
}

/** Honor levels of the named warriors, highest first (for drawing batok or ornaments on warrior sprites). */
export const honoredLevels = (state: GameState, content: Content) =>
  state.named
    .filter((v) => v.role === "warrior")
    .map((v) => honorLevel(content, v.honor))
    .filter((l) => l > 0)
    .sort((a, b) => b - a);
