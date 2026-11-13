// Expedition records: what happened on a trade or raid, kept so it can be replayed. The
// engine decides every outcome first; a record only writes down what it decided (who went,
// where they landed, who met them, what was taken), so the replay can never change anything.
// Records are plain JSON, so a later online version can store one and show it to both sides.
// Pure and deterministic, like the rest of the engine.
import { RESOURCES, type Content, type Resource } from "./content";
import type { Command, GameState } from "./game";
import { sameIsland } from "./archipelago";
import { travelSeconds } from "./border";
import type { Point } from "./map";
import type { Muster } from "./border";
import type { NamedVillager } from "./people";
import { neighborDef, standardProposal, type AllyDefender, type Report } from "./region";
import type { Goods } from "./trading";
import { generateVillage, raidPreview } from "./village";

/** A named villager on an expedition, and whether they fell. */
export interface ExpeditionMember {
  name: string;
  story: string;
  fell: boolean;
}

/** One side of a battle: whose warriors, how many, and the named ones among them. */
export interface ExpeditionSide {
  barangay: string;
  count: number;
  named: ExpeditionMember[];
}

/** A group of defenders setting out for the landing: from where, how many, how long the walk is, and whether they made it. */
export interface ExpeditionPost {
  from: Point;
  warriors: number;
  seconds: number | null;
  arrives: boolean;
}

/** An ally who could come to the defenders' aid, and whether they arrived in time. */
export interface ExpeditionAlly {
  id: string;
  warriors: number;
  eta: number | null;
  arrives: boolean;
  by: "land" | "sea";
}

/** The battle at the landing, exactly as the engine resolved it. */
export interface BattleLog {
  defenders: ExpeditionSide & { posts: ExpeditionPost[]; late: number };
  allies: ExpeditionAlly[];
  /** The Kutas' share of the defense, and whether any Kuta covered the landing in full. */
  kutaBonus: number;
  covered: boolean;
  attack: number;
  defense: number;
  /** The attacker's chance to win. */
  chance: number;
  attackerWins: boolean;
  attackerLosses: number;
  defenderLosses: number;
  /** Goods the attackers carried off (empty if they lost). */
  loot: Partial<Record<Resource, number>>;
}

export type ExpeditionKind = "trade" | "raid";
export type Boat = "bangka" | "balangay" | "karakoa";

export interface Expedition {
  id: number;
  kind: ExpeditionKind;
  /** Who set out and where to (barangay ids: the player's own id, or a neighbor's). */
  from: string;
  to: string;
  /** "out": the player's own expedition; "in": raiders coming to the player's shore. */
  side: "out" | "in";
  departAt: number;
  arriveAt: number;
  /** Crossed the open sea to another island. */
  sea: boolean;
  boat: Boat;
  /** The way on the regional map: from the start's place to the target's. */
  route: Point[];
  /** Where the boat landed on the target's map (raids), or null (trades tie up at the dock). */
  landing: Point | null;
  /** The ones who went: envoys or raiders. */
  party: ExpeditionSide;
  trade?: { gave: Goods; got: Goods };
  battle?: BattleLog;
  /** The battle report it goes with, if any. */
  reportId?: number;
}

const placeOf = (state: GameState, id: string): Point => {
  const p = state.region?.places[id];
  return p ? { x: p.x, y: p.y } : { x: 0, y: 0 };
};

const crossesSea = (state: GameState, a: string, b: string) => {
  const places = state.region?.places;
  return !!places && !!places[a] && !!places[b] && !sameIsland(places, a, b);
};

/** The first `count` named warriors of a barangay, in naming order: the named ones in a force of that size. */
export function namedWarriors(named: NamedVillager[], count: number): ExpeditionMember[] {
  return named
    .filter((v) => v.role === "warrior")
    .slice(0, Math.max(0, count))
    .map((v) => ({ name: v.name, story: v.story, fell: false }));
}

/** Adds a record, keeping the newest rules.expeditions.keep. */
export function addExpedition(state: GameState, content: Content, e: Omit<Expedition, "id">): GameState {
  const keep = content.rules.expeditions.keep;
  const record: Expedition = { ...e, id: state.nextExpeditionId };
  return { ...state, expeditions: [...state.expeditions, record].slice(-keep), nextExpeditionId: state.nextExpeditionId + 1 };
}

/** Where a voyage left from and when it arrived, for an action done on another island. */
export interface Arrival {
  departAt: number;
  arriveAt: number;
}

