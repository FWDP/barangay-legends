// Ranggo ng Kapuluan: every barangay in the archipelago ranked by renown, raids defended and
// Aklat entries. AI barangays keep their own renown (never lost): it grows when they reach a new
// peak of size and strength, and with battles they win; their defenses are counted too. Each
// barangay remembers when it last gained in each ranked stat, so a tie goes to whoever got
// there first. The player's renown rank is tracked: moving up is celebrated (history, Balita),
// and an AI barangay overtaking the player is in the Balita.
import type { Content } from "./content";
import type { GameState } from "./game";
import { addHistory } from "./people";
import { addNews, strengthOfState, type NeighborState } from "./region";

/** An AI barangay's ranked stats. */
export interface Fame {
  /** Kabantugan, never lost. */
  renown: number;
  /** Game time of the last renown gained. */
  renownAt: number;
  /** The highest size-and-strength score reached so far (renown grows past it). */
  peak: number;
  /** Raids beaten off. */
  defended: number;
  defendedAt: number;
}

/** When the player last gained in each ranked stat (for ties). */
export interface AchievedAt {
  renown: number;
  defended: number;
  aklat: number;
}

/** A barangay's size and strength as renown (on the same thresholds as the player's levels). */
export function aiScore(content: Content, s: GameState): number {
  const k = content.rules.kabantugan;
  return Math.round(s.villagers * k.aiPerVillager + strengthOfState(s, content) * k.aiPerStrength);
}

/** A new AI barangay's fame: its current size and strength, gained at `time`. */
export function newFame(content: Content, s: GameState, time: number): Fame {
  const score = aiScore(content, s);
  return { renown: score, renownAt: time, peak: score, defended: 0, defendedAt: time };
}

// ---------- Ordering ----------

export type RankTab = "renown" | "defended" | "aklat";
export const RANK_TABS: RankTab[] = ["renown", "defended", "aklat"];

/**
 * One barangay in the ranking: plain data, so the panel can show entries from anywhere (the
 * local archipelago now, a server's online ranking later). A null stat isn't known ("—").
 */
export interface RankEntry {
  id: string;
  name: string;
  datu: string;
  level: number;
  island: string;
  /** The alliance's name and color, or null. */
  bloc: { name: string; color: string } | null;
  you: boolean;
  renown: number | null;
  renownAt: number;
  defended: number | null;
  defendedAt: number;
  aklat: number | null;
  aklatAt: number;
}

const AT: Record<RankTab, "renownAt" | "defendedAt" | "aklatAt"> = { renown: "renownAt", defended: "defendedAt", aklat: "aklatAt" };

/**
 * Entries in rank order for a tab: the highest first; on a tie, whoever got there first; then
 * the player; then the order given. Unknown stats come last.
 */
export function rankEntries<E extends Pick<RankEntry, "you" | RankTab | "renownAt" | "defendedAt" | "aklatAt">>(entries: E[], tab: RankTab): E[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const va = a.e[tab];
      const vb = b.e[tab];
      if (va === null || vb === null) return va === vb ? a.i - b.i : va === null ? 1 : -1;
      if (va !== vb) return vb - va;
      const ta = a.e[AT[tab]];
      const tb = b.e[AT[tab]];
      if (ta !== tb) return ta - tb;
      if (a.e.you !== b.e.you) return a.e.you ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.e);
}

/** How much more the player needs in a tab to pass the barangay just above, or null at the top. */
export function toPass<E extends Pick<RankEntry, "id" | "you" | RankTab | "renownAt" | "defendedAt" | "aklatAt">>(ranked: E[], tab: RankTab): { above: E; need: number } | null {
  const i = ranked.findIndex((e) => e.you);
  const me = ranked[i];
  const above = ranked[i - 1];
  if (i <= 0 || !me || !above || me[tab] === null || above[tab] === null) return null;
  // A tie goes to whoever got there first, and that's them: one more than they have.
  return { above, need: above[tab]! - me[tab]! + 1 };
}

/** The renown standings of the player's archipelago, as entries with ids only for names. */
function renownStandings(state: GameState): Pick<RankEntry, "id" | "you" | RankTab | "renownAt" | "defendedAt" | "aklatAt">[] {
  const me = { id: state.barangay.id, you: true, renown: state.kabantugan, renownAt: state.achievedAt.renown, defended: 0, defendedAt: 0, aklat: 0, aklatAt: 0 };
  const them = (state.region?.neighbors ?? []).map((n) => ({ id: n.id, you: false, renown: n.fame.renown, renownAt: n.fame.renownAt, defended: 0, defendedAt: 0, aklat: 0, aklatAt: 0 }));
  return rankEntries([me, ...them], "renown");
}

/** The player's place by renown (1 = first). */
export function renownRank(state: GameState): number {
  return renownStandings(state).findIndex((e) => e.you) + 1;
}

// ---------- Tracking ----------

