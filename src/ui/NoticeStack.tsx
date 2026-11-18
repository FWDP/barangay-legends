// One banner at a time over the map (see notices.ts): the most important notification, with a
// small "+N" badge for the rest that opens into a list (on a tap or a click). Picking one from the
// list brings it forward; information can be dismissed. A big banner can be minimized (—) into
// a compact pill (icon, short title, countdown and its main buttons) that stays while its event
// lasts; on phones raid and event banners minimize themselves after a few seconds. Ongoing
// states are small status icons instead.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type React from "react";
import type { Content } from "../engine/content";
import type { GameState } from "../engine/game";
import { clock, type BannerAction } from "./EventBanners";
import { arrange, endingSoon, pickFromList, statusIcons, type Notice } from "./notices";
import type { Lang } from "./settings";
import { fill, type GameText } from "./uiContent";

export interface NoticeView {
  /** The full banner. */
  node: ReactNode;
  /** One line for the waiting list (icon and words). */
  label: string;
  /** What tapping it does (opens the trade offer, the choice, the expedition), if anything. */
  onOpen?: () => void;
  /** Minimized: a compact pill with its icon, a short title, a countdown and its main buttons. */
  pill?: { icon: ReactNode; title: string; seconds?: number; actions?: BannerAction[] };
}

/**
 * The notices sit above the map's labels and chips (z-10 and z-20 there) and its production
 * numbers (floats.tsx, z-25). Their open list is drawn on the page itself (a portal), above every
 * banner, panel and overlay, so nothing can cover it.
 */
export const NOTICE_LAYER = "z-30";
export const NOTICE_LIST_LAYER = "z-[80]";
const LIST_W = 256;

/** Raid and event banners that minimize themselves on phones (narrower than PHONE_MAX_PX). */
export const AUTO_MINIMIZE = ["raid", "fire", "hunger", "typhoon", "eclipse", "tikbalang", "sickness", "overcrowded", "damaged", "pest"];
export const AUTO_MINIMIZE_MS = 3000;
export const PHONE_MAX_PX = 767;

/** What the player has done with the notices (kept by the App, so it survives the stack moving). */
export interface NoticeUi {
  dismissed: Set<string>;
  front: string | null;
  open: boolean;
  /** Minimized notices (shown as pills). */
  minimized: Set<string>;
  /** Notices the player opened again from their pill: not minimized again automatically. */
  kept: Set<string>;
  set: (patch: Partial<Omit<NoticeUi, "set">>) => void;
}

export function useNoticeUi(): NoticeUi {
  const [ui, setUi] = useState<Omit<NoticeUi, "set">>(() => ({ dismissed: new Set(), front: null, open: false, minimized: new Set(), kept: new Set() }));
  return { ...ui, set: (patch) => setUi((u) => ({ ...u, ...patch })) };
}

const isPhone = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(`(max-width: ${PHONE_MAX_PX}px)`).matches;

