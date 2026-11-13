// The region: AI neighbor barangays along the river, warriors, war and diplomacy.
// Pure and deterministic. Each neighbor is a full GameState run by the same engine rules as
// the player (tick + commands), steered by a simple AI. All randomness comes from the seeded
// RNG in the player's state, rolled once per whole game second.
import { RESOURCES, type Content, type NeighborDef, type Resource, type TraitDef } from "./content";
import { apply, canAfford, asCost, buildingCost, housing, newGame, owned, placeAuto, rates, tick, type GameState } from "./game";
import { autoPlaceTile } from "./map";
import { Rng } from "./rng";
import { borderDefense, chooseLanding } from "./border";
import type { Point } from "./map";

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
  /** Raids on the player: where it was fought, warriors too far away to arrive in time, and whether a Kuta covered the landing. */
  landing?: Point;
  late?: number;
  covered?: boolean;
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
}

const EPSILON = 1e-9;
const MAX_REPORTS = 12;
const clamp100 = (v: number) => Math.min(100, Math.max(0, v));

// ---------- Setup ----------

const aiContents = new WeakMap<Content, Content>();
/** AI neighbors share the player's rules, minus random disasters and choice events (nobody is there to fight fires or decide). */
export function aiContent(content: Content): Content {
  let c = aiContents.get(content);
  if (!c) {
    c = { ...content, events: { hunger: content.events.hunger, seasons: content.events.seasons }, choices: [] };
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
  return {
    ...s,
    villagers: def.start.villagers,
    warriors: def.start.warriors,
    resources: { ...s.resources, ...asCost(def.start.resources) },
  };
}

export function createRegion(content: Content, time: number, seed: number): RegionState {
  const d = content.rules.diplomacy;
  return {
    neighbors: content.neighbors.map((def, i) => ({
      id: def.id,
      state: newNeighborState(content, def, seed),
      trust: def.trust,
      influence: d.startInfluence,
      status: "independent",
      marriage: false,
      loyalty: 0,
      guard: null,
      raidCooldownUntil: 0,
      // Stagger AI decisions so the neighbors don't all act on the same second.
      nextDecisionAt: Math.floor(time) + d.aiDecisionSeconds + i * 3,
    })),
    renown: 0,
    truceUntil: Math.floor(time) + d.truceSeconds,
    incomingRaid: null,
    nextAiRaidAt: 0,
    offer: null,
    reports: [],
    nextReportId: 1,
    nextTributeAt: Math.floor(time) + d.tribute.everySeconds,
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
  const away = state.region?.neighbors.reduce((n, nb) => n + (nb.guard?.warriors ?? 0), 0) ?? 0;
  return Math.max(0, state.warriors - away);
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

/** Turns a villager into a Mandirigma, for the warrior cost. Needs a healthy villager who isn't one yet. */
export function train(state: GameState, content: Content): GameState {
  const cost = asCost(content.rules.military.warrior.cost);
  const free = state.villagers - state.warriors - state.sick.length;
  if (free < 1 || !canAfford(state, cost)) return state;
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
  return [addReport(region, { time, kind: "tributary", neighbor: n.id }), tributary];
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
      if (change.influence > 0) [r, next] = addInfluence(r, next, change.influence, content, state.time);
      else if (next.status === "independent") next = { ...next, influence: clamp100(next.influence + change.influence) };
    }
    return [{ ...state, region: r }, next];
  });
}

