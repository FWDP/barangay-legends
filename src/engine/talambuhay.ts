// Life stories (talambuhay) of named villagers: the dated events of their life, noted as they
// happen (born or arrived, married, became a parent, grew up, became an elder, ...). Only named
// villagers keep a story; a named villager is linked to the resident they are (NamedVillager
// .resident). Pure: no React, no browser APIs.
import type { Content, VillagerRole } from "./content";
import type { GameState } from "./game";
import type { Gender, Resident } from "./residents";
import type { NamedVillager } from "./people";
import { lifeSpans, residentName } from "./population";
import { rollAt } from "./rng";

export type LifeKind = "born" | "arrived" | "married" | "parent" | "grewUp" | "elder" | "raid" | "sick" | "healed" | "learned" | "died";

/** One dated line of a life story. Text is made by the UI from content, so it follows the language. */
export interface LifeEvent {
  at: number;
  kind: LifeKind;
  /** Someone else in it (a resident id): the spouse, the child, the elder who taught them. */
  other?: number;
  /** Why they came (arrived): a reason id from content/villagers/arrivals.json. */
  reason?: string;
  /** Where they came from or fought (a barangay id). */
  from?: string;
  /** How a raid went for them (raid). */
  outcome?: "won" | "lost";
  /** What they learned (learned): an id from the life-story templates. */
  lesson?: string;
  /** A raid on the barangay they fought off (raid), not one they went on. */
  defense?: boolean;
  /** The other person's name when it was noted (for when they are gone). */
  otherName?: string;
  /** How they died (died). */
  cause?: "age" | "sickness" | "raid" | "hunger";
}

/** The most events a story keeps (the first ones, born or arrived, are always kept). */
export const MAX_LIFE = 24;

/** Notes an event in the life story of the named villager who is this resident (if any). */
export function noteLife(state: GameState, content: Content, resident: number, event: Omit<LifeEvent, "at">): GameState {
  const i = state.named.findIndex((v) => v.resident === resident);
  if (i < 0) return state;
  const v = state.named[i];
  const life = [...(v.life ?? []), withName(state, content, { at: state.time, ...event })];
  const kept = life.length > MAX_LIFE ? [life[0], ...life.slice(-(MAX_LIFE - 1))] : life;
  const named = state.named.slice();
  named[i] = { ...v, life: kept };
  return { ...state, named };
}

/**
 * The first lines of a life story begun now (a villager just named, or an old one linked): born
 * here (to their parents) or arrived (why, from where), and their marriage if they have a spouse.
 */
export function startLife(state: GameState, resident: number, since: number, content?: Content): LifeEvent[] {
  const r = state.residents.find((x) => x.id === resident);
  if (!r) return [{ at: since, kind: "arrived" }];
  const out: LifeEvent[] = [];
  if (r.came === "born") out.push({ at: Math.max(0, bornAt(r, content) ?? since), kind: "born" });
  else out.push({ at: since, kind: "arrived", ...(r.why ? { reason: r.why } : {}), ...(r.from ? { from: r.from } : {}) });
  // What they learned as a child, by the evening fire.
  for (const e of r.lessons ?? []) out.push(e);
  if (r.spouse !== undefined && state.residents.some((x) => x.id === r.spouse)) out.push({ at: since, kind: "married", other: r.spouse });
  return out.sort((a, b) => a.at - b.at);
}

/** When someone born here was born: their age group began at `since`, after the groups before it. */
function bornAt(r: Resident, content?: Content): number | undefined {
  if (r.since === undefined) return undefined;
  if (!content || r.age === "child") return r.since;
  const span = lifeSpans(content);
  return r.since - span.child - (r.age === "elder" ? span.adult : 0);
}

/** An event with the other person's name as it is now (kept for when they are gone). */
function withName(state: GameState, content: Content, e: LifeEvent): LifeEvent {
  if (e.other === undefined || e.otherName) return e;
  const o = state.residents.find((r) => r.id === e.other);
  const name = o ? residentName(state, content, o) : "";
  return name ? { ...e, otherName: name } : e;
}

