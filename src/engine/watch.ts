// The Bantayan: a watchtower at the shore or river bank. When staffed (its lookouts at work), it
// sees raiders landing within rules.watch.radius: their warning comes early, the landing shows
// from the start and the alarm is raised. Unwatched landings give only a short warning, and the
// landing shows only as the boats come close. Pure: worked out from the state, for the battle,
// the warning, the Defense map and AI villages alike.
import type { Content } from "./content";
import type { GameState } from "./game";
import { buildingWorkers } from "./game";
import type { Point } from "./map";

/** The Bantayan types (buildings that watch). */
const towers = (content: Content) => new Set(content.buildings.filter((d) => d.watch).map((d) => d.id));

/** Standing Bantayan with at least one lookout at work: only these watch. */
export function staffedBantayan(state: GameState, content: Content): Point[] {
  const ids = towers(content);
  if (!state.buildings.some((b) => ids.has(b.type))) return [];
  const workers = buildingWorkers(state, content);
  return state.buildings.filter((b, i) => ids.has(b.type) && !b.damaged && (workers[i] ?? 0) > 0);
}

/** Does a Bantayan at `tower` see a landing at `landing`? (Straight line between tile centres.) */
export const sees = (content: Content, tower: Point, landing: Point) => Math.hypot(tower.x - landing.x, tower.y - landing.y) <= content.rules.watch.radius;

/** Is this landing watched by any staffed Bantayan? */
export function isWatched(state: GameState, content: Content, landing: Point | null): boolean {
  if (!landing) return false;
  return staffedBantayan(state, content).some((t) => sees(content, t, landing));
}

/** The warning a raid landing here gives: long if a Bantayan watches it, short if not. */
export function warningFor(content: Content, watched: boolean): number {
  const w = content.rules.watch;
  return watched ? w.watchedWarningSeconds : w.unwatchedWarningSeconds;
}

/** When a raid's landing point can be seen: at once if watched, else only as the boats come close. */
export function landingShownAt(content: Content, watched: boolean, strikeAt: number, warnedAt: number): number {
  return watched ? warnedAt : Math.max(warnedAt, strikeAt - content.rules.watch.revealUnwatchedSeconds);
}
