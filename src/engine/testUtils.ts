// Helpers shared by engine tests.
import { loadContent, type Content, type Events } from "./content";
import { newGame, type GameState, type PlacedBuilding } from "./game";

export const content = loadContent();

/**
 * Map reference (default content/rules.json): x = 0 is river, x = 9..10 forest,
 * x = 1..8 land, plaza at (5, 0), rows -3..3 to start.
 */
export function withState(patch: Partial<GameState> & { buildings?: PlacedBuilding[] }): GameState {
  return { ...newGame(content), ...patch };
}

export const at = (type: string, x: number, y: number): PlacedBuilding => ({ type, x, y });

/** Content with event fields overridden, e.g. withEvents({ fire: { chancePerSecond: 1 } }). */
export function withEvents(patch: { [K in keyof Events]?: Partial<NonNullable<Events[K]>> }, base: Content = content): Content {
  const events = { ...base.events } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    events[key] = { ...(base.events as Record<string, object>)[key], ...value };
  }
  return { ...base, events: events as Events };
}

/** No random disasters at all, for tests about something else. */
export const calm = withEvents({
  sickness: { chancePerSecond: 0 },
  fire: { chancePerSecond: 0 },
  typhoon: { chancePerSecond: 0 },
});
