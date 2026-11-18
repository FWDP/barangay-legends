// Kabantugan (renown) and the barangay level. Renown is earned and never lost: villager
// milestones, Mga Gawain tasks, raids won (attacking or defending), trades, a tributary or ally
// gained, raising the Bahay ng Datu, and Aklat ng Alamat entries (amounts in rules.json; tasks and
// Aklat entries start small and ramp up, and rank changes in the Ranggo give none). It is
// worked out by comparing the state before and after each engine step or command, so every way
// of achieving something counts once, whether done directly, by sea or while away. Feasts,
// warriors' honor and answering an ally's call add theirs where they happen. Repeatable sources
// count against daily caps (renown.ts). The level (1–20) comes from total renown on rising
// thresholds; each new level brings its reward (content/levels.json).
import { RESOURCES, type Content, type Text } from "./content";
import type { GameState } from "./game";
import { addHistory } from "./people";
import { addNews } from "./region";
import { earnRenown, levelForRenown, RENOWN_SOURCES, type RenownSource } from "./renown";

export { levelForRenown, type RenownSource } from "./renown";

export const maxLevel = (content: Content) => content.rules.kabantugan.levelAt.length + 1;

/** The player's barangay level. */
export const barangayLevel = (state: GameState, content: Content) => levelForRenown(content, state.kabantugan);

/** Renown the next level needs, or null at the top. */
export function renownForLevel(content: Content, level: number): number | null {
  return level <= 1 ? 0 : (content.rules.kabantugan.levelAt[level - 2] ?? null);
}


/**
 * Renown the first `n` tasks or Aklat entries are worth together: the (i+1)-th is worth
 * first + step·i, never more than `max` (rules.kabantugan.taskRamp / aklatRamp), so the first
 * ones give small amounts (fractions add up) and the first steps don't race the levels.
 */
function rampedSum(ramp: { first: number; step: number }, max: number, n: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.min(max, ramp.first + ramp.step * i);
  return total;
}

/** Total renown for tasks or Aklat entries number `from`+1 to `to` (counts done before and after). */
export function rampedTotal(ramp: { first: number; step: number }, max: number, from: number, to: number): number {
  return to <= from ? 0 : Math.round(rampedSum(ramp, max, to)) - Math.round(rampedSum(ramp, max, from));
}

/** Renown for the (n+1)-th task or Aklat entry (whole renown: the fractions carry over). */
export const rampedRenown = (ramp: { first: number; step: number }, max: number, n: number): number => rampedTotal(ramp, max, n, n + 1);

/**
 * Renown earned between two states of the same barangay, by source (only sources that gave
 * some), before the daily caps. Feasts, honor and ally calls are added where they happen.
 */
export function renownSources(prev: GameState, next: GameState, content: Content): Partial<Record<RenownSource, number>> {
  const k = content.rules.kabantugan;
  const out: Partial<Record<RenownSource, number>> = {};
  const add = (src: RenownSource, n: number) => {
    if (n > 0) out[src] = (out[src] ?? 0) + n;
  };
  // Every 10 villagers reached for the first time.
  const tens = Math.floor(next.villagers / 10);
  if (tens > next.stats.bestTens) add("villagers", (tens - next.stats.bestTens) * k.perTenVillagers);
  add("tasks", rampedTotal(k.taskRamp, k.perTask, prev.gawainDone.length, next.gawainDone.length));
  add("trades", Math.max(0, next.stats.trades - prev.stats.trades) * k.perTrade);
  add("datu", Math.max(0, next.datuLevel - prev.datuLevel) * k.perDatuLevel);
  add("aklat", rampedTotal(k.aklatRamp, k.perAklat, prev.aklat.length, next.aklat.length));
  const pr = prev.region;
  const nr = next.region;
  if (pr && nr) {
    const seen = Math.max(0, ...pr.reports.map((r) => r.id));
    for (const r of nr.reports) {
      if (r.id <= seen || !r.win) continue;
      if (r.kind === "raid") add("raids", Math.round(k.perRaidWon * (r.renownFactor ?? 1)));
      if (r.kind === "defense") add("defenses", k.perDefenseWon);
    }
    const won = neighborsWon(prev, next);
    add("tributaries", won.tributaries.length * k.perTributary);
    add("allies", won.allies.length * k.perAlly);
  }
  return out;
}

