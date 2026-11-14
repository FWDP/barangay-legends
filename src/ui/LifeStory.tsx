// A named villager's life story card: their portrait sprite, class and role, family (tap a named
// relative to open their story), the sentences of who they are and the dated lines of their life.
// Used for the living (tap their sprite) and the remembered (the Libingan).
import { useEffect, useRef } from "react";
import type { Content } from "../engine/content";
import type { GameState } from "../engine/game";
import type { NamedVillager } from "../engine/people";
import type { FamilyLink, LifeStory } from "../engine/talambuhay";
import { dayOf } from "./Days";
import { barangayName } from "./politicsText";
import type { Lang } from "./settings";
import { lifeDay, lifeLine, storySentences } from "./talambuhay";
import type { GameText } from "./uiContent";
import type { Appearance, Tapped } from "./villagers";
import { drawPerson, type Look } from "./VillagerLayer";

/** Their sprite, drawn large (the same drawing as on the map). */
export function Portrait(props: { id: number; look: Appearance; role: Look; faded?: boolean }) {
  const { id, look, role, faded = false } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    const dpr = window.devicePixelRatio || 1;
    const size = 64;
    c.width = size * dpr;
    c.height = size * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    drawPerson(g, size / 2, size - 6, 150, id, role, { p: { x: 0, y: 0 }, moving: false, stride: 0 }, 0, faded ? 0.6 : 1, look);
  }, [id, look.gender, look.age, look.cls, look.malong, role, faded]);
  return <canvas ref={ref} aria-hidden className="size-16 shrink-0 rounded-xl border-2 border-amber-900/30 bg-amber-100/70" />;
}

/** A named villager's portrait look: their resident's (grown, never a child), else a plain one. */
export function namedLook(state: GameState, content: Content, v: NamedVillager): Appearance {
  const r = v.resident !== undefined ? state.residents.find((x) => x.id === v.resident) : undefined;
  const malong = content.traditions.find((t) => t.id === state.tradition)?.dress === "malong";
  return { gender: v.gender ?? r?.gender ?? "woman", age: r?.age === "elder" ? "elder" : "adult", cls: r?.cls ?? (v.role === "warrior" ? "warrior" : "commoner"), malong };
}

/** The Tapped card for a named villager opened from someone's family list. */
export function tappedFor(state: GameState, content: Content, v: NamedVillager): Tapped {
  return { named: v, look: namedLook(state, content, v), role: v.role === "warrior" ? "warrior" : "idle", place: null };
}

function FamilyRow(props: { label: string; people: FamilyLink[]; canOpen: (l: FamilyLink) => boolean; onOpen: (l: FamilyLink) => void }) {
  const { label, people, canOpen, onOpen } = props;
  if (people.length === 0) return null;
  return (
    <li className="flex flex-wrap items-baseline gap-1">
      <span className="text-xs text-stone-500">{label}:</span>
      {people.map((p) =>
        canOpen(p) ? (
          <button key={p.resident} type="button" onClick={() => onOpen(p)} className="min-h-6 rounded-full border border-amber-800/40 bg-amber-100 px-2 text-xs font-semibold text-amber-900 underline-offset-2 hover:underline">
            ⭐ {p.name}
          </button>
        ) : (
          <span key={p.resident} className="text-xs font-semibold">
            {p.name}
          </span>
        ),
      )}
    </li>
  );
}

/** The story itself (the dialog around it is the caller's). */
export function LifeStoryView(props: {
  story: LifeStory;
  state: GameState;
  content: Content;
  game: GameText;
  lang: Lang;
  look: Appearance;
  role: Look;
  line: string;
  sick?: string | null;
  gone?: boolean;
  /** Opens a named relative's story (only living named villagers can be opened). */
  onOpen: (namedId: number) => void;
}) {
  const { story, state, content, game, lang, look, role, line, sick, gone = false, onOpen } = props;
  const t = game.talambuhay;
  const place = (id: string) => barangayName(state, content, id, game, lang);
  const sentences = storySentences(story, content, lang, place);
  const canOpen = (l: FamilyLink) => l.named !== undefined && state.named.some((v) => v.id === l.named);
  const open = (l: FamilyLink) => l.named !== undefined && onOpen(l.named);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Portrait id={story.id} look={look} role={role} faded={gone} />
        <div className="min-w-0">
          <h2 id="villager-name" className="font-display text-xl leading-tight text-amber-900">
            {gone ? <span aria-hidden>⚱️</span> : <span aria-hidden>⭐</span>} {story.name}
          </h2>
          <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{line}</p>
          {gone && <p className="text-xs text-stone-500 italic">{t.gone[lang]}</p>}
        </div>
      </div>
      {sick && <p className="text-xs text-red-800">🤒 {sick}</p>}
      <p className="text-sm leading-snug">{sentences.join(" ")}</p>
      {(story.parents.length > 0 || story.spouse || story.children.length > 0) && (
        <section aria-label={t.family[lang]}>
          <h3 className="text-xs font-bold text-amber-900">{t.family[lang]}</h3>
          <ul className="space-y-0.5">
            <FamilyRow label={t.parents[lang]} people={story.parents} canOpen={canOpen} onOpen={open} />
            <FamilyRow label={t.spouse[lang]} people={story.spouse ? [story.spouse] : []} canOpen={canOpen} onOpen={open} />
            <FamilyRow label={t.children[lang]} people={story.children} canOpen={canOpen} onOpen={open} />
          </ul>
        </section>
      )}
      {story.life.length > 0 && (
        <section aria-label={t.timeline[lang]}>
          <h3 className="text-xs font-bold text-amber-900">{t.timeline[lang]}</h3>
          <ol className="max-h-40 space-y-0.5 overflow-y-auto border-l-2 border-amber-800/30 pl-2 text-xs leading-snug">
            {story.life.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <span className="font-semibold whitespace-nowrap text-stone-500">{lifeDay(content, lang, dayOf(state, content, e.at))}</span> · {lifeLine(e, content, lang, place)}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
