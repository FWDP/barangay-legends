import { useEffect, useRef, useState } from "react";
import { RESOURCES, type Content, type Resource } from "../engine/content";
import type { Command, GameState } from "../engine/game";
import { neighborDef, type Path, type Report } from "../engine/region";
import { clock } from "./EventBanners";
import { formatDuration, RESOURCE_ICON } from "./format";

const goods = (g?: Partial<Record<Resource, number>>) =>
  RESOURCES.filter((r) => (g?.[r] ?? 0) > 0)
    .map((r) => `${g![r]} ${RESOURCE_ICON[r]}`)
    .join(" and ") || "nothing";

/** What happened at the landing: warriors who didn't make it, and whether a Kuta covered it. */
function border(report: Report): string[] {
  const lines: string[] = [];
  if (report.late) lines.push(`${report.late} ${report.late === 1 ? "warrior was" : "warriors were"} too far away to reach the shore in time.`);
  return lines;
}

/** The title and short lines of a report. Captives never appear: goods are abstract tribute. */
export function describeReport(report: Report, content: Content): { icon: string; title: string; lines: string[] } {
  const who = neighborDef(content, report.neighbor);
  const name = who?.name ?? report.neighbor;
  const odds =
    report.attack !== undefined && report.defense !== undefined
      ? `Attack ${report.attack} vs defense ${Math.round(report.defense)} (${Math.round((report.chance ?? 0) * 100)}% chance).`
      : "";
  switch (report.kind) {
    case "raid":
      return report.win
        ? {
            icon: "🏆",
            title: `Mangayaw on ${name}: victory`,
            lines: [odds, `Tribute brought home: ${goods(report.loot)}.`, `Warriors lost: ${report.ourLosses} of ours, ${report.theirLosses} of theirs.`, `+${report.renown} renown. The other barangays trust you less.`],
          }
        : {
            icon: "💥",
            title: `Mangayaw on ${name}: driven back`,
            lines: [odds, `Warriors lost: ${report.ourLosses} of ours, ${report.theirLosses} of theirs.`, "Nothing was taken."],
          };
    case "defense":
      return report.win
        ? {
            icon: "🛡️",
            title: `${name}'s raid was beaten back at the shore`,
            lines: [odds, `Warriors lost: ${report.ourLosses} of ours, ${report.theirLosses} of theirs.`, ...border(report), `+${report.renown} renown.`],
          }
        : {
            icon: "🔥",
            title: `${name} raided your barangay`,
            lines: [odds, `They carried off ${goods(report.lost)}. Your buildings stand.`, `Warriors lost: ${report.ourLosses} of ours, ${report.theirLosses} of theirs.`, ...border(report)],
          };
    case "tributary":
      return { icon: "🏵️", title: `${name} is now your tributary`, lines: [`${who?.datu ?? "Their datu"} will send a share of their harvest every minute. Keep them loyal.`] };
    case "alliance":
      return { icon: "🩸", title: `Sandugo with ${name}`, lines: ["A blood compact binds your peoples. They will help defend you."] };
    case "rebellion":
      return { icon: "⚠️", title: `${name} has rebelled`, lines: ["Their loyalty ran out. They are independent again. Trade with or protect your tributaries."] };
  }
}

/** The newest report id, for marking everything already in a save as seen. */
export const latestReportId = (state: GameState) => (state.region?.reports ?? []).reduce((m, r) => Math.max(m, r.id), 0);

/** The first report the player hasn't seen yet, if any. */
export const unseenReport = (state: GameState, seen: number) => (state.region?.reports ?? []).find((r) => r.id > seen);

