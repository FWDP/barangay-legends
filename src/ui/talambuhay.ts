// A life story (talambuhay) in words: the 3-5 sentences about who someone is, and the dated
// lines of their life, from the templates in content/villagers/talambuhay.json. The engine
// (engine/talambuhay.ts) decides what the story is made of; this only says it in a language.
import type { Content } from "../engine/content";
import type { LifeEvent, LifeStory } from "../engine/talambuhay";
import type { Lang } from "./settings";
import { fill } from "./uiContent";

/** "A", "A and B", "A, B and C" in the language's own "and". */
export function joinNames(content: Content, names: string[], lang: Lang): string {
  const and = content.talambuhay.family.and[lang];
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")}${and}${names.at(-1)}`;
}

/**
 * The sentences of a life story: where they came from (and their parents), their spouse and
 * children if any, what they're good at and one personal detail. Always 3 to 5.
 */
export function storySentences(story: LifeStory, content: Content, lang: Lang, placeName: (id: string) => string): string[] {
  const t = content.talambuhay;
  const f = t.family;
  const vars = { name: story.name };
  const out: string[] = [];
  if (story.came === "born") {
    out.push(story.parents.length ? fill(f.born[lang], { ...vars, parents: joinNames(content, story.parents.map((p) => p.name), lang) }) : fill(f.bornNoParents[lang], vars));
  } else if (story.came === "founder") out.push(fill(f.founder[lang], vars));
  else out.push(story.from ? fill(f.arrived[lang], { ...vars, barangay: placeName(story.from) }) : fill(f.arrivedNoPlace[lang], vars));
  if (story.spouse) out.push(fill(f.spouse[lang], { ...vars, spouse: story.spouse.name }));
  if (story.children.length === 1) out.push(fill(f.child[lang], { ...vars, children: story.children[0].name }));
  else if (story.children.length > 1) out.push(fill(f.children[lang], { ...vars, n: story.children.length, children: joinNames(content, story.children.map((c) => c.name), lang) }));
  const skill = t.skills.find((s) => s.id === story.skill) ?? t.skills[0];
  const detail = t.details.find((d) => d.id === story.detail) ?? t.details[0];
  out.push(fill(skill.text[lang], vars), fill(detail.text[lang], vars));
  return out;
}

/** One dated line of a life, without the date. */
export function lifeLine(e: LifeEvent, content: Content, lang: Lang, placeName: (id: string) => string): string {
  const t = content.talambuhay;
  const ev = t.events;
  const other = e.otherName ?? "";
  switch (e.kind) {
    case "born":
      return ev.born[lang];
    case "arrived":
      return e.from ? fill(ev.arrivedFrom[lang], { barangay: placeName(e.from) }) : ev.arrived[lang];
    case "married":
      return fill(ev.married[lang], { other });
    case "parent":
      return fill(ev.parent[lang], { other });
    case "grewUp":
      return ev.grewUp[lang];
    case "elder":
      return ev.elder[lang];
    case "raid": {
      const key = e.defense ? (e.outcome === "won" ? "defendedWon" : "defendedLost") : e.outcome === "won" ? "raidWon" : "raidLost";
      return fill(ev[key][lang], { barangay: e.from ? placeName(e.from) : "" });
    }
    case "sick":
      return ev.sick[lang];
    case "healed":
      return ev.healed[lang];
    case "learned": {
      const lesson = t.lessons.find((l) => l.id === e.lesson)?.text[lang] ?? t.lessons[0].text[lang];
      return other ? fill(ev.learned[lang], { lesson, other }) : fill(ev.learnedAlone[lang], { lesson });
    }
    case "died":
      return fill(ev.died[lang], { cause: t.causes[e.cause ?? "age"][lang] });
  }
}

/** "Araw N" for a game time. */
export function lifeDay(content: Content, lang: Lang, day: number): string {
  return fill(content.talambuhay.events.day[lang], { n: day });
}
