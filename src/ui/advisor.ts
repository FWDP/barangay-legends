// The datu's elder adviser: a short guided tutorial, then occasional tips on triggers.
// Presentation only. It reads GameState and never changes it; its own memory (tutorial
// progress, how often each tip was shown) is kept per browser, apart from the save.
// Pure functions, so the rules (one tip per 90 s, at most 3 repeats...) are tested.
import type { Content } from "../engine/content";
import { isBurning, isHungry } from "../engine/events";
import { workforce } from "../engine/clearing";
import { owned, rates, unreachableWorkplaces, type GameState } from "../engine/game";
import { directionFrom, raidLanding } from "../engine/border";
import { barangayCenter, isUnlocked, TILE_CODE } from "../engine/map";
import { neighborDef } from "../engine/region";
import type { Lang } from "./settings";
import { fill, TRIGGERS, TUTORIAL_EVENTS, type AdvisorDef, type TriggerId, type TutorialEvent, type TutorialStep } from "./uiContent";

/** Game seconds between two tips. */
export const TIP_GAP_SECONDS = 90;
/** A tip line is never shown more often than this. */
export const MAX_REPEATS = 3;
/** A tip closes itself after this many game seconds. */
export const TIP_SECONDS = 20;
/** Saves older than this skip the tutorial: the player already knows the basics. */
export const TUTORIAL_SECONDS = 300;
/** Warn when the rice will run out within this many seconds. */
export const RICE_WARNING_SECONDS = 60;
/** A worker building must sit empty this long before the adviser mentions it. */
export const UNSTAFFED_SECONDS = 15;
/** "Nothing built for 2 minutes." */
export const IDLE_SECONDS = 120;
/** Suggest Daan once the barangay has this many workplaces and no path yet. */
export const ROADS_AFTER_WORKPLACES = 3;

/** Kept in localStorage: survives reloads, never part of the game save. */
export interface AdvisorMemory {
  tutorial: "new" | "active" | "done" | "skipped";
  /** Tutorial events the player has done (gathered, opened a menu, opened the Rehiyon). */
  events: TutorialEvent[];
  /** Times each tip line has been shown. */
  shown: Record<string, number>;
}

/** Tracking for this page load only. Times are game seconds (state.time). */
export interface AdvisorSession {
  /** Which barangay this session follows; a new game starts a new session. */
  barangay: string;
  lastShownAt: number | null;
  /** Triggers already spoken about that still hold; they re-arm once the condition clears. */
  disarmed: TriggerId[];
  buildingCount: number;
  lastBuildAt: number;
  unstaffedSince: number | null;
  unlocked: string[];
  /** Buildings unlocked during play that the adviser hasn't announced yet. */
  pendingUnlocks: string[];
}

export type Message =
  | { kind: "tutorial"; stepId: string; step: number; total: number; text: string }
  | { kind: "tip"; lineId: string; trigger: TriggerId; text: string; at: number };

export interface AdvisorModel {
  memory: AdvisorMemory;
  session: AdvisorSession;
  message: Message | null;
}

export interface AdvisorInput {
  state: GameState;
  content: Content;
  advisor: AdvisorDef;
  lang: Lang;
  /** The player turned tips off. */
  tipsOn: boolean;
  /** Something must not be interrupted (a battle report is open): say nothing. */
  blocked: boolean;
}

export const NEW_MEMORY: AdvisorMemory = { tutorial: "new", events: [], shown: {} };

export function parseMemory(json: string | null): AdvisorMemory {
  try {
    const raw = json ? JSON.parse(json) : null;
    if (!raw || typeof raw !== "object") return { ...NEW_MEMORY };
    const tutorial = ["new", "active", "done", "skipped"].includes(raw.tutorial) ? raw.tutorial : "new";
    const events = Array.isArray(raw.events) ? raw.events.filter((e: unknown) => (TUTORIAL_EVENTS as readonly unknown[]).includes(e)) : [];
    const shown: Record<string, number> = {};
    if (raw.shown && typeof raw.shown === "object") {
      for (const [k, v] of Object.entries(raw.shown)) if (typeof v === "number" && v >= 0) shown[k] = v;
    }
    return { tutorial, events, shown };
  } catch {
    return { ...NEW_MEMORY };
  }
}

const barangayKey = (state: GameState) => `${state.barangay.id}:${state.map.seed}`;
const unlockedIds = (state: GameState, content: Content) => content.buildings.filter((b) => isUnlocked(state, b)).map((b) => b.id);

