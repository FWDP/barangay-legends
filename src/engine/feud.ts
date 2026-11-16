// Blood debts and feuds (utang na dugo, W.2) and settling them (W.3). When a barangay's people are
// killed by another, a blood debt is recorded between them: who died and their rank. An unpaid
// debt is a feud: the wronged side's grudge rises sharply and it may raid for vengeance (fiercer
// raids: more warriors, more deaths, a few houses set alight). Kin of the wronged (marriage and
// sandugo partners, bloc mates) trust the offender less. Feuds cool very slowly on their own;
// settling them is much better: mediation, a blood price (bayad sa dugo), and a peace sealed by a
// sandugo, a shared Pista with gifts, or a marriage. Breaking a sealed peace is a grave betrayal.
// AI barangays carry blood debts with each other too (told in the Balita). Pure and deterministic.
import type { Content, ResourceAmounts } from "./content";

export type Rank = "commoner" | "warrior" | "noble" | "datu";

export interface FeudDeath {
  /** A named villager's name (the player's people), else unnamed. */
  name?: string;
  rank: Rank;
  at: number;
}

/** How a settled feud was sealed. */
export type SealKind = "sandugo" | "pista" | "marriage";

/** Who carries a mediation. */
export type Mediator = "elder" | "babaylan" | "datu";

export interface Feud {
  id: number;
  /** The barangay owed the blood debt, and the one that owes it (barangay ids; the player's too). */
  wronged: string;
  offender: string;
  deaths: FeudDeath[];
  since: number;
  /** How hot the feud runs, 0..100: raised by each death, cooling very slowly. At 0 it's over. */
  heat: number;
  /** Making peace (W.3): a go-between has brought both sides to talk; the blood price agreed and paid. */
  mediated?: { by: Mediator; at: number };
  /** The last mediation that failed (it can be tried again after rules.feud.mediation.retrySeconds). */
  failedAt?: number;
  price?: ResourceAmounts;
  paid?: boolean;
}

/** A sealed peace between two barangays (the player and a neighbor). Breaking it is a betrayal. */
export interface Peace {
  a: string;
  b: string;
  at: number;
  by: SealKind;
}

export interface FeudState {
  feuds: Feud[];
  nextFeudId: number;
  peaces: Peace[];
}

/** Feud numbers (rules.feud). */
export interface FeudRules {
  heatPerDeath: number;
  rankWeight: Record<Rank, number>;
  coolPerMinute: number;
  grudgeOnDeath: number;
  kinTrustLoss: number;
  vengeance: { chanceFactor: number; warriorsPercent: number; firesMax: number };
  mediation: { base: number; elder: number; babaylan: number; datu: number; trustWeight: number; heatWeight: number; retrySeconds: number; datuMinTrust: number };
  /** The blood price per death by rank, in each good it can be paid in (gold, Palay, rice wine now; heirlooms later). */
  price: { perDeath: Record<Rank, ResourceAmounts>; counterPercent: number; acceptWithinPercent: number };
  seal: { trustBonus: number; sandugoWine: number; pistaGifts: ResourceAmounts };
  betrayal: { trustLossAll: number; grudge: number };
  mourningRaid: { chancePerSecond: number };
}

export const emptyFeuds = (): FeudState => ({ feuds: [], nextFeudId: 1, peaces: [] });

/** The open feud in which `wronged` is owed by `offender`, if any. */
export const feudBetween = (f: FeudState, wronged: string, offender: string) => f.feuds.find((x) => x.wronged === wronged && x.offender === offender);

/** Any open feud between two barangays, either way round. */
export const feudOf = (f: FeudState, a: string, b: string) => f.feuds.find((x) => (x.wronged === a && x.offender === b) || (x.wronged === b && x.offender === a));

/** Is there a sealed peace between two barangays? */
export const peaceOf = (f: FeudState, a: string, b: string) => f.peaces.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));

/**
 * Records deaths `offender` caused among `wronged`'s people: a new feud, or a deeper one. Returns
 * the feuds and whether it's a new feud (for the Balita).
 */
export function recordBloodDebt(f: FeudState, content: Content, wronged: string, offender: string, deaths: FeudDeath[]): { feuds: FeudState; started: boolean } {
  if (deaths.length === 0 || wronged === offender) return { feuds: f, started: false };
  const r = content.rules.feud;
  const heat = deaths.reduce((h, d) => h + r.heatPerDeath * (r.rankWeight[d.rank] ?? 1), 0);
  const open = feudBetween(f, wronged, offender);
  if (open) {
    // A paid price no longer covers new deaths: the price is asked again.
    const next: Feud = { ...open, deaths: [...open.deaths, ...deaths].slice(-30), heat: Math.min(100, open.heat + heat), paid: false };
    delete next.price;
    return { feuds: { ...f, feuds: f.feuds.map((x) => (x === open ? next : x)) }, started: false };
  }
  const at = deaths[0].at;
  const feud: Feud = { id: f.nextFeudId, wronged, offender, deaths, since: at, heat: Math.min(100, heat) };
  return { feuds: { ...f, feuds: [...f.feuds, feud], nextFeudId: f.nextFeudId + 1 }, started: true };
}

/** Feuds cool very slowly on their own; one that has cooled to nothing is over. Returns the ids that ended. */
export function coolFeuds(f: FeudState, content: Content, seconds: number): { feuds: FeudState; ended: Feud[] } {
  if (f.feuds.length === 0) return { feuds: f, ended: [] };
  const cool = (content.rules.feud.coolPerMinute * seconds) / 60;
  const ended: Feud[] = [];
  const feuds = f.feuds
    .map((x) => ({ ...x, heat: Math.max(0, x.heat - cool) }))
    .filter((x) => {
      if (x.heat > 0) return true;
      ended.push(x);
      return false;
    });
  return { feuds: { ...f, feuds }, ended };
}

/**
 * The blood price for a feud's deaths (bayad sa dugo): per death, by rank, in each good it can be
 * paid in (rules.feud.price.perDeath: gold, Palay and rice wine for now; heirlooms such as gongs,
 * porcelain and fine textiles can be added there as their own resource, with no change here).
 */
export function bloodPrice(content: Content, feud: Feud): ResourceAmounts {
  const out: ResourceAmounts = {};
  for (const d of feud.deaths) {
    for (const [k, v] of Object.entries(content.rules.feud.price.perDeath[d.rank] ?? {})) {
      const key = k as keyof ResourceAmounts;
      out[key] = (out[key] ?? 0) + (v ?? 0);
    }
  }
  return out;
}

/** A price scaled to `percent` of another (counter-offers), whole numbers. */
export const scalePrice = (p: ResourceAmounts, percent: number): ResourceAmounts =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Math.ceil(((v ?? 0) * percent) / 100)])) as ResourceAmounts;

/** The value of a price (sum of its goods at the handog values), to compare offers. */
export function priceValue(content: Content, p: ResourceAmounts): number {
  const values = content.rules.diplomacy.handog.values as ResourceAmounts;
  return Object.entries(p).reduce((sum, [k, v]) => sum + (v ?? 0) * (values[k as keyof ResourceAmounts] ?? 1), 0);
}