export function NoticeStack(props: {
  state: GameState;
  queue: Notice[];
  views: Record<string, NoticeView | undefined>;
  game: GameText;
  lang: Lang;
  /** The App's notice state; a stack on its own keeps its own. */
  ui?: NoticeUi;
  /** At the bottom of the map (clear of the raid), the list opens upward. */
  side?: "top" | "bottom";
}) {
  const { state, queue, views, game, lang, side = "top" } = props;
  const t = game.notices;
  const p = game.pills;
  const own = useNoticeUi();
  const ui = props.ui ?? own;
  const { dismissed, front, open, minimized, kept } = ui;
  // Only notices with something to show take part.
  const present = queue.filter((n) => views[n.id]);
  const { shown, pills, waiting } = arrange(present, dismissed, front, minimized);

  // A notice that has gone (its event over) forgets it was minimized: the next raid starts in full.
  const ids = present.map((n) => n.id).join(",");
  const set = useRef(ui.set);
  set.current = ui.set;
  useEffect(() => {
    const now = new Set(ids.split(","));
    const keep = (s: Set<string>) => [...s].every((id) => now.has(id));
    if (!keep(minimized) || !keep(kept)) {
      set.current({ minimized: new Set([...minimized].filter((id) => now.has(id))), kept: new Set([...kept].filter((id) => now.has(id))) });
    }
  }, [ids, minimized, kept]);

  // On phones a raid or event banner shows in full for its first few seconds, then minimizes.
  const autoId = shown && AUTO_MINIMIZE.includes(shown.id) && views[shown.id]?.pill && !kept.has(shown.id) ? shown.id : null;
  useEffect(() => {
    if (!autoId || !isPhone()) return;
    const timer = setTimeout(() => {
      if (isPhone()) set.current({ minimized: new Set([...minimizedRef.current, autoId]) });
    }, AUTO_MINIMIZE_MS);
    return () => clearTimeout(timer);
  }, [autoId]);
  const minimizedRef = useRef(minimized);
  minimizedRef.current = minimized;

  // The open list's place on the page: under the badge (over it at the bottom), kept on screen.
  const badge = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ left: number; top: number; bottom: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const el = badge.current;
      if (!open || !el) return setAt((a) => (a ? null : a));
      const r = el.getBoundingClientRect();
      const w = Math.min(LIST_W, window.innerWidth - 16);
      const next = { left: Math.round(Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))), top: Math.round(r.bottom + 4), bottom: Math.round(window.innerHeight - r.top + 4) };
      setAt((a) => (a && a.left === next.left && a.top === next.top && a.bottom === next.bottom ? a : next));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  });

  if (!shown && pills.length === 0) return null;
  const soon = endingSoon(waiting, state.time);
  const minimize = (id: string) => ui.set({ minimized: new Set(minimized).add(id), front: front === id ? null : front });
  const expand = (id: string) => {
    const m = new Set(minimized);
    m.delete(id);
    ui.set({ minimized: m, kept: new Set(kept).add(id), front: id });
  };
  const view = shown ? views[shown.id]! : null;
  return (
    <div className={`pointer-events-none flex w-full max-w-full flex-col items-center gap-1 sm:w-auto ${side === "bottom" ? "flex-col-reverse" : ""}`} data-notice-side={side}>
      {pills.length > 0 && (
        <div className="pointer-events-none flex max-w-full flex-wrap justify-center gap-1">
          {pills.map((n) => (
            <Pill key={n.id} notice={n} view={views[n.id]!} state={state} expandLabel={p.expand[lang]} onExpand={() => expand(n.id)} />
          ))}
        </div>
      )}
      {shown && view && (
        /* The banner, kept to the top strip of the map on phones; minimize and dismiss beside it, never over its buttons. */
        <div className="flex max-w-full items-start gap-1">
          <div
            className={`pointer-events-auto relative max-h-[22vh] min-w-0 max-w-full overflow-y-auto overscroll-contain sm:max-h-none ${view.onOpen ? "cursor-pointer" : ""}`}
            data-notice={shown.id}
            {...(view.onOpen
              ? {
                  role: "button",
                  tabIndex: 0,
                  "aria-label": view.label,
                  // A tap on the banner opens it; its own buttons keep their job.
                  onClick: (e: React.MouseEvent) => {
                    if (!(e.target as HTMLElement).closest("button,a,input,select")) view.onOpen!();
                  },
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                      e.preventDefault();
                      view.onOpen!();
                    }
                  },
                }
              : {})}
          >
            {view.node}
          </div>
          {(shown.dismissKey || view.pill) && (
            <span className="pointer-events-auto flex shrink-0 flex-col gap-1">
              {view.pill && (
                <button
                  type="button"
                  aria-label={p.minimize[lang]}
                  title={p.minimize[lang]}
                  data-minimize={shown.id}
                  onClick={() => minimize(shown.id)}
                  className="flex size-7 items-center justify-center rounded-full border border-amber-950/40 bg-stone-900/75 text-sm leading-none font-bold text-amber-50 shadow"
                >
                  —
                </button>
              )}
              {shown.dismissKey && (
                <button
                  type="button"
                  aria-label={t.dismiss[lang]}
                  onClick={() => ui.set({ dismissed: new Set(dismissed).add(shown.dismissKey!), front: null })}
                  className="flex size-7 items-center justify-center rounded-full border border-amber-950/40 bg-stone-900/75 text-xs text-amber-50 shadow"
                >
                  ✕
                </button>
              )}
            </span>
          )}
        </div>
      )}
      {waiting.length > 0 && (
        <div className="pointer-events-auto relative flex flex-col items-center">
          <button
            ref={badge}
            type="button"
            aria-expanded={open}
            aria-label={`${fill(t.moreLabel[lang], { n: waiting.length })}${soon ? ` · ${t.soon[lang]}` : ""}`}
            data-notice-more
            // A tap and a click open it alike (phones have no hover).
            onClick={() => ui.set({ open: !open })}
            className={`min-h-7 min-w-9 touch-manipulation rounded-full border-2 px-2 py-0.5 font-display text-xs shadow ${soon ? "border-red-950 bg-red-600 text-white motion-safe:animate-pulse" : "border-amber-950/60 bg-amber-200 text-amber-950"}`}
          >
            {fill(t.more[lang], { n: waiting.length })}
            {soon && " ⏳"}
          </button>
          {open &&
            at &&
            createPortal(
              <div className={`fixed ${NOTICE_LIST_LAYER}`} style={{ left: at.left, ...(side === "bottom" ? { bottom: at.bottom } : { top: at.top }), width: LIST_W, maxWidth: "calc(100vw - 1rem)" }}>
                <NoticeList
                  waiting={waiting}
                  views={views}
                  state={state}
                  label={t.list[lang]}
                  onPick={(id) => {
                    // It comes forward (an action-now banner steps aside to its pill) and opens.
                    const picked = pickFromList(present, ui, id, (x) => !!views[x]?.pill);
                    ui.set({ ...picked, open: false });
                    views[id]!.onOpen?.();
                  }}
                />
              </div>,
              document.body,
            )}
        </div>
      )}
    </div>
  );
}

