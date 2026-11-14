// Where villagers come from (rules.population, content/villagers/arrivals.json). While the
// barangay is fed and has housing room, newcomers arrive for a reason (land, a marriage, an
// alliance, a trader who stays, kin fleeing a raid), and households in a Bahay Kubo have
// children while the barangay is happy enough. Children grow up after childDays Araw, adults
// become elders after elderAfterDays. Children don't work and eat less; elders work less.
// Births and arrivals are told gently in the Balita. Every villager is a resident (residents.ts)
// with a name from content/names.json, so a newborn's parents can be named. Rolls use rollAt on
// the map's seed and a counter (stats.rolls), so they never shift the shared RNG. AI barangays
// keep the simple arrivals (game.ts). Pure: no React, no browser APIs.
import type { ArrivalReason, Content } from "./content";
import { housing, type GameState } from "./game";
import type { NewsItem } from "./region";
import { classFor, makeResident, type AgeGroup, type Gender, type Resident } from "./residents";
import { rollAt } from "./rng";
import { noteLife } from "./talambuhay";
import { maybeName } from "./people";

const SALT_NAME = 9301;
const SALT_REASON = 9302;
const SALT_SIZE = 9303;
const SALT_COUPLE = 9304;
const SALT_SPREAD = 9305;
const SALT_FROM = 9306;
const SALT_KIN = 9307;

/** How long a child is a child, and an adult an adult, in game seconds. */
export function lifeSpans(content: Content): { child: number; adult: number } {
  const day = content.rules.dayNight.daySeconds;
  return { child: content.rules.population.childDays * day, adult: content.rules.population.elderAfterDays * day };
}

/** A resident's name: their named villager's, or one from content/names.json by gender, from the seed. */
export function residentName(state: GameState, content: Content, r: Resident): string {
  const named = state.named.find((v) => v.resident === r.id);
  if (named) return named.name;
  const pool = r.gender === "woman" ? content.villagers.women : content.villagers.men;
  if (pool.length === 0) return "";
  return pool[Math.floor(rollAt(state.map.seed, r.id, SALT_NAME) * pool.length)];
}

// ---------- The economy: who works and how much they eat ----------

const countCache = new WeakMap<Resident[], { children: number; elders: number }>();

function counts(residents: Resident[]): { children: number; elders: number } {
  let c = countCache.get(residents);
  if (!c) {
    c = { children: 0, elders: 0 };
    for (const r of residents) {
      if (r.age === "child") c.children++;
      else if (r.age === "elder") c.elders++;
    }
    countCache.set(residents, c);
  }
  return c;
}

/**
 * Villagers who can't work a full share: every child, and elders' missing share (they work
 * elderWorkPercent and teach). Rounded down for elders, so one elder alone still works. Zero for
 * AI barangays (they store no residents; every villager counts the same).
 */
export function notWorking(state: GameState, content: Content): number {
  if (state.residents.length === 0) return 0;
  const { children, elders } = counts(state.residents);
  return children + Math.floor((elders * (100 - content.rules.population.elderWorkPercent)) / 100);
}

/** How many full shares of rice the villagers eat: children eat childRicePercent of a share. */
export function riceEaters(state: GameState, content: Content): number {
  if (state.residents.length === 0) return state.villagers;
  const { children } = counts(state.residents);
  return Math.max(0, state.villagers - (children * (100 - content.rules.population.childRicePercent)) / 100);
}

// ---------- Growing up ----------

/**
 * Children grow up after childDays Araw and adults become elders after elderAfterDays (from
 * `since`, when they entered their age group). Named villagers' life stories note it. Returns
 * the state itself when nobody changed.
 */
