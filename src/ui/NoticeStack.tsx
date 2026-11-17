// One banner at a time over the map (see notices.ts): the most important notification, with a
// small "+N" badge for the rest that opens into a list. Picking one from the list brings it
// forward; information can be dismissed. Ongoing states are small status icons instead.
import { useState, type ReactNode } from "react";
import type React from "react";
import type { Content } from "../engine/content";
import type { GameState } from "../engine/game";
import { clock } from "./EventBanners";
import { arrange, endingSoon, statusIcons, type Notice } from "./notices";
import type { Lang } from "./settings";
import { fill, type GameText } from "./uiContent";

export interface NoticeView {
  /** The full banner. */
  node: ReactNode;
  /** One line for the waiting list (icon and words). */
  label: string;
  /** What tapping it does (opens the trade offer, the choice, the expedition), if anything. */
  onOpen?: () => void;
}

/** The notices sit above the map's labels and chips (z-10 and z-20 there), and their list above them all. */
export const NOTICE_LAYER = "z-30";
export const NOTICE_LIST_LAYER = "z-40";

export function NoticeStack(props: { state: GameState; queue: Notice[]; views: Record<string, NoticeView | undefined>; game: GameText; lang: Lang }) {
  const { state, queue, views, game, lang } = props;
  const t = game.notices;
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [front, setFront] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // Only notices with something to show take part.
  const { shown, waiting } = arrange(
    queue.filter((n) => views[n.id]),
    dismissed,
    front,
  );
  if (!shown) return null;
  const soon = endingSoon(waiting, state.time);
  return (
    <div className="pointer-events-none flex w-full max-w-full flex-col items-center gap-1 sm:w-auto">
      {/* The banner, kept to the top strip of the map on phones. */}
      <div
        className={`pointer-events-auto relative max-h-[22vh] max-w-full overflow-y-auto overscroll-contain sm:max-h-none ${views[shown.id]!.onOpen ? "cursor-pointer" : ""}`}
        data-notice={shown.id}
        {...(views[shown.id]!.onOpen
          ? {
              role: "button",
              tabIndex: 0,
              "aria-label": views[shown.id]!.label,
              // A tap on the banner opens it; its own buttons (an action, ✕) keep their job.
              onClick: (e: React.MouseEvent) => {
                if (!(e.target as HTMLElement).closest("button,a,input,select")) views[shown.id]!.onOpen!();
              },
              onKeyDown: (e: React.KeyboardEvent) => {
                if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                  e.preventDefault();
                  views[shown.id]!.onOpen!();
                }
              },
            }
          : {})}
      >
        {views[shown.id]!.node}
        {shown.dismissKey && (
          <button
            type="button"
            aria-label={t.dismiss[lang]}
            onClick={() => {
              setDismissed((d) => new Set(d).add(shown.dismissKey!));
              setFront(null);
            }}
            className="absolute top-0.5 right-0.5 flex size-6 items-center justify-center rounded-full bg-stone-900/60 text-xs text-amber-50"
          >
            ✕
          </button>
        )}
      </div>
      {waiting.length > 0 && (
        <div className={`pointer-events-auto relative flex flex-col items-center ${NOTICE_LIST_LAYER}`}>
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${fill(t.moreLabel[lang], { n: waiting.length })}${soon ? ` · ${t.soon[lang]}` : ""}`}
            onClick={() => setOpen((o) => !o)}
            className={`rounded-full border-2 px-2 py-0.5 font-display text-xs shadow ${soon ? "border-red-950 bg-red-600 text-white motion-safe:animate-pulse" : "border-amber-950/60 bg-amber-200 text-amber-950"}`}
          >
            {fill(t.more[lang], { n: waiting.length })}
            {soon && " ⏳"}
          </button>
          {open && (
            <ul aria-label={t.list[lang]} className="mat-card relative mt-1 w-64 max-w-[calc(100vw-5rem)] space-y-0.5 rounded-xl border-2 border-amber-900/60 p-1.5 text-xs text-stone-800 shadow-lg">
              {waiting.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setFront(n.id);
                      setOpen(false);
                      views[n.id]!.onOpen?.();
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-amber-100"
                  >
                    <span className="min-w-0">{views[n.id]!.label}</span>
                    {n.expiresAt !== undefined && <span className={`shrink-0 tabular-nums ${n.expiresAt - state.time <= 15 ? "font-bold text-red-700" : "text-stone-500"}`}>{clock(n.expiresAt - state.time)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** What a status icon means (its tip). */
export function statusText(id: string, detail: string, game: GameText, lang: Lang): string {
  const t = game.notices;
  return id === "mourning" ? fill(t.mourning[lang], { time: clock(Number(detail)) }) : id === "embargo" ? fill(t.embargo[lang], { names: detail }) : id === "blessings" ? fill(t.blessings[lang], { names: detail }) : id === "tired" ? t.tired[lang] : t.tradePaused[lang];
}

/** Small status icons for ongoing states, each with a short tip (tap on phones, hover on desktop). */
export function StatusIcons(props: { state: GameState; content: Content; game: GameText; lang: Lang; className?: string; tradeHeld?: boolean }) {
  const { state, content, game, lang, className = "", tradeHeld = false } = props;
  const t = game.notices;
  const [tip, setTip] = useState<string | null>(null);
  const list = statusIcons(state, content, lang, tradeHeld);
  if (list.length === 0) return null;
  const text = (id: string, detail: string) => statusText(id, detail, game, lang);
  return (
    <div role="group" aria-label={t.status[lang]} className={`pointer-events-auto relative flex flex-col items-end gap-1 ${className}`}>
      <div className="flex gap-1">
        {list.map((s) => (
          <button
            key={s.id}
            type="button"
            title={text(s.id, s.detail)}
            aria-label={text(s.id, s.detail)}
            onClick={() => setTip((x) => (x === s.id ? null : s.id))}
            className="flex size-7 items-center justify-center rounded-lg bg-stone-900/55 text-base leading-none shadow"
          >
            <span aria-hidden>{s.icon}</span>
          </button>
        ))}
      </div>
      {tip && list.some((s) => s.id === tip) && (
        <p role="status" className="absolute top-8 right-0 z-20 w-56 rounded-lg bg-stone-900/90 px-2 py-1 text-[11px] leading-snug text-amber-50 shadow-lg">
          {text(tip, list.find((s) => s.id === tip)!.detail)}
        </p>
      )}
    </div>
  );
}
