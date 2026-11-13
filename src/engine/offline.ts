// Offline progress: what the barangay did while the game was closed. Pure and deterministic.
// The UI measures the time away (the engine never reads the clock) and passes it in.
//
// Only gentle things happen offline: fields and camps produce, villagers eat, newcomers
// arrive while there is room and rice (and may get names), the sick recover, a clearing job
// finishes, seasons turn, happiness drifts, tasks (Mga Gawain) met are credited, neighbors grow
// and tributaries send tribute. Nothing harmful: no disasters, no raids, nobody leaves or
// dies. Warnings that were running (a fire, a typhoon, a raid) wait for the player.
import { RESOURCES, type Content, type Resource } from "./content";
import { healRate, isHungry } from "./events";
import { housing, rates, type GameState } from "./game";
import { advanceClearing } from "./clearing";
import { aiContent, aiDecide, traitOf, updatePolitics, type NeighborState, type RegionState } from "./region";
import { checkTasks } from "./gawain";
import { nextHappiness } from "./happiness";
import { reconcilePeople } from "./people";
import { capGrowth, riceCap } from "./storage";
import { checkAklat } from "./aklat";
import { advanceReplanting, afterClearing, updateForest } from "./forest";
import { passMourning } from "./death";
import { applyRenown } from "./kabantugan";
import { trackRanking } from "./ranking";

/** Neighbors on other islands are stepped once every this many offline steps. */
const FAR_EVERY = 4;

export interface OfflineReport {
  /** Seconds credited (after the cap). */
  seconds: number;
  /** Seconds the player was actually away. */
  away: number;
  produced: Record<Resource, number>;
  eaten: number;
  /** Seconds the barangay spent with an empty granary (nobody worked, nobody left). */
  hungrySeconds: number;
  arrived: number;
  recovered: number;
  /** Forest tiles finished clearing. */
  cleared: number;
  tribute: Record<Resource, number>;
  /** The neighbor whose trade boat gave up waiting, if any. */
  offerExpired: string | null;
  /** Mga Gawain finished while away (ids, in order). */
  tasks: string[];
  /** Balita news ids that came while away (at most one political event). */
  news: number[];
}

const zero = (): Record<Resource, number> => Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<Resource, number>;

interface StepResult {
  state: GameState;
  produced: Record<Resource, number>;
  eaten: number;
  hungry: number;
  arrived: number;
  recovered: number;
  cleared: number;
}

/**
 * One coarse step of `dt` seconds for any barangay: produce and eat (production stops once the
 * rice runs out), newcomers while fed and there is room, recovery, and land clearing.
 */
export function gentleStep(state: GameState, content: Content, dt: number): StepResult {
  // No forest reactions offline: the diwata don't withhold rice while the player is away.
  const r = rates(state, content, { offline: true });
  const resources = { ...state.resources };
  const produced = zero();
  // The share of the step the barangay is fed (workers stop at 0 rice).
  let fed = isHungry(state) ? 0 : 1;
  if (fed && r.net.rice < 0 && resources.rice + r.net.rice * dt < 0) fed = resources.rice / -r.net.rice / dt;
  for (const res of RESOURCES) produced[res] = r.produced[res] * dt * fed;
  const eaten = Math.min(resources.rice + produced.rice, r.eaten.rice * dt);
  for (const res of RESOURCES) resources[res] = Math.max(0, resources[res] + produced[res] - (res === "rice" ? eaten : 0));
  // Full granaries: what doesn't fit isn't stored (and isn't counted as brought in).
  const capped = capGrowth(state.resources.rice, resources.rice, riceCap(state, content));
  produced.rice -= resources.rice - capped;
  resources.rice = capped;
  let s: GameState = { ...state, resources, time: state.time + dt, lastBuild: null, happiness: nextHappiness(state, content, dt) };

  // Newcomers, only while fed and there's room. Never anyone leaving.
  let arrived = 0;
  const room = Math.max(0, housing(s, content) - s.villagers);
  if (room > 0 && fed === 1 && resources.rice > 0) {
    const migration = Math.max(0, s.migration) + dt / content.rules.secondsPerNewVillager;
    arrived = Math.min(room, Math.floor(migration));
    s = { ...s, villagers: s.villagers + arrived, migration: arrived === room ? 0 : migration - arrived };
  }

  // The sick recover (no new cases).
  const rate = healRate(s, content);
  const sick = s.sick.map((left) => left - dt * rate).filter((left) => left > 1e-9);
  const recovered = s.sick.length - sick.length;
  s = { ...s, sick };

  // Clearing carries on while the barangay is fed: every job that would have finished does.
  let cleared = 0;
  if (fed > 0 && s.clearing.length > 0) {
    const before = s.resources.wood;
    const prev = s;
    const done = advanceClearing(s, content, dt * fed, false);
    s = content.ai ? done.state : afterClearing(prev, done.state, content);
    cleared = done.cleared;
    produced.wood += s.resources.wood - before;
  }
  // Newcomers may get names; recoveries clear named villagers' sickness. Then tasks met are credited.
  // The forest recovers (and replanting goes on) offline, but the spirits don't react: no
  // pranks, no tikbalang, no messages. Aklat entries met (e.g. a new building) are found.
  if (!content.ai) s = checkAklat(updateForest(fed > 0 ? advanceReplanting(s, content, dt * fed) : s, content, dt, false), content);
  // Mourning passes while away; nobody dies offline.
  s = passMourning(s, content, dt);
  // Renown for what was achieved (newcomers, tasks, Aklat entries), and any level reached.
  if (!content.ai) s = trackRanking(state, applyRenown(state, s, content), content);
  s = checkTasks(reconcilePeople(state, s, content), content);
  return { state: s, produced, eaten, hungry: dt * (1 - fed), arrived, recovered, cleared };
}

