// Text about tasks (Mga Gawain), named villagers and the barangay's history, in the player's
// language. Pure, so it is tested; the components only lay it out.
import type { Content, QuestDef } from "../engine/content";
import type { GameState } from "../engine/game";
import { currentTask, datuTitle } from "../engine/gawain";
import { storyText, type HistoryEntry, type NamedVillager } from "../engine/people";
import type { Report } from "../engine/region";
import { costText } from "./format";
import type { Lang } from "./settings";
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
export function historyLine(h: HistoryEntry, content: Content, game: GameText, lang: Lang): string {
  const t = game.history;
  switch (h.kind) {
    case "task":
      return fill(t.task[lang], { task: questById(content, h.task)?.text[lang] ?? h.task ?? "" });
    case "named":
      return fill(t.named[lang], { story: h.story ? storyText(content, { name: h.name ?? "", story: h.story }, lang) : (h.name ?? "") });
    case "fell":
      return fill(t.fell[lang], { name: h.name ?? "" });
    case "left": {
      const line = h.cause === "hunger" ? t.leftHunger : h.cause === "crowded" ? t.leftCrowded : t.left;
      return fill(line[lang], { name: h.name ?? "" });
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

/** The datu's name with their title, e.g. "Datu Lakas, Datu ng Ilog". */
export function datuWithTitle(state: GameState, content: Content, lang: Lang): string {
  const name = state.barangay.datu ? `Datu ${state.barangay.datu}` : "Datu";
  const title = datuTitle(state, content);
  return title ? `${name}, ${title[lang]}` : name;
}

/** A named villager's card: name, what they do, their story. */
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
  return lines;
}
