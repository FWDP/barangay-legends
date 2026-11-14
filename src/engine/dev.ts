// Dev tools (only offered by the ?dev=1 panel). They are ordinary serializable commands that go
// through apply(), so a save stays valid and the engine stays deterministic; any save that used
// one is marked devSave, to keep it apart from real play.
import { RESOURCES, type Content, type ResourceAmounts } from "./content";
import { dayPhaseAt, isNightAt } from "./daynight";
import { chooseLanding } from "./border";
import type { GameState } from "./game";
import { setTiles, tileAt } from "./map";
import { addFlag } from "./worship";
import { allyRaiders, raidableAllies, startAllyCall } from "./region";

/** Events the dev panel can start. "choice:<id>" starts a choice event. */
export const DEV_EVENTS = ["fire", "typhoon", "sickness", "eclipse", "tikbalang", "sarimanok", "raid", "offer"] as const;
export type DevEvent = (typeof DEV_EVENTS)[number] | `choice:${string}`;

export type DevAction =
  | { action: "fastForward"; days: number }
  | { action: "addResources"; amounts: ResourceAmounts }
  | { action: "trigger"; event: DevEvent }
  | { action: "setTime"; phase: "day" | "night" }
  | { action: "clearForest" }
  /** An ally (sandugo or bloc mate) is raided: its messenger's call for help comes now. */
  | { action: "allyRaid"; ally: string };

/** At most this many days per fast-forward (each day is simulated second by second). */
export const MAX_FAST_FORWARD_DAYS = 10;

/**
 * Runs a dev action. `run(state, seconds)` is the normal tick (passed in to avoid an import
 * cycle). Returns the same state when the action can't happen.
 */
export function devCommand(state: GameState, content: Content, cmd: DevAction, run: (s: GameState, seconds: number) => GameState): GameState {
  const done = devAction(state, content, cmd, run);
  return done === state ? state : { ...done, devSave: true };
}

function devAction(state: GameState, content: Content, cmd: DevAction, run: (s: GameState, seconds: number) => GameState): GameState {
  const day = content.rules.dayNight.daySeconds;
  switch (cmd.action) {
    case "fastForward": {
      const days = Number.isInteger(cmd.days) ? Math.min(MAX_FAST_FORWARD_DAYS, Math.max(0, cmd.days)) : 0;
      return days > 0 ? run(state, days * day) : state;
    }
    case "addResources": {
      const resources = { ...state.resources };
      let any = false;
      for (const r of RESOURCES) {
        const v = cmd.amounts?.[r];
        if (Number.isFinite(v) && (v as number) > 0) {
          resources[r] += v as number;
          any = true;
        }
      }
      return any ? { ...state, resources } : state;
    }
    case "setTime": {
      // Played forward to the next dusk or dawn, so everything on the way happens as usual.
      const { nightFrom, nightTo } = content.rules.dayNight;
      if ((cmd.phase === "night") === isNightAt(content, state.time)) return state;
      const p = dayPhaseAt(content, state.time);
      const target = cmd.phase === "night" ? nightFrom : nightTo;
      const wait = (((target - p + 1) % 1) || 1) * day + 0.5;
      return run(state, wait);
    }
    case "clearForest": {
      // Forest only: balete trees, river and sea stay, and the Forest Balance doesn't change.
      const changes: { x: number; y: number; tile: "cleared" }[] = [];
      for (let y = 0; y < state.map.height; y++) for (let x = 0; x < state.map.width; x++) if (tileAt(state.map, x, y) === "forest") changes.push({ x, y, tile: "cleared" });
      return changes.length ? { ...state, map: setTiles(state.map, changes), clearing: [] } : state;
    }
    case "trigger":
      return trigger(state, content, cmd.event);
    case "allyRaid": {
      if (!raidableAllies(state).some((a) => a.id === cmd.ally)) return state;
      // Their usual raiders, or any other barangay with warriors.
      const from = allyRaiders(state, content, cmd.ally)[0] ?? state.region!.neighbors.find((n) => n.id !== cmd.ally && n.status !== "ally" && n.state.warriors > 0);
      return from ? startAllyCall(state, content, cmd.ally, from.id, Math.floor(state.time)) : state;
    }
  }
}

function trigger(state: GameState, content: Content, event: DevEvent): GameState {
  const t = Math.floor(state.time);
  const ev = content.events;
  if (event.startsWith("choice:")) {
    const id = event.slice("choice:".length);
    const def = content.choices.find((c) => c.id === id);
    if (!def || state.choice) return state;
    const fits = state.region?.neighbors.find((n) => def.neighbor === "any" || n.status === def.neighbor);
    if (def.neighbor && !fits) return state;
    const neighbor = def.neighbor ? fits!.id : null;
    return { ...state, choice: { id, neighbor, at: state.time } };
  }
  switch (event) {
    case "fire": {
      const i = state.buildings.findIndex((b) => b.type === ev.fire?.target && !b.damaged && b.burningSince === undefined);
      if (!ev.fire || i < 0) return state;
      return { ...state, buildings: state.buildings.map((b, j) => (j === i ? { ...b, burningSince: t } : b)) };
    }
    case "typhoon":
      return ev.typhoon && !state.typhoon ? { ...state, typhoon: { strikeAt: t + ev.typhoon.warningSeconds } } : state;
    case "sickness":
      return ev.sickness && state.sick.length < state.villagers ? { ...state, sick: [...state.sick, ev.sickness.sickSeconds] } : state;
    case "eclipse": {
      const e = content.eclipse;
      return e && !state.eclipse ? addFlag({ ...state, eclipse: { endsAt: t + e.durationSeconds, taps: 0 } }, e.lore ?? e.id) : state;
    }
    case "tikbalang": {
      const k = content.trickery;
      if (!k || state.tikbalang || k.riddles.length === 0) return state;
      const workers = Math.min(k.workersLost, state.villagers);
      return workers > 0 ? addFlag({ ...state, tikbalang: { riddle: k.riddles[0].id, workers, until: t + k.lostSeconds } }, k.lore ?? k.id) : state;
    }
    case "sarimanok": {
      const v = content.visitor;
      if (!v || state.sarimanok) return state;
      const y = Math.max(1, Math.floor(state.map.height / 3));
      return { ...state, sarimanok: { from: { x: -1, y }, to: { x: state.map.width + 1, y: Math.max(1, y - 3) }, at: t, until: t + v.visibleSeconds } };
    }
    case "raid": {
      const r = state.region;
      const from = r?.neighbors.find((n) => n.status === "independent");
      if (!r || !from || r.incomingRaid) return state;
      return { ...state, region: { ...r, truceUntil: 0, incomingRaid: { from: from.id, strikeAt: t + content.rules.diplomacy.aiRaid.warningSeconds, landing: chooseLanding(state, content, t) } } };
    }
    case "offer": {
      const r = state.region;
      const d = content.rules.diplomacy.offers;
      const from = r?.neighbors.find((n) => n.state.resources.rice >= d.give);
      if (!r || !from || r.offer) return state;
      return { ...state, region: { ...r, offer: { from: from.id, give: { resource: "rice", amount: d.give }, want: { resource: "wood", amount: Math.max(1, Math.floor((d.give * 100) / d.receivePercent)) }, expiresAt: t + d.expireSeconds } } };
    }
  }
  return state;
}
