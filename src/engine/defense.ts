// Teaching defense: where raiders can land on the barangay's shore (the same landing points a
// raid picks from, see border.ts), which of them a staffed Bantayan watches, what a planned
// Bantayan would add, and why a raid on the player went the way it did. Pure: worked out from the state
// with the engine's own landing and radius rules, so the map, the warning and the report always
// agree with the battle.
import type { Content } from "./content";
import type { GameState } from "./game";
import type { Point } from "./map";
import type { Report } from "./region";
import { closestLandings, raidLanding } from "./border";
import { isWatched, sees, staffedBantayan } from "./watch";

/** The landing points a raid on this barangay picks from (rules.diplomacy.aiRaid.landingChoices). */
export const landingPoints = (state: GameState, content: Content): Point[] => closestLandings(state.map, content.rules.diplomacy.aiRaid.landingChoices);

/** The standing Kutas: rally points and shelters (damaged ones shelter no one). */
export function standingKutas(state: GameState, content: Content): Point[] {
  const forts = new Set(content.buildings.filter((b) => (b.defense ?? 0) > 0).map((b) => b.id));
  return state.buildings.filter((b) => forts.has(b.type) && !b.damaged);
}

export interface ShorePoint {
  p: Point;
  /** A staffed Bantayan watches it. */
  watched: boolean;
  /** The planned Bantayan (being placed) would watch it. */
  byNew: boolean;
}

/** Every landing point and whether a staffed Bantayan watches it now, and a Bantayan planned at `planned`. */
export function shoreCoverage(state: GameState, content: Content, planned: Point | null = null): ShorePoint[] {
  const towers = staffedBantayan(state, content);
  return landingPoints(state, content).map((p) => ({
    p,
    watched: towers.some((t) => sees(content, t, p)),
    byNew: planned !== null && sees(content, planned, p),
  }));
}

/** How many landing points are watched, out of how many. */
export function shoreWatched(state: GameState, content: Content): { watched: number; total: number } {
  const points = shoreCoverage(state, content);
  return { watched: points.filter((s) => s.watched).length, total: points.length };
}

/** A raid on its way: where it lands, and whether a Bantayan watched it (an early warning). */
export function raidWarning(state: GameState, content: Content): { landing: Point; watched: boolean } | null {
  const landing = raidLanding(state, content);
  if (!landing) return null;
  return { landing, watched: state.region?.incomingRaid?.watched ?? isWatched(state, content, landing) };
}

/** Is the raid's landing point known yet? Watched: from the start; unwatched: only as the boats come close. */
export function landingKnown(state: GameState, content: Content): boolean {
  const raid = state.region?.incomingRaid;
  if (!raid) return false;
  if (raid.watched || raid.warnedAt === undefined) return true;
  return state.time >= raid.strikeAt - content.rules.watch.revealUnwatchedSeconds;
}

export type RaidReason = "wonWatched" | "won" | "lateUnwatched" | "unwatched" | "late" | "lostWatched" | "outnumbered";

/** Why a defense went the way it did, for the report's one line (content/ui.json defense.reason*). */
export function raidReason(report: Pick<Report, "win" | "watched" | "late">): RaidReason {
  const late = (report.late ?? 0) > 0;
  if (report.win) return report.watched ? "wonWatched" : "won";
  if (report.watched === false) return late ? "lateUnwatched" : "unwatched";
  if (late) return "late";
  return report.watched ? "lostWatched" : "outnumbered";
}

/** Did a raid land where no Bantayan watched (the report shows the unwatched shore)? */
export const landedUnwatched = (report: Pick<Report, "kind" | "watched">) => report.kind === "defense" && report.watched === false;
