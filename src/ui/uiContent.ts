// Text for the help screen (content/help/*.json) and the adviser (content/advisor.json).
// Presentation only: none of it changes game rules. Checked here so a contributor's typo
// fails `npm test` instead of showing a blank bubble.
import type { Content } from "../engine/content";
import { LANGS, type Lang } from "./settings";

export type Localized = Record<Lang, string>;

export interface HelpSection {
  id: string;
  icon: string;
  /** A row of emoji drawn as the section's picture. */
  art: string[];
  title: string;
  body: string[];
}

export interface HelpDoc {
  lang: Lang;
  label: string;
  ui: { title: string; close: string; language: string };
  sections: HelpSection[];
}

export const TRIGGERS = [
  "raid-warning",
  "event-fire",
  "rice-low",
  "food-workers",
  "forest-angry",
  "event-typhoon",
  "event-sickness",
  "trade-offer",
  "refused-raids",
  "forest-restless",
  "no-path",
  "old-paths",
  "borrowing",
  "unlocked",
  "unstaffed",
  "roads",
  "dambana",
  "aklat",
  "idle",
] as const;
/** Listed most urgent first: when several hold at once, the adviser speaks about the first. */
export type TriggerId = (typeof TRIGGERS)[number];

export const TUTORIAL_EVENTS = ["gather", "menu", "rehiyon"] as const;
export type TutorialEvent = (typeof TUTORIAL_EVENTS)[number];

export type StepDone = { event: TutorialEvent } | { built: string };

export interface TutorialStep {
  id: string;
  done: StepDone;
  text: Localized;
}

export interface AdvisorLine {
  id: string;
  trigger: TriggerId;
  text: Localized;
  /** Show this line at most this many times (default 3, the adviser's limit). */
  max?: number;
}

export interface AdvisorDef {
  name: string;
  title: Localized;
  /** An emoji, or an image path under public/art. */
  portrait: string;
  ui: { skip: Localized; dismiss: Localized; step: Localized };
  tutorial: TutorialStep[];
  lines: AdvisorLine[];
}

export const TITLE_TEXT = [
  "tagline", "welcomeBack", "welcomeBackUnnamed", "continue", "newGame", "start", "youWillLead", "chooseNames",
  "datuName", "barangayName", "reroll", "replaceTitle", "replaceText", "replaceConfirm", "cancel", "online",
  "comingSoon", "help", "settings", "credits", "support", "close", "free",
] as const;
export type TitleKey = (typeof TITLE_TEXT)[number];

export interface TitleDef {
  links: { source: string; contributors: string; support: string };
  text: Record<TitleKey, Localized>;
}

/** Random default names for a new barangay and its datu. */
export interface NameLists {
  datu: string[];
  barangay: string[];
}

/**
 * In-game labels (content/ui.json): every group, its keys, and the placeholders each may use.
 * Adding a key here makes it required in the file.
 */
export const GAME_TEXT = {
  gawain: {
    title: [], reward: ["reward"], titleReward: ["title"], progress: ["have", "need"], count: ["n", "total"],
    moreSoon: [], allDone: ["total"], open: [], close: [], history: [], noHistory: [],
  },
  roles: { villager: [], farmer: [], woodcutter: [], fisher: [], warrior: [] },
  history: { named: ["story"], left: ["name"], leftHunger: ["name"], leftCrowded: ["name"], fell: ["name"], task: ["task"] },
  villager: { sick: [], close: [], ledDefense: ["name"] },
  news: { taskDone: ["task", "reward"], next: ["task"], title: ["title"], moreSoon: [], firstNamed: ["story"] },
  share: { button: [], villagers: ["n"], datu: ["datu"], text: [], saved: [], failed: [] },
  aklat: { title: [], progress: ["found", "total"], tradition: ["tradition"], inGame: [], sources: [], locked: [], hint: ["hint"], review: [], open: [], found: ["name"] },
  dambana: {
    title: [], favor: ["favor"], chooseTitle: [], chooseText: [], choose: [], change: ["cost"], offer: [], offerHint: [], bless: [], cooldown: ["time"],
    active: ["time"], permission: ["cost"], permissionActive: ["tiles"], needTradition: [], needFavor: [], close: [], burial: ["style"], healer: ["name"],
  },
  forest: { label: ["balance"], tip: [], stage1: [], stage2: ["percent"], replant: ["cost"], replanting: ["time"], prank: ["building", "time"] },
  events: { eclipse: [], gong: [], gongs: ["taps", "needed"], eclipseWon: ["favor", "gold"], eclipseLost: ["rice"], tikbalang: ["n"], right: [], wrong: ["time"], sarimanok: ["gift"] },
} as const satisfies Record<string, Record<string, readonly string[]>>;

export type GameText = { [G in keyof typeof GAME_TEXT]: { [K in keyof (typeof GAME_TEXT)[G]]: Localized } };