export function ageResidents(state: GameState, content: Content): GameState {
  if (content.ai || state.residents.length === 0) return state;
  const span = lifeSpans(content);
  let changed: Resident[] | null = null;
  const grew: number[] = [];
  const aged: number[] = [];
  state.residents.forEach((r, i) => {
    if (r.since === undefined) return;
    let next: Resident | null = null;
    if (r.age === "child" && state.time >= r.since + span.child) {
      next = { ...r, age: "adult", since: r.since + span.child };
      grew.push(r.id);
    } else if (r.age === "adult" && state.time >= r.since + span.adult) {
      next = { ...r, age: "elder", since: r.since + span.adult };
      aged.push(r.id);
    }
    if (next) {
      changed ??= state.residents.slice();
      changed[i] = next;
    }
  });
  if (!changed) return state;
  let s: GameState = { ...state, residents: changed };
  for (const id of grew) s = noteLife(s, content, id, { kind: "grewUp" });
  // A child of the barangay may be named as they come of age (people.ts: the usual chance).
  for (const id of grew) {
    const r = s.residents.find((x) => x.id === id);
    if (r && !s.named.some((v) => v.resident === id)) s = maybeName(s, content, false, r);
  }
  for (const id of aged) s = noteLife(s, content, id, { kind: "elder" });
  return s;
}

// ---------- Births and newcomers ----------

/** A roll for this module: deterministic, and only advances stats.rolls. */
function roll(s: GameState, salt: number): [number, GameState] {
  const r = rollAt(s.map.seed, s.stats.rolls, salt);
  return [r, { ...s, stats: { ...s.stats, rolls: s.stats.rolls + 1 } }];
}

/** Housing room for more villagers (the same housing cap the arrivals always had). */
const room = (state: GameState, content: Content) => Math.max(0, housing(state, content) - state.villagers);

/** Can a household have a child now: fed, room, happy enough, and a Bahay Kubo standing? */
export function canHaveChild(state: GameState, content: Content): boolean {
  return room(state, content) > 0 && expecting(state, content);
}

/** Is a household expecting a child (all but the room: a child waits for room before newcomers do)? */
function expecting(state: GameState, content: Content): boolean {
  const p = content.rules.population;
  if (state.hunger > 0 || state.resources.rice <= 0) return false;
  if (state.happiness < p.birthMinHappiness) return false;
  if (!state.buildings.some((b) => b.type === "bahay-kubo" && !b.damaged)) return false;
  return couples(state).length > 0 || (singles(state, "woman").length > 0 && singles(state, "man").length > 0);
}

const isAdult = (r: Resident) => r.age === "adult";
const byId = (state: GameState) => new Map(state.residents.map((r) => [r.id, r]));

/** Couples who can still have children (both adults), as [woman, man]. */
function couples(state: GameState): [Resident, Resident][] {
  const ids = byId(state);
  const out: [Resident, Resident][] = [];
  for (const r of state.residents) {
    if (r.gender !== "woman" || !isAdult(r) || r.spouse === undefined) continue;
    const m = ids.get(r.spouse);
    if (m && isAdult(m)) out.push([r, m]);
  }
  return out;
}

/** Unmarried adults of a gender (or widowed: their spouse is no longer in the barangay). */
function singles(state: GameState, gender: Gender): Resident[] {
  const here = byId(state);
  return state.residents.filter((r) => r.gender === gender && isAdult(r) && (r.spouse === undefined || !here.has(r.spouse)));
}

/** Marries two residents (both record it), and notes it in named villagers' life stories. */
function marry(state: GameState, content: Content, a: number, b: number): GameState {
  const s: GameState = { ...state, residents: state.residents.map((r) => (r.id === a ? { ...r, spouse: b } : r.id === b ? { ...r, spouse: a } : r)) };
  return noteLife(noteLife(s, content, a, { kind: "married", other: b }), content, b, { kind: "married", other: a });
}

/** Adds a resident (a newborn or a newcomer) as one more villager. */
function addResident(state: GameState, r: Resident): GameState {
  return { ...state, villagers: state.villagers + 1, residents: [...state.residents, r], residentsNext: Math.max(state.residentsNext, r.id + 1) };
}

