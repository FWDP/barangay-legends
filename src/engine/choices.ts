// Choice events: a short story with 2–3 choices, each with effects (content/events/choices).
// Pure and deterministic like the rest of the engine: the roll uses the seeded RNG once per
// game second, and the player's answer is a "choose" command.
import { RESOURCES, type ChoiceEffects, type ChoiceEventDef, type ChoiceOption, type Content } from "./content";
import { seasonAt } from "./events";
import { housing, type GameState } from "./game";
import { adjustRelations, type NeighborStatus } from "./region";
import { rollAt } from "./rng";

/** Choice events roll with rollAt (see rng.ts), so they never disturb the shared RNG. */
export const choiceRoll = rollAt;

/** A choice event waiting for the datu's answer. */
export interface PendingChoice {
  id: string;
  /** The neighbor the story is about, if any. */
  neighbor: string | null;
  /** Game time it came up. */
  at: number;
}

/** How many recent events are kept out of the draw, so the same story doesn't come back at once. */
const RECENT = 3;
const EPSILON = 1e-9;
/** The key in GameState.nextEventAt for the earliest next choice event. */
export const CHOICE_KEY = "choice";

/** Neighbors an event could be about. */
function candidates(state: GameState, def: ChoiceEventDef): string[] {
  const want: NeighborStatus | "any" | null = def.conditions.allied ? "ally" : (def.neighbor ?? null);
  if (!want) return [];
  return (state.region?.neighbors ?? []).filter((n) => want === "any" || n.status === want).map((n) => n.id);
}

/** Can this event come up now? Every condition in its file must hold. */
export function isEligible(state: GameState, content: Content, def: ChoiceEventDef): boolean {
  const c = def.conditions;
  if (c.season && !c.season.includes(seasonAt(content, state.time)?.season.id ?? "")) return false;
  if (c.hasBuilding && !state.buildings.some((b) => b.type === c.hasBuilding && !b.damaged)) return false;
  if (c.lacksBuilding && state.buildings.some((b) => b.type === c.lacksBuilding)) return false;
  if (c.minVillagers !== undefined && state.villagers < c.minVillagers) return false;
  if ((c.allied || def.neighbor) && candidates(state, def).length === 0) return false;
  return true;
}

/** Choice events are never offered during a raid, nor while one is waiting. */
export function choicesBlocked(state: GameState): boolean {
  return state.choice !== null || (state.region?.incomingRaid ?? null) !== null;
}

/**
 * Rolls for a new choice event on each whole second from state.time to state.time + dt.
 * At most one every rules.choices.minGapSeconds, never before startsAfterSeconds.
 */
export function updateChoices(state: GameState, content: Content, t0: number, dt: number): GameState {
  const rules = content.rules.choices;
  if (content.choices.length === 0 || choicesBlocked(state)) return state;
  const seed = state.map.seed;
  let s = state;
  for (let second = Math.floor(t0 + EPSILON) + 1; second <= Math.floor(t0 + dt + EPSILON); second++) {
    if (second < rules.startsAfterSeconds || second < (s.nextEventAt[CHOICE_KEY] ?? 0)) continue;
    if (choiceRoll(seed, second, 0) >= rules.chancePerSecond) continue;
    const pool = content.choices.filter((d) => !s.recentChoices.includes(d.id) && isEligible(s, content, d));
    if (pool.length === 0) continue;
    const total = pool.reduce((sum, d) => sum + d.weight, 0);
    let roll = choiceRoll(seed, second, 1) * total;
    const def = pool.find((d) => (roll -= d.weight) < 0) ?? pool[pool.length - 1];
    const who = candidates(s, def);
    s = {
      ...s,
      choice: { id: def.id, neighbor: who.length ? who[Math.floor(choiceRoll(seed, second, 2) * who.length)] : null, at: second },
      nextEventAt: { ...s.nextEventAt, [CHOICE_KEY]: second + rules.minGapSeconds },
    };
    break;
  }
  return s;
}

export const choiceDef = (content: Content, id: string) => content.choices.find((c) => c.id === id);

/** Why an option can't be chosen right now (it costs more than the barangay has), or null. */
export function optionBlocker(state: GameState, option: ChoiceOption): string | null {
  const e = option.effects;
  for (const r of RESOURCES) {
    const n = e.resources?.[r] ?? 0;
    if (n < 0 && state.resources[r] < -n) return `Needs ${-n} ${r}`;
  }
  if ((e.villagers ?? 0) < 0 && state.villagers <= -(e.villagers ?? 0)) return "Not enough villagers";
  return null;
}

/** Applies one option's effects. Resources never go below 0; newcomers only come if there is room. */
export function applyEffects(state: GameState, content: Content, effects: ChoiceEffects, neighbor: string | null): GameState {
  const resources = { ...state.resources };
  for (const r of RESOURCES) resources[r] = Math.max(0, resources[r] + (effects.resources?.[r] ?? 0));
  let s: GameState = { ...state, resources };

  const v = effects.villagers ?? 0;
  if (v > 0) s = { ...s, villagers: s.villagers + Math.min(v, Math.max(0, housing(s, content) - s.villagers)) };
  if (v < 0) {
    const villagers = Math.max(0, s.villagers + v);
    s = { ...s, villagers, warriors: Math.min(s.warriors, villagers), sick: s.sick.slice(0, villagers) };
  }

  const sick = effects.sick ?? 0;
  const sickness = content.events.sickness;
  if (sick > 0 && sickness) {
    const n = Math.min(sick, Math.max(0, s.villagers - s.sick.length));
    s = { ...s, sick: [...s.sick, ...Array.from({ length: n }, () => sickness.sickSeconds)] };
  }
  // Cures the ones furthest from recovery first.
  if (sick < 0) s = { ...s, sick: [...s.sick].sort((a, b) => a - b).slice(0, Math.max(0, s.sick.length + sick)) };

  if (neighbor && (effects.trust || effects.influence)) {
    s = adjustRelations(s, content, neighbor, { trust: effects.trust, influence: effects.influence });
  }
  return s;
}

/** The player answers the waiting choice event. Refused (same state) if the option is unknown or unaffordable. */
export function choose(state: GameState, content: Content, optionId: string): GameState {
  const pending = state.choice;
  const def = pending && choiceDef(content, pending.id);
  const option = def?.choices.find((o) => o.id === optionId);
  if (!pending || !def || !option || optionBlocker(state, option)) return state;
  const s = applyEffects(state, content, option.effects, pending.neighbor);
  return { ...s, choice: null, recentChoices: [...state.recentChoices, def.id].slice(-RECENT) };
}