/** Neighbors grow, decide and pay tribute; nothing hostile, and loyalty doesn't drift. */
function regionStep(
  region: RegionState,
  player: GameState,
  content: Content,
  dt: number,
  decisions: number,
  far?: { step: number; every: number; decisions: number },
): { region: RegionState; player: GameState; tribute: Record<Resource, number> } {
  const ai = aiContent(content);
  const d = content.rules.diplomacy;
  const tribute = zero();
  const resources = { ...player.resources };
  const home = region.places?.[player.barangay.id]?.island;
  const neighbors = region.neighbors.map((n): NeighborState => {
    // Barangays on other islands are stepped more coarsely offline (every `every` steps), to keep catch-up quick.
    const distant = !!far && home !== undefined && region.places?.[n.id] !== undefined && region.places[n.id].island !== home;
    if (distant && far!.step % far!.every !== far!.every - 1) return n;
    const span = distant ? dt * far!.every : dt;
    const due = distant ? far!.decisions : decisions;
    let them = gentleStep(n.state, ai, span).state;
    for (let i = 0; i < due; i++) them = aiDecide(them, content, traitOf(content, n.id));
    if (n.status === "tributary") {
      const produced = rates(them, ai).produced;
      const left = { ...them.resources };
      for (const res of RESOURCES) {
        const goods = Math.min(left[res], Math.floor((produced[res] * span * d.tribute.percent) / 100));
        left[res] -= goods;
        resources[res] += goods;
        tribute[res] += goods;
      }
      them = { ...them, resources: left };
    }
    // Grudges fade while the player is away too.
    const grudge = Math.max(0, n.grudge - (d.grudge.decayPerMinute * span) / 60);
    return { ...n, state: them, grudge };
  });
  return { region: { ...region, neighbors }, player: { ...player, resources }, tribute };
}

/**
 * Credits `awaySeconds` of time away, capped at rules.offline.maxSeconds, in coarse steps.
 * Returns the new state and what happened, for the "While you were away" story.
 */