/** A local Balita line (births, arrivals): at most balitaMax of them are kept, so politics news stays. */
function addLocalNews(state: GameState, content: Content, item: Omit<NewsItem, "id" | "time">): GameState {
  const region = state.region;
  if (!region) return state;
  const max = content.rules.population.balitaMax;
  let news = [...region.news, { ...item, time: state.time, id: region.nextNewsId }];
  const local = news.filter((n) => n.key === "birth" || n.key === "arrival");
  if (local.length > max) {
    const drop = new Set(local.slice(0, local.length - max));
    news = news.filter((n) => !drop.has(n));
  }
  return { ...state, region: { ...region, news, nextNewsId: region.nextNewsId + 1 } };
}

/** A child is born to a couple (one is formed from two single adults if there is none). */
export function birth(state: GameState, content: Content, quiet = false): GameState {
  let s = state;
  let pair = couples(s);
  if (pair.length === 0) {
    const w = singles(s, "woman");
    const m = singles(s, "man");
    if (!w.length || !m.length) return s;
    let a: number;
    let b: number;
    [a, s] = roll(s, SALT_COUPLE);
    [b, s] = roll(s, SALT_COUPLE);
    s = marry(s, content, w[Math.floor(a * w.length)].id, m[Math.floor(b * m.length)].id);
    pair = couples(s);
  }
  let r: number;
  [r, s] = roll(s, SALT_COUPLE);
  const [mother, father] = pair[Math.floor(r * pair.length)];
  const id = Math.max(s.residentsNext, ...s.residents.map((x) => x.id + 1), 1);
  const look = makeResident(content, s.map.seed, id);
  // A child belongs to their family's class.
  const child: Resident = { id, gender: look.gender, age: "child", cls: mother.cls, since: s.time, parents: [mother.id, father.id], came: "born" };
  s = addResident(s, child);
  s = noteLife(s, content, child.id, { kind: "born" });
  s = noteLife(noteLife(s, content, mother.id, { kind: "parent", other: id }), content, father.id, { kind: "parent", other: id });
  if (!quiet) s = addLocalNews(s, content, { key: "birth", people: [residentName(s, content, mother), residentName(s, content, father), residentName(s, content, child)] });
  return s;
}

/** Can a reason come up now? */
function reasonHolds(state: GameState, reason: ArrivalReason): boolean {
  const region = state.region;
  switch (reason.needs) {
    case undefined:
      return true;
    case "marriage":
      return !!region?.neighbors.some((n) => n.marriage);
    case "alliance":
      return !!region?.neighbors.some((n) => n.marriage || n.status === "ally");
    case "trade":
      return state.stats.trades > 0;
    case "allyRaided":
      return raidedAllies(state).length > 0;
  }
}

/** Allies raided in the last two Araw (news "ally-lost" or "ally-defended"). */
function raidedAllies(state: GameState): string[] {
  const region = state.region;
  if (!region) return [];
  const since = state.time - 2 * 240;
  return [...new Set(region.news.filter((n) => (n.key === "ally-lost" || n.key === "ally-defended") && n.time >= since && n.barangay).map((n) => n.barangay!))];
}

/** Where newcomers came from, for the reason: an ally, a trading partner, a raided ally. */
function placeFor(state: GameState, reason: ArrivalReason, r: number): string | undefined {
  const region = state.region;
  if (!region) return undefined;
  const pick = (ids: string[]) => (ids.length ? ids[Math.floor(r * ids.length)] : undefined);
  switch (reason.needs) {
    case "marriage":
      return pick(region.neighbors.filter((n) => n.marriage).map((n) => n.id));
    case "alliance":
      return pick(region.neighbors.filter((n) => n.marriage || n.status === "ally").map((n) => n.id));
    case "allyRaided":
      return pick(raidedAllies(state));
    case "trade":
      return pick(region.neighbors.filter((n) => n.metAt !== null).map((n) => n.id)) ?? pick(region.neighbors.map((n) => n.id));
    default:
      return undefined;
  }
}

