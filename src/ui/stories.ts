// Text about tasks (Mga Gawain), named villagers and the barangay's history, in the player's
// language. Pure, so it is tested; the components only lay it out.
import type { Content, QuestDef } from "../engine/content";
import type { GameState } from "../engine/game";
import { currentTask, datuTitle } from "../engine/gawain";
import { levelTitle } from "../engine/kabantugan";
import { storyText, type HistoryEntry, type NamedVillager } from "../engine/people";
import type { Report } from "../engine/region";
import { costText } from "./format";
import { newsLine } from "./politicsText";
import type { Lang } from "./settings";
import type { Tapped } from "./villagers";
import { householdOf } from "../engine/household";
import { fill, type GameText } from "./uiContent";

/** "🪵 10", "the title Datu ng Ilog", or both. */
export function rewardText(q: QuestDef, game: GameText, lang: Lang): string {
  const parts: string[] = [];
  if (q.reward.resources && Object.values(q.reward.resources).some((n) => (n ?? 0) > 0)) parts.push(costText(q.reward.resources));
  if (q.reward.title) parts.push(fill(game.gawain.titleReward[lang], { title: q.reward.title[lang] }));
  return parts.join(" + ");
}

const questById = (content: Content, id: string | undefined) => content.quests.find((q) => q.id === id);

/** One line of the barangay history. */
export function historyLine(h: HistoryEntry, content: Content, game: GameText, lang: Lang, state?: GameState): string {
  const t = game.history;
  switch (h.kind) {
    case "spirits": {
      // The tradition's forest spirit speaks, then what it means in the game.
      const spirit = state ? content.traditions.find((x) => x.id === state.tradition)?.forestSpirit : undefined;
      const said = spirit ? (h.stage === 2 ? spirit.stage2 : spirit.stage1)[lang] : "";
      const means = h.stage === 2 ? fill(game.forest.stage2[lang], { percent: content.rules.forest.riceWithheldPercent }) : game.forest.stage1[lang];
      return said ? `${said} ${means}` : means;
    }
    case "died": {
      const d = game.death;
      if (h.cause === "raid" && !h.name) return fill(d.diedRaid[lang], { count: h.count ?? 1 });
      const cause = h.cause === "age" || h.cause === "sickness" || h.cause === "hunger" || h.cause === "raid" ? d[h.cause][lang] : "";
      return h.name ? fill(d.diedNamed[lang], { name: h.name, cause, them: them(game, h, lang) }) : fill(d.died[lang], { cause });
    }
    case "frail":
      return fill(game.death.frail[lang], { name: h.name ?? "" });
    case "datu": {
      const lv = content.datuHouse?.datuHouse.levels.find((l) => l.level === h.level);
      const what = lv?.unlocks ? fill(game.datu.unlocks[lang], { what: game.datu[lv.unlocks][lang] }) : "";
      return fill(game.datu.news[lang], { level: h.level ?? 1, what }).trim();
    }
    case "level":
      return fill(game.level.up[lang], { level: h.level ?? 1 });
    case "rank":
      return h.level === 1 ? `${fill(game.rank.up[lang], { rank: 1 })} ${game.rank.top[lang]}` : fill(game.rank.up[lang], { rank: h.level ?? 1 });
    case "aklat":
      return fill(game.aklat.found[lang], { name: content.aklat.find((e) => e.id === h.entry)?.aklat.name[lang] ?? h.entry ?? "" });
    case "event": {
      const e = game.events;
      if (h.event === "eclipseWon") return fill(e.eclipseWon[lang], { favor: h.favor ?? 0, gold: h.amounts?.gold ?? 0 });
      if (h.event === "eclipseLost") return fill(e.eclipseLost[lang], { rice: h.amounts?.rice ?? 0 });
      if (h.event === "sarimanok") return fill(e.sarimanok[lang], { gift: costText(h.amounts ?? {}) });
      return e.right[lang];
    }
    case "task":
      return fill(t.task[lang], { task: questById(content, h.task)?.text[lang] ?? h.task ?? "" });
    case "named":
      return fill(t.named[lang], { story: h.story ? storyText(content, { name: h.name ?? "", story: h.story }, lang) : (h.name ?? "") });
    case "fell":
      return fill(t.fell[lang], { name: h.name ?? "" });
    case "left": {
      const line = h.cause === "hunger" ? t.leftHunger : h.cause === "crowded" ? t.leftCrowded : t.left;
      return fill(line[lang], { name: h.name ?? "", them: them(game, h, lang) });
    }
  }
}

/** What the adviser says when a task is done: the reward, then the next task (or that the chain ended). */
export function taskNews(done: string, state: GameState, content: Content, game: GameText, lang: Lang): string {
  const q = questById(content, done);
  if (!q) return "";
  const n = game.news;
  const parts = [fill(n.taskDone[lang], { task: q.text[lang], reward: fill(game.gawain.reward[lang], { reward: rewardText(q, game, lang) }) })];
  if (q.reward.title) parts.push(fill(n.title[lang], { title: q.reward.title[lang] }));
  // The next task after this one (it may already be done too: then the one that is current).
  const next = currentTask(state, content);
  parts.push(next ? fill(n.next[lang], { task: next.text[lang] }) : n.moreSoon[lang]);
  return parts.join(" ");
}