export function validateGameText(raw: unknown, file = "ui.json"): GameText {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  for (const [group, keys] of Object.entries(GAME_TEXT)) {
    const g = raw[group];
    if (!isObject(g)) throw new Error(`${file}: missing "${group}"`);
    for (const [key, vars] of Object.entries(keys as Record<string, readonly string[]>)) {
      const text = localized(g[key], `${file}: ${group}.${key}`);
      for (const l of LANGS) {
        for (const name of placeholders(text[l])) if (!vars.includes(name)) throw new Error(`${file}: ${group}.${key} has no {${name}}`);
      }
    }
  }
  return raw as unknown as GameText;
}

export interface UiContent {
  help: Record<Lang, HelpDoc>;
  advisor: AdvisorDef;
  title: TitleDef;
  names: NameLists;
  game: GameText;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

function localized(v: unknown, where: string): Localized {
  if (!isObject(v)) throw new Error(`${where} needs text for ${LANGS.join(" and ")}`);
  for (const l of LANGS) if (!isText(v[l])) throw new Error(`${where} is missing "${l}" text`);
  return v as Localized;
}

/** Placeholders like {building} used in a piece of text. */
export const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

/** Replaces {name} with vars[name]; unknown placeholders stay as they are. */
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

const HELP_VARS = ["riceEaten", "gatherPerClick"];
/** Numbers the help text may mention, taken from the rules so they never go stale. */
export const helpVars = (content: Content) => ({
  riceEaten: content.rules.riceEatenPerVillagerPerSecond,
  gatherPerClick: content.rules.gatherPerClick,
});

export function validateHelp(raw: unknown, file = "help"): HelpDoc {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  if (!(LANGS as readonly unknown[]).includes(raw.lang)) throw new Error(`${file}: "lang" must be one of ${LANGS.join(", ")}`);
  if (!isText(raw.label)) throw new Error(`${file}: "label" must be a non-empty string`);
  if (!isObject(raw.ui) || !["title", "close", "language"].every((k) => isText((raw.ui as Record<string, unknown>)[k]))) {
    throw new Error(`${file}: "ui" needs "title", "close" and "language"`);
  }
  if (!Array.isArray(raw.sections) || raw.sections.length === 0) throw new Error(`${file}: needs at least one section`);
  raw.sections.forEach((s, i) => {
    const where = `${file}: sections[${i}]`;
    if (!isObject(s) || !isText(s.id) || !isText(s.icon) || !isText(s.title)) throw new Error(`${where} needs "id", "icon" and "title"`);
    if (!Array.isArray(s.art) || !s.art.every(isText)) throw new Error(`${where}: "art" must be a list of emoji`);
    if (!Array.isArray(s.body) || s.body.length === 0 || !s.body.every(isText)) throw new Error(`${where}: "body" needs at least one paragraph`);
    for (const p of s.body as string[]) {
      for (const name of placeholders(p)) if (!HELP_VARS.includes(name)) throw new Error(`${where}: unknown placeholder {${name}}`);
    }
  });
  return raw as unknown as HelpDoc;
}

const LINE_VARS: Record<TriggerId, string[]> = {
  "raid-warning": ["neighbor", "datu", "seconds", "direction"],
  "event-fire": [],
  "rice-low": ["seconds"],
  "food-workers": ["farmers", "villagers"],
  "event-typhoon": ["seconds"],
  "event-sickness": [],
  "trade-offer": ["neighbor", "datu"],
  "refused-raids": ["neighbor", "datu"],
  unlocked: ["building"],
  unstaffed: ["building"],
  "no-path": ["building"],
  "old-paths": ["building"],
  roads: ["percent"],
  borrowing: ["building"],
  "forest-angry": [],
  "forest-restless": [],
  dambana: [],
  aklat: [],
  idle: [],
};

export function validateAdvisor(raw: unknown, buildingIds: string[], file = "advisor"): AdvisorDef {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  if (!isText(raw.name) || !isText(raw.portrait)) throw new Error(`${file}: needs "name" and "portrait"`);
  localized(raw.title, `${file}: title`);
  if (!isObject(raw.ui)) throw new Error(`${file}: missing "ui"`);
  for (const k of ["skip", "dismiss", "step"]) localized(raw.ui[k], `${file}: ui.${k}`);
  if (!Array.isArray(raw.tutorial)) throw new Error(`${file}: "tutorial" must be a list`);
  const ids = new Set<string>();
  const unique = (id: unknown, where: string) => {
    if (!isText(id)) throw new Error(`${where} needs an "id"`);
    if (ids.has(id)) throw new Error(`${where}: id "${id}" is used twice`);
    ids.add(id);
  };
  raw.tutorial.forEach((s, i) => {
    const where = `${file}: tutorial[${i}]`;
    if (!isObject(s)) throw new Error(`${where} must be an object`);
    unique(s.id, where);
    localized(s.text, `${where}.text`);
    const d = s.done;
    if (isObject(d) && "event" in d) {
      if (!(TUTORIAL_EVENTS as readonly unknown[]).includes(d.event)) throw new Error(`${where}: unknown event "${String(d.event)}"`);
    } else if (isObject(d) && "built" in d) {
      if (!buildingIds.includes(d.built as string)) throw new Error(`${where}: unknown building "${String(d.built)}"`);
    } else {
      throw new Error(`${where}: "done" needs an "event" or a "built" building id`);
    }
  });
  if (!Array.isArray(raw.lines)) throw new Error(`${file}: "lines" must be a list`);
  raw.lines.forEach((line, i) => {
    const where = `${file}: lines[${i}]`;
    if (!isObject(line)) throw new Error(`${where} must be an object`);
    unique(line.id, where);
    if (!(TRIGGERS as readonly unknown[]).includes(line.trigger)) throw new Error(`${where}: unknown trigger "${String(line.trigger)}"`);
    const text = localized(line.text, `${where}.text`);
    if (line.max !== undefined && (!Number.isInteger(line.max) || (line.max as number) < 1 || (line.max as number) > 3)) {
      throw new Error(`${where}: "max" must be 1, 2 or 3`);
    }
    const allowed = LINE_VARS[line.trigger as TriggerId];
    for (const l of LANGS) {
      for (const name of placeholders(text[l])) {
        if (!allowed.includes(name)) throw new Error(`${where}: trigger "${String(line.trigger)}" has no {${name}}`);
      }
    }
  });
  return raw as unknown as AdvisorDef;
}

export function validateTitle(raw: unknown, file = "title"): TitleDef {
  if (!isObject(raw) || !isObject(raw.links) || !isObject(raw.text)) throw new Error(`${file}: needs "links" and "text"`);
  for (const k of ["source", "contributors", "support"]) {
    const url = raw.links[k];
    if (typeof url !== "string" || (url !== "" && !/^https:\/\//.test(url))) throw new Error(`${file}: links.${k} must be an https:// link or ""`);
  }
  if (!isText(raw.links.source)) throw new Error(`${file}: links.source is required`);
  for (const k of TITLE_TEXT) localized(raw.text[k], `${file}: text.${k}`);
  return raw as unknown as TitleDef;
}

export function validateNames(raw: unknown, file = "names"): NameLists {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  for (const k of ["datu", "barangay"]) {
    const list = raw[k];
    if (!Array.isArray(list) || list.length === 0 || !list.every((n) => isText(n) && n.length <= 30)) {
      throw new Error(`${file}: "${k}" needs at least one name of at most 30 characters`);
    }
  }
  return raw as unknown as NameLists;
}

/** A random pick from each list (UI only: the engine's own randomness stays seeded). */
export function randomNames(names: NameLists, random: () => number = Math.random): { datu: string; name: string } {
  const pick = (l: string[]) => l[Math.floor(random() * l.length) % l.length];
  return { datu: pick(names.datu), name: pick(names.barangay) };
}

export function buildUiContent(
  helpFiles: Record<string, unknown>,
  rawAdvisor: unknown,
  content: Content,
  rawTitle: unknown,
  rawNames: unknown,
  rawGameText?: unknown,
): UiContent {
  const docs = Object.entries(helpFiles).map(([file, raw]) => validateHelp(raw, file));
  const help = {} as Record<Lang, HelpDoc>;
  for (const d of docs) {
    if (help[d.lang]) throw new Error(`help: two files for "${d.lang}"`);
    help[d.lang] = d;
  }
  for (const l of LANGS) if (!help[l]) throw new Error(`help: missing content/help/${l}.json`);
  // Translations must cover the same sections, so switching language never hides one.
  const order = help.en.sections.map((s) => s.id).join(",");
  for (const l of LANGS) {
    if (help[l].sections.map((s) => s.id).join(",") !== order) throw new Error(`help: ${l}.json must have the same sections as en.json, in order`);
  }
  return {
    help,
    advisor: validateAdvisor(rawAdvisor, content.buildings.map((b) => b.id)),
    title: validateTitle(rawTitle),
    names: validateNames(rawNames),
    game: validateGameText(rawGameText),
  };
}

export function loadUiContent(content: Content): UiContent {
  const help = import.meta.glob("../../content/help/*.json", { eager: true, import: "default" });
  const advisor = import.meta.glob("../../content/advisor.json", { eager: true, import: "default" });
  const title = import.meta.glob("../../content/title.json", { eager: true, import: "default" });
  const names = import.meta.glob("../../content/names.json", { eager: true, import: "default" });
  const game = import.meta.glob("../../content/ui.json", { eager: true, import: "default" });
  return buildUiContent(help, Object.values(advisor)[0], content, Object.values(title)[0], Object.values(names)[0], Object.values(game)[0]);
}
