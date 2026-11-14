// Life stories (talambuhay.ts): what they are made of, the dated events, the evening lessons,
// the Libingan keeping the stories of the dead, and saves.
import { describe, expect, it } from "vitest";
import { die } from "./death";
import { buildContent, validateTalambuhay } from "./content";
import { STATE_VERSION, type GameState } from "./game";
import type { NamedVillager } from "./people";
import { reconcilePeople } from "./people";
import { ageResidents, lifeSpans } from "./population";
import type { Resident } from "./residents";
import { parseSave } from "./save";
import { detailFor, lifeStory, noteLife, skillFor, teach } from "./talambuhay";
import { content, withState } from "./testUtils";
import talambuhayJson from "../../content/villagers/talambuhay.json";

const day = content.rules.dayNight.daySeconds;
const person = (id: number, gender: Resident["gender"], extra: Partial<Resident> = {}): Resident => ({ id, gender, age: "adult", cls: "commoner", since: 0, ...extra });
const named = (id: number, resident: number, extra: Partial<NamedVillager> = {}): NamedVillager => ({
  id,
  name: `N${id}`,
  story: content.villagers.stories.find((s) => s.role === "villager" && !s.first)!.id,
  role: "villager",
  since: 0,
  resident,
  life: [],
  ...extra,
});

/** A family: mother (1) and father (2) married, two children (3, 4), and an elder (5). Mother and child 3 are named. */
function family(patch: Partial<GameState> = {}): GameState {
  return withState({
    villagers: 5,
    residents: [
      person(1, "woman", { spouse: 2, came: "arrived", from: "malinaw" }),
      person(2, "man", { spouse: 1, came: "founder" }),
      person(3, "woman", { parents: [1, 2], came: "born", since: 10 }),
      person(4, "man", { parents: [1, 2], came: "born", age: "child", since: 50 }),
      person(5, "woman", { age: "elder" }),
    ],
    residentsNext: 6,
    named: [named(1, 1, { gender: "woman" }), named(2, 3, { gender: "woman" })],
    ...patch,
  });
}

describe("life stories", () => {
  it("are deterministic: the same seed and villager give the same skill and detail", () => {
    const s = family();
    const a = lifeStory(s, content, s.named[0]);
    const b = lifeStory(family(), content, family().named[0]);
    expect(a).toEqual(b);
    expect(content.talambuhay.skills.map((x) => x.id)).toContain(a.skill);
    expect(content.talambuhay.details.map((x) => x.id)).toContain(a.detail);
    // Over many villagers and seeds, more than one skill and detail come up.
    const skills = new Set<string>();
    const details = new Set<string>();
    for (let id = 1; id <= 40; id++) {
      skills.add(skillFor(content, 7, { id, role: "villager" }));
      details.add(detailFor(content, 7, { id }));
    }
    expect(skills.size).toBeGreaterThan(2);
    expect(details.size).toBeGreaterThan(2);
  });

  it("link to the real family members, and to their named villager", () => {
    const s = family();
    const mother = lifeStory(s, content, s.named[0]);
    expect(mother.came).toBe("arrived");
    expect(mother.from).toBe("malinaw");
    expect(mother.spouse?.resident).toBe(2);
    expect(mother.children.map((c) => c.resident)).toEqual([3, 4]);
    // The named daughter can be opened from her mother's story.
    expect(mother.children[0].named).toBe(2);
    expect(mother.children[0].name).toBe("N2");
    expect(mother.children[1].named).toBeUndefined();
    const daughter = lifeStory(s, content, s.named[1]);
    expect(daughter.came).toBe("born");
    expect(daughter.parents.map((p) => p.resident)).toEqual([1, 2]);
    expect(daughter.parents[0]).toMatchObject({ name: "N1", named: 1 });
  });

  it("only give skills that fit the role, and fighting only to the Mandirigma", () => {
    for (let id = 1; id <= 60; id++) {
      expect(skillFor(content, 3, { id, role: "farmer" })).not.toBe("fighting");
      const w = content.talambuhay.skills.find((x) => x.id === skillFor(content, 3, { id, role: "warrior" }))!;
      expect(!w.roles || w.roles.includes("warrior")).toBe(true);
    }
  });
});