export function offlineProgress(state: GameState, content: Content, awaySeconds: number): { state: GameState; report: OfflineReport } {
  const off = content.rules.offline;
  const away = Math.max(0, Number.isFinite(awaySeconds) ? awaySeconds : 0);
  const seconds = Math.min(away, off.maxSeconds);
  const report: OfflineReport = {
    seconds,
    away,
    produced: zero(),
    eaten: 0,
    hungrySeconds: 0,
    arrived: 0,
    recovered: 0,
    cleared: 0,
    tribute: zero(),
    offerExpired: null,
    tasks: [],
    news: [],
  };
  if (seconds < off.minSeconds) return { state, report: { ...report, seconds: 0 } };

  const start = state.time;
  const end = start + seconds;
  let s = state;
  let region = state.region;
  const steps = Math.min(off.maxSteps, Math.ceil(seconds / off.stepSeconds));
  const dt = seconds / steps;
  // Neighbors decide once every offline.aiDecisionSeconds of game time.
  let decided = 0;
  for (let i = 0; i < steps; i++) {
    const due = Math.floor(((i + 1) * dt) / off.aiDecisionSeconds) - decided;
    const step = gentleStep(s, content, dt);
    s = step.state;
    for (const r of RESOURCES) report.produced[r] += step.produced[r];
    report.eaten += step.eaten;
    report.hungrySeconds += step.hungry;
    report.arrived += step.arrived;
    report.recovered += step.recovered;
    report.cleared += step.cleared;
    if (region) {
      const farDue = Math.floor(((i + 1) * dt) / off.aiDecisionSeconds) - Math.floor(((i + 1 - FAR_EVERY) * dt) / off.aiDecisionSeconds);
      const rs = regionStep(region, s, content, dt, due, { step: i, every: FAR_EVERY, decisions: Math.max(0, farDue) });
      decided += due;
      region = rs.region;
      s = rs.player;
      for (const r of RESOURCES) report.tribute[r] += rs.tribute[r];
    }
  }

  // Warnings that were running wait for the player: the same time is left on them as when
  // the game closed. Fires don't burn down, typhoons don't strike, raids don't arrive.
  s = {
    ...s,
    time: end,
    hunger: 0,
    typhoon: s.typhoon ? { strikeAt: s.typhoon.strikeAt + seconds } : null,
    buildings: s.buildings.map((b) => (b.burningSince === undefined ? b : { ...b, burningSince: b.burningSince + seconds })),
    // Time away doesn't count as neglecting the Dambana, and the beings who were here wait too.
    lastRitualAt: s.lastRitualAt === null ? null : s.lastRitualAt + seconds,
    eclipse: s.eclipse ? { ...s.eclipse, endsAt: s.eclipse.endsAt + seconds } : null,
    tikbalang: s.tikbalang ? { ...s.tikbalang, until: s.tikbalang.until + seconds } : null,
    sarimanok: s.sarimanok ? { ...s.sarimanok, at: s.sarimanok.at + seconds, until: s.sarimanok.until + seconds } : null,
    pranks: s.pranks.map((p) => ({ ...p, until: p.until + seconds })),
  };

  if (region) {
    // A raid paused while away also keeps trading paused: the offer's time stands still too.
    const held = region.incomingRaid && region.offer ? { ...region.offer, expiresAt: region.offer.expiresAt + seconds } : region.offer;
    if (held !== region.offer) region = { ...region, offer: held };
    const offer = region.offer && region.offer.expiresAt <= end ? null : region.offer;
    if (region.offer && !offer) report.offerExpired = region.offer.from;
    region = {
      ...region,
      offer,
      incomingRaid: region.incomingRaid ? { ...region.incomingRaid, strikeAt: region.incomingRaid.strikeAt + seconds } : null,
      truceUntil: region.truceUntil + seconds,
      nextAiRaidAt: region.nextAiRaidAt + seconds,
      nextTributeAt: end + content.rules.diplomacy.tribute.everySeconds,
      // Boats at sea wait too: they arrive as long after the return as they had left to go.
      voyages: (region.voyages ?? []).map((v) => ({ ...v, departAt: v.departAt + seconds, arriveAt: v.arriveAt + seconds })),
      neighbors: region.neighbors.map((n) => ({
        ...n,
        // Guards come home if their time ran out; decisions resume from now.
        guard: n.guard && n.guard.until <= end ? null : n.guard,
        nextDecisionAt: n.nextDecisionAt + seconds,
      })),
    };
    s = { ...s, region };
  }
  // Politics: at most one scripted event while away; it never attacks the player.
  if (s.region) {
    const lastNews = s.region.nextNewsId;
    s = updatePolitics(s, content, start, end, 1);
    report.news = s.region!.news.filter((n) => n.id >= lastNews).map((n) => n.id);
  }
  report.tasks = s.gawainDone.filter((id) => !state.gawainDone.includes(id));
  return { state: s, report };
}
