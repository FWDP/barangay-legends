// The region: AI neighbor barangays along the river, warriors, war and diplomacy.
// Pure and deterministic. Each neighbor is a full GameState run by the same engine rules as
// the player (tick + commands), steered by a simple AI. All randomness comes from the seeded
// RNG in the player's state, rolled once per whole game second.
import { counted, dailyFactor, relationshipDays, tradeValueFactor, type Today } from "./limits";
import { updateDoors } from "./doors";
import { newFame, type Fame } from "./ranking";
import { datuInfluenceMultiplier } from "./datu";
import { RESOURCES, type Content, type NeighborDef, type RefusalReason, type Resource, type ResourceAmounts, type TraitDef } from "./content";
import { apply, canAfford, asCost, buildingCost, housing, newGame, owned, placeAuto, rates, tick, warriorCap, type GameState } from "./game";
import { autoPlaceTile } from "./map";
import { nearestClearable } from "./clearing";
import { Rng } from "./rng";
import { proposeTrade, type CounterOffer, type Proposal } from "./trading";
import { chooseLanding, raidLanding, raidWindow, sheltered } from "./border";
import { lootableFood } from "./food";
import { bloodPrice, coolFeuds, emptyFeuds, peaceOf, priceValue, recordBloodDebt, scalePrice, type Feud, type FeudState, type Mediator, type SealKind } from "./feud";
import { addHonor, steadiness } from "./honor";
import { addWounded, endBattle, heldAway, lossTotal, ransomFor, shouldFlee, woundedCount, type BattleEnd, type Captive } from "./warfare";
import { isWatched, stakesDelay, warningFor } from "./watch";
import { dayPhaseAt, isNightAt } from "./daynight";
import { seasonAt } from "./events";
import { addExpedition, defenseExpedition } from "./expeditions";
import { alliesComing, borderBattle, raidSetup } from "./battle";
import type { Point } from "./map";
import { generateArchipelago, islandDistance, type Island, type Place } from "./archipelago";
import {
  absorbed,
  atWarMembers,
  blocById,
  blocOf,
  blocStrength,
  expel as expelFor,
  formBloc as formBlocFor,
  generateBlocs,
  joinBloc as joinBlocFor,
  leaderDefeated,
  leaveBloc as leaveBlocFor,
  scriptedEvent,
  type Politics,
} from "./politics";
import { hasDatuUnlock } from "./datu";
import { rollAt } from "./rng";

export type NeighborStatus = "independent" | "tributary" | "ally";
/** The four ways to bring a neighbor in. */
export type Path = "trade" | "marriage" | "sandugo" | "mangayaw";

export interface NeighborState {
  id: string;
  /** Their barangay, run by the same engine rules as the player's. */
  state: GameState;
  /** 0..100. Built by trade and gifts, lost by raids. Marriage needs it. */
  trust: number;
  /** 0..100. At 100 the neighbor becomes a tributary. */
  influence: number;
  status: NeighborStatus;
  marriage: boolean;
  /** 0..100, tributaries only. Below the rebel line they become independent again. */
  loyalty: number;
  /** Player warriors guarding this tributary until a game time. */
  guard: { warriors: number; until: number } | null;
  /** The player can't raid them again before this time. */
  raidCooldownUntil: number;
  nextDecisionAt: number;
  /** 0..100: how much they resent the player's raids on them. Separate from trust; fades slowly. */
  grudge: number;
  /** Why they last turned a trade (or alliance) down, and when, for the diplomacy panel. */
  lastRefusal: { reason: RefusalReason; at: number } | null;
  /** Their tradition (content/traditions). */
  tradition: string;
  /** Their renown and raids beaten off, for the Ranggo (ranking.ts). */
  fame: Fame;
  /** Game time of first contact (the first trade, gift, offer taken or raid), or null. */
  metAt: number | null;
  /** Trades, gifts and raids with them today (limits.ts). */
  today: Today | null;
}

/** A line of political news (the Balita feed): a scripted event or something a barangay did. */
export interface NewsItem {
  id: number;
  time: number;
  /** A politics event id (content/events/politics), or an action: formed, joined, left, expelled, absorbed, defeated, war-loss, ally-defended, ally-lost, war-joined. */
  key: string;
  /** Barangay or bloc ids named in it. */
  barangay?: string;
  bloc?: string;
  other?: string;
  /** Births and arrivals ("birth", "arrival"): the people named in it (a newborn's mother, father, child; the newcomers). */
  people?: string[];
  /** Why newcomers came (arrival): a reason id in content/villagers/arrivals.json. */
  reason?: string;
}

/** A Balangay at sea: carrying an action to another island, or coming home. */
export interface Voyage {
  id: number;
  /** "out": carrying `command` to `target`; "home": coming back (with any warriors). */
  leg: "out" | "home";
  target: string;
  /** The action it carries (trade, marriage, sandugo, raid), done on arrival. */
  command: { type: string; [key: string]: unknown } | null;
  departAt: number;
  arriveAt: number;
  /** Warriors aboard (a raid out, the survivors home). */
  warriors: number;
  /** Waiting offshore (a trade arriving during a raid on the barangay). */
  waiting?: boolean;
}

export interface TradeOffer {
  from: string;
  /** What they give the player, and what they want back. */
  give: { resource: Resource; amount: number };
  want: { resource: Resource; amount: number };
  expiresAt: number;
}

/** A raid on its way: who, when, and where they'll land (chosen when the raid starts). */
export interface IncomingRaid {
  from: string;
  strikeAt: number;
  /** The river-bank tile they land on, where the battle is fought. Missing in older saves. */
  landing?: Point | null;
  /** When the raid was seen (the warning began); strikeAt minus this is the warning (v33). */
  warnedAt?: number;
  /** A staffed Bantayan watched the landing: a long warning, the landing shown at once, the alarm. */
  watched?: boolean;
  /** The datu sounded the tambuli: allies send volunteers too (callForHelp). */
  called?: boolean;
  /** The datu called every Mandirigma to arms, not only those the food workplaces can spare (callEveryone). */
  everyone?: boolean;
  /** A vengeance raid for a blood debt (feud.ts): fiercer, more warriors, and a few houses may burn. */
  vengeance?: boolean;
  /** A mourning raid after their datu died (Visayan practice; flagged for review). */
  mourning?: boolean;
}

/** An ally being raided: its messenger's call for help waits at the Bahay ng Datu until the raid strikes. */
export interface AllyCall {
  /** The ally raided, and the barangay raiding it. */
  ally: string;
  from: string;
  strikeAt: number;
}

export type ReportKind = "raid" | "defense" | "rebellion" | "tributary" | "alliance";

/** A short battle or diplomacy report for the player. Captives are never part of it. */
export interface Report {
  id: number;
  time: number;
  kind: ReportKind;
  neighbor: string;
  /** Battles: did the player win, the numbers behind it, losses on each side, goods taken. */
  win?: boolean;
  attack?: number;
  defense?: number;
  chance?: number;
  ourLosses?: number;
  theirLosses?: number;
  loot?: Partial<Record<Resource, number>>;
  lost?: Partial<Record<Resource, number>>;
  renown?: number;
  /** The player's raids: the share of renown it brings (less for raiding the same barangay again that day). */
  renownFactor?: number;
  /** Battles (W.1): each side's wounded, fallen and captured; whose morale broke and why; how the losers withdrew. */
  wounded?: { ours: number; theirs: number };
  fallen?: { ours: number; theirs: number };
  captured?: { ours: number; theirs: number };
  broke?: "attackers" | "defenders";
  reason?: "losses" | "leader";
  withdrew?: "boat" | "land";
  /** A captive record (warfare.ts) for warriors held after this battle, ours or theirs. */
  captive?: number;
  /** The villagers fled into the forest (no Kuta, an overwhelming raid). */
  fled?: boolean;
  /** Raids: where it was fought, warriors too far away to arrive in time, and whether a staffed Bantayan watched the landing (v33). */
  landing?: Point;
  late?: number;
  watched?: boolean;
  /** Raids on the player: the share of the usual loot taken (less with storehouses in a Kuta's shelter or allies on the way), percent. */
  lootShare?: number;
  /** Allies whose warriors came in time to fight at the landing. */
  allies?: string[];
}

export interface RegionState {
  neighbors: NeighborState[];
  renown: number;
  /** No AI raids before this game time. */
  truceUntil: number;
  /** A raid on its way (warning shown), or null. */
  incomingRaid: IncomingRaid | null;
  nextAiRaidAt: number;
  /** When the datu last sounded the tambuli (callForHelp), for overuse. */
  lastCallAt?: number;
  offer: TradeOffer | null;
  reports: Report[];
  nextReportId: number;
  nextTributeAt: number;
  /** Paths the player has used so far. */
  paths: Path[];
  /** Set once every neighbor is a tributary or ally: the player is Paramount Datu. */
  victory: { time: number; paths: Path[] } | null;
  /** A neighbor's counter-offer to the player's last proposal, waiting for an answer. */
  counter: CounterOffer | null;
  /** The archipelago: islands and where each barangay (the player too, by its barangay id) sits. */
  islands: Island[];
  places: Record<string, Place>;
  /** Alliance blocs and wars (see politics.ts). */
  politics: Politics;
  /** The Balita feed, newest last. */
  news: NewsItem[];
  nextNewsId: number;
  /** The player's Balangay at sea. */
  voyages: Voyage[];
  nextVoyageId: number;
  /** An ally's call for help, waiting for the datu's answer (missing in older saves). */
  allyCall?: AllyCall | null;
  /** Warriors held for ransom after battles, ours and theirs (warfare.ts); they always come home. */
  captives?: Captive[];
  nextCaptiveId?: number;
  /** Blood debts, feuds and sealed peaces (feud.ts). Missing in older saves: none. */
  feuds?: FeudState;
}

const EPSILON = 1e-9;
const MAX_REPORTS = 12;
export const MAX_NEWS = 30;
const clamp100 = (v: number) => Math.min(100, Math.max(0, v));

// ---------- Setup ----------

const aiContents = new WeakMap<Content, Content>();
/** AI neighbors share the player's rules, minus random disasters and choice events (nobody is there to fight fires or decide). */
export function aiContent(content: Content): Content {
  let c = aiContents.get(content);
  if (!c) {
    // No tasks or named villagers for them either.
    c = { ...content, events: { hunger: content.events.hunger, seasons: content.events.seasons }, choices: [], quests: [], villagers: { ...content.villagers, chance: 0 }, ai: true, visitor: null, eclipse: null, trickery: null };
    aiContents.set(content, c);
  }
  return c;
}

