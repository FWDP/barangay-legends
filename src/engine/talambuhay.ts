// Life stories (talambuhay) of named villagers: the dated events of their life, noted as they
// happen (born or arrived, married, became a parent, grew up, became an elder, ...). Only named
// villagers keep a story; a named villager is linked to the resident they are (NamedVillager
// .resident). Pure: no React, no browser APIs.
import type { Content } from "./content";
import type { GameState } from "./game";

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
}

/** The most events a story keeps (the first ones, born or arrived, are always kept). */
export const MAX_LIFE = 24;

/** Notes an event in the life story of the named villager who is this resident (if any). */
export function noteLife(state: GameState, _content: Content, resident: number, event: Omit<LifeEvent, "at">): GameState {
  const i = state.named.findIndex((v) => v.resident === resident);
  if (i < 0) return state;
  const v = state.named[i];
  const life = [...(v.life ?? []), { at: state.time, ...event }];
  const kept = life.length > MAX_LIFE ? [life[0], ...life.slice(-(MAX_LIFE - 1))] : life;
  const named = state.named.slice();
  named[i] = { ...v, life: kept };
  return { ...state, named };
}

/**
 * The first lines of a life story begun now (a villager just named, or an old one linked): born
 * here (to their parents) or arrived (why, from where), and their marriage if they have a spouse.
 */
export function startLife(state: GameState, resident: number, since: number): LifeEvent[] {
  const r = state.residents.find((x) => x.id === resident);
  if (!r) return [{ at: since, kind: "arrived" }];
  const out: LifeEvent[] = [];
  if (r.came === "born") out.push({ at: Math.max(0, r.since ?? since), kind: "born" });
  else out.push({ at: since, kind: "arrived", ...(r.why ? { reason: r.why } : {}), ...(r.from ? { from: r.from } : {}) });
  if (r.spouse !== undefined && state.residents.some((x) => x.id === r.spouse)) out.push({ at: since, kind: "married", other: r.spouse });
  return out;
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
export function linkNamed(state: GameState): GameState {
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
    return { ...out, resident: pick.id, gender: v.gender ?? pick.gender, ...(out.life?.length ? {} : { life: startLife(state, pick.id, v.since) }) };
  });
  return changed ? { ...state, named } : state;
}
