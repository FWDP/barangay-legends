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

/** The evening: the first eveningShare of the night, when elders and children sit by the fire. */
export function isEveningAt(content: Content, time: number): boolean {
  const { nightFrom, nightTo, eveningShare } = content.rules.dayNight;
  const p = dayPhaseAt(content, time);
  return p >= nightFrom && p < nightFrom + (nightTo - nightFrom) * eveningShare;
}

/** The moon's phase (0 new, 0.5 full, back to 1) on a game time: one cycle every moonCycleDays Araw. */
export function moonPhaseAt(content: Content, foundedAt: number, time: number): number {
  const { daySeconds, moonCycleDays } = content.rules.dayNight;
  const cycle = daySeconds * moonCycleDays;
  // The barangay is founded at a half moon, waxing.
  const p = (time - foundedAt) / cycle + 0.25;
  return ((p % 1) + 1) % 1;
}

/** The share (0..1) of the span from `time` to `time + span` that is night. */
export function nightShare(content: Content, time: number, span: number): number {
  if (span <= 0) return isNightAt(content, time) ? 1 : 0;
  const { daySeconds: d, nightFrom, nightTo } = content.rules.dayNight;
  // Night seconds from the start of time to t (a whole night per day, plus the part of today's).
  const upTo = (t: number) => {
    const days = Math.floor(t / d);
    const p = t / d - days;
    return days * (nightTo - nightFrom) * d + Math.min(Math.max(p - nightFrom, 0), nightTo - nightFrom) * d;
  };
  return Math.min(1, Math.max(0, (upTo(time + span) - upTo(time)) / span));
}

/**
 * How fast work goes over a span of time: 1 by day, rules.dayNight.nightProductionFactor at
 * night, and in between for a span that crosses dusk or dawn. Buildings with nightWork (the
 * Fishing Dock) ignore it.
 */
export function nightFactor(content: Content, time: number, span = 0): number {
  const f = content.rules.dayNight.nightProductionFactor;
  return 1 - nightShare(content, time, span) * (1 - f);
}

// ---------- Days ----------

/** The day number (Araw 1, 2, …) at a game time, for a barangay founded at `foundedAt`. */
export function dayAt(content: Content, foundedAt: number, time: number): number {
  return Math.floor(Math.max(0, time - foundedAt) / content.rules.dayNight.daySeconds) + 1;
}
