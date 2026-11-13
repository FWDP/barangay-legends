// Alliance blocs, seeded and not simulated. Barangays are grouped into rival blocs when the
// map is made; blocs then change only when someone acts (joins, leaves, expels, is absorbed or
// defeated) or when a scripted event (content/events/politics) fires, at most one per
// rules.politics.minGapSeconds. Plain functions over barangay ids: nothing here knows who is
// the player and who is AI, so the same rules can run on a server for real players.
import type { Content, PoliticsEventDef } from "./content";
import { rollAt } from "./rng";

export interface Bloc {
  id: string;
  leader: string;
  /** Every member, the leader included. */
  members: string[];
}

export interface War {
  a: string;
  b: string;
  since: number;
}

export interface Politics {
  blocs: Bloc[];
  wars: War[];
  nextBlocId: number;
  /** When the last scripted event fired (one per minGapSeconds at most). */
  lastEventAt: number | null;
  /** Next game second wars cost their members warriors. */
  nextWarTickAt: number;
}

/** How strong a barangay is (warriors and walls), for choosing leaders. */
export type StrengthOf = (id: string) => number;

const SALT = 7700;

export const emptyPolitics = (): Politics => ({ blocs: [], wars: [], nextBlocId: 1, lastEventAt: null, nextWarTickAt: 0 });

export const blocOf = (p: Politics, id: string): Bloc | undefined => p.blocs.find((b) => b.members.includes(id));
export const blocById = (p: Politics, id: string): Bloc | undefined => p.blocs.find((b) => b.id === id);
export const isLeader = (p: Politics, id: string) => p.blocs.some((b) => b.leader === id);

export function atWar(p: Politics, a: string, b: string): boolean {
  return p.wars.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a));
}

/** The blocs a bloc is at war with. */
export const enemiesOf = (p: Politics, blocId: string) => p.wars.flatMap((w) => (w.a === blocId ? [w.b] : w.b === blocId ? [w.a] : []));

/** The strongest of some ids (ties: the first). */
function strongest(ids: string[], strength: StrengthOf): string {
  return ids.reduce((best, id) => (strength(id) > strength(best) ? id : best), ids[0]);
}

/** Drops empty blocs (and their wars); a bloc whose leader left gets the strongest member. */
function tidy(p: Politics, strength: StrengthOf): Politics {
  const blocs = p.blocs
    .filter((b) => b.members.length >= 1)
    .map((b) => (b.members.includes(b.leader) ? b : { ...b, leader: strongest(b.members, strength) }));
  const ids = new Set(blocs.map((b) => b.id));
  return { ...p, blocs, wars: p.wars.filter((w) => ids.has(w.a) && ids.has(w.b)) };
}

/**
 * The starting blocs: 2–3 (rules.blocs) among `ids`, each led by its strongest member, with a
 * few barangays left independent. Deterministic from the seed.
 */
export function generateBlocs(content: Content, ids: string[], strength: StrengthOf, seed: number): Politics {
  const r = content.rules.blocs;
  const roll = (i: number, k: number) => rollAt(seed >>> 0, i, SALT + k);
  const count = Math.min(Math.floor(ids.length / 2), r.min + Math.floor(roll(0, 0) * (r.max - r.min + 1)));
  const shuffled = ids.map((id, i) => ({ id, k: roll(i + 1, 1) })).sort((a, b) => a.k - b.k).map((x) => x.id);
  const free = Math.min(r.independents, Math.max(0, shuffled.length - count * 2));
  const joining = shuffled.slice(0, shuffled.length - free);
  // Leaders: the strongest of those joining, one per bloc.
  const leaders = [...joining].sort((a, b) => strength(b) - strength(a)).slice(0, count);
  const blocs: Bloc[] = leaders.map((leader, i) => ({ id: `bloc-${i + 1}`, leader, members: [leader] }));
  joining.filter((id) => !leaders.includes(id)).forEach((id, i) => blocs[i % blocs.length]?.members.push(id));
  return tidy({ blocs, wars: [], nextBlocId: blocs.length + 1, lastEventAt: null, nextWarTickAt: 0 }, strength);
}

/** `founder` starts a new bloc and leads it (only if it isn't in one). */
export function formBloc(p: Politics, founder: string): Politics {
  if (blocOf(p, founder)) return p;
  return { ...p, blocs: [...p.blocs, { id: `bloc-${p.nextBlocId}`, leader: founder, members: [founder] }], nextBlocId: p.nextBlocId + 1 };
}

/** `id` joins a bloc (only if it isn't in one). */
export function joinBloc(p: Politics, blocId: string, id: string): Politics {
  if (blocOf(p, id) || !blocById(p, blocId)) return p;
  return { ...p, blocs: p.blocs.map((b) => (b.id === blocId ? { ...b, members: [...b.members, id] } : b)) };
}

/** `id` leaves its bloc. A leader who leaves hands over to the strongest member; a bloc of one dissolves. */
export function leaveBloc(p: Politics, id: string, strength: StrengthOf): Politics {
  const bloc = blocOf(p, id);
  if (!bloc) return p;
  // A bloc someone just formed alone stays until it has members or its founder leaves.
  const blocs = p.blocs.map((b) => (b.id === bloc.id ? { ...b, members: b.members.filter((m) => m !== id) } : b));
  const left = blocs.find((b) => b.id === bloc.id)!;
  if (left.members.length === 0) return { ...p, blocs: blocs.filter((b) => b.id !== bloc.id), wars: p.wars.filter((w) => w.a !== bloc.id && w.b !== bloc.id) };
  return tidy({ ...p, blocs: blocs.map((b) => (b.id === bloc.id && b.leader === id ? { ...b, leader: strongest(b.members, strength) } : b)) }, strength);
}

