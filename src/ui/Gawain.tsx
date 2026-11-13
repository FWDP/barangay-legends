// Mga Gawain (the task chain), named villagers' cards and the barangay history.
import { onArawText } from "./Days";
import { useState } from "react";
import type { Content } from "../engine/content";
import type { GameState } from "../engine/game";
import { currentTask, earnedTitles, taskProgress } from "../engine/gawain";
import type { NamedVillager } from "../engine/people";
import { datuLevelNeeded, maxDatuLevel, nextDatuLevel } from "../engine/datu";
import { datuHouseUrl, houseStyleFor } from "./datuHouseArt";
import { asCost, canAfford } from "../engine/game";
import { costText } from "./format";
import type { Lang } from "./settings";
import { useModal } from "./StoryDialogs";
import { historyLine, rewardText, villagerCard } from "./stories";
import { fill, type GameText } from "./uiContent";

const OPEN_KEY = "barangay-legends/gawain-open";

function loadOpen(): boolean {
  try {
    const v = localStorage.getItem(OPEN_KEY);
    // Open by default on wide screens, folded on phones.
    return v === null ? window.matchMedia?.("(min-width: 640px)").matches === true : v === "1";
  } catch {
    return false;
  }
}

/**
 * The current task, always on screen at the map's left edge. Folded it is a slim tab with the
 * task's text; open it shows progress, the reward and the history button.
 */
export function GawainPanel(props: { state: GameState; content: Content; game: GameText; lang: Lang; onHistory: () => void; inline?: boolean }) {
  const { state, content, game, lang, onHistory, inline = false } = props;
  const [open, setOpen] = useState(loadOpen);
  if (content.quests.length === 0) return null;
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(OPEN_KEY, open ? "0" : "1");
    } catch {
      // Storage blocked: the panel forgets on reload.
    }
  };
  const t = game.gawain;
  const q = currentTask(state, content);
  const total = content.quests.length;
  const n = state.gawainDone.length + 1;
  const p = q ? taskProgress(state, content, q) : null;
  const text = q ? q.text[lang] : t.moreSoon[lang];
  return (
    <section
      data-map-overlay={inline ? undefined : true}
      aria-label={t.title[lang]}
      className={inline ? "pointer-events-auto max-w-full" : "pointer-events-auto absolute top-14 left-2 z-10 max-w-[min(15rem,calc(100%-5rem))] sm:top-16"}
    >
      {open ? (
        <div className="mat-card rounded-xl border-2 border-amber-900/70 p-2.5 text-stone-800 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-sm leading-tight text-amber-900">
              <span aria-hidden>📜</span> {t.title[lang]}
              <span className="ml-1 font-sans text-[10px] font-normal text-stone-500">{q ? fill(t.count[lang], { n, total }) : fill(t.allDone[lang], { total })}</span>
            </h2>
            <button type="button" onClick={toggle} aria-label={t.close[lang]} className="-mt-1 -mr-1 px-1 text-sm text-stone-500">
              ✕
            </button>
          </div>
          <p className="mt-1 text-sm leading-snug font-semibold">{text}</p>
          {q && p && p.need > 1 && (
            <div className="mt-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-amber-900/15" role="progressbar" aria-valuemin={0} aria-valuemax={p.need} aria-valuenow={Math.min(p.have, p.need)}>
                <div className="h-full rounded-full bg-lime-600" style={{ width: `${Math.min(100, (100 * p.have) / p.need)}%` }} />
              </div>
              <span className="text-[11px] text-stone-500 tabular-nums">{fill(t.progress[lang], { have: Math.min(p.have, p.need), need: p.need })}</span>
            </div>
          )}
          {q && <p className="mt-1 text-xs text-amber-900">{fill(t.reward[lang], { reward: rewardText(q, game, lang) })}</p>}
          <button type="button" onClick={onHistory} className="mt-1.5 text-xs font-semibold text-amber-800 underline underline-offset-2">
            {t.history[lang]}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-label={`${t.open[lang]}: ${text}`}
          className="wood-panel flex max-w-full items-center gap-1.5 rounded-xl border-2 border-amber-950/70 py-1 pr-2 pl-1.5 text-left text-amber-50 shadow-lg"
        >
          <span aria-hidden className="text-lg leading-none">
            📜
          </span>
          <span className="min-w-0 text-xs leading-tight">
            <span className="block truncate font-semibold">{text}</span>
            {q && p && p.need > 1 && <span className="block text-[10px] text-amber-200/90 tabular-nums">{fill(t.progress[lang], { have: Math.min(p.have, p.need), need: p.need })}</span>}
          </span>
        </button>
      )}
    </section>
  );
}