/** Trade: give a parcel of one resource for the other. Builds trust and influence; keeps tributaries loyal. */
export function trade(state: GameState, content: Content, id: string, give: Resource): GameState {
  const t = content.rules.diplomacy.trade;
  return withNeighbor(state, id, (n, region) => {
    const get = RESOURCES.find((r) => r !== give)!;
    const trait = traitOf(content, id);
    const receive = Math.floor((t.give * (t.receivePercent + trait.tradeBonusPercent)) / 100);
    if (state.resources[give] < t.give || n.state.resources[get] < receive) return null;
    let [player, them] = moveGoods(state, n.state, { [give]: t.give });
    [them, player] = moveGoods(them, player, { [get]: receive });
    let next: NeighborState = { ...n, state: them, trust: addTrust(n, t.trust, trait) };
    if (next.status === "tributary") next = { ...next, loyalty: clamp100(next.loyalty + t.loyalty) };
    let r = addPath(region, "trade");
    [r, next] = addInfluence(r, next, t.influence, content, state.time);
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
  if (n.trust <= m.trustNeeded) return "trust";
  if (!canAfford(state, asCost(m.cost))) return "cost";
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
    [r, next] = addInfluence(r, next, m.influence, content, state.time);
    return [{ ...player, region: r }, next];
  });
}

/** Sandugo: a blood compact with a family you have married into. Makes them an ally (mutual defense). */
export function sandugo(state: GameState, content: Content, id: string): GameState {
  const sd = content.rules.diplomacy.sandugo;
  return withNeighbor(state, id, (n, region) => {
    if (!n.marriage || n.status === "ally" || !canAfford(state, asCost(sd.cost))) return null;
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
  let next: NeighborState = {
    ...target,
    state: them,
    trust: clamp100(target.trust - d.raid.trustLossTarget),
    marriage: false,
    raidCooldownUntil: state.time + d.raid.cooldownSeconds,
  };
  if (battle.attackerWins) {
    // Every neighbor hears of it.
    region = {
      ...region,
      renown: region.renown + d.raid.renown,
      neighbors: region.neighbors.map((n) => (n.id === id ? n : { ...n, trust: clamp100(n.trust - d.raid.trustLossAll) })),
    };
    region = addPath(region, "mangayaw");
    [region, next] = addInfluence(region, next, d.raid.influence, content, state.time);
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
  const offer = state.region?.offer;
  if (!offer || state.time > offer.expiresAt) return state;
  const t = content.rules.diplomacy.trade;
  const cleared = { ...state, region: { ...state.region!, offer: null } };
  return withNeighbor(cleared, offer.from, (n, region) => {
    if (state.resources[offer.want.resource] < offer.want.amount || n.state.resources[offer.give.resource] < offer.give.amount) return null;
    let [player, them] = moveGoods(cleared, n.state, { [offer.want.resource]: offer.want.amount });
    [them, player] = moveGoods(them, player, { [offer.give.resource]: offer.give.amount });
    let next: NeighborState = { ...n, state: them, trust: addTrust(n, t.trust, traitOf(content, n.id)) };
    if (next.status === "tributary") next = { ...next, loyalty: clamp100(next.loyalty + t.loyalty) };
    let r = addPath(region, "trade");
    [r, next] = addInfluence(r, next, t.influence, content, state.time);
    return [{ ...player, region: r }, next];
  });
}

export function declineOffer(state: GameState): GameState {
  return state.region?.offer ? { ...state, region: { ...state.region, offer: null } } : state;
}

function checkVictory(state: GameState): GameState {
  const region = state.region;
  if (!region || region.victory || region.neighbors.length === 0) return state;
  if (!region.neighbors.every((n) => n.status === "tributary" || n.status === "ally")) return state;
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
  region.neighbors = region.neighbors.map((n) => ({ ...n, state: tick(n.state, ai, dt) }));

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
  return checkVictory({ ...s, rng: rng.seed });
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

  // Trade offers: one at a time, from neighbors that still trust the player a little.
  if (region.offer && second >= region.offer.expiresAt) region = { ...region, offer: null };
  if (!region.offer) {
    for (const n of region.neighbors) {
      if (n.trust < 10) continue;
      if (rng.next() >= d.offers.chancePerSecond * traitOf(content, n.id).offerChanceMultiplier) continue;
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

  const allies = region.neighbors
    .filter((n) => n.status === "ally" && n.id !== attacker.id)
    .reduce((sum, n) => sum + (n.state.warriors * m.warrior.defense * d.sandugo.allyDefensePercent) / 100, 0);
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
  });
  return { ...player, region: next };
}