/** Shows each new report once, as a short dialog. */
export function ReportDialog(props: {
  state: GameState;
  content: Content;
  seen: number;
  onSeen: (id: number) => void;
  hold?: boolean;
  names?: (r: Report) => string[];
  /** Panoorin: what watching this report's battle does, or null if it can't be watched. */
  onWatch?: (r: Report) => (() => void) | null;
  watchLabel?: string;
  /** Why a defense went the way it did, in one line (defense.ts raidReason), or null. */
  reason?: (r: Report) => string | null;
  /** "Show me": the uncovered shoreline on the map, for a raid that landed where no Kuta reached. */
  onShowShore?: (r: Report) => (() => void) | null;
  showLabel?: string;
}) {
  const { state, content, seen, onSeen: setSeen, hold = false, names, onWatch, watchLabel, reason, onShowShore, showLabel } = props;
  // Held back while the battle plays out on the map.
  const next = hold ? undefined : unseenReport(state, seen);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (next && !d.open) d.showModal();
    if (!next && d.open) d.close();
  }, [next]);
  const close = () => next && setSeen(next.id);
  const described = next ? describeReport(next, content) : null;
  // Named villagers in the battle: who fell, or who led the defense.
  const text = described && next ? { ...described, lines: [...described.lines, ...(names?.(next) ?? [])] } : null;
  return (
    <dialog
      ref={dialog}
      aria-labelledby="report-title"
      onClose={close}
      onClick={(e) => e.target === dialog.current && close()}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/50"
    >
      {text && next && (
        <div className="mat-card space-y-2 p-5">
          <p className="text-xs tracking-wide text-stone-500 uppercase">Ulat · report · {clock(next.time)}</p>
          <h2 id="report-title" className="font-display text-2xl text-amber-900">
            <span aria-hidden>{text.icon}</span> {text.title}
          </h2>
          {reason?.(next) && <p className="rounded-lg bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-950">{reason(next)}</p>}
          <ul className="space-y-1 text-sm">
            {text.lines.filter(Boolean).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            {(() => {
              const show = onShowShore?.(next);
              return show ? (
                <button type="button" onClick={show} className="game-btn border-2 border-amber-950/60 bg-amber-600 px-4 py-2 text-sm font-semibold text-white">
                  {showLabel}
                </button>
              ) : null;
            })()}
            {(() => {
              const go = onWatch?.(next);
              return go ? (
                <button type="button" onClick={go} className="game-btn border-2 border-amber-950/60 bg-stone-200 px-4 py-2 text-sm font-semibold text-stone-900">
                  🎬 {watchLabel}
                </button>
              ) : null;
            })()}
            <button type="button" autoFocus onClick={close} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-4 py-2 text-sm font-semibold text-amber-950">
              OK
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/**
 * A neighbor's trade offer, with accept and decline. On the barangay map it starts folded: a
 * bangka sails in and docks, and tapping the boat (or this bar) opens the offer.
 */
export function OfferBar(props: {
  state: GameState;
  content: Content;
  dispatch: (c: Command) => void;
  /** Show only a short line about the boat until the player opens it. */
  folded?: boolean;
  /** The boat is still on its way. */
  sailing?: boolean;
  /** Trade is paused for a raid (until the boat is back at the dock). */
  held?: boolean;
  onOpen?: () => void;
}) {
  const { state, content, dispatch, folded = false, sailing = false, held = false, onOpen } = props;
  const offer = state.region?.offer;
  if (!offer) return null;
  const who = neighborDef(content, offer.from);
  const canPay = state.resources[offer.want.resource] >= offer.want.amount;
  if (held) {
    return (
      <div role="status" className="wood-panel pointer-events-auto flex max-w-full items-center gap-2 rounded-xl border-2 border-red-900 px-3 py-1.5 text-xs leading-tight text-amber-50 shadow-lg sm:text-sm">
        <span className="text-xl leading-none" aria-hidden>
          🛶
        </span>
        <span>
          <b>⏸ Trade paused — raid in progress.</b> The bangka from <span className="font-display">{who?.name ?? offer.from}</span> waits offshore and
          comes back after.
        </span>
      </div>
    );
  }
  if (folded) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="wood-panel pointer-events-auto flex max-w-full items-center gap-2 rounded-xl border-2 border-amber-950/70 px-3 py-1.5 text-left text-xs leading-tight text-amber-50 shadow-lg sm:text-sm"
      >
        <span className="text-xl leading-none" aria-hidden>
          🛶
        </span>
        <span>
          {sailing ? (
            <>A bangka from <span className="font-display">{who?.name ?? offer.from}</span> is sailing in…</>
          ) : (
            <>A bangka from <span className="font-display">{who?.name ?? offer.from}</span> has docked. Tap the boat, or here, to trade · {clock(offer.expiresAt - state.time)}</>
          )}
        </span>
      </button>
    );
  }
  return (
    <div role="status" className="wood-panel pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-xl border-2 border-amber-950/70 px-3 py-1.5 text-amber-50 shadow-lg">
      <span className="text-xl leading-none" aria-hidden>
        🛶
      </span>
      <span className="min-w-0 flex-1 text-xs leading-tight sm:text-sm">
        <span className="font-display">{who?.name ?? offer.from}</span> offers {offer.give.amount} {RESOURCE_ICON[offer.give.resource]} for {offer.want.amount}{" "}
        {RESOURCE_ICON[offer.want.resource]} · {clock(offer.expiresAt - state.time)}
      </span>
      <button type="button" disabled={!canPay} onClick={() => dispatch({ type: "acceptOffer" })} className="game-btn border-2 border-green-950 bg-green-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">
        Accept
      </button>
      <button type="button" onClick={() => dispatch({ type: "declineOffer" })} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-2 py-1 text-xs font-semibold text-amber-950">
        No thanks
      </button>
    </div>
  );
}

const PATH_LABEL: Record<Path, string> = {
  trade: "🛶 Trade",
  marriage: "💍 Marriage alliance",
  sandugo: "🩸 Sandugo",
  mangayaw: "🔥 Mangayaw",
};

/**
 * The win screen: every neighbor is a tributary or ally. Shown once per win, then play
 * continues. `waiting` holds it back while another dialog (a report) is open.
 */
export function VictoryDialog({ state, content, waiting }: { state: GameState; content: Content; waiting: boolean }) {
  const victory = state.region?.victory ?? null;
  const key = `barangay-legends/victory-seen/${state.barangay.id}/${state.map.seed}`;
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  const dialog = useRef<HTMLDialogElement>(null);
  const show = victory !== null && !seen && !waiting;
  useEffect(() => {
    const d = dialog.current;
    if (d && show && !d.open) d.showModal();
  }, [show]);
  const close = () => {
    setSeen(true);
    try {
      localStorage.setItem(key, "1");
    } catch {
      // ignore
    }
    dialog.current?.close();
  };
  const tributaries = state.region?.neighbors.filter((n) => n.status === "tributary").length ?? 0;
  const allies = state.region?.neighbors.filter((n) => n.status === "ally").length ?? 0;
  return (
    <dialog ref={dialog} aria-labelledby="victory-title" onClose={close} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border-4 border-amber-500 p-0 shadow-2xl backdrop:bg-amber-950/70">
      {victory && (
        <div className="mat-card space-y-3 p-6 text-center text-stone-800">
          <div className="text-5xl" aria-hidden>
            🏵️
          </div>
          <h2 id="victory-title" className="font-display text-3xl text-amber-900">
            Paramount Datu
          </h2>
          <p className="text-sm">
            Every barangay along the river now looks to you: {tributaries} {tributaries === 1 ? "tributary" : "tributaries"} and {allies}{" "}
            {allies === 1 ? "ally" : "allies"}.
          </p>
          <p className="font-display text-lg">Time: {formatDuration(victory.time)}</p>
          <div>
            <p className="text-xs tracking-wide text-stone-500 uppercase">Paths you took</p>
            <ul className="mt-1 flex flex-wrap justify-center gap-1.5">
              {victory.paths.map((p) => (
                <li key={p} className="rounded-full bg-amber-200 px-2.5 py-0.5 text-sm text-amber-950">
                  {PATH_LABEL[p]}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-stone-500">Keep their loyalty, or the region may slip away again.</p>
          <button type="button" autoFocus onClick={close} className="game-btn border-2 border-amber-950/60 bg-amber-300 px-5 py-2 font-display text-amber-950">
            Keep playing
          </button>
          <p className="sr-only">{content.neighbors.length} barangays in the region.</p>
        </div>
      )}
    </dialog>
  );
}