/** A newcomer's age group: mostly adults, some children and elders (rules.population). */
function newcomerAge(content: Content, r: number): AgeGroup {
  const p = content.rules.population;
  const v = r * 100;
  return v < p.newcomerChildPercent ? "child" : v < p.newcomerChildPercent + p.newcomerElderPercent ? "elder" : "adult";
}

/** When a newcomer's current age group began: partway through it, so they don't all grow up together. */
function sinceFor(content: Content, age: AgeGroup, time: number, r: number): number {
  const span = lifeSpans(content);
  if (age === "child") return time - r * span.child * 0.9;
  if (age === "adult") return time - r * span.adult * 0.9;
  return time;
}

/** One newcomer resident (or the first of a family). */
function newcomer(state: GameState, content: Content, age: AgeGroup, gender?: Gender): [Resident, GameState] {
  let s = state;
  const id = Math.max(s.residentsNext, ...s.residents.map((x) => x.id + 1), 1);
  const look = makeResident(content, s.map.seed, id);
  let r: number;
  [r, s] = roll(s, SALT_SPREAD);
  return [{ id, gender: gender ?? look.gender, age, cls: classFor(content, s.map.seed, id), since: sinceFor(content, age, s.time, r), came: "arrived" }, s];
}

/**
 * Newcomers arrive for a reason picked by weight among those that can happen now: one person,
 * or a family (a couple and children) up to the room there is. A newcomer who comes to marry
 * marries a single villager. Told in the Balita unless `quiet` (time away).
 */
export function arrival(state: GameState, content: Content, quiet = false): GameState {
  const space = room(state, content);
  if (space <= 0) return state;
  let s = state;
  const options = content.arrivals.reasons
    .map((reason) => ({ reason, w: reasonHolds(s, reason) ? reason.weight + (reason.needs ? (reason.boost ?? 0) : 0) : 0 }))
    .filter((o) => o.w > 0);
  // A spouse comes only if someone single is waiting for them.
  const usable = options.filter((o) => !o.reason.spouse || singles(s, "woman").length + singles(s, "man").length > 0);
  const total = usable.reduce((n, o) => n + o.w, 0);
  let r: number;
  [r, s] = roll(s, SALT_REASON);
  let reason = usable[0]?.reason ?? content.arrivals.reasons[0];
  for (let acc = 0, i = 0; i < usable.length; i++) {
    acc += usable[i].w;
    if (r * total < acc) {
      reason = usable[i].reason;
      break;
    }
  }
  let sz: number;
  [sz, s] = roll(s, SALT_SIZE);
  const [lo, hi] = reason.size;
  const size = Math.min(space, content.rules.population.familyMax, lo + Math.floor(sz * (hi - lo + 1)));
  let fr: number;
  [fr, s] = roll(s, SALT_FROM);
  const from = placeFor(s, reason, fr);
  const came: Resident[] = [];
  let spouse: Resident | undefined;
  if (reason.spouse) {
    // They marry someone single here: a woman comes for a single man, a man for a single woman.
    const men = singles(s, "man");
    const women = singles(s, "woman");
    let k: number;
    [k, s] = roll(s, SALT_KIN);
    const forMan = men.length > 0 && (women.length === 0 || k < 0.5);
    const pool = forMan ? men : women;
    spouse = pool[Math.floor(k * pool.length) % pool.length];
    let p: Resident;
    [p, s] = newcomer(s, content, "adult", forMan ? "woman" : "man");
    came.push(p);
    s = addResident(s, p);
    s = marry(s, content, p.id, spouse.id);
  } else {
    // The first is an adult; a family's second is their spouse, the rest children or elders.
    for (let i = 0; i < size; i++) {
      let a: number;
      [a, s] = roll(s, SALT_KIN);
      const age: AgeGroup = i < 2 ? (size === 1 ? newcomerAge(content, a) : "adult") : a < 0.75 ? "child" : "elder";
      const gender: Gender | undefined = i === 1 ? (came[0].gender === "woman" ? "man" : "woman") : undefined;
      let p: Resident;
      [p, s] = newcomer(s, content, age, gender);
      // A family keeps one class; children's parents are the couple.
      if (i > 0) p = { ...p, cls: came[0].cls, ...(age === "child" && came.length >= 2 ? { parents: [came[0].id, came[1].id] } : {}) };
      came.push(p);
      s = addResident(s, p);
      if (i === 1) s = marry(s, content, came[0].id, p.id);
    }
  }
  // Remembered on the resident, so a life story begun later (a name given) starts from it.
  const ids = new Set(came.map((p) => p.id));
  s = { ...s, residents: s.residents.map((r) => (ids.has(r.id) ? { ...r, why: reason.id, ...(from ? { from } : {}) } : r)) };
  for (const p of came) s = noteLife(s, content, p.id, { kind: "arrived", reason: reason.id, ...(from ? { from } : {}) });
  if (!quiet) {
    // The newcomers' names; a spouse's name follows the newcomer's (people: [newcomer, spouse]).
    const names = came.map((p) => residentName(s, content, p));
    if (spouse) names.push(residentName(s, content, spouse));
    s = addLocalNews(s, content, { key: "arrival", reason: reason.id, people: names, ...(from ? { barangay: from } : {}) });
  }
  return s;
}

