// A lively barangay (W.6): life wasn't only work. In the late afternoon and evening people visit,
// sit under the silong or by the fire, tell stories, play music and games; children play. A
// barangay with time for this is a little happier; one where everyone works all the time (too few
// villagers for its workplaces) slowly tires ("Pagod na ang mga tao"). Crowded feasts spread
// sickness a little faster. Named villagers' stories gain social moments. No gambling: cockfights
// and wagers appear only in the Aklat, as history. Pure and deterministic; the scenes are drawn by
// the UI (villagers.ts, VillagerLayer.tsx).
import type { Content } from "./content";
import type { GameState } from "./game";
import { freeVillagers } from "./clearing";
import { rollAt } from "./rng";

/** Social numbers (rules.social). */
export interface SocialRules {
  /** At least this share of villagers free (not at work) keeps an evening life: +livelyHappiness. */
  livelyFreePercent: number;
  livelyHappiness: number;
  /** Below this share free, people tire; after tiredAfterSeconds, tiredHappiness (negative). */
  tiredFreeBelowPercent: number;
  tiredAfterSeconds: number;
  tiredHappiness: number;
  /** Sickness is this much likelier during a crowded Pista. */
  feastSickPercent: number;
  /** Chance per evening that a named villager's story gains a social moment. */
  momentChancePerEvening: number;
}

/** Share (0..1) of villagers not at work: time for evening life. */
export function freeShare(state: GameState, content: Content): number {
  if (state.villagers <= 0) return 1;
  return Math.min(1, freeVillagers(state, content) / state.villagers);
}

/** Happiness from the barangay's social life: lively, tired, or neither. Quiet while mourning. */
export function socialHappiness(state: GameState, content: Content): number {
  // A house carried together lately (bayanihan, W.7) lifts everyone's spirits for a while.
  const carried = state.bayanihan && state.time < state.bayanihan.at + content.rules.bayanihan.happinessSeconds ? content.rules.bayanihan.happiness : 0;
  return carried + socialMood(state, content);
}

function socialMood(state: GameState, content: Content): number {
  const r = content.rules.social;
  if ((state.tiredFor ?? 0) >= r.tiredAfterSeconds) return r.tiredHappiness;
  if (state.mourning > 0) return 0;
  return freeShare(state, content) * 100 >= r.livelyFreePercent ? r.livelyHappiness : 0;
}

/** Is everyone working all the time? "Pagod na ang mga tao" once it has lasted. */
export const isTired = (state: GameState, content: Content) => (state.tiredFor ?? 0) >= content.rules.social.tiredAfterSeconds;

/** The overwork clock: runs while too few are free, rests otherwise. */
export function updateTired(state: GameState, content: Content, dt: number): GameState {
  if (content.ai || state.villagers <= 0) return state;
  const busy = freeShare(state, content) * 100 < content.rules.social.tiredFreeBelowPercent;
  const tiredFor = busy ? (state.tiredFor ?? 0) + dt : 0;
  return tiredFor === (state.tiredFor ?? 0) ? state : { ...state, tiredFor };
}

/** A Pista is going on (and no mourning): crowded, so sickness spreads a little faster. */
export const feastCrowd = (state: GameState) => !!state.pista && state.time < state.pista.until && state.mourning <= 0;

/** How much likelier sickness is now (1 = as usual). */
export const feastSicknessFactor = (state: GameState, content: Content) => (feastCrowd(state) ? 1 + content.rules.social.feastSickPercent / 100 : 1);

/** Social moments in a life story: a contest won at a Pista, music played at a wedding, a song taught. */
export const SOCIAL_MOMENTS = ["sipa", "agong", "song", "wrestling", "flute", "bayanihan"] as const;
export type SocialMoment = (typeof SOCIAL_MOMENTS)[number];

const SALT_MOMENT = 9301;
const SALT_MOMENT_WHO = 9302;
const SALT_MOMENT_WHAT = 9303;

/**
 * Picks this evening's social moment, if any (seeded by the evening number): who among the named
 * and what. Sipa and wrestling only at a Pista; music by tradition (no music while mourning).
 */
export function socialMoment(state: GameState, content: Content, evening: number): { named: number; moment: SocialMoment } | null {
  if (state.mourning > 0 || state.named.length === 0) return null;
  const seed = state.map.seed;
  if (rollAt(seed, evening, SALT_MOMENT) >= content.rules.social.momentChancePerEvening) return null;
  const v = state.named[Math.floor(rollAt(seed, evening, SALT_MOMENT_WHO) * state.named.length)];
  const options: SocialMoment[] = feastCrowd(state) ? ["sipa", "wrestling", "agong"] : ["agong", "song", "flute"];
  return { named: v.id, moment: options[Math.floor(rollAt(seed, evening, SALT_MOMENT_WHAT) * options.length)] };
}
