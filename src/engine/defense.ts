// Teaching Kuta placement: where raiders can land on the barangay's shore (the same landing
// points a raid picks from, see border.ts), which of them a Kuta covers, what a planned Kuta
// would add, and why a raid on the player went the way it did. Pure: worked out from the state
// with the engine's own landing and radius rules, so the map, the warning and the report always
// agree with the battle.
import type { Content } from "./content";
import type { GameState } from "./game";
import type { Point } from "./map";
import type { Report } from "./region";
import { closestLandings, kutaCovers, raidLanding } from "./border";

/** The landing points a raid on this barangay picks from (rules.diplomacy.aiRaid.landingChoices). */
export const landingPoints = (state: GameState, content: Content): Point[] => closestLandings(state.map, content.rules.diplomacy.aiRaid.landingChoices);

/** The standing Kutas (damaged ones defend nothing, as in the battle). */
export function standingKutas(state: GameState, content: Content): Point[] {
  const forts = new Set(content.buildings.filter((b) => (b.defense ?? 0) > 0).map((b) => b.id));
  return state.buildings.filter((b) => forts.has(b.type) && !b.damaged);
}

export interface ShorePoint {
  p: Point;
  /** A standing Kuta has it within its radius. */
  covered: boolean;
  /** The planned Kuta (being placed) would have it within its radius. */
  byNew: boolean;
}

/** Every landing point and whether it is covered now, and by a Kuta planned at `planned`. */
export function shoreCoverage(state: GameState, content: Content, planned: Point | null = null): ShorePoint[] {
  const forts = standingKutas(state, content);
  return landingPoints(state, content).map((p) => ({
    p,
    covered: forts.some((k) => kutaCovers(content, k, p)),
    byNew: planned !== null && kutaCovers(content, planned, p),
  }));
}

/** How many landing points are covered, out of how many. */
export function shoreCovered(state: GameState, content: Content): { covered: number; total: number } {
  const points = shoreCoverage(state, content);
  return { covered: points.filter((s) => s.covered).length, total: points.length };
}

/** A raid on its way: where it lands, and whether any standing Kuta covers that spot. */
export function raidWarning(state: GameState, content: Content): { landing: Point; covered: boolean } | null {
  const landing = raidLanding(state, content);
  if (!landing) return null;
  return { landing, covered: standingKutas(state, content).some((k) => kutaCovers(content, k, landing)) };
}

export type RaidReason = "wonCovered" | "won" | "lateUncovered" | "uncovered" | "late" | "lostCovered" | "outnumbered";

/** Why a defense went the way it did, for the report's one line (content/ui.json defense.reason*). */
export function raidReason(report: Pick<Report, "win" | "covered" | "late">): RaidReason {
  const late = (report.late ?? 0) > 0;
  if (report.win) return report.covered ? "wonCovered" : "won";
  if (report.covered === false) return late ? "lateUncovered" : "uncovered";
  if (late) return "late";
  return report.covered ? "lostCovered" : "outnumbered";
}

/** Did a raid land where no Kuta covered it (the report shows the uncovered shore)? */
export const landedUncovered = (report: Pick<Report, "kind" | "covered">) => report.kind === "defense" && report.covered === false;