const LIFE_KINDS: readonly LifeKind[] = ["born", "arrived", "married", "parent", "grewUp", "elder", "raid", "sick", "healed", "learned", "died"];

/** A saved life story: valid events only, in order, at most MAX_LIFE. */
export function parseLife(raw: unknown): LifeEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: LifeEvent[] = [];
  for (const e of raw.slice(0, MAX_LIFE)) {
    if (typeof e !== "object" || e === null) continue;
    const o = e as Record<string, unknown>;
    if (typeof o.at !== "number" || !Number.isFinite(o.at) || o.at < 0 || !LIFE_KINDS.includes(o.kind as LifeKind)) continue;
    const ev: LifeEvent = { at: o.at, kind: o.kind as LifeKind };
    if (Number.isInteger(o.other)) ev.other = o.other as number;
    if (typeof o.reason === "string" && o.reason.length <= 40) ev.reason = o.reason;
    if (typeof o.from === "string" && o.from.length <= 40) ev.from = o.from;
    if (o.outcome === "won" || o.outcome === "lost") ev.outcome = o.outcome;
    if (typeof o.lesson === "string" && o.lesson.length <= 40) ev.lesson = o.lesson;
    if (o.defense === true) ev.defense = true;
    if (typeof o.otherName === "string" && o.otherName !== "" && o.otherName.length <= 30) ev.otherName = o.otherName;
    if (o.cause === "age" || o.cause === "sickness" || o.cause === "raid" || o.cause === "hunger") ev.cause = o.cause;
    out.push(ev);
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Links every named villager to a resident (old saves, or a name given before its resident
 * existed): the first resident not yet anyone's, of their gender, grown (a Mandirigma: a grown
 * man), else any free resident. A link to a resident who is gone is dropped first. Returns the
 * state itself when nothing changes.
 */
export function linkNamed(state: GameState, content?: Content): GameState {
  const here = new Set(state.residents.map((r) => r.id));
  const taken = new Set<number>();
  let changed = false;
  const named = state.named.map((v) => {
    if (v.resident !== undefined && here.has(v.resident) && !taken.has(v.resident)) {
      taken.add(v.resident);
      return v;
    }
    changed = true;
    const free = state.residents.filter((r) => !taken.has(r.id) && !state.named.some((o) => o !== v && o.resident === r.id));
    const grown = free.filter((r) => r.age !== "child");
    const fits = grown.filter((r) => (v.role === "warrior" ? r.gender === "man" && r.age === "adult" : !v.gender || r.gender === v.gender));
    const pick = fits[0] ?? grown[0] ?? free[0];
    const out = { ...v };
    delete out.resident;
    if (!pick) return out;
    taken.add(pick.id);
    return { ...out, resident: pick.id, gender: v.gender ?? pick.gender, ...(out.life?.length ? {} : { life: startLife(state, pick.id, v.since, content) }) };
  });
  return changed ? { ...state, named } : state;
}

// ---------- The life story itself ----------

const SALT_SKILL = 9401;
const SALT_DETAIL = 9402;
const SALT_TEACH = 9403;
const SALT_LEARNER = 9404;
const SALT_TEACHER = 9405;
const SALT_LESSON = 9406;

/** Someone in a villager's family: their name, and the named villager they are (to open their story). */
export interface FamilyLink {
  resident: number;
  name: string;
  /** Their named villager's id, if they are one. */
  named?: number;
}

/**
 * Everything a life story is made from (the UI turns it into sentences in the player's language):
 * what they're good at and one personal detail (template ids, from the seed and their id), where
 * they came from, their family in the barangay, and the dated events of their life.
 */
export interface LifeStory {
  id: number;
  name: string;
  gender: Gender;
  role: VillagerRole;
  skill: string;
  detail: string;
  came: "born" | "arrived" | "founder";
  /** Where they came from (arrived), a barangay id. */
  from?: string;
  parents: FamilyLink[];
  spouse: FamilyLink | null;
  children: FamilyLink[];
  life: LifeEvent[];
}