/** Battles AI barangays won or beat off between two states: from new reports and Balita items. */
function aiBattles(prev: GameState, next: GameState): Map<string, { won: number; defended: number }> {
  const out = new Map<string, { won: number; defended: number }>();
  const add = (id: string | undefined, key: "won" | "defended") => {
    if (!id) return;
    const b = out.get(id) ?? { won: 0, defended: 0 };
    b[key]++;
    out.set(id, b);
  };
  const pr = prev.region;
  const nr = next.region;
  if (!pr || !nr) return out;
  const seenReport = Math.max(0, ...pr.reports.map((r) => r.id));
  for (const r of nr.reports) {
    if (r.id <= seenReport || r.win === undefined) continue;
    // The player's raid lost: they beat it off. Their raid on the player won.
    if (r.kind === "raid" && !r.win) add(r.neighbor, "defended");
    if (r.kind === "defense" && !r.win) add(r.neighbor, "won");
  }
  const seenNews = pr.nextNewsId - 1;
  for (const n of nr.news) {
    if (n.id <= seenNews) continue;
    // An ally defended (with the player's warriors) or overrun by its enemy.
    if (n.key === "ally-defended") add(n.barangay, "defended");
    if (n.key === "ally-lost") add(n.other, "won");
  }
  return out;
}

/** An AI barangay's fame after a step: a new peak of size and strength, and battles. */
function nextFame(content: Content, before: NeighborState | undefined, n: NeighborState, battles: { won: number; defended: number } | undefined, time: number): Fame {
  const k = content.rules.kabantugan;
  let f = n.fame;
  if (!before || before.state !== n.state) {
    const score = aiScore(content, n.state);
    if (score > f.peak) f = { ...f, renown: f.renown + (score - f.peak), peak: score, renownAt: time };
  }
  if (battles) {
    const gained = battles.won * k.perRaidWon + battles.defended * k.perDefenseWon;
    if (gained > 0) f = { ...f, renown: f.renown + gained, renownAt: time };
    if (battles.defended > 0) f = { ...f, defended: f.defended + battles.defended, defendedAt: time };
  }
  return f;
}

/**
 * Updates the ranked stats from `prev` to `next` (after the player's renown is applied): when
 * the player gained, the AI barangays' fame, and the player's renown rank with its news.
 * Returns `next` itself when nothing changed.
 */
export function trackRanking(prev: GameState, next: GameState, content: Content): GameState {
  if (content.ai) return next;
  let s = next;
  const t = s.time;
  // The player's gains.
  const at = { ...s.achievedAt };
  if (s.kabantugan > prev.kabantugan) at.renown = t;
  if (s.stats.raidsDefended > prev.stats.raidsDefended) at.defended = t;
  if (s.aklat.length > prev.aklat.length) at.aklat = t;
  if (at.renown !== s.achievedAt.renown || at.defended !== s.achievedAt.defended || at.aklat !== s.achievedAt.aklat) s = { ...s, achievedAt: at };
  // AI barangays: only those whose state changed, or who fought.
  const region = s.region;
  if (region && (region !== prev.region || s.time !== prev.time)) {
    const battles = aiBattles(prev, s);
    let changed = false;
    const neighbors = region.neighbors.map((n) => {
      const before = prev.region?.neighbors.find((x) => x.id === n.id);
      if (before && before.state === n.state && !battles.has(n.id)) return n;
      const fame = nextFame(content, before, n, battles.get(n.id), t);
      if (fame === n.fame) return n;
      changed = true;
      return { ...n, fame };
    });
    if (changed) s = { ...s, region: { ...region, neighbors } };
  }
  return updateRank(prev, s);
}

/** The player's renown rank: moving up is celebrated; an AI barangay passing the player is news. */
function updateRank(prev: GameState, s: GameState): GameState {
  if (!s.region) return s;
  if (s.kabantugan === prev.kabantugan && s.region === prev.region && s.renownRank > 0) return s;
  const standings = renownStandings(s);
  const rank = standings.findIndex((e) => e.you) + 1;
  if (rank === s.renownRank) return s;
  const was = s.renownRank;
  let next: GameState = { ...s, renownRank: rank };
  // The first time (a new or migrated save) it's only noted.
  if (was === 0) return next;
  const me = next.barangay.id;
  if (rank < was) {
    next = addHistory(next, { at: next.time, kind: "rank", level: rank });
    next = { ...next, region: addNews(next.region!, { time: next.time, key: "rank-up", barangay: me }) };
  } else {
    // Who passed the player: above now, and not above before.
    const before = renownStandings(prev);
    const wasAbove = new Set(before.slice(0, before.findIndex((e) => e.you)).map((e) => e.id));
    let region = next.region!;
    for (const e of standings.slice(0, rank - 1)) {
      if (!wasAbove.has(e.id)) region = addNews(region, { time: next.time, key: "overtook", barangay: e.id, other: me });
    }
    next = { ...next, region };
  }
  return next;
}