/** A named villager's card: tap their sprite (the one with a star). */
export function VillagerDialog(props: { villager: NamedVillager | null; content: Content; game: GameText; lang: Lang; onClose: () => void }) {
  const { villager, content, game, lang, onClose } = props;
  const dialog = useModal(!!villager);
  const card = villager ? villagerCard(villager, content, game, lang) : null;
  return (
    <dialog
      ref={dialog}
      aria-labelledby="villager-name"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-xs rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/50"
    >
      {card && (
        <div className="mat-card space-y-2 p-4">
          <h2 id="villager-name" className="font-display text-xl text-amber-900">
            <span aria-hidden>⭐</span> {card.name}
          </h2>
          <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{card.role}</p>
          <p className="text-sm leading-snug italic">“{card.story}”</p>
          {card.sick && <p className="text-xs text-red-800">🤒 {card.sick}</p>}
          <div className="flex justify-end">
            <button type="button" autoFocus onClick={onClose} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-4 py-1.5 text-sm font-semibold text-amber-950">
              {game.villager.close[lang]}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/** The barangay history: newest first, with the titles the datu has earned. */
export function HistoryDialog(props: { open: boolean; state: GameState; content: Content; game: GameText; lang: Lang; onClose: () => void }) {
  const { open, state, content, game, lang, onClose } = props;
  const dialog = useModal(open);
  const titles = earnedTitles(state, content);
  const entries = [...state.history].reverse();
  return (
    <dialog
      ref={dialog}
      aria-labelledby="history-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/50"
    >
      {open && (
        <div className="mat-card flex max-h-[80dvh] flex-col gap-2 p-4">
          <h2 id="history-title" className="font-display text-xl text-amber-900">
            <span aria-hidden>📜</span> {game.gawain.history[lang]}
          </h2>
          {titles.length > 0 && (
            <p className="flex flex-wrap gap-1">
              {titles.map((t) => (
                <span key={t.en} className="rounded-full border border-amber-800/40 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                  👑 {t[lang]}
                </span>
              ))}
            </p>
          )}
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto text-sm leading-snug">
            {entries.length === 0 && <li className="text-stone-500">{game.gawain.noHistory[lang]}</li>}
            {entries.map((h, i) => (
              <li key={`${h.at}-${i}`} className="border-b border-amber-900/10 pb-1">
                <span aria-hidden className="mr-1">
                  {h.kind === "task" ? "✅" : h.kind === "named" ? "⭐" : h.kind === "fell" ? "⚔️" : "👣"}
                </span>
                {historyLine(h, content, game, lang)}
                <span className="ml-1 text-[11px] whitespace-nowrap text-stone-500">· {onArawText(state, content, game, lang, h.at)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <button type="button" autoFocus onClick={onClose} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-4 py-1.5 text-sm font-semibold text-amber-950">
              {game.villager.close[lang]}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/** The Bahay ng Datu: its level, what each level gives, and raising it. */
export function DatuDialog(props: { open: boolean; state: GameState; content: Content; game: GameText; lang: Lang; onUpgrade: () => void; onClose: () => void }) {
  const { open, state, content, game, lang, onUpgrade, onClose } = props;
  const dialog = useModal(open);
  const house = content.datuHouse;
  const d = game.datu;
  const next = nextDatuLevel(state, content);
  const cost = asCost(next?.cost ?? {});
  const needs = datuLevelNeeded(state, content);
  const def = house?.datuHouse;
  return (
    <dialog
      ref={dialog}
      aria-labelledby="datu-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/50"
    >
      {open && house && def && (
        <div className="mat-card space-y-2 p-4 text-sm">
          <h2 id="datu-title" className="font-display text-xl text-amber-900">
            <img src={datuHouseUrl(state.datuLevel, houseStyleFor(state, content))} alt="" className="inline size-12 align-middle" /> {d.title[lang]}
          </h2>
          <p className="text-xs text-stone-600">
            {state.barangay.datu ? `Datu ${state.barangay.datu} · ` : ""}
            {fill(d.level[lang], { level: state.datuLevel, max: maxDatuLevel(content) })}
          </p>
          <p>{fill(d.bonus[lang], { production: (state.datuLevel - 1) * def.productionPercentPerLevel, influence: (state.datuLevel - 1) * def.influencePercentPerLevel })}</p>
          <ul className="space-y-0.5 text-xs">
            {def.levels
              .filter((l) => l.unlocks)
              .map((l) => (
                <li key={l.level} className={state.datuLevel >= l.level ? "font-semibold text-green-800" : "text-stone-500"}>
                  {state.datuLevel >= l.level ? "✅" : "🔒"} {fill(d.level[lang], { level: l.level, max: maxDatuLevel(content) })}: {d[l.unlocks!][lang]}
                </li>
              ))}
          </ul>
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs font-semibold">
              {next ? costText(cost) : d.max[lang]}
              {needs !== null && <span className="block font-normal text-red-800">🔒 {fill(game.level.needs[lang], { level: needs })}</span>}
            </span>
            {next && (
              <button
                type="button"
                disabled={!canAfford(state, cost) || needs !== null}
                onClick={onUpgrade}
                className="game-btn border-2 border-green-950 bg-green-700 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {fill(d.upgrade[lang], { level: next.level })}
              </button>
            )}
          </div>
          <div className="flex justify-end">
            <button type="button" autoFocus onClick={onClose} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-4 py-1.5 text-sm font-semibold text-amber-950">
              {d.close[lang]}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/** Tapping the Libingan: the names of the remembered, and how many others rest there. */
export function RememberedDialog(props: { open: boolean; state: GameState; content: Content; game: GameText; lang: Lang; onClose: () => void }) {
  const { open, state, content, game, lang, onClose } = props;
  const dialog = useModal(open);
  const t = game.death;
  const look = content.traditions.find((x) => x.id === state.tradition)?.burialLook ?? "jars";
  const others = Math.max(0, state.stats.deaths - state.remembered.length);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="remembered-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/50"
    >
      {open && (
        <div className="mat-card flex max-h-[80dvh] flex-col gap-2 p-4 text-sm">
          <h2 id="remembered-title" className="font-display text-xl text-amber-900">
            <span aria-hidden>{look === "longon" ? "⚰️" : "⚱️"}</span> {t.remembered[lang]}
          </h2>
          <p className="text-xs text-stone-500">{t[look][lang]}</p>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {state.remembered.length === 0 && others === 0 && <li className="text-stone-500">{t.none[lang]}</li>}
            {[...state.remembered].reverse().map((r, i) => (
              <li key={`${r.name}-${r.at}-${i}`} className="border-b border-amber-900/10 pb-1">
                🕯️ <b>{r.name}</b> <span className="text-xs text-stone-500">· {t[r.cause][lang]}</span>
              </li>
            ))}
            {others > 0 && <li className="text-xs text-stone-500 italic">{fill(t.others[lang], { count: others })}</li>}
          </ul>
          <div className="flex justify-end">
            <button type="button" autoFocus onClick={onClose} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-4 py-1.5 text-sm font-semibold text-amber-950">
              {game.villager.close[lang]}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
