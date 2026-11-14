// The Defense map's key: which markers are on the map (landing points, open or covered by a Kuta;
// the Kutas' range; where today's raiders will land) and the one-line tip for tapping each. Pure,
// so it is tested; BarangayMap draws it.
import type { Point } from "../engine/map";
import type { GameText } from "./uiContent";

export type MarkerKind = "open" | "covered" | "range" | "landing";

/** Each marker's line in the key and its tip when tapped (keys in ui.json "defense"). */
export const MARKER_TEXT: Record<MarkerKind, { legend: keyof GameText["defense"]; tip: keyof GameText["defense"] }> = {
  open: { legend: "legendOpen", tip: "tipOpen" },
  covered: { legend: "legendCovered", tip: "tipCovered" },
  range: { legend: "legendRange", tip: "tipRange" },
  landing: { legend: "legendLanding", tip: "tipLanding" },
};

/** What is marked on the map now, in the key's order. */
export interface Marks {
  /** Landing points on the shore, by "x,y": covered by a Kuta (or the one being placed) or open. */
  shore: ReadonlyMap<string, "covered" | "new" | "open">;
  /** Tiles inside a Kuta's range, by "x,y". */
  range: ReadonlySet<string>;
  /** Where today's raiders land (a raid warning, or a visit's raid preview). */
  landing: Point | null;
}

/** The lines the key shows: only markers that are on the map. */
export function legendItems(m: Marks): MarkerKind[] {
  const kinds = new Set([...m.shore.values()].map((v) => (v === "open" ? "open" : "covered")));
  const out: MarkerKind[] = [];
  if (m.landing) out.push("landing");
  if (kinds.has("open")) out.push("open");
  if (kinds.has("covered")) out.push("covered");
  if (m.range.size > 0) out.push("range");
  return out;
}

/** The marker on a tile, if any: the raiders' landing first, then a landing point, then a Kuta's range. */
export function markerAt(m: Marks, x: number, y: number): MarkerKind | null {
  if (m.landing && m.landing.x === x && m.landing.y === y) return "landing";
  const s = m.shore.get(`${x},${y}`);
  if (s) return s === "open" ? "open" : "covered";
  if (m.range.has(`${x},${y}`)) return "range";
  return null;
}