/** The skill a named villager is known for: one that fits their role, from the seed and their id. */
export function skillFor(content: Content, seed: number, v: { id: number; role: VillagerRole }): string {
  const skills = content.talambuhay.skills;
  const fits = skills.filter((s) => !s.roles || s.roles.includes(v.role));
  const pool = fits.length ? fits : skills;
  return pool[Math.floor(rollAt(seed, v.id, SALT_SKILL) * pool.length)].id;
}

/** Their personal detail (a habit, a fear, a dream, a favorite place), from the seed and their id. */
export function detailFor(content: Content, seed: number, v: { id: number }): string {
  const d = content.talambuhay.details;
  return d[Math.floor(rollAt(seed, v.id, SALT_DETAIL) * d.length)].id;
}

function link(state: GameState, content: Content, r: Resident): FamilyLink {
  const named = state.named.find((v) => v.resident === r.id);
  return { resident: r.id, name: residentName(state, content, r), ...(named ? { named: named.id } : {}) };
}

/** A named villager's life story now: their family linked to the real villagers who are here. */
export function lifeStory(state: GameState, content: Content, v: NamedVillager): LifeStory {
  const me = v.resident !== undefined ? state.residents.find((r) => r.id === v.resident) : undefined;
  const byId = new Map(state.residents.map((r) => [r.id, r]));
  const parents = (me?.parents ?? []).flatMap((p) => (byId.has(p) ? [link(state, content, byId.get(p)!)] : []));
  const spouse = me?.spouse !== undefined && byId.has(me.spouse) ? link(state, content, byId.get(me.spouse)!) : null;
  const children = me ? state.residents.filter((r) => r.parents?.includes(me.id)).map((r) => link(state, content, r)) : [];
  const life = (v.life ?? []).map((e) => {
    // The other person's name as it is now (they may have been named since), or as it was.
    const o = e.other !== undefined ? byId.get(e.other) : undefined;
    return o ? { ...e, otherName: residentName(state, content, o) } : e;
  });
  return {
    id: v.id,
    name: v.name,
    gender: v.gender ?? me?.gender ?? "woman",
    role: v.role,
    skill: skillFor(content, state.map.seed, v),
    detail: detailFor(content, state.map.seed, v),
    came: me?.came ?? "arrived",
    ...(me?.from ? { from: me.from } : {}),
    parents,
    spouse,
    children,
    life,
  };
}

/** The story kept at the Libingan: as it was when they died, with how they died at the end. */
export function finalStory(state: GameState, content: Content, v: NamedVillager, cause: NonNullable<LifeEvent["cause"]>): LifeStory {
  const story = lifeStory(state, content, v);
  return { ...story, life: [...story.life, { at: state.time, kind: "died" as const, cause }].slice(-MAX_LIFE) };
}

/** A saved Libingan story (anything that doesn't fit is dropped). */
export function parseStory(raw: unknown): LifeStory | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  const str = (x: unknown) => typeof x === "string" && x !== "" && x.length <= 40;
  if (!Number.isInteger(o.id) || !str(o.name) || !str(o.skill) || !str(o.detail) || !str(o.role)) return undefined;
  if (o.gender !== "woman" && o.gender !== "man") return undefined;
  const links = (x: unknown): FamilyLink[] =>
    Array.isArray(x)
      ? x.slice(0, 30).flatMap((l) => {
          if (typeof l !== "object" || l === null) return [];
          const k = l as Record<string, unknown>;
          if (!Number.isInteger(k.resident) || !str(k.name)) return [];
          return [{ resident: k.resident as number, name: k.name as string, ...(Number.isInteger(k.named) ? { named: k.named as number } : {}) }];
        })
      : [];
  const came = o.came === "born" || o.came === "founder" ? o.came : "arrived";
  return {
    id: o.id as number,
    name: o.name as string,
    gender: o.gender,
    role: o.role as VillagerRole,
    skill: o.skill as string,
    detail: o.detail as string,
    came,
    ...(str(o.from) ? { from: o.from as string } : {}),
    parents: links(o.parents).slice(0, 2),
    spouse: links(o.spouse ? [o.spouse] : [])[0] ?? null,
    children: links(o.children),
    life: parseLife(o.life),
  };
}

