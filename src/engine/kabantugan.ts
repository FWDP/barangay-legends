// Kabantugan (renown) and the barangay level. Renown is earned and never lost: villager
// milestones, Mga Gawain tasks, raids won (attacking or defending), trades, a tributary or ally
// gained, raising the Bahay ng Datu, and Aklat ng Alamat entries (amounts in rules.json). It is
// worked out by comparing the state before and after each engine step or command, so every way
// of achieving something counts once, whether done directly, by sea or while away. The level
// (1–20) comes from total renown; each new level brings its reward (content/levels.json).
import { RESOURCES, type Content, type Text } from "./content";
import type { GameState } from "./game";
import { addHistory } from "./people";
import { addNews, strengthOfState } from "./region";

/** Barangay level from renown: 1, then one more for each threshold reached. */
export function levelForRenown(content: Content, renown: number): number {
  const at = content.rules.kabantugan.levelAt;
  let level = 1;
  for (const need of at) if (renown >= need) level++;
  return level;
}

export const maxLevel = (content: Content) => content.rules.kabantugan.levelAt.length + 1;

/** The player's barangay level. */
export const barangayLevel = (state: GameState, content: Content) => levelForRenown(content, state.kabantugan);

/** Renown the next level needs, or null at the top. */
export function renownForLevel(content: Content, level: number): number | null {
  return level <= 1 ? 0 : (content.rules.kabantugan.levelAt[level - 2] ?? null);
}

/** An AI barangay's level, from its size and strength on the same thresholds (recalculated as it changes). */
export function aiLevel(content: Content, s: GameState): number {
  const k = content.rules.kabantugan;
  return levelForRenown(content, s.villagers * k.aiPerVillager + strengthOfState(s, content) * k.aiPerStrength);
}

/** Renown earned between two states of the same barangay. */
export function renownBetween(prev: GameState, next: GameState, content: Content): number {
  const k = content.rules.kabantugan;
  let gained = 0;
  // Every 10 villagers reached for the first time.
  const tens = Math.floor(next.villagers / 10);
  if (tens > next.stats.bestTens) gained += (tens - next.stats.bestTens) * k.perTenVillagers;
  gained += Math.max(0, next.gawainDone.length - prev.gawainDone.length) * k.perTask;
  gained += Math.max(0, next.stats.trades - prev.stats.trades) * k.perTrade;
  gained += Math.max(0, next.datuLevel - prev.datuLevel) * k.perDatuLevel;
  gained += Math.max(0, next.aklat.length - prev.aklat.length) * k.perAklat;
  const pr = prev.region;
  const nr = next.region;
  if (pr && nr) {
    const seen = Math.max(0, ...pr.reports.map((r) => r.id));
    for (const r of nr.reports) {
      if (r.id <= seen || !r.win) continue;
      if (r.kind === "raid") gained += k.perRaidWon;
      if (r.kind === "defense") gained += k.perDefenseWon;
    }
    for (const n of nr.neighbors) {
      const before = pr.neighbors.find((x) => x.id === n.id)?.status ?? "independent";
      if (before === n.status) continue;
      if (n.status === "tributary") gained += k.perTributary;
      if (n.status === "ally" && before !== "ally") gained += k.perAlly;
    }
  }
  return gained;
}

/**
 * Adds the renown earned from `prev` to `next`, then pays the reward of every level reached
 * that wasn't rewarded yet (noted in the history, for the celebration and the adviser).
 * Returns `next` itself when nothing changed.
 */
export function applyRenown(prev: GameState, next: GameState, content: Content): GameState {
  if (content.ai) return next;
  const gained = renownBetween(prev, next, content);
  const tens = Math.floor(next.villagers / 10);
  let s = next;
  if (gained > 0 || tens > next.stats.bestTens) {
    s = { ...s, kabantugan: s.kabantugan + gained, stats: { ...s.stats, bestTens: Math.max(s.stats.bestTens, tens) } };
  }
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
    state.gawainDone.length * k.perTask +
    battleRenown +
    (r?.paths.includes("trade") ? k.perTrade : 0) +
    (r?.neighbors.filter((n) => n.status === "tributary").length ?? 0) * k.perTributary +
    (r?.neighbors.filter((n) => n.status === "ally").length ?? 0) * k.perAlly +
    Math.max(0, state.datuLevel - 1) * k.perDatuLevel +
    state.aklat.length * k.perAklat
  );
}