/** The adviser on a new barangay level: the celebration, the reward, and what it means. */
export function levelNews(level: number, state: GameState, content: Content, game: GameText, lang: Lang): string {
  const reward = content.levels.find((l) => l.level === level)?.reward;
  const parts = [fill(game.level.up[lang], { level })];
  const what = [reward?.resources ? costText(reward.resources) : "", reward?.title ? reward.title[lang] : ""].filter(Boolean).join(" · ");
  if (what) parts.push(`${fill(game.level.reward[lang], { reward: what })}.`);
  parts.push(fill(game.level.advisor[lang], { barangay: state.barangay.name || "Barangay" }));
  return parts.join(" ");
}

/** The datu's name with their title, e.g. "Datu Lakas, Datu ng Ilog". */
export function datuWithTitle(state: GameState, content: Content, lang: Lang): string {
  const name = state.barangay.datu ? `Datu ${state.barangay.datu}` : "Datu";
  const title = levelTitle(state, content) ?? datuTitle(state, content);
  return title ? `${name}, ${title[lang]}` : name;
}

/** A named villager's card: name, what they do, their story. */
/**
 * The card for anyone tapped on the map: their name (named villagers, the datu, the spouse),
 * their class in the barangay's tradition's words, and what they do; a named villager's story.
 */
export function tappedCard(t: Tapped, state: GameState, content: Content, game: GameText, lang: Lang): { name: string; star: boolean; line: string; story: string | null; sick: string | null } {
  const v = game.villager;
  const tradition = content.traditions.find((x) => x.id === state.tradition);
  const cls = t.look.cls ?? "commoner";
  const className = tradition?.classes?.[cls].name[lang] ?? game.classes[cls][lang];
  const home = householdOf(state, content);
  const byBuilding = Object.entries(content.villagers.roleBuildings).find(([, b]) => b === t.place)?.[0] as keyof GameText["roles"] | undefined;
  const role =
    t.role === "datu" ? v.datu[lang]
    : t.role === "spouse" ? fill(v.spouse[lang], { spouse: (home.spouse.gender === "woman" ? v.wife : v.husband)[lang] })
    : t.role === "attendant" ? v.attendant[lang]
    : t.role === "warrior" ? game.roles.warrior[lang]
    : t.role === "clearing" ? v.clearing[lang]
    : t.role === "sick" ? v.sickRole[lang]
    : t.role === "work" ? (byBuilding ? game.roles[byBuilding][lang] : game.roles.villager[lang])
    : t.look.age === "child" ? v.child[lang]
    : t.look.age === "elder" ? v.elder[lang]
    : game.roles.villager[lang];
  const name = t.named?.name ?? (t.role === "datu" ? state.barangay.datu || v.datu[lang] : t.role === "spouse" ? home.spouse.name : v.unnamed[lang]);
  return {
    name,
    star: !!t.named,
    line: fill(v.classLine[lang], { class: className, role: t.named ? game.roles[t.named.role][lang] : role }),
    story: t.named ? storyText(content, t.named, lang) : null,
    sick: t.named?.sick ? v.sick[lang] : null,
  };
}

export function villagerCard(v: NamedVillager, content: Content, game: GameText, lang: Lang): { name: string; role: string; story: string; sick: string | null } {
  return { name: v.name, role: game.roles[v.role][lang], story: storyText(content, v, lang), sick: v.sick ? game.villager.sick[lang] : null };
}

/**
 * Named villagers in a battle report: the warriors who fell in it (from the history, at the
 * battle's time), or for a won defense, a named warrior who led it.
 */
export function battleNames(r: Report, state: GameState, game: GameText, lang: Lang): string[] {
  if (r.kind !== "defense" && r.kind !== "raid") return [];
  const fell = state.history.filter((h) => h.kind === "fell" && Math.abs(h.at - r.time) <= 1.5).map((h) => fill(game.history.fell[lang], { name: h.name ?? "" }));
  if (fell.length) return fell;
  const warriors = state.named.filter((v) => v.role === "warrior" && v.since <= r.time);
  if (r.win && warriors.length) return [fill(game.villager.ledDefense[lang], { name: warriors[r.id % warriors.length].name })];
  return [];
}

/** History lines for the "While you were away" story: entries after `before` up to `after` (tasks are told separately). */
export function awayPeopleLines(before: GameState, after: GameState, content: Content, game: GameText, lang: Lang): string[] {
  const lines: string[] = [];
  const done = after.gawainDone.filter((id) => !before.gawainDone.includes(id));
  for (const id of done) {
    const q = questById(content, id);
    if (q) lines.push(`${fill(game.history.task[lang], { task: q.text[lang] })} ${fill(game.gawain.reward[lang], { reward: rewardText(q, game, lang) })}`);
  }
  for (const h of after.history) {
    if (h.at <= before.time || h.at > after.time || h.kind === "task") continue;
    lines.push(historyLine(h, content, game, lang));
  }
  // The Balita: political news while away.
  const seen = Math.max(0, ...(before.region?.news ?? []).map((n) => n.id));
  for (const n of after.region?.news ?? []) if (n.id > seen) lines.push(`📣 ${newsLine(n, after, content, game, lang)}`);
  return lines;
}

/** The pronoun for a named villager in a history line ({them}): from their stored gender. */
function them(game: GameText, h: HistoryEntry, lang: Lang): string {
  const t = game.history;
  return (h.gender === "woman" ? t.herThem : h.gender === "man" ? t.himThem : t.anyThem)[lang];
}