/**
 * After a command (or a Balangay arriving with one): if it was a trade that went through or a
 * raid that was fought, adds its record. `before` and `after` are the states around the
 * command; nothing is decided here, only read from what the engine did.
 */
export function noteExpedition(before: GameState, after: GameState, content: Content, command: Command, arrival?: Arrival): GameState {
  if (!after.region || !before.region) return after;
  const me = before.barangay.id;
  const time = arrival?.arriveAt ?? before.time;
  const departAt = arrival?.departAt ?? before.time;
  if (command.type === "trade" || command.type === "proposeTrade" || command.type === "acceptCounter") {
    if (after.stats.trades <= before.stats.trades) return after;
    const counter = before.region.counter;
    const id = command.type === "acceptCounter" ? counter?.neighbor : command.neighbor;
    if (!id) return after;
    const p =
      command.type === "trade"
        ? standardProposal(content, id, command.give)
        : command.type === "proposeTrade"
          ? { give: command.give, want: command.want }
          : { give: counter!.give, want: counter!.want };
    const sea = crossesSea(before, me, id);
    return addExpedition(after, content, {
      kind: "trade",
      from: me,
      to: id,
      side: "out",
      departAt,
      arriveAt: time,
      sea,
      boat: sea ? "balangay" : "bangka",
      route: [placeOf(before, me), placeOf(before, id)],
      landing: null,
      party: { barangay: me, count: content.rules.expeditions.envoys, named: [] },
      trade: { gave: { ...p.give }, got: { ...p.want } },
    });
  }
  if (command.type === "raid") {
    const report = newReport(before, after, "raid");
    const target = before.region.neighbors.find((n) => n.id === command.neighbor);
    const def = neighborDef(content, command.neighbor);
    if (!report || !target || !def) return after;
    // Where they landed and where the defenders came from, on the village a visit shows.
    const village = generateVillage(content, target, def, time);
    const landing = raidPreview(village, content).landing;
    const forts = village.buildings.filter((b) => (content.buildings.find((d) => d.id === b.type)?.defense ?? 0) > 0 && !b.damaged);
    const m = content.rules.military;
    const defenders = target.state.warriors;
    const starts: Point[] = forts.length ? forts.map((b) => ({ x: b.x, y: b.y })) : [village.map.plaza];
    // The engine counts every defender at the battle (no muster for the player's raids).
    const posts: ExpeditionPost[] = starts.map((from, i) => ({
      from,
      warriors: Math.floor(defenders / starts.length) + (i < defenders % starts.length ? 1 : 0),
      seconds: landing ? travelSeconds(village.map, from, landing, content) : null,
      arrives: true,
    }));
    const kutaBonus = Math.max(0, (report.defense ?? 0) - m.baseDefense - defenders * m.warrior.defense);
    const sea = crossesSea(before, me, command.neighbor);
    return addExpedition(after, content, {
      kind: "raid",
      from: me,
      to: command.neighbor,
      side: "out",
      departAt,
      arriveAt: time,
      sea,
      boat: "karakoa",
      route: [placeOf(before, me), placeOf(before, command.neighbor)],
      landing,
      party: { barangay: me, count: command.warriors, named: namedWarriors(before.named, command.warriors) },
      battle: {
        defenders: { barangay: command.neighbor, count: defenders, named: [], posts, late: 0 },
        allies: [],
        kutaBonus,
        covered: kutaBonus > 0 && raidPreview(village, content).covering.length > 0,
        attack: report.attack ?? 0,
        defense: report.defense ?? 0,
        chance: report.chance ?? 0,
        attackerWins: report.win === true,
        attackerLosses: report.ourLosses ?? 0,
        defenderLosses: report.theirLosses ?? 0,
        loot: { ...(report.loot ?? {}) },
      },
      reportId: report.id,
    });
  }
  return after;
}

/** The report a step added, of a kind, if any. */
function newReport(before: GameState, after: GameState, kind: Report["kind"]): Report | null {
  const from = before.region?.nextReportId ?? 0;
  return [...(after.region?.reports ?? [])].reverse().find((r) => r.id >= from && r.kind === kind) ?? null;
}