/** The waiting notices: each opens on a tap or a click (and leaves the list). */
export function NoticeList(props: { waiting: Notice[]; views: Record<string, NoticeView | undefined>; state: GameState; label: string; onPick: (id: string) => void }) {
  const { waiting, views, state, label, onPick } = props;
  return (
    <ul aria-label={label} data-notice-list className="mat-card pointer-events-auto space-y-0.5 rounded-xl border-2 border-amber-900/60 p-1.5 text-xs text-stone-800 shadow-lg">
      {waiting.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            data-notice-item={n.id}
            onClick={() => onPick(n.id)}
            className="flex min-h-9 w-full touch-manipulation items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-amber-100"
          >
            <span className="min-w-0">{views[n.id]!.label}</span>
            {n.paused ? (
              <span className="shrink-0" aria-hidden>
                ⏸
              </span>
            ) : (
              n.expiresAt !== undefined && <span className={`shrink-0 tabular-nums ${n.expiresAt - state.time <= 15 ? "font-bold text-red-700" : "text-stone-500"}`}>{clock(n.expiresAt - state.time)}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A minimized banner: icon, short title and countdown (tap to show it in full), and its main buttons. */
function Pill({ notice, view, state, expandLabel, onExpand }: { notice: Notice; view: NoticeView; state: GameState; expandLabel: string; onExpand: () => void }) {
  const pill = view.pill!;
  const seconds = pill.seconds ?? (notice.expiresAt !== undefined ? notice.expiresAt - state.time : undefined);
  const danger = notice.tier === 0;
  return (
    <div
      data-pill={notice.id}
      className={`pointer-events-auto flex max-w-full items-center gap-1 rounded-full border-2 py-0.5 pr-0.5 pl-1 shadow-lg ${danger ? "border-red-950 bg-red-700 text-white" : "wood-panel border-amber-950/70 text-amber-50"}`}
    >
      <button type="button" onClick={onExpand} aria-label={`${pill.title}${seconds !== undefined ? ` ${clock(seconds)}` : ""}: ${expandLabel}`} title={expandLabel} className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap">
        <span aria-hidden className="text-sm leading-none">
          {pill.icon}
        </span>
        <span className="font-display">{pill.title}</span>
        {seconds !== undefined && <span className="tabular-nums">{clock(seconds)}</span>}
      </button>
      {pill.actions?.map((a) => (
        <button
          key={a.label}
          type="button"
          title={a.tip}
          aria-label={`${a.label}: ${a.tip}`}
          disabled={a.disabled}
          onClick={a.onClick}
          className="game-btn flex shrink-0 items-center gap-1 border-2 border-amber-950 bg-amber-300 px-1.5 py-0.5 text-[11px] font-semibold text-amber-950 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {a.icon}
          <span className="max-[400px]:sr-only">{a.label}</span>
        </button>
      ))}
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