/** The leader of a bloc sends a member away. */
export function expel(p: Politics, leader: string, member: string, strength: StrengthOf): Politics {
  const bloc = blocOf(p, member);
  if (!bloc || bloc.leader !== leader || member === leader) return p;
  return leaveBloc(p, member, strength);
}

/** A barangay absorbed by another (made a tributary) leaves its bloc. */
export const absorbed = (p: Politics, id: string, strength: StrengthOf) => leaveBloc(p, id, strength);

/** A bloc leader defeated in battle loses the lead to the bloc's strongest other member. */
export function leaderDefeated(p: Politics, leader: string, strength: StrengthOf): Politics {
  const bloc = p.blocs.find((b) => b.leader === leader);
  if (!bloc || bloc.members.length < 2) return p;
  const others = bloc.members.filter((m) => m !== leader);
  return { ...p, blocs: p.blocs.map((b) => (b.id === bloc.id ? { ...b, leader: strongest(others, strength) } : b)) };
}

export function startWar(p: Politics, a: string, b: string, time: number): Politics {
  if (a === b || atWar(p, a, b) || !blocById(p, a) || !blocById(p, b)) return p;
  return { ...p, wars: [...p.wars, { a, b, since: time }] };
}

export function endWar(p: Politics, a: string, b: string): Politics {
  return { ...p, wars: p.wars.filter((w) => !((w.a === a && w.b === b) || (w.a === b && w.b === a))) };
}

/** What a scripted event changed, for its news: the event and the names in it. */
export interface PoliticsChange {
  event: PoliticsEventDef;
  politics: Politics;
  /** Barangay and bloc ids the news names: barangay, bloc, other (bloc). */
  barangay?: string;
  bloc?: string;
  other?: string;
}

/**
 * One scripted event, if any applies: someone leaves a bloc, two blocs go to war, two at war
 * make peace, or an independent joins a bloc. `protectedBlocs` (the player's) are never
 * changed by a script. The pick is seeded by `second`.
 */
export function scriptedEvent(
  p: Politics,
  events: PoliticsEventDef[],
  ids: string[],
  strength: StrengthOf,
  protectedBlocs: string[],
  seed: number,
  second: number,
): PoliticsChange | null {
  const roll = (k: number) => rollAt(seed >>> 0, second, SALT + 20 + k);
  const open = p.blocs.filter((b) => !protectedBlocs.includes(b.id));
  const pick = <T,>(list: T[], k: number): T => list[Math.floor(roll(k) * list.length) % list.length];
  const options = events.filter((e) => {
    if (e.type === "leave") return open.some((b) => b.members.length >= 3);
    if (e.type === "war") return open.length >= 2 && open.some((a) => open.some((b) => a.id !== b.id && !atWar(p, a.id, b.id)));
    if (e.type === "peace") return p.wars.some((w) => !protectedBlocs.includes(w.a) && !protectedBlocs.includes(w.b));
    if (e.type === "join") return open.length > 0 && ids.some((id) => !blocOf(p, id));
    return false;
  });
  if (options.length === 0) return null;
  const total = options.reduce((sum, e) => sum + e.weight, 0);
  let r = roll(0) * total;
  const event = options.find((e) => (r -= e.weight) < 0) ?? options[options.length - 1];
  switch (event.type) {
    case "leave": {
      const bloc = pick(open.filter((b) => b.members.length >= 3), 1);
      const who = pick(bloc.members.filter((m) => m !== bloc.leader), 2);
      return { event, politics: leaveBloc(p, who, strength), barangay: who, bloc: bloc.id };
    }
    case "war": {
      const pairs = open.flatMap((a) => open.filter((b) => a.id < b.id && !atWar(p, a.id, b.id)).map((b) => [a.id, b.id] as const));
      const [a, b] = pick(pairs, 1);
      return { event, politics: startWar(p, a, b, second), bloc: a, other: b };
    }
    case "peace": {
      const w = pick(p.wars.filter((x) => !protectedBlocs.includes(x.a) && !protectedBlocs.includes(x.b)), 1);
      return { event, politics: endWar(p, w.a, w.b), bloc: w.a, other: w.b };
    }
    case "join": {
      const who = pick(ids.filter((id) => !blocOf(p, id)), 1);
      const bloc = pick(open, 2);
      return { event, politics: joinBloc(p, bloc.id, who), barangay: who, bloc: bloc.id };
    }
  }
}

/** Members of every bloc at war, for the war's cost. */
export function atWarMembers(p: Politics): string[] {
  const ids = new Set(p.wars.flatMap((w) => [w.a, w.b]));
  return p.blocs.filter((b) => ids.has(b.id)).flatMap((b) => b.members);
}

/** Total strength of a bloc. */
export const blocStrength = (b: Bloc, strength: StrengthOf) => b.members.reduce((sum, m) => sum + strength(m), 0);
