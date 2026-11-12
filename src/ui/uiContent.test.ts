import { describe, expect, it } from "vitest";
import { content } from "../engine/testUtils";
import { browserLang, parseSettings, DEFAULT_SETTINGS } from "./settings";
import { buildUiContent, fill, helpVars, loadUiContent, placeholders, validateAdvisor, validateHelp } from "./uiContent";

const ids = content.buildings.map((b) => b.id);
const text = { en: "Hi", fil: "Kumusta" };
const advisor = (patch: Record<string, unknown> = {}) => ({
  name: "Dalisay",
  title: text,
  portrait: "👵🏽",
  ui: { skip: text, dismiss: text, step: text },
  tutorial: [{ id: "a", done: { built: "palayan" }, text }],
  lines: [{ id: "b", trigger: "rice-low", text: { en: "{seconds}s left", fil: "{seconds}s na lang" } }],
  ...patch,
});

describe("help and adviser content", () => {
  it("loads the files in content/", () => {
    const ui = loadUiContent(content);
    expect(ui.help.en.sections.length).toBeGreaterThan(0);
    expect(ui.help.fil.sections.map((s) => s.id)).toEqual(ui.help.en.sections.map((s) => s.id));
    expect(ui.advisor.tutorial.length).toBeGreaterThan(0);
  });

  it("covers the five help topics", () => {
    const ui = loadUiContent(content);
    expect(ui.help.en.sections.map((s) => s.id)).toEqual(["goal", "resources", "buildings", "seasons", "rehiyon"]);
  });

  it("fills help numbers from the rules", () => {
    const ui = loadUiContent(content);
    const all = ui.help.en.sections.flatMap((s) => s.body).map((p) => fill(p, helpVars(content)));
    expect(all.some((p) => p.includes(String(content.rules.riceEatenPerVillagerPerSecond)))).toBe(true);
    expect(all.every((p) => placeholders(p).length === 0)).toBe(true);
  });

  it("rejects a translation that drops a section", () => {
    const ui = loadUiContent(content);
    const fil = { ...ui.help.fil, sections: ui.help.fil.sections.slice(1) };
    expect(() => buildUiContent({ en: ui.help.en, fil }, advisor(), content)).toThrow(/same sections/);
  });

  it("rejects help with an unknown placeholder or missing body", () => {
    const doc = { lang: "en", label: "English", ui: { title: "t", close: "c", language: "l" }, sections: [{ id: "x", icon: "?", art: [], title: "X", body: ["{nope}"] }] };
    expect(() => validateHelp(doc)).toThrow(/placeholder/);
    expect(() => validateHelp({ ...doc, sections: [{ ...doc.sections[0], body: [] }] })).toThrow(/paragraph/);
  });

  it("checks adviser lines: triggers, languages, placeholders, unique ids", () => {
    expect(validateAdvisor(advisor(), ids).lines).toHaveLength(1);
    expect(() => validateAdvisor(advisor({ lines: [{ id: "b", trigger: "rain", text }] }), ids)).toThrow(/unknown trigger/);
    expect(() => validateAdvisor(advisor({ lines: [{ id: "b", trigger: "idle", text: { en: "Hi" } }] }), ids)).toThrow(/"fil"/);
    expect(() => validateAdvisor(advisor({ lines: [{ id: "b", trigger: "idle", text: { en: "{building}", fil: "x" } }] }), ids)).toThrow(/no \{building\}/);
    expect(() => validateAdvisor(advisor({ lines: [{ id: "a", trigger: "idle", text }] }), ids)).toThrow(/twice/);
    expect(() => validateAdvisor(advisor({ tutorial: [{ id: "a", done: { built: "castle" }, text }] }), ids)).toThrow(/unknown building/);
    expect(() => validateAdvisor(advisor({ tutorial: [{ id: "a", done: { event: "dance" }, text }] }), ids)).toThrow(/unknown event/);
  });

  it("fills placeholders and leaves unknown ones alone", () => {
    expect(fill("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });
});

describe("settings", () => {
  it("defaults to the browser language, Filipino for fil or tl", () => {
    expect(browserLang(["fil-PH"])).toBe("fil");
    expect(browserLang(["tl", "en"])).toBe("fil");
    expect(browserLang(["en-US", "fil"])).toBe("en");
    expect(browserLang(["ja"])).toBe("en");
    expect(browserLang([])).toBe("en");
  });

  it("reads stored settings, clamping volumes and dropping junk", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ musicVolume: 3, effectsVolume: -1, tips: false, language: "fil" }))).toEqual({
      musicVolume: 1,
      effectsVolume: 0,
      tips: false,
      language: "fil",
    });
    expect(parseSettings(JSON.stringify({ language: "xx", tips: "yes" }))).toEqual(DEFAULT_SETTINGS);
  });
});
