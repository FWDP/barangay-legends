// Story-shaped moments: a choice event waiting for the datu, and "While you were away".
import { useEffect, useRef, useState } from "react";
import { choiceDef, optionBlocker } from "../engine/choices";
import { RESOURCES, type ChoiceEffects, type Content } from "../engine/content";
import type { Command, GameState } from "../engine/game";
import { neighborDef } from "../engine/region";
import { RESOURCE_ICON } from "./format";
import { fill } from "./uiContent";

function useModal(open: boolean) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return dialog;
}

const sign = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);

/** Short chips for what a choice does, e.g. "−5 🍚", "+1 👥", "🤝 +10". */
export function effectChips(e: ChoiceEffects): string[] {
  const chips: string[] = [];
  for (const r of RESOURCES) if (e.resources?.[r]) chips.push(`${sign(e.resources[r]!)} ${RESOURCE_ICON[r]}`);
  if (e.villagers) chips.push(`${sign(e.villagers)} 👥`);
  if (e.sick) chips.push(e.sick > 0 ? `🤒 ${e.sick} sick` : `💚 ${-e.sick} healed`);
  if (e.trust) chips.push(`🤝 trust ${sign(e.trust)}`);
  if (e.influence) chips.push(`🏵️ influence ${sign(e.influence)}`);
  return chips;
}

/** The banner that tells the player a choice event is waiting. */
export function ChoiceBanner(props: { state: GameState; content: Content; onOpen: () => void }) {
  const def = props.state.choice && choiceDef(props.content, props.state.choice.id);
  if (!def) return null;
  return (
    <button
      type="button"
      onClick={props.onOpen}
      className="wood-panel pointer-events-auto flex max-w-full items-center gap-2 rounded-xl border-2 border-amber-400 px-3 py-1.5 text-left text-amber-50 shadow-lg"
    >
      <span className="text-xl leading-none motion-safe:animate-pulse" aria-hidden>
        {def.icon}
      </span>
      <span className="min-w-0 text-xs leading-tight sm:text-sm">
        <span className="font-display text-sm sm:text-base">{def.title}</span> Someone waits to see the datu. Tap to hear them.
      </span>
    </button>
  );
}

/** The story and its choices; after choosing, what came of it. */
export function ChoiceDialog(props: { state: GameState; content: Content; open: boolean; onClose: () => void; dispatch: (c: Command) => void }) {
  const { state, content, open, onClose, dispatch } = props;
  const pending = state.choice;
  const def = pending && choiceDef(content, pending.id);
  const who = pending?.neighbor ? neighborDef(content, pending.neighbor) : undefined;
  const vars = { neighbor: who?.name ?? "a neighbor", datu: who?.datu ?? "their datu" };
  // After choosing, the event is gone from the state; keep the outcome to show it.
  const [outcome, setOutcome] = useState<{ title: string; icon: string; text: string } | null>(null);
  const dialog = useModal(open && (!!def || !!outcome));
  const close = () => {
    setOutcome(null);
    onClose();
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="choice-title"
      onClose={close}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/60"
    >
      <div className="mat-card max-h-[85dvh] space-y-3 overflow-y-auto p-5">
        {outcome ? (
          <>
            <h2 id="choice-title" className="font-display text-2xl text-amber-900">
              <span aria-hidden>{outcome.icon}</span> {outcome.title}
            </h2>
            <p className="text-sm leading-snug">{outcome.text}</p>
            <div className="flex justify-end">
              <button type="button" autoFocus onClick={close} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-4 py-2 text-sm font-semibold text-amber-950">
                Continue
              </button>
            </div>
          </>
        ) : def ? (
          <>
            <h2 id="choice-title" className="font-display text-2xl text-amber-900">
              <span aria-hidden>{def.icon}</span> {def.title}
            </h2>
            <p className="text-sm leading-snug">{fill(def.story, vars)}</p>
            <div className="space-y-2">
              {def.choices.map((o) => {
                const blocked = optionBlocker(state, o);
                const chips = effectChips(o.effects);
                return (
                  <button
                    key={o.id}
                    type="button"
                    disabled={!!blocked}
                    onClick={() => {
                      dispatch({ type: "choose", option: o.id });
                      setOutcome({ title: def.title, icon: def.icon, text: fill(o.result, vars) });
                    }}
                    className="game-btn block w-full border-2 border-amber-950/60 bg-amber-100 px-3 py-2 text-left text-amber-950 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <span className="block text-sm font-semibold">{fill(o.label, vars)}</span>
                    <span className="mt-0.5 flex flex-wrap gap-1 text-[11px]">
                      {chips.length ? chips.map((c) => <span key={c} className="rounded-full bg-amber-900/10 px-1.5">{c}</span>) : <span className="text-stone-500">No cost</span>}
                      {blocked && <span className="rounded-full bg-red-100 px-1.5 text-red-900">{blocked}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-stone-500">{def.sources[0]}</p>
              <button type="button" onClick={close} className="shrink-0 text-xs font-semibold text-amber-900 underline">
                Decide later
              </button>
            </div>
          </>
        ) : null}
      </div>
    </dialog>
  );
}

/** "While you were away": a few sentences about what happened. */
export function AwayDialog(props: { lines: string[] | null; onClose: () => void }) {
  const { lines, onClose } = props;
  const dialog = useModal(!!lines && lines.length > 0);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="away-title"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/60"
    >
      {lines && (
        <div className="mat-card max-h-[85dvh] space-y-3 overflow-y-auto p-5">
          <h2 id="away-title" className="font-display text-2xl text-amber-900">
            <span aria-hidden>🌅</span> While you were away
          </h2>
          <p className="text-sm text-stone-500">{lines[0]}</p>
          <div className="space-y-1.5 text-sm leading-snug">
            {lines.slice(1).map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
          <div className="flex justify-end">
            <button type="button" autoFocus onClick={onClose} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-4 py-2 text-sm font-semibold text-amber-950">
              Back to the barangay
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/** A one-time notice from the game (e.g. what a save update changed). OK dismisses it for good. */
export function NoticeDialog(props: { notice: string | null; onDismiss: () => void }) {
  const { notice, onDismiss } = props;
  const dialog = useModal(!!notice);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="notice-title"
      onClose={onDismiss}
      className="m-auto w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/60"
    >
      {notice && (
        <div className="mat-card space-y-3 p-5">
          <h2 id="notice-title" className="font-display text-xl text-amber-900">
            <span aria-hidden>📜</span> A note for the datu
          </h2>
          <p className="text-sm leading-snug">{notice}</p>
          <div className="flex justify-end">
            <button type="button" autoFocus onClick={onDismiss} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-4 py-2 text-sm font-semibold text-amber-950">
              OK
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
