// The adviser's speech bubble at the edge of the screen, and the hook that runs the adviser.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Content } from "../engine/content";
import type { GameState } from "../engine/game";
import { advise, dismiss, newModel, noteEvent, parseMemory, skipTutorial, type AdvisorModel, type Message } from "./advisor";
import type { Lang } from "./settings";
import type { AdvisorDef, GameText, TutorialEvent } from "./uiContent";

const MEMORY_KEY = "barangay-legends/advisor";

function loadMemory() {
  try {
    return parseMemory(localStorage.getItem(MEMORY_KEY));
  } catch {
    return parseMemory(null);
  }
}

/** Runs the adviser about once a second, and right away when something it watches changes. */
export function useAdvisor(state: GameState, content: Content, advisor: AdvisorDef, opts: { lang: Lang; tipsOn: boolean; blocked: boolean; game?: GameText }) {
  const [model, setModel] = useState<AdvisorModel>(() => newModel(loadMemory(), state, content));
  const latest = useRef({ state, ...opts });
  latest.current = { state, ...opts };
  const run = useCallback((m: AdvisorModel) => advise(m, { ...latest.current, content, advisor }), [content, advisor]);

  useEffect(() => {
    const id = setInterval(() => setModel(run), 1000);
    return () => clearInterval(id);
  }, [run]);
  useEffect(() => setModel(run), [run, state.buildings, state.history, opts.lang, opts.tipsOn, opts.blocked]);

  useEffect(() => {
    try {
      localStorage.setItem(MEMORY_KEY, JSON.stringify(model.memory));
    } catch {
      // Storage blocked: the adviser forgets on reload.
    }
  }, [model.memory]);

  return {
    message: model.message,
    note: useCallback((e: TutorialEvent) => setModel((m) => run(noteEvent(m, e))), [run]),
    dismiss: useCallback(() => setModel(dismiss), []),
    skip: useCallback(() => setModel((m) => skipTutorial(m, latest.current.state.time)), []),
  };
}

function Portrait({ src, name }: { src: string; name: string }) {
  const image = /\.(png|jpe?g|svg|webp)$/i.test(src);
  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-amber-950/70 bg-amber-200 text-3xl shadow-md sm:size-14 sm:text-4xl">
      {image ? <img src={src} alt={name} className="size-full object-cover" /> : <span role="img" aria-label={name}>{src}</span>}
    </span>
  );
}

/** The bubble. A tip closes with one tap; a tutorial step stays until done or skipped. */
export function AdvisorBubble(props: { message: Message | null; advisor: AdvisorDef; lang: Lang; onDismiss: () => void; onSkip: () => void }) {
  const { message, advisor, lang, onDismiss, onSkip } = props;
  if (!message) return null;
  const tip = message.kind !== "tutorial";
  const body = (
    <>
      <span className="block font-display text-sm leading-tight text-amber-900">
        {advisor.name} <span className="font-sans text-[11px] font-normal text-stone-500">· {advisor.title[lang]}</span>
      </span>
      <span className="mt-0.5 block text-sm leading-snug">{message.text}</span>
    </>
  );
  return (
    <div
      role="status"
      aria-live="polite"
      data-map-overlay
      className="pointer-events-auto absolute bottom-[4.5rem] left-2 z-20 flex max-w-[min(22rem,calc(100%-4.5rem))] items-end gap-1.5 motion-safe:animate-bounce-in"
    >
      <Portrait src={advisor.portrait} name={advisor.name} />
      <div className="mat-card relative min-w-0 rounded-2xl rounded-bl-sm border-2 border-amber-900/70 text-left text-stone-800 shadow-xl">
        {tip ? (
          <button type="button" onClick={onDismiss} className="block w-full px-3 py-2 text-left" aria-label={`${message.text} ${advisor.ui.dismiss[lang]}`}>
            {body}
            <span className="mt-1 block text-[10px] text-stone-500">{advisor.ui.dismiss[lang]} ✕</span>
          </button>
        ) : (
          <div className="px-3 py-2">
            {body}
            <span className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-[11px] text-stone-500 tabular-nums">
                {advisor.ui.step[lang]} {message.step}/{message.total}
              </span>
              <button type="button" onClick={onSkip} className="game-btn border-2 border-amber-950/50 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950">
                {advisor.ui.skip[lang]}
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
