// The region: AI neighbor barangays along the river, warriors, war and diplomacy.
// Pure and deterministic. Each neighbor is a full GameState run by the same engine rules as
// the player (tick + commands), steered by a simple AI. All randomness comes from the seeded
// RNG in the player's state, rolled once per whole game second.
import { counted, dailyFactor, relationshipDays, tradeValueFactor, type Today } from "./limits";
import { updateDoors } from "./doors";
import { newFame, type Fame } from "./ranking";
import { datuInfluenceMultiplier } from "./datu";
import { RESOURCES, type Content, type NeighborDef, type RefusalReason, type Resource, type TraitDef } from "./content";
import { apply, canAfford, asCost, buildingCost, housing, newGame, owned, placeAuto, rates, tick, warriorCap, type GameState } from "./game";
import { autoPlaceTile } from "./map";
import { Rng } from "./rng";
import { proposeTrade, type CounterOffer, type Proposal } from "./trading";
import { borderDefense, chooseLanding } from "./border";
import type { Point } from "./map";
import { generateArchipelago, islandDistance, sameIsland, travelSeconds, type Island, type Place } from "./archipelago";
import {
  absorbed,
  atWarMembers,
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
  /** Raids on the player: where it was fought, warriors too far away to arrive in time, and whether a Kuta covered the landing. */
  landing?: Point;
  late?: number;
  covered?: boolean;
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
  return Math.max(0, state.warriors - guarding - atSea);
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

/** Takes `percent` of each resource from one state: returns what was taken. */
function takeShare(from: GameState, percent: number): Partial<Record<Resource, number>> {
  const out: Partial<Record<Resource, number>> = {};
  for (const r of RESOURCES) out[r] = Math.floor((from.resources[r] * percent) / 100);
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
  const get = RESOURCES.find((r) => r !== give)!;
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

  const rng = new Rng(state.rng);
  const attack = attackOf(warriors, content);
  const defense = defenseOf(target.state, content);
  const battle = resolveBattle(attack, defense, rng.next(), content);
  const ourLosses = casualties(warriors, battle.attackerLossPercent, !battle.attackerWins);
  const theirLosses = casualties(target.state.warriors, battle.defenderLossPercent, battle.attackerWins);

  let player = loseWarriors({ ...state, rng: rng.seed }, ourLosses);
  let them = loseWarriors(target.state, theirLosses);
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
    loot,
    renown: battle.attackerWins ? d.raid.renown : 0,
    renownFactor,
  });
  const i = region.neighbors.findIndex((n) => n.id === id);
  const neighbors = [...region.neighbors];
  neighbors[i] = next;
  return checkVictory({ ...player, region: { ...region, neighbors } });
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
  if (s.resources.rice < 5) {
    for (let i = 0; i < 20; i++) s = apply(s, ai, { type: "gather", resource: "rice" });
  }
  const tryBuild = (id: string): GameState | null => {
    const def = ai.buildings.find((b) => b.id === id);
    if (!def) return null;
    if (!canAfford(s, buildingCost(ai, def, owned(s, id)))) return null;
    const tile = autoPlaceTile(s, ai, def);
    if (!tile) return null;
    const built = apply(s, ai, { type: "build", building: id, x: tile.x, y: tile.y });
    return built === s ? null : built;
  };
  const net = rates(s, ai).net.rice;
  const wantWarriors = Math.floor((s.villagers * trait.warriorPercent) / 100);
  const walls = ai.buildings.filter((b) => b.defense).reduce((n, b) => n + owned(s, b.id), 0);
  const camps = owned(s, "woodcutter-camp");
  const fields = owned(s, "palayan");
  const plan: (() => GameState | null)[] = [
    () => (net < 0.2 ? tryBuild("palayan") : null),
    () => (s.villagers >= housing(s, ai) ? tryBuild("bahay-kubo") : null),
    () => (s.warriors < wantWarriors ? (train(s, ai) === s ? null : train(s, ai)) : null),
    () => (walls < 1 + Math.floor(s.villagers / 15) ? tryBuild("kuta") : null),
    () => (camps * 2 < fields ? tryBuild("woodcutter-camp") : tryBuild("palayan")),
  ];
  for (const step of plan) {
    const next = step();
    if (next) return next;
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
  const ai = aiContent(content);
  const d = content.rules.diplomacy;
  const t1 = t0 + dt;
  let s: GameState = state;
  let region: RegionState = { ...state.region };

  // Neighbors live their own lives.
  // Grudges fade slowly.
  region.neighbors = region.neighbors.map((n) => ({
    ...n,
    state: tick(n.state, ai, dt),
    grudge: n.grudge > 0 ? Math.max(0, n.grudge - (d.grudge.decayPerMinute * dt) / 60) : n.grudge,
  }));
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

  // A raid on the player strikes when its warning runs out.
  if (region.incomingRaid && second >= region.incomingRaid.strikeAt) s = aiRaidStrikes(s, content, second, rng);
  region = { ...s.region! };

  // New raids, after the truce: only aggressive, independent neighbors with warriors.
  if (!region.incomingRaid && second >= region.truceUntil && second >= region.nextAiRaidAt) {
    for (const n of region.neighbors) {
      if (n.status !== "independent" || !traitOf(content, n.id).raids || n.state.warriors < 1) continue;
      if (rng.next() < d.aiRaid.chancePerSecond) {
        region = { ...region, incomingRaid: { from: n.id, strikeAt: second + d.aiRaid.warningSeconds, landing: chooseLanding(s, content, second) } };
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
      const want = RESOURCES.find((r) => r !== give)!;
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
  const m = content.rules.military;
  const region = state.region!;
  const raid = region.incomingRaid!;
  const i = region.neighbors.findIndex((n) => n.id === raid.from);
  const attacker = region.neighbors[i];
  const base = { ...region, incomingRaid: null, nextAiRaidAt: second + d.aiRaid.cooldownSeconds };
  // Called off if they're no longer hostile or have no warriors left.
  if (!attacker || attacker.status !== "independent" || attacker.state.warriors < 1) return { ...state, region: base };

  const helpers = alliedDefenders(state, content).filter((a) => a.arrives && a.id !== attacker.id);
  const allies = helpers.reduce((sum, a) => sum + (a.warriors * m.warrior.defense * d.sandugo.allyDefensePercent) / 100, 0);
  const attack = attackOf(attacker.state.warriors, content);
  // The battle is at the landing: only warriors who get there in time fight, and each Kuta
  // counts in full only if the landing is within its radius. Allies come too (by boat).
  const landing = raid.landing ?? chooseLanding(state, content, raid.strikeAt - d.aiRaid.warningSeconds);
  const border = landing ? borderDefense(state, content, landing, d.aiRaid.warningSeconds) : null;
  const defense = (border ? border.defense : defenseOf(state, content)) + allies;
  const battle = resolveBattle(attack, defense, rng.next(), content);
  const defenders = border ? border.muster.joined : homeWarriors(state);
  const ourLosses = casualties(defenders, battle.defenderLossPercent, battle.attackerWins);
  const theirLosses = casualties(attacker.state.warriors, battle.attackerLossPercent, !battle.attackerWins);

  let player = loseWarriors(state, ourLosses);
  let them = loseWarriors(attacker.state, theirLosses);
  let lost: Partial<Record<Resource, number>> = {};
  if (battle.attackerWins) {
    lost = takeShare(player, d.aiRaid.lootPercent);
    [player, them] = moveGoods(player, them, lost);
  }
  const neighbors = [...base.neighbors];
  neighbors[i] = { ...attacker, state: them };
  let next: RegionState = { ...base, neighbors, renown: base.renown + (battle.attackerWins ? 0 : d.aiRaid.defendRenown) };
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
    lost,
    renown: battle.attackerWins ? 0 : d.aiRaid.defendRenown,
    ...(landing && border ? { landing, late: border.muster.late, covered: border.muster.covered } : {}),
    ...(helpers.length ? { allies: helpers.map((a) => a.id) } : {}),
  });
  if (!battle.attackerWins) player = { ...player, stats: { ...player.stats, raidsDefended: player.stats.raidsDefended + 1 } };
  return { ...player, region: next };
}

// ---------- Allies at the border ----------

/** An ally who could come to defend the player, and whether they arrive within the raid warning. */
export interface AllyDefender {
  id: string;
  warriors: number;
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
export function alliedDefenders(state: GameState, content: Content): AllyDefender[] {
  const region = state.region;
  if (!region) return [];
  const a = content.rules.allyDefense;
  const warning = content.rules.diplomacy.aiRaid.warningSeconds;
  const me = state.barangay.id;
  const myBloc = blocOf(region.politics, me);
  return region.neighbors
    .filter((n) => (n.status === "ally" || myBloc?.members.includes(n.id)) && n.state.warriors > 0)
    .map((n) => {
      const land = sameIsland(region.places, me, n.id);
      const eta = land
        ? Math.round(a.landSeconds + islandDistanceWithin(region, me, n.id) * a.landSecondsPerUnit)
        : n.state.villagers >= a.balangayMinVillagers
          ? travelSeconds(content, region.islands, region.places, n.id, me)
          : null;
      return { id: n.id, warriors: n.state.warriors, eta, arrives: eta !== null && eta <= warning, by: land ? ("land" as const) : ("sea" as const) };
    });
}

/** Straight-line distance between two barangays' spots on the regional map. */
function islandDistanceWithin(region: RegionState, a: string, b: string): number {
  const pa = region.places[a];
  const pb = region.places[b];
  return pa && pb ? Math.hypot(pa.x - pb.x, pa.y - pb.y) : 0;
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
  const ourLosses = casualties(sent, battle.defenderLossPercent, battle.attackerWins);
  const allyLosses = casualties(a.state.warriors, battle.defenderLossPercent, battle.attackerWins);
  const enemyLosses = casualties(e.state.warriors, battle.attackerLossPercent, !battle.attackerWins);
  const player = loseWarriors(state, ourLosses);
  const neighbors = region.neighbors.map((n) => {
    if (n.id === ally) return { ...n, state: loseWarriors(n.state, allyLosses), trust: clamp100(n.trust + d.sandugo.trust) };
    if (n.id === enemy) return { ...n, state: loseWarriors(n.state, enemyLosses), grudge: clamp100(n.grudge + d.grudge.raidLost) };
    return n;
  });
  const next = addNews({ ...region, neighbors }, { time: state.time, key: battle.attackerWins ? "ally-lost" : "ally-defended", barangay: ally, other: enemy });
  return { ...player, region: next };
}
