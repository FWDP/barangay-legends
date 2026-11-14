import { describe, expect, it } from "vitest";
import { content } from "../engine/testUtils";
import { loadUiContent } from "./uiContent";
import { legendItems, markerAt, MARKER_TEXT, type Marks } from "./defenseLegend";

const marks = (patch: Partial<Marks> = {}): Marks => ({
  shore: new Map([
    ["1,4", "open"],
    ["1,5", "covered"],
  ]),
  range: new Set(["2,5", "3,5"]),
  landing: null,
  ...patch,
});

describe("the Defense map's key", () => {
  it("lists only the markers on the map", () => {
    expect(legendItems(marks())).toEqual(["open", "covered", "range"]);
    expect(legendItems(marks({ landing: { x: 1, y: 4 } }))).toEqual(["landing", "open", "covered", "range"]);
    expect(legendItems(marks({ shore: new Map([["1,4", "new"]]), range: new Set() }))).toEqual(["covered"]);
    // A visit's raid preview: no landing points drawn, just the landing and the Kutas' range.
    expect(legendItems(marks({ shore: new Map(), landing: { x: 0, y: 0 } }))).toEqual(["landing", "range"]);
    expect(legendItems({ shore: new Map(), range: new Set(), landing: null })).toEqual([]);
  });

  it("finds the marker on a tapped tile: the raiders' landing, then a landing point, then a Kuta's range", () => {
    const m = marks({ landing: { x: 1, y: 4 } });
    expect(markerAt(m, 1, 4)).toBe("landing");
    expect(markerAt(m, 1, 5)).toBe("covered");
    expect(markerAt(marks(), 1, 4)).toBe("open");
    expect(markerAt(m, 3, 5)).toBe("range");
    expect(markerAt(m, 7, 7)).toBeNull();
  });

  it("has a key line and a one-line tip for every marker, in English and Filipino", () => {
    const game = loadUiContent(content).game;
    for (const t of Object.values(MARKER_TEXT)) {
      for (const lang of ["en", "fil"] as const) {
        expect(game.defense[t.legend][lang]).toBeTruthy();
        const tip = game.defense[t.tip][lang];
        expect(tip).toBeTruthy();
        expect(tip).not.toContain("\n");
      }
    }
  });
});
