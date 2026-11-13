// The game's own day and night, in game time (rules.dayNight). The map's tint and the
// villagers going home follow it, and the Bakunawa eclipse only comes at night.
import type { Content } from "./content";

/** How far through the day we are (0..1) at a game time. */
export function dayPhaseAt(content: Content, time: number): number {
  const d = content.rules.dayNight.daySeconds;
  return (((time % d) + d) % d) / d;
}

export function isNightAt(content: Content, time: number): boolean {
  const { nightFrom, nightTo } = content.rules.dayNight;
  const p = dayPhaseAt(content, time);
  return p >= nightFrom && p < nightTo;
}
