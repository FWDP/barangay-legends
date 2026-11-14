import { describe, expect, it } from "vitest";
import type { LifeEvent, LifeStory } from "../engine/talambuhay";
import { content } from "../engine/testUtils";
import { joinNames, lifeLine, storySentences } from "./talambuhay";

const story = (patch: Partial<LifeStory> = {}): LifeStory => ({
  id: 1,
  name: "Dalisay",
  gender: "woman",
  role: "fisher",
  skill: content.talambuhay.skills[0].id,
  detail: content.talambuhay.details[0].id,
  came: "born",
  parents: [{ resident: 2, name: "Ligaya" }, { resident: 3, name: "Malakas", named: 4 }],
  spouse: null,
  children: [],
  life: [],
  ...patch,
});
const place = (id: string) => `B-${id}`;

describe("life story text", () => {
  it("is 3 to 5 sentences, in both languages, with no blanks left", () => {
    const kids = [{ resident: 7, name: "Tala" }, { resident: 8, name: "Bagwis" }];
    for (const s of [story(), story({ came: "arrived", from: "malinaw", parents: [] }), story({ came: "founder", spouse: { resident: 5, name: "Lakan" }, children: kids })]) {
      for (const lang of ["en", "fil"] as const) {
        const lines = storySentences(s, content, lang, place);
        expect(lines.length).toBeGreaterThanOrEqual(3);
        expect(lines.length).toBeLessThanOrEqual(5);
        for (const l of lines) expect(l).not.toMatch(/[{}]/);
      }
    }
    expect(storySentences(story(), content, "en", place)[0]).toContain("Ligaya and Malakas");
    expect(storySentences(story({ came: "arrived", from: "malinaw", parents: [] }), content, "en", place)[0]).toContain("B-malinaw");
  });

  it("has a line for every life event", () => {
    const events: LifeEvent[] = [
      { at: 0, kind: "born" },
      { at: 0, kind: "arrived", from: "malinaw" },
      { at: 0, kind: "married", other: 2, otherName: "Lakan" },
      { at: 0, kind: "parent", other: 3, otherName: "Tala" },
      { at: 0, kind: "grewUp" },
      { at: 0, kind: "elder" },
      { at: 0, kind: "raid", from: "malinaw", outcome: "won" },
      { at: 0, kind: "raid", from: "malinaw", outcome: "lost", defense: true },
      { at: 0, kind: "sick" },
      { at: 0, kind: "healed" },
      { at: 0, kind: "learned", lesson: "baybayin", other: 4, otherName: "Ines" },
      { at: 0, kind: "learned", lesson: "old-songs" },
      { at: 0, kind: "died", cause: "raid" },
    ];
    for (const e of events) {
      for (const lang of ["en", "fil"] as const) {
        const l = lifeLine(e, content, lang, place);
        expect(l).not.toBe("");
        expect(l).not.toMatch(/[{}]/);
      }
    }
    expect(lifeLine(events[10], content, "en", place)).toBe("Learned to write in baybayin from Ines");
  });

  it("joins names with the language's own 'and'", () => {
    expect(joinNames(content, ["A", "B", "C"], "en")).toBe("A, B and C");
    expect(joinNames(content, ["A", "B"], "fil")).toBe("A at B");
  });
});