/**
 * Births and newcomers over dt seconds (the player's barangay). A household expecting a child
 * (fed, happy enough, a couple in a Bahay Kubo) has one every secondsPerBirth; a child waiting
 * for room gets the next free home before any newcomer. Newcomers come while there is room.
 * Progress is kept in state (births; migration for newcomers), so it carries over between
 * steps. `quiet`: no Balita lines (time away).
 */
export function growPopulation(state: GameState, content: Content, dt: number, quiet = false): GameState {
  const p = content.rules.population;
  const fed = state.hunger === 0 && state.resources.rice > 0;
  let s = state;
  if (!fed) {
    // Nothing comes while hungry: progress waits (leaving is handled in game.ts).
    return s.births === 0 && s.migration <= 0 ? s : { ...s, births: 0, migration: Math.min(0, s.migration) };
  }
  // A child on the way waits (at most one) until there's a home for them.
  let births = expecting(s, content) ? Math.min(1, s.births + dt / p.secondsPerBirth) : 0;
  // No room: newcomers wait, and families leaving a lost house (negative progress, game.ts) go on.
  let migration = room(s, content) > 0 ? Math.max(0, s.migration) + dt / p.secondsPerNewcomer : Math.min(0, s.migration);
  while (births >= 1 - 1e-9 && canHaveChild(s, content)) {
    s = birth(s, content, quiet);
    births -= 1;
  }
  while (migration >= 1 - 1e-9 && room(s, content) > 0) {
    s = arrival(s, content, quiet);
    migration -= 1;
  }
  if (room(s, content) <= 0) migration = Math.min(0, migration);
  if (births === s.births && migration === s.migration) return s;
  return { ...s, migration, births: Math.max(0, births) };
}

/** A family's members in the barangay: parents, spouse and children (resident ids), for the life story. */
export function familyOf(state: GameState, id: number): { parents: number[]; spouse: number | null; children: number[] } {
  const me = state.residents.find((r) => r.id === id);
  const here = new Set(state.residents.map((r) => r.id));
  return {
    parents: (me?.parents ?? []).filter((p) => here.has(p)),
    spouse: me?.spouse !== undefined && here.has(me.spouse) ? me.spouse : null,
    children: state.residents.filter((r) => r.parents?.includes(id)).map((r) => r.id),
  };
}