/**
 * Life events from one step (prev → next): named villagers who fell sick or were healed, and the
 * named warriors at a raid that was just fought (one they went on, or one they beat off at home).
 */
export function noteLifeEvents(prev: GameState, next: GameState, content: Content): GameState {
  let s = next;
  const before = new Map(prev.named.map((v) => [v.id, v]));
  for (const v of next.named) {
    const was = before.get(v.id);
    if (!was || v.resident === undefined) continue;
    if (v.sick && !was.sick) s = noteLife(s, content, v.resident, { kind: "sick" });
    else if (!v.sick && was.sick) s = noteLife(s, content, v.resident, { kind: "healed" });
  }
  const seen = Math.max(0, ...(prev.region?.reports ?? []).map((r) => r.id));
  for (const r of next.region?.reports ?? []) {
    if (r.id <= seen || (r.kind !== "raid" && r.kind !== "defense")) continue;
    for (const v of s.named) {
      if (v.role !== "warrior" || !before.has(v.id) || v.resident === undefined) continue;
      s = noteLife(s, content, v.resident, { kind: "raid", from: r.neighbor, outcome: r.win ? "won" : "lost", ...(r.kind === "defense" ? { defense: true } : {}) });
    }
  }
  return s;
}

/** Evenings begun between two times: night falls at rules.dayNight.nightFrom of each Araw. */
function eveningsBetween(content: Content, from: number, to: number): number[] {
  const { daySeconds, nightFrom } = content.rules.dayNight;
  const out: number[] = [];
  const first = Math.floor((from - nightFrom * daySeconds) / daySeconds) + 1;
  for (let k = first; k * daySeconds + nightFrom * daySeconds <= to && out.length < 50; k++) {
    const at = k * daySeconds + nightFrom * daySeconds;
    if (at > from) out.push(k);
  }
  return out;
}

/**
 * How children learned (no school: those came with the Spanish). Each evening the elders sit with
 * the children by the fire at the datu's gathering place; now and then (rules.population.learning)
 * an elder teaches one learner a lesson: a child (kept with them for their life story when they
 * grow up and are named) or a named villager as an apprentice. Online only, like the gatherings.
 */
export function teach(prev: GameState, next: GameState, content: Content): GameState {
  const rules = content.rules.population.learning;
  const lessons = content.talambuhay.lessons;
  if (rules.chancePerEvening <= 0 || lessons.length === 0) return next;
  let s = next;
  for (const k of eveningsBetween(content, prev.time, next.time)) {
    const seed = s.map.seed;
    if (rollAt(seed, k, SALT_TEACH) >= rules.chancePerEvening) continue;
    const elders = s.residents.filter((r) => r.age === "elder");
    if (elders.length === 0) continue;
    const children = s.residents.filter((r) => r.age === "child" && (r.lessons?.length ?? 0) < rules.maxPerChild);
    const apprentices = s.named.filter((v) => v.resident !== undefined && s.residents.some((r) => r.id === v.resident && r.age !== "elder"));
    const learners: { child?: Resident; named?: NamedVillager }[] = [...children.map((child) => ({ child })), ...apprentices.map((named) => ({ named }))];
    if (learners.length === 0) continue;
    const who = learners[Math.floor(rollAt(seed, k, SALT_LEARNER) * learners.length)];
    // Named elders teach first (they have a story to tell); else any elder.
    const namedElders = elders.filter((r) => s.named.some((v) => v.resident === r.id));
    const pool = namedElders.length ? namedElders : elders;
    const teacher = pool[Math.floor(rollAt(seed, k, SALT_TEACHER) * pool.length)];
    const lesson = lessons[Math.floor(rollAt(seed, k, SALT_LESSON) * lessons.length)].id;
    const event: Omit<LifeEvent, "at"> = { kind: "learned", lesson, other: teacher.id };
    if (who.named) s = noteLife(s, content, who.named.resident!, event);
    else if (who.child) {
      const e = withName(s, content, { at: s.time, ...event });
      s = { ...s, residents: s.residents.map((r) => (r.id === who.child!.id ? { ...r, lessons: [...(r.lessons ?? []), e] } : r)) };
    }
  }
  return s;
}
