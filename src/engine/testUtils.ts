// Helpers shared by engine tests.
import { loadContent, type Content, type Events } from "./content";
import { newGame, type GameState, type PlacedBuilding } from "./game";
import { TILE_CODE, type MapState, type Point } from "./map";

export const content = loadContent();

const ASCII: Record<string, string> = { ".": TILE_CODE.cleared, P: TILE_CODE.cleared, "~": TILE_CODE.river, T: TILE_CODE.forest, "=": TILE_CODE.bridge, B: TILE_CODE.balete, "#": TILE_CODE.daan };

/**
 * A map drawn as text, one string per row:
 *   . cleared   P plaza (cleared)   ~ river   T forest   = bridge   B balete   # daan
 */
export function mapFrom(rows: string[], seed = 1): MapState {
  let plaza: Point | null = null;
  rows.forEach((row, y) => {
    const x = row.indexOf("P");
    if (x >= 0) plaza = { x, y };
  });
  const tiles = rows.map((row) => [...row].map((c) => ASCII[c] ?? "?").join("")).join("");
  if (tiles.includes("?") || rows.some((r) => r.length !== rows[0].length)) throw new Error("bad test map");
  return { width: rows[0].length, height: rows.length, seed, tiles, plaza: plaza ?? { x: 0, y: 0 } };
}

/**
 * The default test map: like the original v2 layout. River in column 0, land in 1..8,
 * forest in 9..10, plaza at (5, 4), rows 0..8.
 */
export const TEST_MAP = mapFrom([
  "~........TT",
  "~........TT",
  "~........TT",
  "~........TT",
  "~....P...TT",
  "~........TT",
  "~........TT",
  "~........TT",
  "~........TT",
]);

export function withState(patch: Partial<GameState> & { buildings?: PlacedBuilding[] }): GameState {
  return {
    ...newGame(content),
    map: TEST_MAP,
    buildings: [at("bahay-kubo", 5, 3)],
    clearing: null,
    tilesCleared: 0,
    // No region unless a test asks for one, so other tests aren't affected by neighbors.
    region: null,
    ...patch,
  };
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