/**
 * Neighbors that became a tributary or an ally between two states and never gave renown for it
 * before (renownTally): a tributary that rebels and is won back again gives none.
 */
export function neighborsWon(prev: GameState, next: GameState): { tributaries: string[]; allies: string[] } {
  const out = { tributaries: [] as string[], allies: [] as string[] };
  const pr = prev.region;
  const nr = next.region;
  if (!pr || !nr) return out;
  const t = next.renownTally;
  for (const n of nr.neighbors) {
    const before = pr.neighbors.find((x) => x.id === n.id)?.status ?? "independent";
    if (before === n.status) continue;
    if (n.status === "tributary" && !t.tributaries.includes(n.id)) out.tributaries.push(n.id);
    if (n.status === "ally" && !t.allies.includes(n.id)) out.allies.push(n.id);
  }
  return out;
}

/** Renown earned between two states of the same barangay (before the daily caps). */
export function renownBetween(prev: GameState, next: GameState, content: Content): number {
  return Object.values(renownSources(prev, next, content)).reduce((a, b) => a + (b ?? 0), 0);
}

/**
 * Adds the renown earned from `prev` to `next` (within the daily caps), then pays the reward of
 * every level reached that wasn't rewarded yet (noted in the history, for the celebration and
 * the adviser).
 * Returns `next` itself when nothing changed.
 */
export function applyRenown(prev: GameState, next: GameState, content: Content): GameState {
  if (content.ai) return next;
  const sources = renownSources(prev, next, content);
  const tens = Math.floor(next.villagers / 10);
  let s = next;
  for (const src of RENOWN_SOURCES) s = earnRenown(s, content, src, sources[src] ?? 0);
  const won = neighborsWon(prev, next);
  if (won.tributaries.length || won.allies.length) {
    const t = s.renownTally;
    s = { ...s, renownTally: { ...t, tributaries: [...t.tributaries, ...won.tributaries], allies: [...t.allies, ...won.allies] } };
  }
  if (tens > s.stats.bestTens) s = { ...s, stats: { ...s.stats, bestTens: tens } };
  const level = barangayLevel(s, content);
  if (level <= s.levelRewarded) return s;
  for (let l = s.levelRewarded + 1; l <= level; l++) {
    const reward = content.levels.find((x) => x.level === l)?.reward;
    if (reward?.resources) {
      const resources = { ...s.resources };
      for (const r of RESOURCES) resources[r] += reward.resources[r] ?? 0;
      s = { ...s, resources };
    }
    s = addHistory(s, { at: s.time, kind: "level", level: l });
  }
  // The islands hear of it (the Balita).
  if (s.region) s = { ...s, region: addNews(s.region, { time: s.time, key: "level", barangay: s.barangay.id }) };
  return { ...s, levelRewarded: level };
}

/** The latest title a barangay level gave, or null. */
export function levelTitle(state: GameState, content: Content): Text | null {
  let title: Text | null = null;
  const reached = Math.min(state.levelRewarded, barangayLevel(state, content));
  for (const l of content.levels) if (l.level <= reached && l.reward.title) title = l.reward.title;
  return title;
}

/** The renown a save had already earned (for the v20 → v21 migration). */
export function renownFromAchievements(state: GameState, content: Content, battleRenown: number): number {
  const k = content.rules.kabantugan;
  const r = state.region;
  return (
    Math.floor(state.villagers / 10) * k.perTenVillagers +
    rampedTotal(k.taskRamp, k.perTask, 0, state.gawainDone.length) +
    battleRenown +
    (r?.paths.includes("trade") ? k.perTrade : 0) +
    (r?.neighbors.filter((n) => n.status === "tributary").length ?? 0) * k.perTributary +
    (r?.neighbors.filter((n) => n.status === "ally").length ?? 0) * k.perAlly +
    Math.max(0, state.datuLevel - 1) * k.perDatuLevel +
    rampedTotal(k.aklatRamp, k.perAklat, 0, state.aklat.length)
  );
}