/** The record of an AI raid on the player, from what the engine used to decide it. */
export function defenseExpedition(
  state: GameState,
  content: Content,
  raid: { from: string; departAt: number; arriveAt: number; landing: Point | null; attackers: number },
  border: Muster | null,
  helpers: AllyDefender[],
  result: { attack: number; defense: number; chance: number; attackerWins: boolean; ourLosses: number; theirLosses: number; lost: Partial<Record<Resource, number>>; defenders: number },
  reportId: number,
): Omit<Expedition, "id"> {
  const me = state.barangay.id;
  const m = content.rules.military;
  const posts: ExpeditionPost[] = border
    ? border.posts.map((p) => ({ from: { ...p.from }, warriors: p.warriors, seconds: p.seconds, arrives: p.arrives }))
    : [{ from: { ...state.map.plaza }, warriors: result.defenders, seconds: 0, arrives: true }];
  const kutaBonus = border ? border.walls : Math.max(0, result.defense - m.baseDefense - result.defenders * m.warrior.defense);
  return {
    kind: "raid",
    from: raid.from,
    to: me,
    side: "in",
    departAt: raid.departAt,
    arriveAt: raid.arriveAt,
    sea: crossesSea(state, raid.from, me),
    boat: "karakoa",
    route: [placeOf(state, raid.from), placeOf(state, me)],
    landing: raid.landing ? { ...raid.landing } : null,
    party: { barangay: raid.from, count: raid.attackers, named: [] },
    battle: {
      defenders: { barangay: me, count: result.defenders, named: namedWarriors(state.named, result.defenders), posts, late: border?.late ?? 0 },
      allies: helpers.map((a) => ({ id: a.id, warriors: a.warriors, eta: a.eta, arrives: a.arrives, by: a.by })),
      kutaBonus,
      covered: border?.covered ?? false,
      attack: result.attack,
      defense: result.defense,
      chance: result.chance,
      attackerWins: result.attackerWins,
      attackerLosses: result.theirLosses,
      defenderLosses: result.ourLosses,
      loot: { ...result.lost },
    },
    reportId,
  };
}

/**
 * Marks the named warriors who fell in this step's battles. Called after the named villagers
 * are brought up to date (people.ts), which decides who fell; a fallen warrior not already
 * listed takes the place of the last listed one who survived, so the list stays the force's size.
 */
export function markFallen(before: GameState, after: GameState): GameState {
  const fresh = after.expeditions.filter((e) => e.id >= before.nextExpeditionId);
  if (fresh.length === 0) return after;
  const old = new Set(before.history);
  const fell = after.history.filter((h) => !old.has(h) && h.kind === "fell" && h.name).map((h) => ({ name: h.name!, story: h.story ?? "" }));
  if (fell.length === 0) return after;
  const me = before.barangay.id;
  let left = [...fell];
  const mark = (side: ExpeditionSide): ExpeditionSide => {
    if (side.barangay !== me || left.length === 0) return side;
    let named = side.named.map((v) => {
      const i = left.findIndex((f) => f.name === v.name);
      if (i < 0) return v;
      left = left.filter((_, k) => k !== i);
      return { ...v, fell: true };
    });
    // Anyone who fell but wasn't listed was there too.
    while (left.length && named.length < side.count + 1) {
      const f = left.shift()!;
      const survivor = named.map((v) => !v.fell).lastIndexOf(true);
      const entry = { name: f.name, story: f.story, fell: true };
      if (named.length >= side.count && survivor >= 0) named = named.map((v, k) => (k === survivor ? entry : v));
      else if (named.length < side.count) named = [...named, entry];
      else break;
    }
    return { ...side, named };
  };
  const expeditions = after.expeditions.map((e) => {
    if (e.id < before.nextExpeditionId || !e.battle) return e;
    // The player's side: the raiders on the player's raid, the defenders on a raid against them.
    return e.side === "out" ? { ...e, party: mark(e.party) } : { ...e, battle: { ...e.battle, defenders: { ...e.battle.defenders, ...mark(e.battle.defenders) } } };
  });
  return { ...after, expeditions };
}

/** The player's recent expeditions finished in (from, to]: for "While you were away". */
export const expeditionsBetween = (state: GameState, from: number, to: number) => state.expeditions.filter((e) => e.arriveAt > from && e.arriveAt <= to);

/** The record that goes with a battle report, if it is still kept. */
export const expeditionForReport = (state: GameState, reportId: number) => state.expeditions.find((e) => e.reportId === reportId) ?? null;

// ---------- Reading records from a save ----------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nonNeg = (v: unknown): v is number => num(v) && v >= 0;
const point = (v: unknown): Point | null => (isObject(v) && num(v.x) && num(v.y) ? { x: v.x, y: v.y } : null);
const str = (v: unknown): v is string => typeof v === "string" && v !== "";