/** FNV-1a, to give each neighbor its own seed from the player's. */
function hashString(text: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export function newNeighborState(content: Content, def: NeighborDef, seed: number): GameState {
  const ai = aiContent(content);
  let s: GameState = { ...newGame(ai, hashString(def.id, seed), false), buildings: [] };
  for (const b of ai.buildings) {
    for (let i = 0; i < (def.start.buildings[b.id] ?? 0); i++) s = placeAuto(s, ai, b.id);
  }
  return updateDoors(null, {
    ...s,
    villagers: def.start.villagers,
    warriors: def.start.warriors,
    resources: { ...s.resources, ...asCost(def.start.resources) },
  }, ai);
}

/** A neighbor's tradition: from its file, or picked from the seed. */
function traditionFor(content: Content, def: NeighborDef, seed: number, i: number): string {
  if (def.tradition) return def.tradition;
  const t = content.traditions;
  return t.length ? t[Math.floor(rollAt(seed >>> 0, i, 5900) * t.length) % t.length].id : "";
}

/** How strong a barangay is: its attack and its defense. */
export const strengthOfState = (s: GameState, content: Content) => attackOf(s.warriors, content) + defenseOf(s, content);

/** Strength by barangay id: the player's own id or a neighbor's. */
export function strengthFn(state: GameState, content: Content): (id: string) => number {
  return (id) => {
    if (id === state.barangay.id) return strengthOfState(state, content);
    const n = state.region?.neighbors.find((x) => x.id === id);
    return n ? strengthOfState(n.state, content) : 0;
  };
}

/** A new neighbor as it starts (also used to add neighbors to an older save). */
export function newNeighbor(content: Content, def: NeighborDef, i: number, time: number, seed: number): NeighborState {
  const d = content.rules.diplomacy;
  const state = newNeighborState(content, def, seed);
  return {
    id: def.id,
    state,
    trust: def.trust,
    influence: d.startInfluence,
    status: "independent",
    marriage: false,
    loyalty: 0,
    guard: null,
    raidCooldownUntil: 0,
    grudge: 0,
    lastRefusal: null,
    // Stagger AI decisions so the neighbors don't all act on the same second.
    nextDecisionAt: Math.floor(time) + d.aiDecisionSeconds + i * 3,
    tradition: traditionFor(content, def, seed, i),
    fame: newFame(content, state, Math.floor(time)),
    metAt: null,
    today: null,
  };
}

export function createRegion(content: Content, time: number, seed: number, playerId = "barangay-1"): RegionState {
  const d = content.rules.diplomacy;
  const neighbors = content.neighbors.map((def, i) => newNeighbor(content, def, i, time, seed));
  const { islands, places } = generateArchipelago(content, seed, playerId);
  const strength = (id: string) => {
    const n = neighbors.find((x) => x.id === id);
    return n ? strengthOfState(n.state, content) : 0;
  };
  const politics = { ...generateBlocs(content, neighbors.map((n) => n.id), strength, seed), nextWarTickAt: Math.floor(time) + content.rules.politics.warTickSeconds };
  return {
    islands,
    places,
    politics,
    news: [],
    nextNewsId: 1,
    voyages: [],
    nextVoyageId: 1,
    neighbors,
    renown: 0,
    truceUntil: Math.floor(time) + d.truceSeconds,
    incomingRaid: null,
    allyCall: null,
    nextAiRaidAt: 0,
    offer: null,
    reports: [],
    nextReportId: 1,
    nextTributeAt: Math.floor(time) + d.tribute.everySeconds,
    counter: null,
    paths: [],
    victory: null,
  };
}

export const neighborDef = (content: Content, id: string) => content.neighbors.find((n) => n.id === id);
export const traitOf = (content: Content, id: string): TraitDef =>
  content.rules.diplomacy.traits[neighborDef(content, id)?.trait ?? ""] ?? {
    label: "",
    trustGainPercent: 100,
    influenceGainPercent: 100,
    tradeBonusPercent: 0,
    offerChanceMultiplier: 1,
    raids: false,
    warriorPercent: 0,
  };

// ---------- Warriors and battle ----------

/** Warriors at home: all of them, minus any guarding a tributary. */
export function homeWarriors(state: GameState): number {
  const guarding = state.region?.neighbors.reduce((n, nb) => n + (nb.guard?.warriors ?? 0), 0) ?? 0;
  // Warriors at sea (on a raid by Balangay, or coming home) are away too.
  const atSea = state.region?.voyages?.reduce((n, v) => n + v.warriors, 0) ?? 0;
  // So are warriors held for ransom, and the wounded rest until they heal (warfare.ts).
  return Math.max(0, state.warriors - guarding - atSea - heldAway(state) - woundedCount(state));
}

/** Defense against a raid: a base, warriors at home, and every standing defensive building (Kuta). */
export function defenseOf(state: GameState, content: Content): number {
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  const walls = state.buildings.reduce((sum, b) => sum + (b.damaged ? 0 : (defs.get(b.type)?.defense ?? 0)), 0);
  const m = content.rules.military;
  return m.baseDefense + homeWarriors(state) * m.warrior.defense + walls;
}

export const attackOf = (warriors: number, content: Content) => warriors * content.rules.military.warrior.attack;

export interface BattleResult {
  attackerWins: boolean;
  /** The attacker's chance to win: attack / (attack + defense). */
  chance: number;
  attackerLossPercent: number;
  defenderLossPercent: number;
}

/**
 * Resolves a battle from attack vs defense and one seeded roll in [0, 1). The attacker wins
 * when roll < attack / (attack + defense). The loser loses more warriors than the winner.
 */
export function resolveBattle(attack: number, defense: number, roll: number, content: Content): BattleResult {
  const m = content.rules.military;
  const chance = attack <= 0 ? 0 : attack / (attack + Math.max(0, defense));
  const attackerWins = roll < chance;
  return {
    attackerWins,
    chance,
    attackerLossPercent: attackerWins ? m.winnerLossPercent : m.loserLossPercent,
    defenderLossPercent: attackerWins ? m.loserLossPercent : m.winnerLossPercent,
  };
}

/** Warriors lost from a force: rounded, and a defeated side always loses at least one. */
export function casualties(warriors: number, percent: number, defeated: boolean): number {
  if (warriors <= 0) return 0;
  const n = Math.round((warriors * percent) / 100);
  return Math.min(warriors, defeated ? Math.max(1, n) : n);
}

/** Fallen warriors were villagers too. */
function loseWarriors(state: GameState, n: number): GameState {
  const villagers = Math.max(0, state.villagers - n);
  return { ...state, warriors: Math.max(0, state.warriors - n), villagers, sick: state.sick.slice(0, villagers) };
}

/**
 * Takes `percent` of each resource from one state: returns what was taken. Of Pagkain only what's
 * preserved in jars and the Kamalig can be carried off, never root crops in the ground.
 */
function takeShare(from: GameState, percent: number): Partial<Record<Resource, number>> {
  const out: Partial<Record<Resource, number>> = {};
  for (const r of RESOURCES) out[r] = Math.floor(((r === "food" ? lootableFood(from) : from.resources[r]) * percent) / 100);
  return out;
}

function moveGoods(from: GameState, to: GameState, goods: Partial<Record<Resource, number>>): [GameState, GameState] {
  const a = { ...from.resources };
  const b = { ...to.resources };
  for (const r of RESOURCES) {
    const n = Math.min(goods[r] ?? 0, a[r]);
    a[r] -= n;
    b[r] += n;
  }
  return [{ ...from, resources: a }, { ...to, resources: b }];
}

/**
 * Trains a villager as a Mandirigma, for the warrior cost. Needs a healthy villager who isn't one
 * yet, and room under the Kuta cap (warriorsPerKuta each). A Mandirigma keeps working between raids.
 */
export function train(state: GameState, content: Content): GameState {
  const cost = asCost(content.rules.military.warrior.cost);
  const untrained = state.villagers - state.warriors - state.sick.length;
  if (untrained < 1 || state.warriors >= warriorCap(state, content) || !canAfford(state, cost)) return state;
  const resources = { ...state.resources };
  for (const r of RESOURCES) resources[r] -= cost[r];
  return { ...state, resources, warriors: state.warriors + 1 };
}

// ---------- Diplomacy ----------

function withNeighbor(state: GameState, id: string, fn: (n: NeighborState, region: RegionState) => [GameState, NeighborState] | null): GameState {
  const region = state.region;
  const i = region?.neighbors.findIndex((n) => n.id === id) ?? -1;
  if (!region || i < 0) return state;
  const result = fn(region.neighbors[i], region);
  if (!result) return state;
  const [s, n] = result;
  const neighbors = [...s.region!.neighbors];
  neighbors[i] = n;
  return checkVictory({ ...s, region: { ...s.region!, neighbors } });
}

const addTrust = (n: NeighborState, amount: number, trait: TraitDef) =>
  clamp100(n.trust + (amount > 0 ? (amount * trait.trustGainPercent) / 100 : amount));

function addPath(region: RegionState, path: Path): RegionState {
  return region.paths.includes(path) ? region : { ...region, paths: [...region.paths, path] };
}

export function addNews(region: RegionState, item: Omit<NewsItem, "id">): RegionState {
  const news = [...region.news, { ...item, id: region.nextNewsId }].slice(-MAX_NEWS);
  return { ...region, news, nextNewsId: region.nextNewsId + 1 };
}

function addReport(region: RegionState, report: Omit<Report, "id">): RegionState {
  const reports = [...region.reports, { ...report, id: region.nextReportId }].slice(-MAX_REPORTS);
  return { ...region, reports, nextReportId: region.nextReportId + 1 };
}

/** Raises influence; at 100 an independent neighbor becomes a tributary. */
function addInfluence(region: RegionState, n: NeighborState, amount: number, content: Content, time: number): [RegionState, NeighborState] {
  if (n.status !== "independent") return [region, n];
  const trait = traitOf(content, n.id);
  const influence = clamp100(n.influence + (amount * trait.influenceGainPercent) / 100);
  if (influence < 100 - EPSILON) return [region, { ...n, influence }];
  const tributary: NeighborState = { ...n, influence: 100, status: "tributary", loyalty: content.rules.diplomacy.loyalty.start };
  // Absorbed: it leaves its bloc.
  let r = addReport(region, { time, kind: "tributary", neighbor: n.id });
  if (blocOf(r.politics, n.id)) {
    const strength = (id: string) => strengthOfState(r.neighbors.find((x) => x.id === id)?.state ?? tributary.state, content);
    r = addNews({ ...r, politics: absorbed(r.politics, n.id, strength) }, { time, key: "absorbed", barangay: n.id });
  }
  return [r, tributary];
}

/**
 * Changes how one neighbor sees the player (a choice event's effect). Trust follows the
 * neighbor's temperament like any other gain; influence follows the usual rules, so it can
 * make them a tributary.
 */
export function adjustRelations(state: GameState, content: Content, id: string, change: { trust?: number; influence?: number }): GameState {
  return withNeighbor(state, id, (n, region) => {
    let next: NeighborState = change.trust ? { ...n, trust: addTrust(n, change.trust, traitOf(content, id)) } : n;
    let r = region;
    if (change.influence) {
      if (change.influence > 0) [r, next] = addInfluence(r, next, change.influence * datuInfluenceMultiplier(state, content), content, state.time);
      else if (next.status === "independent") next = { ...next, influence: clamp100(next.influence + change.influence) };
    }
    return [{ ...state, region: r }, next];
  });
}

/**
 * Trading pauses from a raid's warning until the raid is over: nothing can be traded or
 * accepted, no new offers come, and a waiting offer's time stands still. Every trade path
 * checks this.
 */
export function tradingPaused(state: GameState): boolean {
  return (state.region?.incomingRaid ?? null) !== null;
}

/** The standard parcel: give rules.diplomacy.trade.give of one resource for the other at the usual rate. */
export function standardProposal(content: Content, id: string, give: Resource): Proposal {
  const t = content.rules.diplomacy.trade;
  // The standard parcel swaps Palay and wood (anything else is asked for wood's worth of Palay).
  const get: Resource = give === "rice" ? "wood" : "rice";
  const receive = Math.floor((t.give * (t.receivePercent + traitOf(content, id).tradeBonusPercent)) / 100);
  return { give: { resource: give, amount: t.give }, want: { resource: get, amount: receive } };
}

/** Trade: offer the standard parcel. The neighbor decides like any proposal (see trading.ts). */
export function trade(state: GameState, content: Content, id: string, give: Resource): GameState {
  return proposeTrade(state, content, id, standardProposal(content, id, give));
}

/**
 * Carries out an agreed trade: the goods change hands, trust and influence grow, a tributary
 * grows more loyal. Refused (same state) if either side can't pay.
 */
export function executeTrade(state: GameState, content: Content, id: string, p: Proposal): GameState {
  const t = content.rules.diplomacy.trade;
  return withNeighbor(state, id, (n, region) => {
    if (state.resources[p.give.resource] < p.give.amount || n.state.resources[p.want.resource] < p.want.amount) return null;
    let [player, them] = moveGoods(state, n.state, { [p.give.resource]: p.give.amount });
    [them, player] = moveGoods(them, player, { [p.want.resource]: p.want.amount });
    // Worth its value, and much less when they've already traded with the player today.
    const weight = tradeValueFactor(content, p.give.amount * (content.rules.diplomacy.tradeDecision.values[p.give.resource] ?? 1)) * dailyFactor(state, content, n, "trades");
    let next: NeighborState = { ...counted(state, content, n, "trades"), state: them, trust: addTrust(n, t.trust * weight, traitOf(content, id)) };
    if (next.status === "tributary") next = { ...next, loyalty: clamp100(next.loyalty + t.loyalty * weight) };
    player = { ...player, stats: { ...player.stats, trades: player.stats.trades + 1 } };
    let r = addPath(region, "trade");
    [r, next] = addInfluence(r, next, t.influence * weight * datuInfluenceMultiplier(state, content), content, state.time);
    return [{ ...player, region: r }, next];
  });
}

/** Why a marriage alliance can't happen yet, or null. */
export function marriageBlocker(state: GameState, content: Content, id: string): string | null {
  const m = content.rules.diplomacy.marriage;
  const n = state.region?.neighbors.find((x) => x.id === id);
  if (!n) return "unknown";
  if (n.marriage) return "already-married";
  if (n.status === "ally") return "already-allied";
  if (n.grudge > content.rules.diplomacy.grudge.noAlliancesAbove) return "grudge";
  if (n.trust <= m.trustNeeded) return "trust";
  if (relationshipDays(state, content, n) < content.rules.limits.marriageMinDays) return "young";
  if (!canAfford(state, asCost(m.cost))) return "cost";
  return null;
}

/** Why a sandugo can't happen yet, or null: it needs a marriage, or a long relationship. */
export function sandugoBlocker(state: GameState, content: Content, id: string): string | null {
  const n = state.region?.neighbors.find((x) => x.id === id);
  if (!n) return "unknown";
  if (n.status === "ally") return "already-allied";
  if (n.grudge > content.rules.diplomacy.grudge.noAlliancesAbove) return "grudge";
  if (!n.marriage && relationshipDays(state, content, n) < content.rules.limits.sandugoMinDays) return "young";
  if (!canAfford(state, asCost(content.rules.diplomacy.sandugo.cost))) return "cost";
  return null;
}

/** Marriage alliance: needs trust above the line and a large gift. Big influence gain. */
export function marry(state: GameState, content: Content, id: string): GameState {
  if (marriageBlocker(state, content, id) !== null) return state;
  const m = content.rules.diplomacy.marriage;
  return withNeighbor(state, id, (n, region) => {
    const [player, them] = moveGoods(state, n.state, asCost(m.cost));
    let next: NeighborState = { ...n, state: them, marriage: true, trust: addTrust(n, m.trust, traitOf(content, id)) };
    let r = addPath(region, "marriage");
    [r, next] = addInfluence(r, next, m.influence * datuInfluenceMultiplier(state, content), content, state.time);
    return [{ ...player, region: r }, next];
  });
}

/** Sandugo: a blood compact with a family you have married into. Makes them an ally (mutual defense). */
export function sandugo(state: GameState, content: Content, id: string): GameState {
  const sd = content.rules.diplomacy.sandugo;
  return withNeighbor(state, id, (n, region) => {
    if (sandugoBlocker(state, content, id) !== null) return null;
    const [player, them] = moveGoods(state, n.state, asCost(sd.cost));
    const next: NeighborState = { ...n, state: them, status: "ally", guard: null, trust: addTrust(n, sd.trust, traitOf(content, id)) };
    const r = addReport(addPath(region, "sandugo"), { time: state.time, kind: "alliance", neighbor: id });
    return [{ ...player, region: r }, next];
  });
}

/**
 * Mangayaw: send warriors to raid an independent neighbor. One seeded roll decides it.
 * A win brings goods (as abstract tribute), renown and influence but costs trust with
 * every neighbor; a loss costs warriors. No people are ever taken.
 */
export function raid(state: GameState, content: Content, id: string, warriors: number): GameState {
  const d = content.rules.diplomacy;
  const m = content.rules.military;
  if (!Number.isInteger(warriors) || warriors < 1 || warriors > homeWarriors(state)) return state;
  const target = state.region?.neighbors.find((n) => n.id === id);
  if (!target || target.status !== "independent" || state.time < target.raidCooldownUntil) return state;

  // The same border battle as raids on the player: they land where the visit preview shows,
  // the defenders muster from their Kutas, and their bloc mates may come in time.
  const setup = raidSetup(state, content, id);
  if (!setup) return state;
  const rng = new Rng(state.rng);
  const fight = borderBattle(setup.village, content, setup.landing, warriors, setup.allies, rng.next());
  const { attack, defense, battle } = fight;
  // The battle ends when one side's morale breaks: mostly wounded, few dead, some held (warfare.ts).
  const end = endBattle(battle.attackerWins, warriors, fight.defenders, battleRolls(state, state.region!.nextReportId), content, battleOpts(state, content, id, "attack"));
  const ourLosses = lossTotal(end.attacker);
  const theirLosses = lossTotal(end.defender);

  let player = addWounded(loseWarriors({ ...state, rng: rng.seed }, end.attacker.fallen), content, end.attacker.wounded);
  // Their captured warriors are held by us; ours by them. Everyone comes home in the end.
  let them = loseWarriors(target.state, end.defender.fallen + end.defender.captured);
  let loot: Partial<Record<Resource, number>> = {};
  if (battle.attackerWins) {
    loot = takeShare(them, m.lootPercent);
    [them, player] = moveGoods(them, player, loot);
  }

  let region = player.region!;
  // Raiding the same barangay again today brings less renown.
  const renownFactor = dailyFactor(state, content, target, "raids");
  let next: NeighborState = {
    ...target,
    state: them,
    trust: clamp100(target.trust - d.raid.trustLossTarget),
    marriage: false,
    metAt: counted(state, content, target, "raids").metAt,
    today: counted(state, content, target, "raids").today,
    raidCooldownUntil: state.time + d.raid.cooldownSeconds,
    // They won't forget it soon, less so if it worked.
    grudge: clamp100(target.grudge + (battle.attackerWins ? d.grudge.raidWon : d.grudge.raidLost)),
  };
  // Bloc solidarity: the target's bloc mates resent it too, a little less.
  const bloc = blocOf(region.politics, id);
  if (bloc) {
    const raised = (battle.attackerWins ? d.grudge.raidWon : d.grudge.raidLost) * (content.rules.politics.solidarityPercent / 100);
    region = { ...region, neighbors: region.neighbors.map((n) => (n.id !== id && bloc.members.includes(n.id) ? { ...n, grudge: clamp100(n.grudge + raised) } : n)) };
  }
  if (battle.attackerWins && bloc?.leader === id) {
    // A bloc leader beaten in battle loses the lead.
    region = addNews({ ...region, politics: leaderDefeated(region.politics, id, strengthFn({ ...player, region }, content)) }, { time: state.time, key: "defeated", barangay: id, bloc: bloc.id });
  }
  if (battle.attackerWins) {
    // Every neighbor hears of it.
    region = {
      ...region,
      renown: region.renown + d.raid.renown,
      neighbors: region.neighbors.map((n) => (n.id === id ? n : { ...n, trust: clamp100(n.trust - d.raid.trustLossAll) })),
    };
    region = addPath(region, "mangayaw");
    [region, next] = addInfluence(region, next, d.raid.influence * datuInfluenceMultiplier(state, content), content, state.time);
  }
  const captive = takeCaptives(region, state, content, id, end.attacker.captured, end.defender.captured);
  region = captive.region;
  // Breaking a sealed peace is a grave betrayal: every barangay trusts the player less.
  region = breakPeace(region, content, state.barangay.id, id, state.time);
  // The dead are owed: blood debts both ways (feud.ts).
  region = owe(region, content, id, state.barangay.id, end.defender.fallen, state.time);
  region = owe(region, content, state.barangay.id, id, end.attacker.fallen, state.time);
  region = addReport(region, {
    time: state.time,
    kind: "raid",
    neighbor: id,
    win: battle.attackerWins,
    attack,
    defense,
    chance: battle.chance,
    ourLosses,
    theirLosses,
    ...battleFields(end, "attack"),
    ...(captive.id !== null ? { captive: captive.id } : {}),
    loot,
    renown: battle.attackerWins ? d.raid.renown : 0,
    renownFactor,
    ...(fight.landing && fight.muster ? { landing: fight.landing, late: fight.muster.late, watched: fight.muster.watched } : {}),
    ...(fight.allies.some((a) => a.arrives) ? { allies: fight.allies.filter((a) => a.arrives).map((a) => a.id) } : {}),
  });
  const i = region.neighbors.findIndex((n) => n.id === id);
  const neighbors = [...region.neighbors];
  neighbors[i] = next;
  return checkVictory(warFlags({ ...player, region: { ...region, neighbors } }));
}

/** Send warriors to guard a tributary for a while: they're away from home, and its loyalty rises. */
export function guard(state: GameState, content: Content, id: string, warriors: number): GameState {
  if (!Number.isInteger(warriors) || warriors < 1 || warriors > homeWarriors(state)) return state;
  return withNeighbor(state, id, (n) => {
    if (n.status !== "tributary") return null;
    const total = (n.guard?.warriors ?? 0) + warriors;
    return [state, { ...n, guard: { warriors: total, until: state.time + content.rules.diplomacy.loyalty.guardSeconds } }];
  });
}

/** Accept the open trade offer: counts as a trade. */
export function acceptOffer(state: GameState, content: Content): GameState {
  if (tradingPaused(state)) return state;
  const offer = state.region?.offer;
  if (!offer || state.time > offer.expiresAt) return state;
  const t = content.rules.diplomacy.trade;
  const cleared = { ...state, region: { ...state.region!, offer: null } };
  return withNeighbor(cleared, offer.from, (n, region) => {
    if (state.resources[offer.want.resource] < offer.want.amount || n.state.resources[offer.give.resource] < offer.give.amount) return null;
    let [player, them] = moveGoods(cleared, n.state, { [offer.want.resource]: offer.want.amount });
    [them, player] = moveGoods(them, player, { [offer.give.resource]: offer.give.amount });
    // Their offer counts as a trade with them today, like the player's own.
    const weight = dailyFactor(state, content, n, "trades");
    let next: NeighborState = { ...counted(state, content, n, "trades"), state: them, trust: addTrust(n, t.trust * weight, traitOf(content, n.id)) };
    if (next.status === "tributary") next = { ...next, loyalty: clamp100(next.loyalty + t.loyalty * weight) };
    let r = addPath(region, "trade");
    [r, next] = addInfluence(r, next, t.influence * weight * datuInfluenceMultiplier(state, content), content, state.time);
    return [{ ...player, region: r }, next];
  });
}

export function declineOffer(state: GameState): GameState {
  return state.region?.offer ? { ...state, region: { ...state.region, offer: null } } : state;
}

/**
 * Paramount Datu: the player leads a bloc, and every barangay on every island is the player's
 * ally (sandugo) or tributary, a member of the player's bloc, or in the same bloc as one of the
 * player's allies.
 */
export function isParamount(state: GameState): boolean {
  const region = state.region;
  if (!region || region.neighbors.length === 0) return false;
  const me = state.barangay.id;
  const mine = region.politics.blocs.find((b) => b.leader === me);
  if (!mine) return false;
  const allies = new Set(region.neighbors.filter((n) => n.status === "ally" || n.status === "tributary").map((n) => n.id));
  return region.neighbors.every((n) => {
    if (allies.has(n.id) || mine.members.includes(n.id)) return true;
    const theirs = blocOf(region.politics, n.id);
    return !!theirs && theirs.members.some((m) => allies.has(m));
  });
}

function checkVictory(state: GameState): GameState {
  const region = state.region;
  if (!region || region.victory || !isParamount(state)) return state;
  return { ...state, region: { ...region, victory: { time: state.time, paths: [...region.paths] } } };
}

// ---------- AI ----------

/**
 * One AI decision for a neighbor, using the same commands as the player: gather when out of
 * rice, otherwise build what it needs most (food, houses, warriors, walls, then more work).
 */
export function aiDecide(state: GameState, content: Content, trait: TraitDef): GameState {
  const ai = aiContent(content);
  let s = state;
  if (s.resources.food < 5 && s.resources.rice < 5) {
    for (let i = 0; i < 20; i++) s = apply(s, ai, { type: "gather", resource: "food" });
  }
  // Room to build at all (a house's tile)? If not, every build waits for land to be cleared.
  const house = ai.buildings.find((b) => b.id === "bahay-kubo");
  const room = house ? autoPlaceTile(s, ai, house, { keepEdge: true }) !== null : true;
  const tryBuild = (id: string): GameState | null => {
    const def = ai.buildings.find((b) => b.id === id);
    if (!def || !room) return null;
    if (!canAfford(s, buildingCost(ai, def, owned(s, id)))) return null;
    const tile = autoPlaceTile(s, ai, def, { keepEdge: true });
    if (!tile) return null;
    const built = apply(s, ai, { type: "build", building: id, x: tile.x, y: tile.y });
    return built === s ? null : built;
  };
  // AI barangays eat Pagkain too (a simple pool: food.ts feed), and keep some Palay.
  // AI barangays eat Palay as food, 1:1 (food.ts feed), so both count here.
  const r = rates(s, ai).net;
  const net = r.food + r.rice;
  const food = () => tryBuild("gabihan") ?? tryBuild("kaingin") ?? tryBuild("sagingan") ?? tryBuild("palayan");
  const wantWarriors = Math.floor((s.villagers * trait.warriorPercent) / 100);
  const walls = ai.buildings.filter((b) => b.defense).reduce((n, b) => n + owned(s, b.id), 0);
  const camps = owned(s, "woodcutter-camp");
  const fields = owned(s, "palayan") + owned(s, "gabihan") + owned(s, "kaingin");
  const rice = owned(s, "palayan");
  const plan: (() => GameState | null)[] = [
    () => (net < 0.2 ? food() : null),
    () => (s.villagers >= housing(s, ai) ? tryBuild("bahay-kubo") : null),
    () => (s.warriors < wantWarriors ? (train(s, ai) === s ? null : train(s, ai)) : null),
    () => (walls < 1 + Math.floor(s.villagers / 15) ? tryBuild("kuta") : null),
    () => (camps * 2 < fields ? tryBuild("woodcutter-camp") : rice * 3 < fields ? tryBuild("palayan") : food()),
  ];
  for (const step of plan) {
    const next = step();
    if (next) return next;
  }
  // Out of room: clear the nearest forest, so the barangay keeps growing.
  if (s.clearing.length === 0 && !room) {
    const cleared = apply(s, ai, { type: "clearArea", tiles: nearestClearable(s, ai.rules.aiGrowth.clearTiles) });
    if (cleared !== s) return cleared;
  }
  return s;
}

// ---------- Time ----------

/**
 * Advances the region from t0 to t0 + dt: neighbors grow by the engine rules, tributary
 * loyalty drifts, guards come home, and on every whole second: tribute, AI decisions,
 * raids on the player and trade offers.
 */
export function updateRegion(state: GameState, content: Content, t0: number, dt: number): GameState {
  if (!state.region) return state;
  const d = content.rules.diplomacy;
  const t1 = t0 + dt;
  let s: GameState = state;
  let region: RegionState = { ...state.region };

  // Grudges fade slowly. (Neighbors live their own lives a whole second at a time, below.)
  region.neighbors = region.neighbors.map((n) => (n.grudge > 0 ? { ...n, grudge: Math.max(0, n.grudge - (d.grudge.decayPerMinute * dt) / 60) } : n));
  if (region.counter && t1 > region.counter.expiresAt) region = { ...region, counter: null };

  // Tributary loyalty: guarded ones grow more loyal, the rest slowly drift away and may rebel.
  const rebels: string[] = [];
  const neighbors = region.neighbors.map((n) => {
    let next = n.guard && n.guard.until <= t1 ? { ...n, guard: null } : n;
    if (next.status !== "tributary") return next.guard ? { ...next, guard: null } : next;
    const rate = next.guard ? d.loyalty.guardPerMinute : -d.loyalty.decayPerMinute;
    next = { ...next, loyalty: clamp100(next.loyalty + (rate * dt) / 60) };
    if (next.loyalty < d.loyalty.rebelBelow) {
      rebels.push(n.id);
      next = { ...next, status: "independent", influence: d.loyalty.rebelInfluence, loyalty: 0, guard: null };
    }
    return next;
  });
  region = { ...region, neighbors };
  for (const id of rebels) region = addReport(region, { time: t1, kind: "rebellion", neighbor: id });
  // Feuds cool very slowly on their own (feud.ts); one that has cooled to nothing is over.
  if (region.feuds?.feuds.length) {
    const cooled = coolFeuds(region.feuds, content, dt);
    region = { ...region, feuds: cooled.feuds };
    for (const f of cooled.ended) region = addNews(region, { time: t1, key: "feud-cooled", barangay: f.wronged, other: f.offender });
  }
  s = { ...s, region };

  const rng = new Rng(s.rng);
  for (let second = Math.floor(t0 + EPSILON) + 1; second <= Math.floor(t1 + EPSILON); second++) {
    s = onRegionSecond(s, content, second, rng);
  }
  return checkVictory(updatePolitics({ ...s, rng: rng.seed }, content, t0, t1));
}

function onRegionSecond(state: GameState, content: Content, second: number, rng: Rng): GameState {
  const d = content.rules.diplomacy;
  const ai = aiContent(content);
  let s = state;
  let region = { ...s.region! };

  // Neighbors live their own lives, one whole second at a time, so they grow the same however
  // finely the player's time is cut (a frame, a long tick, an offline step).
  region.neighbors = region.neighbors.map((n) => ({ ...n, state: tick(n.state, ai, 1) }));

  // Tribute: each tributary sends a share of a minute's production.
  if (second >= region.nextTributeAt) {
    region.nextTributeAt += d.tribute.everySeconds;
    region.neighbors = region.neighbors.map((n) => {
      if (n.status !== "tributary") return n;
      const produced = rates(n.state, ai).produced;
      const goods = Object.fromEntries(
        RESOURCES.map((r) => [r, Math.floor((produced[r] * d.tribute.everySeconds * d.tribute.percent) / 100)]),
      );
      const [them, player] = moveGoods(n.state, s, goods);
      s = player;
      return { ...n, state: them };
    });
  }

  // AI decisions.
  region.neighbors = region.neighbors.map((n) =>
    second >= n.nextDecisionAt
      ? { ...n, state: aiDecide(n.state, content, traitOf(content, n.id)), nextDecisionAt: n.nextDecisionAt + d.aiDecisionSeconds }
      : n,
  );
  s = { ...s, region };

  // An ally's call for help: a raid on it starts now and then, and an unanswered call runs out.
  s = updateAllyCall({ ...s, region }, content, second);
  region = { ...s.region! };

  // A raid on the player strikes when its warning runs out.
  if (region.incomingRaid && second >= region.incomingRaid.strikeAt) s = aiRaidStrikes(s, content, second, rng);
  region = { ...s.region! };

  // Now and then an AI datu dies; their barangay may go on a mourning raid against a rival (feud.ts).
  if (second >= region.truceUntil) {
    const out = mourningRaid({ ...s, region }, content, second);
    s = out;
    region = { ...out.region! };
  }

  // New raids, after the truce: only aggressive, independent neighbors with warriors.
  if (!region.incomingRaid && second >= region.truceUntil && second >= region.nextAiRaidAt) {
    const me = s.barangay.id;
    for (const n of region.neighbors) {
      // A blood debt owed to them makes even a peaceful barangay raid, and more often (feud.ts).
      const feud = feudsOf(region).feuds.find((f) => f.wronged === n.id && f.offender === me && !f.paid);
      if (n.status !== "independent" || (!traitOf(content, n.id).raids && !feud) || n.state.warriors < 1) continue;
      if (rng.next() < d.aiRaid.chancePerSecond * raidTimingFactor(s, content, second) * (feud ? content.rules.feud.vengeance.chanceFactor : 1)) {
        region = { ...region, incomingRaid: { ...startRaid(s, content, n.id, second), ...(feud ? { vengeance: true } : {}) } };
        break;
      }
    }
  }

  // Trade offers: one at a time, from neighbors that still trust the player a little. During a
  // raid none come, and a waiting offer's time stands still (its expiry moves on with the clock).
  if (region.incomingRaid) {
    if (region.offer) region = { ...region, offer: { ...region.offer, expiresAt: region.offer.expiresAt + 1 } };
    return { ...s, region };
  }
  if (region.offer && second >= region.offer.expiresAt) region = { ...region, offer: null };
  if (!region.offer) {
    for (const n of region.neighbors) {
      if (n.trust < 10) continue;
      // A grudge makes offers rarer; at the embargo line there are none. (The roll is made either way, so the sequence stays the same.)
      const willing = Math.max(0, 1 - n.grudge / d.grudge.embargoAt);
      if (rng.next() >= d.offers.chancePerSecond * traitOf(content, n.id).offerChanceMultiplier * willing) continue;
      // None in a new barangay's first day (the roll is still made above, to keep the sequence).
      if (second < d.offers.startsAfterSeconds) continue;
      // They offer what they have more of, for the other resource.
      const give = n.state.resources.rice >= n.state.resources.wood ? "rice" : "wood";
      const want: Resource = give === "rice" ? "wood" : "rice";
      if (n.state.resources[give] < d.offers.give) continue;
      region = {
        ...region,
        offer: {
          from: n.id,
          give: { resource: give, amount: d.offers.give },
          want: { resource: want, amount: Math.max(1, Math.floor((d.offers.give * 100) / d.offers.receivePercent)) },
          expiresAt: second + d.offers.expireSeconds,
        },
      };
      break;
    }
  }
  return { ...s, region };
}

/**
 * An AI raid hits the player. Defense: warriors at home, walls, a base, and help from sandugo
 * allies. A lost defense costs some rice and wood, never buildings.
 */
function aiRaidStrikes(state: GameState, content: Content, second: number, rng: Rng): GameState {
  const d = content.rules.diplomacy;
  const region = state.region!;
  const raid = region.incomingRaid!;
  const i = region.neighbors.findIndex((n) => n.id === raid.from);
  const attacker = region.neighbors[i];
  const base = { ...region, incomingRaid: null, nextAiRaidAt: second + d.aiRaid.cooldownSeconds };
  // Called off if they're no longer hostile or have no warriors left.
  if (!attacker || attacker.status !== "independent" || attacker.state.warriors < 1) return { ...state, region: base };

  const window = raidWindow(state, content);
  const coming = alliedDefenders(state, content, window).filter((a) => a.id !== attacker.id);
  const helpers = coming.filter((a) => a.arrives);
  // The battle is at the landing (the same border battle as the player's raids): only warriors
  // who rally at the Kutas and get there before the raiders strike fight, and allies who arrive
  // in time help.
  const landing = raidLanding(state, content);
  const fight = borderBattle(state, content, landing, attackerCount(attacker, raid, content), coming, rng.next(), window);
  const { attack, defense, battle, defenders } = fight;
  const border = fight.muster ? { muster: fight.muster } : null;
  // The battle ends when one side's morale breaks (warfare.ts): mostly wounded, few dead, some held.
  const raiders = attackerCount(attacker, raid, content);
  const end = endBattle(battle.attackerWins, raiders, defenders, battleRolls(state, region.nextReportId), content, battleOpts(state, content, attacker.id, "defense"));
  const ourLosses = lossTotal(end.defender);
  const theirLosses = lossTotal(end.attacker);

  let player = addWounded(loseWarriors(state, end.defender.fallen), content, end.defender.wounded);
  let them = loseWarriors(attacker.state, end.attacker.fallen + end.attacker.captured);
  // No Kuta and an overwhelming raid: the villagers flee into the forest and come back after.
  const fled = shouldFlee(state, content, attack, defense);
  if (fled) player = { ...player, hiding: { until: second + content.rules.military.battle.hideSeconds } };
  let lost: Partial<Record<Resource, number>> = {};
  // Raiders take what they can and leave quickly: less from storehouses and fields in a Kuta's
  // shelter, and less still if allied defenders are on their way. No villager is ever taken.
  const share = battle.attackerWins ? raidLootShare(state, content, coming.some((a) => a.eta !== null)) : 0;
  if (battle.attackerWins) {
    lost = takeShare(player, (d.aiRaid.lootPercent * share) / 100);
    [player, them] = moveGoods(player, them, lost);
  }
  const neighbors = [...base.neighbors];
  neighbors[i] = { ...attacker, state: them };
  let next: RegionState = { ...base, neighbors, renown: base.renown + (battle.attackerWins ? 0 : d.aiRaid.defendRenown) };
  const captive = takeCaptives(next, state, content, attacker.id, end.defender.captured, end.attacker.captured, second);
  next = captive.region;
  next = owe(next, content, state.barangay.id, attacker.id, end.defender.fallen, second);
  next = owe(next, content, attacker.id, state.barangay.id, end.attacker.fallen, second);
  // A vengeance raid that wins sets a few houses alight (the usual fire rules: damaged, never destroyed).
  if (raid.vengeance && battle.attackerWins) player = setFires(player, content, second);
  next = addReport(next, {
    time: second,
    kind: "defense",
    neighbor: attacker.id,
    win: !battle.attackerWins,
    attack,
    defense,
    chance: 1 - battle.chance,
    ourLosses,
    theirLosses,
    ...battleFields(end, "defense"),
    ...(captive.id !== null ? { captive: captive.id } : {}),
    ...(fled ? { fled: true } : {}),
    lost,
    renown: battle.attackerWins ? 0 : d.aiRaid.defendRenown,
    ...(landing && border ? { landing, late: border.muster.late, watched: border.muster.watched } : {}),
    ...(battle.attackerWins ? { lootShare: Math.round(share) } : {}),
    ...(helpers.length ? { allies: helpers.map((a) => a.id) } : {}),
  });
  if (!battle.attackerWins) player = { ...player, stats: { ...player.stats, raidsDefended: player.stats.raidsDefended + 1 } };
  // Written down for its replay: the same numbers the battle was decided by.
  const record = defenseExpedition(
    state,
    content,
    { from: attacker.id, departAt: raid.strikeAt - window, arriveAt: second, landing, attackers: attacker.state.warriors },
    border?.muster ?? null,
    coming,
    { attack, defense, chance: battle.chance, attackerWins: battle.attackerWins, ourLosses, theirLosses, lost, defenders },
    next.nextReportId - 1,
  );
  return addExpedition(warFlags({ ...player, region: next }), content, record);
}

// ---------- Allies at the border ----------

/** An ally who could come to defend the player, and whether they arrive within the raid warning. */
export interface AllyDefender {
  id: string;
  /** Everyone they send: their warriors and, if called with the tambuli, volunteers. */
  warriors: number;
  /** Of them, volunteers who came because the tambuli called. */
  volunteers?: number;
  /** Seconds to reach the landing, or null if they can't come at all (another island, no boats). */
  eta: number | null;
  arrives: boolean;
  by: "land" | "sea";
}

/**
 * Who comes when the player is raided: sandugo allies and members of the player's bloc, with
 * warriors. On the same island they walk (landSeconds plus distance); from another island only
 * those big enough to have boats (balangayMinVillagers) sail, at Balangay speed. Like the
 * player's own warriors, they fight only if they arrive within the raid warning.
 */
export function alliedDefenders(state: GameState, content: Content, window = raidWindow(state, content)): AllyDefender[] {
  const region = state.region;
  if (!region) return [];
  const me = state.barangay.id;
  // Sandugo allies and bloc mates come; tributaries owe military support and send some warriors.
  return alliesComing(region, content, me, helpersOf(state), window, !!region.incomingRaid?.called);
}

/** Who may come to the player's defense: sandugo allies, bloc mates and tributaries. */
function helpersOf(state: GameState): NeighborState[] {
  const region = state.region;
  if (!region) return [];
  const myBloc = blocOf(region.politics, state.barangay.id);
  return region.neighbors.filter((n) => n.status === "ally" || n.status === "tributary" || myBloc?.members.includes(n.id));
}

/** Why the tambuli can't be sounded now, or null: no raid coming, already sounded, or no one to call. */
export function callBlocker(state: GameState): "no-raid" | "called" | "no-allies" | null {
  const raid = state.region?.incomingRaid;
  if (!raid || state.time >= raid.strikeAt) return "no-raid";
  if (raid.called) return "called";
  return helpersOf(state).length ? null : "no-allies";
}

/** Would sounding the tambuli now be overusing it (a small raid, or soon after the last call)? */
export function callOverused(state: GameState, content: Content): boolean {
  const region = state.region;
  const raid = region?.incomingRaid;
  if (!region || !raid) return false;
  const t = content.rules.tambuli;
  const attackers = region.neighbors.find((n) => n.id === raid.from)?.state.warriors ?? 0;
  return attackers <= t.smallRaidAttackers || (region.lastCallAt !== undefined && state.time - region.lastCallAt < t.cooldownSeconds);
}

/**
 * Sounding the tambuli (a signal fire at night): allies, bloc mates and tributaries send armed
 * volunteers on top of their warriors, as their trust and the distance allow (alliesComing).
 * Calling for a small raid, or too soon after the last call, costs every answering ally trust.
 */
const addFlag = (state: GameState, flag: string): GameState => (state.flags.includes(flag) ? state : { ...state, flags: [...state.flags, flag] });

/** The datu calls every Mandirigma to arms for this raid, the food workers among them. */
export function callEveryone(state: GameState): GameState {
  const region = state.region;
  const raid = region?.incomingRaid;
  if (!region || !raid || raid.everyone) return state;
  return { ...state, region: { ...region, incomingRaid: { ...raid, everyone: true } } };
}

export function callForHelp(state: GameState, content: Content): GameState {
  if (callBlocker(state)) return state;
  const region = state.region!;
  const raid = region.incomingRaid!;
  const overused = callOverused(state, content);
  const answering = new Set(helpersOf(state).map((n) => n.id));
  const neighbors = overused ? region.neighbors.map((n) => (answering.has(n.id) ? { ...n, trust: clamp100(n.trust - content.rules.tambuli.overuseTrust) } : n)) : region.neighbors;
  return addFlag({ ...state, region: { ...region, neighbors, incomingRaid: { ...raid, called: true }, lastCallAt: state.time } }, "tambuli");
}

// ---------- Raids on the player: when they come, the warning, the loot ----------

/**
 * How likely a raid is to set out now, as a factor on aiRaid.chancePerSecond: raids tend to
 * arrive at night or dawn (the strike time is judged with an unwatched warning), more around a
 * change of season, fewer while a typhoon is on its way.
 */
export function raidTimingFactor(state: GameState, content: Content, second: number): number {
  const t = content.rules.diplomacy.aiRaid.timing;
  const { nightTo } = content.rules.dayNight;
  const strike = second + content.rules.watch.unwatchedWarningSeconds;
  const phase = dayPhaseAt(content, strike);
  const dark = isNightAt(content, strike) || (phase >= nightTo && phase < nightTo + t.dawnShare);
  let f = dark ? t.nightDawnFactor : t.dayFactor;
  const season = seasonAt(content, second);
  if (season && (season.elapsed < t.seasonChangeSeconds || season.remaining < t.seasonChangeSeconds)) f *= t.seasonChangeFactor;
  if (state.typhoon) f *= t.typhoonFactor;
  return f;
}

/** A raid sets out from `from` at `second`: where it lands, whether a Bantayan sees it, its warning. */
export function startRaid(state: GameState, content: Content, from: string, second: number): IncomingRaid {
  const landing = chooseLanding(state, content, second);
  const watched = isWatched(state, content, landing);
  // Suyak near the landing slow them: they strike later (watch.ts stakesDelay).
  return { from, strikeAt: second + warningFor(content, watched) + stakesDelay(state, content, landing), landing, warnedAt: second, watched };
}

/**
 * The share (percent) of the usual loot winning raiders take: storehouses and fields (the
 * aiRaid.lootTargets types) inside a standing Kuta's shelter give only shelteredLootPercent;
 * with allied defenders on their way the raiders leave sooner with alliesComingLootPercent.
 */
export function raidLootShare(state: GameState, content: Content, alliesOnTheWay: boolean): number {
  const targets = new Set(content.rules.diplomacy.aiRaid.lootTargets);
  const stores = state.buildings.filter((b) => targets.has(b.type));
  const forts = state.buildings.filter((b) => !b.damaged && (content.buildings.find((d) => d.id === b.type)?.defense ?? 0) > 0);
  const inside = stores.filter((b) => forts.some((k) => sheltered(content, k, b))).length;
  const k = content.rules.kuta.shelteredLootPercent;
  let share = stores.length ? ((stores.length - inside) * 100 + inside * k) / stores.length : 100;
  if (alliesOnTheWay) share = (share * content.rules.diplomacy.aiRaid.alliesComingLootPercent) / 100;
  return share;
}


/** How far apart two barangays' islands are (0 on the same island). */
export const seaDistance = (region: RegionState, a: string, b: string) => islandDistance(region.islands, region.places, a, b);

// ---------- Blocs: what the player can do (Bahay ng Datu level 4) ----------

export type BlocBlocker = "level" | "in-bloc" | "not-in-bloc" | "not-leader" | "unknown" | "tributary" | "trust" | "grudge" | "taken";

const politicsRules = (content: Content) => content.rules.politics;

/** Would this neighbor accept the player's invitation (or welcome the player into its bloc)? */
function wouldAccept(n: NeighborState, content: Content): BlocBlocker | null {
  const p = politicsRules(content);
  if (n.status === "tributary") return "tributary";
  if (n.grudge > p.maxGrudge) return "grudge";
  if (n.trust < p.joinTrust) return "trust";
  return null;
}

/**
 * Why a bloc action can't happen now, or null. Actions: form a bloc, invite a neighbor into the
 * player's bloc, ask to join a neighbor's bloc, leave, or expel a member.
 */
export function blocBlocker(state: GameState, content: Content, action: "form" | "invite" | "join" | "leave" | "expel", target?: string): BlocBlocker | null {
  const region = state.region;
  if (!region) return "unknown";
  if (!hasDatuUnlock(state, content, "alliances")) return "level";
  const me = state.barangay.id;
  const mine = blocOf(region.politics, me);
  switch (action) {
    case "form":
      return mine ? "in-bloc" : null;
    case "leave":
      return mine ? null : "not-in-bloc";
    case "invite": {
      if (!mine) return "not-in-bloc";
      if (mine.leader !== me) return "not-leader";
      const n = region.neighbors.find((x) => x.id === target);
      if (!n) return "unknown";
      if (blocOf(region.politics, n.id)) return "taken";
      return wouldAccept(n, content);
    }
    case "join": {
      if (mine) return "in-bloc";
      const bloc = region.politics.blocs.find((b) => b.id === target);
      const leader = region.neighbors.find((x) => x.id === bloc?.leader);
      if (!bloc || !leader) return "unknown";
      return wouldAccept(leader, content);
    }
    case "expel": {
      if (!mine) return "not-in-bloc";
      if (mine.leader !== me) return "not-leader";
      return target && target !== me && mine.members.includes(target) ? null : "unknown";
    }
  }
}

/** Applies a bloc action for the player, if allowed. Leaving and expelling cost trust. */
export function blocAction(state: GameState, content: Content, action: "form" | "invite" | "join" | "leave" | "expel", target?: string): GameState {
  if (blocBlocker(state, content, action, target) !== null) return state;
  const region = state.region!;
  const me = state.barangay.id;
  const p = politicsRules(content);
  const strength = strengthFn(state, content);
  let politics = region.politics;
  let neighbors = region.neighbors;
  let news: Omit<NewsItem, "id"> | null = null;
  const mine = blocOf(politics, me);
  switch (action) {
    case "form":
      politics = formBlocFor(politics, me);
      news = { time: state.time, key: "formed", barangay: me };
      break;
    case "invite":
      politics = joinBlocFor(politics, mine!.id, target!);
      news = { time: state.time, key: "joined", barangay: target, bloc: mine!.id };
      break;
    case "join":
      politics = joinBlocFor(politics, target!, me);
      news = { time: state.time, key: "joined", barangay: me, bloc: target };
      break;
    case "leave":
      neighbors = neighbors.map((n) => (mine!.members.includes(n.id) ? { ...n, trust: clamp100(n.trust - p.leaveTrustLoss) } : n));
      politics = leaveBlocFor(politics, me, strength);
      news = { time: state.time, key: "left", barangay: me, bloc: mine!.id };
      break;
    case "expel":
      neighbors = neighbors.map((n) => (n.id === target ? { ...n, trust: clamp100(n.trust - p.expelTrustLoss) } : n));
      politics = expelFor(politics, me, target!, strength);
      news = { time: state.time, key: "expelled", barangay: target, bloc: mine!.id };
      break;
  }
  let next: RegionState = { ...region, politics, neighbors };
  if (news) next = addNews(next, news);
  return checkVictory({ ...state, region: next });
}

// ---------- Politics over time ----------

/**
 * Scripted political events and the cost of war, once per whole game second crossed. At most
 * one event per minGapSeconds; the player's bloc is never changed by a script.
 */
export function updatePolitics(state: GameState, content: Content, t0: number, t1: number, maxEvents = Infinity): GameState {
  const region = state.region;
  if (!region || content.ai) return state;
  const p = politicsRules(content);
  let s = state;
  let r = region;
  let fired = 0;
  for (let second = Math.floor(t0 + EPSILON) + 1; second <= Math.floor(t1 + EPSILON); second++) {
    // Wars wear both sides down.
    if (r.politics.wars.length && second >= r.politics.nextWarTickAt) {
      // Wars between blocs leave blood debts between their leaders (feud.ts), told in the Balita.
      for (const w of r.politics.wars) {
        const a = blocById(r.politics, w.a)?.leader;
        const b = blocById(r.politics, w.b)?.leader;
        if (a && b) r = owe(owe(r, content, a, b, 1, second), content, b, a, 1, second);
      }
      const hurt = new Set(atWarMembers(r.politics));
      r = {
        ...r,
        politics: { ...r.politics, nextWarTickAt: second + p.warTickSeconds },
        neighbors: r.neighbors.map((n) => (hurt.has(n.id) && n.state.warriors > 0 ? { ...n, state: loseWarriors(n.state, Math.max(1, Math.floor((n.state.warriors * p.warLossPercent) / 100))) } : n)),
      };
    } else if (!r.politics.wars.length && second >= r.politics.nextWarTickAt) {
      r = { ...r, politics: { ...r.politics, nextWarTickAt: second + p.warTickSeconds } };
    }
    if (fired >= maxEvents || second < p.startsAfterSeconds) continue;
    if (r.politics.lastEventAt !== null && second - r.politics.lastEventAt < p.minGapSeconds) continue;
    if (rollAt(s.map.seed, second, 7800) >= p.chancePerSecond) continue;
    const me = s.barangay.id;
    const mine = blocOf(r.politics, me);
    const sNow = { ...s, region: r };
    const change = scriptedEvent(r.politics, content.politics, r.neighbors.map((n) => n.id), strengthFn(sNow, content), mine ? [mine.id] : [], s.map.seed, second);
    if (!change) continue;
    fired++;
    r = addNews({ ...r, politics: { ...change.politics, lastEventAt: second } }, { time: second, key: change.event.id, barangay: change.barangay, bloc: change.bloc, other: change.other });
  }
  return { ...s, region: r };
}

/** Total strength of the bloc a barangay belongs to (its own strength if none). */
export function blocPower(state: GameState, content: Content, id: string): number {
  const region = state.region;
  const strength = strengthFn(state, content);
  const bloc = region ? blocOf(region.politics, id) : undefined;
  return bloc ? blocStrength(bloc, strength) : strength(id);
}

/**
 * The player sends `percent` of the warriors at home to defend an ally attacked by `enemy`:
 * the enemy's warriors against the ally's own defense plus the warriors sent. Same battle
 * engine as any raid; losses on every side; trust with the ally and a grudge from the enemy.
 */
export function alliedBattle(state: GameState, content: Content, ally: string, enemy: string, percent: number): GameState {
  const region = state.region;
  const a = region?.neighbors.find((n) => n.id === ally);
  const e = region?.neighbors.find((n) => n.id === enemy);
  if (!region || !a || !e) return state;
  const m = content.rules.military;
  const d = content.rules.diplomacy;
  const sent = Math.floor((homeWarriors(state) * percent) / 100);
  if (sent < 1) return state;
  const attack = attackOf(e.state.warriors, content);
  const defense = defenseOf(a.state, content) + sent * m.warrior.defense;
  const battle = resolveBattle(attack, defense, rollAt(state.map.seed, Math.floor(state.time), 8800), content);
  // The same ending as any raid (warfare.ts): mostly wounded, few dead.
  const rolls = [0, 1, 2, 3, 4].map((k) => rollAt(state.map.seed, Math.floor(state.time) * 8 + k, 8801));
  const ours = endBattle(battle.attackerWins, e.state.warriors, sent, rolls, content, { defenderSteady: steadiness(state, content) });
  const theirs = endBattle(battle.attackerWins, e.state.warriors, a.state.warriors, rolls, content);
  let player = addWounded(loseWarriors(state, ours.defender.fallen), content, ours.defender.wounded);
  // Standing with an ally who held: honor for the named warriors who went (honor.ts).
  if (!battle.attackerWins) {
    let left = sent;
    player = { ...player, named: player.named.map((v) => (v.role === "warrior" && left-- > 0 ? addHonor(content, v, content.rules.honor.allyDefended).v : v)) };
  }
  const neighbors = region.neighbors.map((n) => {
    if (n.id === ally) return { ...n, state: loseWarriors(n.state, theirs.defender.fallen), trust: clamp100(n.trust + d.sandugo.trust) };
    if (n.id === enemy) return { ...n, state: loseWarriors(n.state, ours.attacker.fallen), grudge: clamp100(n.grudge + d.grudge.raidLost) };
    return n;
  });
  let next = addNews({ ...player.region!, neighbors }, { time: state.time, key: battle.attackerWins ? "ally-lost" : "ally-defended", barangay: ally, other: enemy });
  // Blood debts: our dead are owed by the enemy, and theirs by us.
  next = owe(owe(next, content, state.barangay.id, enemy, ours.defender.fallen, state.time), content, enemy, state.barangay.id, ours.attacker.fallen, state.time);
  return { ...player, region: next };
}

// ---------- Allies raided: the call for help ----------

/** The key in GameState.nextEventAt for the earliest next raid on an ally. */
export const ALLY_CALL_KEY = "allyCall";
/** Salts for the ally-call rolls (rollAt), so they never line up with other rolls. */
const ALLY_CALL_SALT = 9100;

/** The player's allies who can be raided: sandugo allies and bloc mates. */
export function raidableAllies(state: GameState): NeighborState[] {
  const region = state.region;
  if (!region) return [];
  const myBloc = blocOf(region.politics, state.barangay.id);
  return region.neighbors.filter((n) => n.status === "ally" || (myBloc?.members.includes(n.id) ?? false));
}

/** Who could raid this ally: an aggressive, independent barangay with warriors, not on its side. */
export function allyRaiders(state: GameState, content: Content, ally: string): NeighborState[] {
  const region = state.region;
  if (!region) return [];
  const bloc = blocOf(region.politics, ally);
  return region.neighbors.filter(
    (n) => n.id !== ally && n.status === "independent" && traitOf(content, n.id).raids && n.state.warriors > 0 && !(bloc?.members.includes(n.id) ?? false),
  );
}

/**
 * Starts a raid on `ally` by `from`: its messenger's call for help comes up as a choice event at
 * the Bahay ng Datu (content/events/choices/ally-call.json). The same state if it can't.
 */
export function startAllyCall(state: GameState, content: Content, ally: string, from: string, second: number): GameState {
  const region = state.region;
  const def = content.choices.find((c) => c.conditions.allyCall);
  if (!region || !def || region.allyCall || state.choice) return state;
  const c = content.rules.allyCalls;
  return {
    ...state,
    choice: { id: def.id, neighbor: ally, at: second, enemy: from },
    nextEventAt: { ...state.nextEventAt, [ALLY_CALL_KEY]: second + c.cooldownSeconds },
    region: { ...region, allyCall: { ally, from, strikeAt: second + c.warningSeconds } },
  };
}

/** One second of ally calls: maybe a new raid on an ally; a call still unanswered when the raid strikes is let go. */
function updateAllyCall(state: GameState, content: Content, second: number): GameState {
  const region = state.region!;
  const call = region.allyCall;
  if (call) return second >= call.strikeAt ? answerAllyCall(state, content, false) : state;
  const c = content.rules.allyCalls;
  if (second < c.startsAfterSeconds || second < (state.nextEventAt[ALLY_CALL_KEY] ?? 0) || state.choice || region.incomingRaid) return state;
  const seed = state.map.seed;
  if (rollAt(seed, second, ALLY_CALL_SALT) >= c.chancePerSecond) return state;
  const allies = raidableAllies(state).filter((a) => allyRaiders(state, content, a.id).length > 0);
  if (allies.length === 0) return state;
  const ally = allies[Math.floor(rollAt(seed, second, ALLY_CALL_SALT + 1) * allies.length)];
  const raiders = allyRaiders(state, content, ally.id);
  const from = raiders[Math.floor(rollAt(seed, second, ALLY_CALL_SALT + 2) * raiders.length)];
  return startAllyCall(state, content, ally.id, from.id, second);
}

/**
 * The datu answers the call (or it runs out): sending warriors fights beside the ally (the
 * same battle as defending an ally at war) and earns renown and trust; not sending costs trust,
 * and the ally fights alone. Either way the call and its choice event are done.
 */
export function answerAllyCall(state: GameState, content: Content, send: boolean): GameState {
  const call = state.region?.allyCall;
  if (!call) return state;
  const c = content.rules.allyCalls;
  const closed: GameState = {
    ...state,
    region: { ...state.region!, allyCall: null },
    choice: state.choice && content.choices.find((d) => d.id === state.choice!.id)?.conditions.allyCall ? null : state.choice,
  };
  if (send) {
    const fought = alliedBattle(closed, content, call.ally, call.from, c.sendPercent);
    // No warriors at home to send: the call can't be answered that way.
    if (fought === closed) return state;
    return { ...fought, kabantugan: fought.kabantugan + c.renown };
  }
  const lowered = adjustRelations(closed, content, call.ally, { trust: -c.ignoreTrust });
  return allyFightsAlone(lowered, content, call.ally, call.from);
}

/** An ally meets a raid with only its own warriors: losses on both sides, and the news. */
function allyFightsAlone(state: GameState, content: Content, ally: string, enemy: string): GameState {
  const region = state.region;
  const a = region?.neighbors.find((n) => n.id === ally);
  const e = region?.neighbors.find((n) => n.id === enemy);
  if (!region || !a || !e) return state;
  const battle = resolveBattle(attackOf(e.state.warriors, content), defenseOf(a.state, content), rollAt(state.map.seed, Math.floor(state.time), ALLY_CALL_SALT + 3), content);
  const allyLosses = casualties(a.state.warriors, battle.defenderLossPercent, battle.attackerWins);
  const enemyLosses = casualties(e.state.warriors, battle.attackerLossPercent, !battle.attackerWins);
  const neighbors = region.neighbors.map((n) =>
    n.id === ally ? { ...n, state: loseWarriors(n.state, allyLosses) } : n.id === enemy ? { ...n, state: loseWarriors(n.state, enemyLosses) } : n,
  );
  return { ...state, region: addNews({ ...region, neighbors }, { time: state.time, key: battle.attackerWins ? "ally-lost" : "ally-defended", barangay: ally, other: enemy }) };
}

// ---------- Battles end quickly; few die (W.1, warfare.ts) ----------

const SALT_BATTLE = 7701;

/** Seeded rolls for how a battle ends, from the map's seed and the battle's report id. */
function battleRolls(state: GameState, reportId: number): number[] {
  return [0, 1, 2, 3, 4].map((k) => rollAt(state.map.seed, reportId * 8 + k, SALT_BATTLE));
}

/**
 * Fiercer battles: a vengeance raid on us, or our raid on a barangay that owes us blood (feud.ts),
 * kill more. Steadier warriors (honor.ts) break later.
 */
function battleOpts(state: GameState, content: Content, neighbor: string, side: "attack" | "defense"): { fierce?: boolean; attackerSteady?: number; defenderSteady?: number } {
  const me = state.barangay.id;
  const f = feudsOf(state.region!);
  const fierce = side === "defense" ? !!state.region?.incomingRaid?.vengeance || !!state.region?.incomingRaid?.mourning : !!f.feuds.find((x) => x.wronged === me && x.offender === neighbor);
  // Honored warriors are steadier (honor.ts): ours, on whichever side we fight.
  const steady = steadiness(state, content);
  return { ...(fierce ? { fierce } : {}), ...(steady > 0 ? (side === "attack" ? { attackerSteady: steady } : { defenderSteady: steady }) : {}) };
}

/** The feuds of a region (none in older saves). */
export const feudsOf = (region: RegionState): FeudState => region.feuds ?? emptyFeuds();

/** Raiders who come: all their warriors, and more for a vengeance raid (kin and volunteers join it). */
function attackerCount(attacker: NeighborState, raid: IncomingRaid, content: Content): number {
  const extra = raid.vengeance || raid.mourning ? Math.ceil((attacker.state.warriors * content.rules.feud.vengeance.warriorsPercent) / 100) : 0;
  return attacker.state.warriors + extra;
}

/**
 * `offender` killed `count` of `wronged`'s people: a blood debt (feud.ts). If the player is the
 * offender, the wronged neighbor's grudge rises sharply and its kin (bloc mates, marriage and
 * sandugo partners) trust the player less. A new feud is told in the Balita.
 */
export function owe(region: RegionState, content: Content, wronged: string, offender: string, count: number, at: number, rank: "warrior" | "noble" | "datu" | "commoner" = "warrior"): RegionState {
  if (count <= 0) return region;
  const r = content.rules.feud;
  const { feuds, started } = recordBloodDebt(feudsOf(region), content, wronged, offender, Array.from({ length: count }, () => ({ rank, at })));
  let next: RegionState = { ...region, feuds };
  // The player is the one barangay that isn't a neighbor.
  if (!next.neighbors.some((n) => n.id === offender)) {
    const bloc = blocOf(next.politics, wronged);
    next = {
      ...next,
      neighbors: next.neighbors.map((n) =>
        n.id === wronged
          ? { ...n, grudge: clamp100(n.grudge + r.grudgeOnDeath * count) }
          : bloc?.members.includes(n.id)
            ? { ...n, trust: clamp100(n.trust - r.kinTrustLoss) }
            : n,
      ),
    };
  }
  if (started) next = addNews(next, { time: at, key: "feud-begun", barangay: wronged, other: offender });
  return next;
}

/** Raiding a barangay you sealed peace with: trust drops with every barangay, the peace is broken. */
function breakPeace(region: RegionState, content: Content, me: string, them: string, at: number): RegionState {
  const f = feudsOf(region);
  const peace = peaceOf(f, me, them);
  if (!peace) return region;
  const b = content.rules.feud.betrayal;
  return addNews(
    {
      ...region,
      feuds: { ...f, peaces: f.peaces.filter((p) => p !== peace) },
      neighbors: region.neighbors.map((n) => ({ ...n, trust: clamp100(n.trust - b.trustLossAll), ...(n.id === them ? { grudge: clamp100(n.grudge + b.grudge) } : {}) })),
    },
    { time: at, key: "peace-broken", barangay: me, other: them },
  );
}

/** A winning vengeance raid sets up to firesMax houses alight (fire.ts rules: put out, or damaged and repaired). */
function setFires(state: GameState, content: Content, second: number): GameState {
  const max = content.rules.feud.vengeance.firesMax;
  let n = 0;
  const buildings = state.buildings.map((b) => {
    if (n >= max || b.damaged || b.burningSince !== undefined || !content.buildings.find((d) => d.id === b.type)?.housing) return b;
    n++;
    return { ...b, burningSince: second };
  });
  return n ? { ...state, buildings } : state;
}



/** The report's fields for a battle's end, from our side ("attack": we raided; "defense": we were raided). */
function battleFields(end: BattleEnd, side: "attack" | "defense"): Partial<Report> {
  const ours = side === "attack" ? end.attacker : end.defender;
  const theirs = side === "attack" ? end.defender : end.attacker;
  return {
    wounded: { ours: ours.wounded, theirs: theirs.wounded },
    fallen: { ours: ours.fallen, theirs: theirs.fallen },
    captured: { ours: ours.captured, theirs: theirs.captured },
    broke: end.broke,
    reason: end.reason,
    withdrew: end.withdrew,
  };
}

/**
 * Records warriors held after a battle: `ours` of ours held by `neighbor`, `theirs` of theirs held
 * by us. One record per battle (both sides rarely lose warriors to capture at once: the beaten
 * side's are taken). Returns the region and the record's id, or null.
 */
function takeCaptives(region: RegionState, state: GameState, content: Content, neighbor: string, ours: number, theirs: number, at = state.time): { region: RegionState; id: number | null } {
  const b = content.rules.military.battle;
  const side: Captive["side"] | null = ours > 0 ? "ours" : theirs > 0 ? "theirs" : null;
  if (!side) return { region, id: null };
  const count = side === "ours" ? ours : theirs;
  const id = region.nextCaptiveId ?? 1;
  const captive: Captive = { id, side, neighbor, count, at, until: at + b.captiveSeconds, ransom: ransomFor(content, count) };
  return { region: { ...region, captives: [...(region.captives ?? []), captive], nextCaptiveId: id + 1 }, id };
}

/** Pay the ransom for our warriors held by another barangay: gold to them, and they come home. */
export function payRansom(state: GameState, content: Content, id: number): GameState {
  void content;
  const region = state.region;
  const c = region?.captives?.find((x) => x.id === id && x.side === "ours");
  if (!region || !c || state.resources.gold < c.ransom) return state;
  const neighbors = region.neighbors.map((n) => (n.id === c.neighbor ? { ...n, state: { ...n.state, resources: { ...n.state.resources, gold: n.state.resources.gold + c.ransom } } } : n));
  const captives = region.captives!.filter((x) => x !== c);
  return {
    ...state,
    resources: { ...state.resources, gold: state.resources.gold - c.ransom },
    region: addNews({ ...region, neighbors, captives }, { time: state.time, key: "ransomPaid", barangay: c.neighbor }),
  };
}

/**
 * Captives come home: ours when their time is up (or after a ransom); theirs too, or sooner when
 * their barangay pays us ransom (aiRansomAfterSeconds after the battle, if it has the gold).
 */
export function updateCaptives(state: GameState, content: Content, t: number): GameState {
  const region = state.region;
  if (!region?.captives?.length) return state;
  const b = content.rules.military.battle;
  let s = state;
  let r: RegionState = region;
  const keep: Captive[] = [];
  for (const c of region.captives) {
    const nb = r.neighbors.find((n) => n.id === c.neighbor);
    const pays = c.side === "theirs" && nb && t >= c.at + b.aiRansomAfterSeconds && nb.state.resources.gold >= c.ransom;
    if (t < c.until && !pays) {
      keep.push(c);
      continue;
    }
    if (c.side === "theirs" && nb) {
      // Their warriors go home (and they pay us, if they ransomed them).
      const gold = pays ? c.ransom : 0;
      r = {
        ...r,
        neighbors: r.neighbors.map((n) =>
          n.id === c.neighbor ? { ...n, state: { ...n.state, warriors: n.state.warriors + c.count, villagers: n.state.villagers + c.count, resources: { ...n.state.resources, gold: n.state.resources.gold - gold } } } : n,
        ),
      };
      if (gold > 0) {
        s = { ...s, resources: { ...s.resources, gold: s.resources.gold + gold } };
        r = addNews(r, { time: t, key: "ransomReceived", barangay: c.neighbor });
      } else r = addNews(r, { time: t, key: "captivesFreed", barangay: c.neighbor });
    } else r = addNews(r, { time: t, key: "captivesHome", barangay: c.neighbor });
  }
  return { ...s, region: { ...r, captives: keep } };
}

const SALT_MOURN = 7811;
const SALT_MOURN_WHO = 7812;

/**
 * A datu dies (rarely, per second rules.feud.mourningRaid.chancePerSecond): told in the Balita.
 * Their barangay goes on a mourning raid against a rival: the player, if it holds a grudge or a
 * blood debt against them (a raid on its way, fierce), else the leader of a bloc at war with its
 * own (a blood debt between them, in the Balita). A Visayan practice; flagged for review.
 */
export function mourningRaid(state: GameState, content: Content, second: number): GameState {
  const region = state.region!;
  if (rollAt(state.map.seed, second, SALT_MOURN) >= content.rules.feud.mourningRaid.chancePerSecond || region.neighbors.length === 0) return state;
  const n = region.neighbors[Math.floor(rollAt(state.map.seed, second, SALT_MOURN_WHO) * region.neighbors.length)];
  let r = addNews(region, { time: second, key: "datu-died", barangay: n.id });
  if (n.status !== "independent" || n.state.warriors < 1) return { ...state, region: r };
  const me = state.barangay.id;
  const owed = feudsOf(r).feuds.some((f) => f.wronged === n.id && f.offender === me);
  if (!r.incomingRaid && (owed || n.grudge >= content.rules.diplomacy.grudge.noAlliancesAbove)) {
    r = { ...r, incomingRaid: { ...startRaid({ ...state, region: r }, content, n.id, second), mourning: true } };
    return { ...state, region: addNews(r, { time: second, key: "mourning-raid", barangay: n.id, other: me }) };
  }
  const own = blocOf(r.politics, n.id);
  const war = own ? r.politics.wars.find((w) => w.a === own.id || w.b === own.id) : undefined;
  const rival = war ? blocById(r.politics, war.a === own!.id ? war.b : war.a)?.leader : undefined;
  if (!rival) return { ...state, region: r };
  r = owe(r, content, rival, n.id, 1, second);
  return { ...state, region: addNews(r, { time: second, key: "mourning-raid", barangay: n.id, other: rival }) };
}

// ---------- Settling a feud (W.3, feud.ts) ----------

/** A feud the player is part of, by id. */
const playerFeud = (state: GameState, id: number) => {
  const me = state.barangay.id;
  return feudsOf(state.region!).feuds.find((f) => f.id === id && (f.wronged === me || f.offender === me));
};

/** The other barangay in a feud with the player. */
const otherSide = (state: GameState, f: Feud) => (f.wronged === state.barangay.id ? f.offender : f.wronged);

const replaceFeud = (region: RegionState, f: Feud): RegionState => {
  const fs = feudsOf(region);
  return { ...region, feuds: { ...fs, feuds: fs.feuds.map((x) => (x.id === f.id ? f : x)) } };
};

export type MediationBlocker = "unknown" | "done" | "retry" | "no-elder" | "no-babaylan" | "no-datu" | null;

/** A neutral datu trusted by the player who could carry the talks: not the other side, trusted enough. */
export function neutralDatu(state: GameState, content: Content, f: Feud): NeighborState | undefined {
  const other = otherSide(state, f);
  const min = content.rules.feud.mediation.datuMinTrust;
  return state.region!.neighbors.filter((n) => n.id !== other && n.trust >= min && !feudsOf(state.region!).feuds.some((x) => x.wronged === n.id || x.offender === n.id)).sort((a, b) => b.trust - a.trust)[0];
}

/** Why a go-between can't try now: no elder in the barangay, no healer's hut, no neutral datu, tried too recently. */
export function mediationBlocker(state: GameState, content: Content, id: number, by: Mediator): MediationBlocker {
  const f = playerFeud(state, id);
  if (!f) return "unknown";
  if (f.mediated) return "done";
  if (f.failedAt !== undefined && state.time - f.failedAt < content.rules.feud.mediation.retrySeconds) return "retry";
  if (by === "elder" && !state.residents.some((r) => r.age === "elder")) return "no-elder";
  if (by === "babaylan" && !state.buildings.some((b) => !b.damaged && content.buildings.find((d) => d.id === b.type)?.heals)) return "no-babaylan";
  if (by === "datu" && !neutralDatu(state, content, f)) return "no-datu";
  return null;
}

/** The chance (0..1) a go-between brings both sides to talk: their standing, the other side's trust, the feud's heat. */
export function mediationChance(state: GameState, content: Content, f: Feud, by: Mediator): number {
  const m = content.rules.feud.mediation;
  const other = state.region!.neighbors.find((n) => n.id === otherSide(state, f));
  const pct = m.base + m[by] + m.trustWeight * (other?.trust ?? 0) - m.heatWeight * f.heat;
  return Math.min(0.95, Math.max(0.05, pct / 100));
}

const SALT_MEDIATE = 7901;

/** Step 1: a go-between carries the talks. A failed attempt can be tried again later. */
export function mediate(state: GameState, content: Content, id: number, by: Mediator): GameState {
  if (mediationBlocker(state, content, id, by) !== null) return state;
  const f = playerFeud(state, id)!;
  const roll = rollAt(state.map.seed, Math.floor(state.time) * 16 + f.id, SALT_MEDIATE);
  const ok = roll < mediationChance(state, content, f, by);
  const next: Feud = ok ? { ...f, mediated: { by, at: state.time }, price: bloodPrice(content, f) } : { ...f, failedAt: state.time };
  return addFlag({ ...state, region: replaceFeud(state.region!, next) }, "mediation");
}

export type PriceOutcome = "paid" | "countered" | "short" | "blocked";

/**
 * Step 2: the blood price (bayad sa dugo). The player offers (or, when owed, asks) `offer`.
 * Owed by the player: the wronged side takes it if it's within acceptWithinPercent of what they
 * ask, and the whole barangay pays together; else they counter, meeting halfway. Owed to the
 * player: they pay what's asked if it's fair and they can, else they counter with counterPercent.
 * Paid in the goods in rules.feud.price (gold, Palay, rice wine; heirlooms later, unchanged here).
 */
export function offerBloodPrice(state: GameState, content: Content, id: number, offer: ResourceAmounts): { state: GameState; outcome: PriceOutcome } {
  const f = playerFeud(state, id);
  if (!f || !f.mediated || f.paid) return { state, outcome: "blocked" };
  const p = content.rules.feud.price;
  const ask = f.price ?? bloodPrice(content, f);
  const askValue = priceValue(content, bloodPrice(content, f));
  const value = priceValue(content, offer);
  const me = state.barangay.id;
  const otherId = otherSide(state, f);
  const n = state.region!.neighbors.find((x) => x.id === otherId);
  if (!n) return { state, outcome: "blocked" };
  const settle = (payer: "player" | "them", goods: ResourceAmounts): GameState => {
    let player: GameState;
    let them: GameState;
    if (payer === "player") [player, them] = moveGoods(state, n.state, goods);
    else [them, player] = moveGoods(n.state, state, goods);
    const region = replaceFeud(
      { ...state.region!, neighbors: state.region!.neighbors.map((x) => (x.id === otherId ? { ...x, state: them } : x)) },
      { ...f, price: goods, paid: true },
    );
    return { ...player, region };
  };
  if (f.offender === me) {
    if (!canAfford(state, asCost(offer))) return { state, outcome: "short" };
    if (value >= askValue * (1 - p.acceptWithinPercent / 100)) return { state: settle("player", offer), outcome: "paid" };
    // They meet the player halfway between the offer and what they ask.
    const counter = Object.fromEntries(Object.keys({ ...ask, ...offer }).map((k) => [k, Math.ceil(((ask[k as Resource] ?? 0) + (offer[k as Resource] ?? 0)) / 2)])) as ResourceAmounts;
    return { state: { ...state, region: replaceFeud(state.region!, { ...f, price: counter }) }, outcome: "countered" };
  }
  // They owe the player: a fair ask they can pay, they pay.
  const fair = value <= askValue * (1 + p.acceptWithinPercent / 100);
  if (fair && canAfford(n.state, asCost(offer))) return { state: settle("them", offer), outcome: "paid" };
  const counter = scalePrice(bloodPrice(content, f), p.counterPercent);
  return { state: { ...state, region: replaceFeud(state.region!, { ...f, price: counter }) }, outcome: "countered" };
}

export type SealBlocker = "unknown" | "unpaid" | "cost" | "married" | null;

/** What sealing the peace costs: a sandugo with rice wine, a shared Pista with gifts, or the marriage alliance's cost. */
export function sealCost(content: Content, by: SealKind): ResourceAmounts {
  const s = content.rules.feud.seal;
  if (by === "sandugo") return { wine: s.sandugoWine };
  if (by === "pista") return s.pistaGifts;
  return content.rules.diplomacy.marriage.cost;
}

export function sealBlocker(state: GameState, content: Content, id: number, by: SealKind): SealBlocker {
  const f = playerFeud(state, id);
  if (!f) return "unknown";
  if (!f.paid) return "unpaid";
  if (by === "marriage" && state.region!.neighbors.find((n) => n.id === otherSide(state, f))?.marriage) return "married";
  if (!canAfford(state, asCost(sealCost(content, by)))) return "cost";
  return null;
}

/**
 * Step 3: seal the peace with a sandugo (rice wine), a shared Pista with gifts, or a marriage
 * between the two families. The feud ends, the blood debt is cleared, and trust rises for good.
 */
export function sealPeace(state: GameState, content: Content, id: number, by: SealKind): GameState {
  if (sealBlocker(state, content, id, by) !== null) return state;
  const f = playerFeud(state, id)!;
  const otherId = otherSide(state, f);
  const s = content.rules.feud.seal;
  const n = state.region!.neighbors.find((x) => x.id === otherId)!;
  const [player, them] = moveGoods(state, n.state, sealCost(content, by));
  const fs = feudsOf(state.region!);
  const me = state.barangay.id;
  let region: RegionState = {
    ...state.region!,
    feuds: { ...fs, feuds: fs.feuds.filter((x) => x.id !== f.id && !(x.wronged === otherId && x.offender === me) && !(x.wronged === me && x.offender === otherId)), peaces: [...fs.peaces.filter((p) => !((p.a === me && p.b === otherId) || (p.b === me && p.a === otherId))), { a: me, b: otherId, at: state.time, by }] },
    neighbors: state.region!.neighbors.map((x) => (x.id === otherId ? { ...x, state: them, trust: clamp100(x.trust + s.trustBonus), grudge: 0, ...(by === "marriage" ? { marriage: true } : {}) } : x)),
  };
  region = addNews(region, { time: state.time, key: "feud-settled", barangay: me, other: otherId });
  return addFlag({ ...player, region }, "peace-made");
}

/** Aklat entries met in war (W.9): a battle fought, warriors held for ransom, a feud with the player. */
function warFlags(state: GameState): GameState {
  const me = state.barangay.id;
  const flags = new Set(state.flags);
  flags.add("raid-fought");
  if (state.region?.captives?.length) flags.add("captives");
  if (feudsOf(state.region!).feuds.some((f) => f.wronged === me || f.offender === me)) flags.add("feud");
  return flags.size === state.flags.length ? state : { ...state, flags: [...flags] };
}