export function startSession(state: GameState, content: Content): AdvisorSession {
  return {
    barangay: barangayKey(state),
    lastShownAt: null,
    disarmed: [],
    buildingCount: state.buildings.length,
    lastBuildAt: state.time,
    unstaffedSince: null,
    unlocked: unlockedIds(state, content),
    pendingUnlocks: [],
  };
}

export function newModel(memory: AdvisorMemory, state: GameState, content: Content): AdvisorModel {
  return { memory, session: startSession(state, content), message: null };
}

type Vars = Record<string, string | number>;

/** Updates the trackers and lists every trigger that holds right now, with its text values. */
export function observe(session: AdvisorSession, state: GameState, content: Content): { session: AdvisorSession; active: Map<TriggerId, Vars> } {
  const active = new Map<TriggerId, Vars>();
  const t = state.time;
  const s = { ...session };

  const rice = state.resources.rice;
  const net = rates(state, content).net.rice;
  if (rice > 0 && net < 0 && rice / -net <= RICE_WARNING_SECONDS) active.set("rice-low", { seconds: Math.ceil(rice / -net) });

  // An empty worker building, ignoring hunger (nobody works then, and the hunger banner says so).
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  const force = workforce(state, content);
  const workers = force.workers;
  // Paused workplaces and ones lending hands to clearing are empty on purpose.
  const empty = isHungry(state)
    ? -1
    : state.buildings.findIndex((b, i) => !b.damaged && !b.paused && force.borrowed[i] === 0 && (defs.get(b.type)?.workers ?? 0) > 0 && workers[i] === 0);
  if (empty < 0) s.unstaffedSince = null;
  else {
    s.unstaffedSince ??= t;
    if (t - s.unstaffedSince >= UNSTAFFED_SECONDS) active.set("unstaffed", { building: defs.get(state.buildings[empty].type)!.name });
  }

  if (state.typhoon) active.set("event-typhoon", { seconds: Math.max(0, Math.ceil(state.typhoon.strikeAt - t)) });
  if (state.buildings.some(isBurning)) active.set("event-fire", {});
  if (state.sick.length > 0) active.set("event-sickness", {});

  const offer = state.region?.offer;
  if (offer) {
    const who = neighborDef(content, offer.from);
    active.set("trade-offer", { neighbor: who?.name ?? offer.from, datu: who?.datu ?? "" });
  }
  const raid = state.region?.incomingRaid;
  if (raid) {
    const who = neighborDef(content, raid.from);
    const landing = raidLanding(state, content);
    active.set("raid-warning", {
      neighbor: who?.name ?? raid.from,
      datu: who?.datu ?? "",
      seconds: Math.max(0, Math.ceil(raid.strikeAt - t)),
      direction: landing ? directionFrom(barangayCenter(state.map), landing) : "near",
    });
  }

  if (state.buildings.length > s.buildingCount) s.lastBuildAt = t;
  s.buildingCount = state.buildings.length;
  if (t - s.lastBuildAt >= IDLE_SECONDS) active.set("idle", {});

  // Clearing borrowing villagers from a workplace.
  const lender = force.borrowed.findIndex((n) => n > 0);
  if (lender >= 0) active.set("borrowing", { building: defs.get(state.buildings[lender].type)?.name ?? state.buildings[lender].type });

  // Paths: a workplace nobody can walk to; an old save still on the old rule; no roads yet.
  const stranded = unreachableWorkplaces({ ...state, legacyReach: false }, content);
  if (stranded.length > 0) {
    const name = defs.get(stranded[0].type)?.name ?? stranded[0].type;
    active.set(state.legacyReach ? "old-paths" : "no-path", { building: name });
  }
  const workplaces = state.buildings.filter((b) => (defs.get(b.type)?.produces ? 1 : 0)).length;
  if (workplaces >= ROADS_AFTER_WORKPLACES && !state.map.tiles.includes(TILE_CODE.daan)) {
    active.set("roads", { percent: content.rules.roads.connectedBonusPercent });
  }

  const nowUnlocked = unlockedIds(state, content);
  const fresh = nowUnlocked.filter((id) => !s.unlocked.includes(id));
  if (fresh.length > 0) {
    s.unlocked = nowUnlocked;
    s.pendingUnlocks = [...s.pendingUnlocks, ...fresh];
  }
  if (s.pendingUnlocks.length > 0) active.set("unlocked", { building: defs.get(s.pendingUnlocks[0])?.name ?? s.pendingUnlocks[0] });

  return { session: s, active };
}