describe("life events", () => {
  it("are appended in order, with the other person's name kept", () => {
    let s = family({ time: 100 });
    s = noteLife(s, content, 1, { kind: "parent", other: 4 });
    s = noteLife({ ...s, time: 200 }, content, 1, { kind: "elder" });
    const life = s.named[0].life!;
    expect(life.map((e) => e.kind)).toEqual(["parent", "elder"]);
    expect(life[0]).toMatchObject({ at: 100, other: 4 });
    expect(life[0].otherName).toBeTruthy();
    // Someone not named has no story to add to.
    expect(noteLife(s, content, 5, { kind: "elder" })).toBe(s);
  });

  it("note falling sick and being healed", () => {
    const s = family({ sick: [] });
    const ill = reconcilePeople(s, { ...s, sick: [30], named: s.named.map((v, i) => (i === 0 ? { ...v, sick: true } : v)) }, content);
    expect(ill.named[0].life!.at(-1)!.kind).toBe("sick");
    const well = reconcilePeople(ill, { ...ill, sick: [], named: ill.named.map((v) => ({ ...v, sick: undefined })) }, content);
    expect(well.named[0].life!.at(-1)!.kind).toBe("healed");
  });

  it("note the named warriors at a raid: where, and how it went", () => {
    const base = family({ region: withState({}).region ?? null });
    const warrior = named(3, 2, { role: "warrior", story: content.villagers.stories.find((x) => x.role === "warrior")!.id, gender: "man" });
    const s: GameState = { ...base, warriors: 1, named: [...base.named, warrior], region: { ...(family().region ?? ({} as never)), reports: [] } as never };
    const report = { id: 1, time: 0, kind: "defense" as const, neighbor: "malinaw", win: true };
    const after = reconcilePeople(s, { ...s, region: { ...s.region!, reports: [report] } }, content);
    const line = after.named.find((v) => v.id === 3)!.life!.at(-1)!;
    expect(line).toMatchObject({ kind: "raid", from: "malinaw", outcome: "won", defense: true });
    // Only the warriors fight.
    expect(after.named[0].life!.some((e) => e.kind === "raid")).toBe(false);
  });

  it("note growing up and becoming an elder", () => {
    const span = lifeSpans(content);
    const s = family({ time: 0, named: [named(1, 1, { gender: "woman" })] });
    const old = ageResidents({ ...s, time: span.adult + 1 }, content);
    expect(old.named[0].life!.at(-1)!.kind).toBe("elder");
  });
});

describe("the remembered", () => {
  it("keep their life story at the Libingan, ending with how they died", () => {
    const s = family({ time: 500 });
    const gone = die(s, content, "age", { who: s.named[0], second: 500 });
    expect(gone.named.map((v) => v.id)).toEqual([2]);
    const r = gone.remembered.at(-1)!;
    expect(r.name).toBe("N1");
    expect(r.story?.children.map((c) => c.resident)).toEqual([3, 4]);
    expect(r.story?.life.at(-1)).toMatchObject({ kind: "died", cause: "age", at: 500 });
    // The one who died leaves (not someone else), so the family stays as it is.
    expect(gone.residents.map((x) => x.id)).toEqual([2, 3, 4, 5]);
  });

  it("are saved and loaded with their story", () => {
    const s = family({ time: 500 });
    const gone = die(s, content, "sickness", { who: s.named[0], second: 500 });
    const back = parseSave(JSON.stringify(gone), content)!;
    expect(back.remembered.at(-1)!.story).toEqual(gone.remembered.at(-1)!.story);
  });
});

describe("how children learned", () => {
  const sure = { ...content, rules: { ...content.rules, population: { ...content.rules.population, learning: { chancePerEvening: 1, maxPerChild: 3 } } } };
  const evening = content.rules.dayNight.nightFrom * day;

  it("an elder teaches a learner by the fire as night falls, and only then", () => {
    const s = family({ time: evening - 1, named: [] });
    const taught = teach(s, { ...s, time: evening + 1 }, sure);
    const child = taught.residents.find((r) => r.id === 4)!;
    expect(child.lessons).toHaveLength(1);
    expect(child.lessons![0]).toMatchObject({ kind: "learned", other: 5 });
    expect(content.talambuhay.lessons.map((l) => l.id)).toContain(child.lessons![0].lesson);
    // Midday: no lesson.
    const noon = family({ time: 10, named: [] });
    expect(teach(noon, { ...noon, time: 20 }, sure).residents).toEqual(noon.residents);
    // No elder: nobody teaches.
    const young = family({ time: evening - 1, named: [], residents: family().residents.filter((r) => r.age !== "elder"), villagers: 4 });
    expect(teach(young, { ...young, time: evening + 1 }, sure).residents.some((r) => r.lessons)).toBe(false);
  });

  it("are the same every time (seeded)", () => {
    const s = family({ time: 0 });
    const a = teach(s, { ...s, time: day * 5 }, content);
    const b = teach(s, { ...s, time: day * 5 }, content);
    expect(a).toEqual(b);
  });

  it("a child's lessons become part of their story when they grow up and are named", () => {
    const span = lifeSpans(content);
    const always = { ...content, villagers: { ...content.villagers, chance: 1 } };
    const lesson = { at: 60, kind: "learned" as const, lesson: "baybayin", other: 5, otherName: "Elder" };
    const s = family({ time: 50 + span.child + 1, named: [], residents: family().residents.map((r) => (r.id === 4 ? { ...r, lessons: [lesson] } : r)) });
    const grown = ageResidents(s, always);
    const v = grown.named.find((x) => x.resident === 4)!;
    expect(v).toBeDefined();
    expect(v.life!.map((e) => e.kind)).toEqual(["born", "learned", "grewUp"]);
    expect(v.life![0].at).toBe(50);
  });

  it("lessons are saved with the child", () => {
    const lesson = { at: 60, kind: "learned" as const, lesson: "old-songs", other: 5, otherName: "Elder" };
    const s = family({ residents: family().residents.map((r) => (r.id === 4 ? { ...r, lessons: [lesson] } : r)) });
    const back = parseSave(JSON.stringify(s), content)!;
    expect(back.residents.find((r) => r.id === 4)!.lessons).toEqual([lesson]);
  });
});

