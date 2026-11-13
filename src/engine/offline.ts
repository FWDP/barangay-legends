// Offline progress: what the barangay did while the game was closed. Pure and deterministic.
// The UI measures the time away (the engine never reads the clock) and passes it in.
//
// Only gentle things happen offline: fields and camps produce, villagers eat, newcomers
// arrive while there is room and rice, the sick recover, a clearing job finishes, seasons turn,
// neighbors grow and tributaries send tribute. Nothing harmful: no disasters, no raids, nobody
// leaves or dies. Warnings that were running (a fire, a typhoon, a raid) wait for the player.
import { RESOURCES, type Content, type Resource } from "./content";
import { healRate, isHungry } from "./events";
import { healthyWorkers, housing, rates, type GameState } from "./game";
import { setTiles } from "./map";
import { aiContent, aiDecide, traitOf, type NeighborState, type RegionState } from "./region";

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
  const r = rates(state, content);
  const resources = { ...state.resources };
  const produced = zero();
  // The share of the step the barangay is fed (workers stop at 0 rice).
  let fed = isHungry(state) ? 0 : 1;
  if (fed && r.net.rice < 0 && resources.rice + r.net.rice * dt < 0) fed = resources.rice / -r.net.rice / dt;
  for (const res of RESOURCES) produced[res] = r.produced[res] * dt * fed;
  const eaten = Math.min(resources.rice + produced.rice, r.eaten.rice * dt);
  for (const res of RESOURCES) resources[res] = Math.max(0, resources[res] + produced[res] - (res === "rice" ? eaten : 0));
  let s: GameState = { ...state, resources, time: state.time + dt, lastBuild: null };

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

  // A clearing job carries on while the barangay is fed.
  let cleared = 0;
  const job = s.clearing;
  if (job && fed > 0 && healthyWorkers(state) >= content.rules.clearing.workers) {
    const progress = job.progress + dt * fed;
    if (progress >= job.seconds) {
      cleared = 1;
      s = {
        ...s,
        clearing: null,
        legacyReach: false,
        tilesCleared: s.tilesCleared + 1,
        resources: { ...s.resources, wood: s.resources.wood + content.rules.clearing.wood },
        map: setTiles(s.map, [{ x: job.x, y: job.y, tile: "cleared" }]),
      };
      produced.wood += content.rules.clearing.wood;
    } else s = { ...s, clearing: { ...job, progress } };
  }
  return { state: s, produced, eaten, hungry: dt * (1 - fed), arrived, recovered, cleared };
}

/** Neighbors grow, decide and pay tribute; nothing hostile, and loyalty doesn't drift. */
function regionStep(
  region: RegionState,
  player: GameState,
  content: Content,
  dt: number,
  decisions: number,
): { region: RegionState; player: GameState; tribute: Record<Resource, number> } {
  const ai = aiContent(content);
  const d = content.rules.diplomacy;
  const tribute = zero();
  const resources = { ...player.resources };
  const neighbors = region.neighbors.map((n): NeighborState => {
    let them = gentleStep(n.state, ai, dt).state;
    for (let i = 0; i < decisions; i++) them = aiDecide(them, content, traitOf(content, n.id));
    if (n.status === "tributary") {
      const produced = rates(them, ai).produced;
      const left = { ...them.resources };
      for (const res of RESOURCES) {
        const goods = Math.min(left[res], Math.floor((produced[res] * dt * d.tribute.percent) / 100));
        left[res] -= goods;
        resources[res] += goods;
        tribute[res] += goods;
      }
      them = { ...them, resources: left };
    }
    return { ...n, state: them };
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
      const rs = regionStep(region, s, content, dt, due);
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
  };
  if (region) {
    const offer = region.offer && region.offer.expiresAt <= end ? null : region.offer;
    if (region.offer && !offer) report.offerExpired = region.offer.from;
    region = {
      ...region,
      offer,
      incomingRaid: region.incomingRaid ? { ...region.incomingRaid, strikeAt: region.incomingRaid.strikeAt + seconds } : null,
      truceUntil: region.truceUntil + seconds,
      nextAiRaidAt: region.nextAiRaidAt + seconds,
      nextTributeAt: end + content.rules.diplomacy.tribute.everySeconds,
      neighbors: region.neighbors.map((n) => ({
        ...n,
        // Guards come home if their time ran out; decisions resume from now.
        guard: n.guard && n.guard.until <= end ? null : n.guard,
        nextDecisionAt: n.nextDecisionAt + seconds,
      })),
    };
    s = { ...s, region };
  }
  return { state: s, report };
}