/** Is this tutorial step done? Built steps count buildings beyond the ones the barangay started with. */
export function stepDone(step: TutorialStep, state: GameState, content: Content, events: TutorialEvent[]): boolean {
  if ("event" in step.done) return events.includes(step.done.event);
  const id = step.done.built;
  return owned(state, id) > (content.rules.start.buildings[id] ?? 0);
}

/** The tutorial step to show, or null once every step is done. */
export function currentStep(advisor: AdvisorDef, state: GameState, content: Content, events: TutorialEvent[]): number | null {
  const i = advisor.tutorial.findIndex((s) => !stepDone(s, state, content, events));
  return i < 0 ? null : i;
}

/** The line to use for a trigger: one shown fewer than MAX_REPEATS times, least shown first. */
export function pickLine(advisor: AdvisorDef, memory: AdvisorMemory, trigger: TriggerId) {
  const lines = advisor.lines.filter((l) => l.trigger === trigger && (memory.shown[l.id] ?? 0) < Math.min(MAX_REPEATS, l.max ?? MAX_REPEATS));
  return lines.sort((a, b) => (memory.shown[a.id] ?? 0) - (memory.shown[b.id] ?? 0))[0] ?? null;
}

/** One adviser update (the UI calls it about once a second). */
export function advise(model: AdvisorModel, input: AdvisorInput): AdvisorModel {
  const { state, content, advisor, lang, tipsOn, blocked } = input;
  const t = state.time;
  let session = model.session.barangay === barangayKey(state) && t >= (model.session.lastShownAt ?? 0) ? model.session : startSession(state, content);
  const seen = observe(session, state, content);
  session = { ...seen.session, disarmed: seen.session.disarmed.filter((id) => seen.active.has(id)) };
  let memory = model.memory;

  if (memory.tutorial === "new") memory = { ...memory, tutorial: t >= TUTORIAL_SECONDS ? "done" : "active" };
  if (memory.tutorial === "active") {
    const i = currentStep(advisor, state, content, memory.events);
    if (i !== null) {
      const step = advisor.tutorial[i];
      const message: Message | null =
        tipsOn && !blocked ? { kind: "tutorial", stepId: step.id, step: i + 1, total: advisor.tutorial.length, text: step.text[lang] } : null;
      return { memory, session, message };
    }
    // Finished: give the player a breather before the first tip.
    memory = { ...memory, tutorial: "done" };
    session = { ...session, lastShownAt: t };
  }

  if (!tipsOn || blocked) return { memory, session, message: null };
  const current = model.message?.kind === "tip" && t - model.message.at < TIP_SECONDS ? model.message : null;
  if (current) return { memory, session, message: current };
  if (session.lastShownAt !== null && t - session.lastShownAt < TIP_GAP_SECONDS) return { memory, session, message: null };

  for (const trigger of TRIGGERS) {
    const vars = seen.active.get(trigger);
    if (!vars || session.disarmed.includes(trigger)) continue;
    const line = pickLine(advisor, memory, trigger);
    if (!line) continue;
    memory = { ...memory, shown: { ...memory.shown, [line.id]: (memory.shown[line.id] ?? 0) + 1 } };
    session = {
      ...session,
      lastShownAt: t,
      disarmed: [...session.disarmed, trigger],
      pendingUnlocks: trigger === "unlocked" ? session.pendingUnlocks.slice(1) : session.pendingUnlocks,
    };
    return { memory, session, message: { kind: "tip", lineId: line.id, trigger, text: fill(line.text[lang], vars), at: t } };
  }
  return { memory, session, message: null };
}

/** The player tapped the bubble. A tutorial step stays until it is done or skipped. */
export function dismiss(model: AdvisorModel): AdvisorModel {
  return model.message?.kind === "tip" ? { ...model, message: null } : model;
}

export function skipTutorial(model: AdvisorModel, time: number): AdvisorModel {
  return { memory: { ...model.memory, tutorial: "skipped" }, session: { ...model.session, lastShownAt: time }, message: null };
}

/** Remembers a tutorial event (the player gathered, opened a building menu, opened the Rehiyon). */
export function noteEvent(model: AdvisorModel, event: TutorialEvent): AdvisorModel {
  if (model.memory.events.includes(event)) return model;
  return { ...model, memory: { ...model.memory, events: [...model.memory.events, event] } };
}