function goods(v: unknown): Goods | null {
  if (!isObject(v) || !nonNeg(v.amount) || !(RESOURCES as readonly unknown[]).includes(v.resource)) return null;
  return { resource: v.resource as Resource, amount: v.amount };
}

function amounts(v: unknown): Partial<Record<Resource, number>> {
  if (!isObject(v)) return {};
  return Object.fromEntries(RESOURCES.filter((r) => nonNeg(v[r])).map((r) => [r, v[r] as number])) as Partial<Record<Resource, number>>;
}

function side(v: unknown): ExpeditionSide | null {
  if (!isObject(v) || !str(v.barangay) || !nonNeg(v.count)) return null;
  const named = Array.isArray(v.named)
    ? v.named.filter(isObject).filter((m) => str(m.name)).map((m) => ({ name: m.name as string, story: typeof m.story === "string" ? m.story : "", fell: m.fell === true }))
    : [];
  return { barangay: v.barangay, count: Math.floor(v.count), named };
}

function battle(v: unknown): BattleLog | null {
  if (!isObject(v)) return null;
  const d = side(v.defenders);
  if (!d || !isObject(v.defenders)) return null;
  const raw = v.defenders;
  const posts = Array.isArray(raw.posts)
    ? raw.posts.filter(isObject).flatMap((p) => {
        const from = point(p.from);
        return from && nonNeg(p.warriors) ? [{ from, warriors: Math.floor(p.warriors), seconds: nonNeg(p.seconds) ? p.seconds : null, arrives: p.arrives === true }] : [];
      })
    : [];
  const allies = Array.isArray(v.allies)
    ? v.allies.filter(isObject).flatMap((a) =>
        str(a.id) && nonNeg(a.warriors) ? [{ id: a.id, warriors: Math.floor(a.warriors), eta: nonNeg(a.eta) ? a.eta : null, arrives: a.arrives === true, by: a.by === "sea" ? ("sea" as const) : ("land" as const) }] : [],
      )
    : [];
  const n = (k: string) => (nonNeg(v[k]) ? (v[k] as number) : 0);
  return {
    defenders: { ...d, posts, late: nonNeg(raw.late) ? Math.floor(raw.late) : 0 },
    allies,
    kutaBonus: n("kutaBonus"),
    covered: v.covered === true,
    attack: n("attack"),
    defense: n("defense"),
    chance: Math.min(1, n("chance")),
    attackerWins: v.attackerWins === true,
    attackerLosses: Math.floor(n("attackerLosses")),
    defenderLosses: Math.floor(n("defenderLosses")),
    loot: amounts(v.loot),
  };
}

/** Expedition records from a save: anything malformed is dropped, never guessed at. */
export function parseExpeditions(raw: unknown, content: Content): Expedition[] {
  if (!Array.isArray(raw)) return [];
  const out: Expedition[] = [];
  for (const e of raw) {
    if (!isObject(e) || !Number.isInteger(e.id) || (e.kind !== "trade" && e.kind !== "raid") || !str(e.from) || !str(e.to)) continue;
    if (!nonNeg(e.departAt) || !nonNeg(e.arriveAt) || e.arriveAt < e.departAt) continue;
    const party = side(e.party);
    if (!party) continue;
    const boat: Boat = e.boat === "balangay" || e.boat === "karakoa" ? e.boat : "bangka";
    const record: Expedition = {
      id: e.id as number,
      kind: e.kind,
      from: e.from,
      to: e.to,
      side: e.side === "in" ? "in" : "out",
      departAt: e.departAt,
      arriveAt: e.arriveAt,
      sea: e.sea === true,
      boat,
      route: Array.isArray(e.route) ? e.route.map(point).filter((p): p is Point => p !== null) : [],
      landing: point(e.landing),
      party,
    };
    if (e.kind === "trade") {
      const t = isObject(e.trade) ? e.trade : {};
      const gave = goods(t.gave);
      const got = goods(t.got);
      if (!gave || !got) continue;
      record.trade = { gave, got };
    } else {
      const b = battle(e.battle);
      if (!b) continue;
      record.battle = b;
    }
    if (Number.isInteger(e.reportId)) record.reportId = e.reportId as number;
    out.push(record);
  }
  return out.slice(-content.rules.expeditions.keep);
}