describe("old saves", () => {
  it("a v30 save loads: the remembered keep their names, and life stories begin", () => {
    const s = family({ time: 500 });
    const raw = JSON.parse(JSON.stringify(s));
    raw.version = 30;
    raw.remembered = [{ name: "Old One", cause: "age", at: 10 }];
    for (const v of raw.named) delete v.life;
    const back = parseSave(JSON.stringify(raw), content)!;
    expect(back.version).toBe(STATE_VERSION);
    expect(back.remembered).toEqual([{ name: "Old One", cause: "age", at: 10 }]);
    expect(back.named).toHaveLength(2);
    expect(lifeStory(back, content, back.named[0]).children).toHaveLength(2);
  });
});

describe("the templates", () => {
  it("are checked: every role has a skill, text in both languages", () => {
    expect(() => validateTalambuhay(talambuhayJson)).not.toThrow();
    const noFarmerSkill = { ...talambuhayJson, skills: talambuhayJson.skills.filter((x) => !("roles" in x) || false).slice(0, 0) };
    expect(() => validateTalambuhay(noFarmerSkill)).toThrow();
    const noFil = { ...talambuhayJson, details: [{ id: "x", kind: "habit", text: { en: "x" } }] };
    expect(() => validateTalambuhay(noFil)).toThrow(/en and fil/);
    expect(buildContent).toBeTypeOf("function");
  });

  it("give skills and details to women and men alike (no gender in the templates)", () => {
    for (const x of [...content.talambuhay.skills, ...content.talambuhay.details]) expect(Object.keys(x)).not.toContain("gender");
  });
});

describe("the evening and the Aklat", () => {
  it("the evening is the first part of the night", async () => {
    const { isEveningAt, isNightAt } = await import("./daynight");
    const { nightFrom, nightTo, eveningShare } = content.rules.dayNight;
    const at = (phase: number) => phase * day;
    expect(isEveningAt(content, at(nightFrom + 0.01))).toBe(true);
    expect(isEveningAt(content, at(nightFrom + (nightTo - nightFrom) * eveningShare + 0.01))).toBe(false);
    expect(isNightAt(content, at(nightFrom + (nightTo - nightFrom) * eveningShare + 0.01))).toBe(true);
    expect(isEveningAt(content, at(0.2))).toBe(false);
  });

  it("a lesson by the fire opens the entries on learning, and the one on what was taught", async () => {
    const { checkAklat } = await import("./aklat");
    const sure = { ...content, rules: { ...content.rules, population: { ...content.rules.population, learning: { chancePerEvening: 1, maxPerChild: 3 } } } };
    const evening = content.rules.dayNight.nightFrom * day;
    const s = family({ time: evening - 1, named: [], aklat: [] });
    const taught = teach(s, { ...s, time: evening + 1 }, sure);
    const lesson = taught.residents.find((r) => r.id === 4)!.lessons![0].lesson!;
    expect(taught.flags).toContain("fireside-lesson");
    expect(taught.flags).toContain(`lesson-${lesson}`);
    const found = checkAklat(taught, content).aklat;
    expect(found).toContain("learning-by-family");
    for (const id of ["learning-by-family", "oral-epics", "baybayin"]) {
      const e = content.lore[id];
      expect(e.reviewed).toBe(false);
      expect(e.sources.length).toBeGreaterThan(0);
    }
  });

  it("there is no school building (schools came with the Spanish)", () => {
    expect(content.buildings.some((b) => /school|paaralan|eskwela/i.test(b.id + b.name))).toBe(false);
  });
});
