// Changing your mind about a building: the menu on a placed building (Move, Demolish), the
// demolish confirmation with its warnings, and the short-lived Undo button after building.
import { ART_LORE, buildingArtUrl } from "./buildingArt";
import { healerStays, sickPlaces } from "../engine/healing";
import { boatCap, boatCost } from "../engine/sea";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Content } from "../engine/content";
import { workforce } from "../engine/clearing";
import { buildingWorkers, canAfford, canStaff, demolishPreview, moveCost, roadBonuses, undoSecondsLeft, type GameState } from "../engine/game";
import { buildingAt } from "../engine/map";
import { costText, formatAmount } from "./format";
import { levelOf, maxLevelOf, nextUpgrade, storageAt, upgradeBlocker, upgradeCost } from "../engine/upgrades";
import { fill, type GameText } from "./uiContent";
import type { Lang } from "./settings";

export interface MenuTarget {
  x: number;
  y: number;
  /** Screen point the menu opens at. */
  sx: number;
  sy: number;
}

const MENU_W = 200;

/** A small menu next to a placed building: Move, Pause (workplaces) and Demolish. */
export function BuildingMenu(props: {
  state: GameState;
  content: Content;
  target: MenuTarget | null;
  onClose: () => void;
  onMove: (x: number, y: number) => void;
  onDemolish: (x: number, y: number) => void;
  /** Pause or resume a workplace. */
  onPause: (x: number, y: number, paused: boolean) => void;
  /** Open the Dambana's offerings and rituals (shrines only). */
  onShrine?: () => void;
  /** The Libingan's list of the remembered. */
  onRemembered?: () => void;
  /** A Balangay dock: train a boat. */
  onTrainBoat?: () => void;
  /** Open a lore note (how a building with custom art is drawn, and its sources). */
  onLore?: (id: string) => void;
  aboutLabel?: string;
  /** Raise a building with upgrades (a Kamalig) one level. */
  onUpgrade?: (x: number, y: number) => void;
  /** In-game text (content/ui.json) for the upgrade lines. */
  game?: GameText;
  lang?: Lang;
}) {
  const { state, content, target, onClose, onMove, onDemolish, onPause, onShrine, onRemembered, onTrainBoat, onLore, aboutLabel, onUpgrade, game, lang = "en" } = props;
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const building = target ? buildingAt(state, target.x, target.y) : undefined;
  const def = building && content.buildings.find((d) => d.id === building.type);

  // Close on Esc or a press anywhere else.
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && onClose();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [target, onClose]);

  // Close if the building goes away (burnt down, undone...).
  useEffect(() => {
    if (target && !building) onClose();
  }, [target, building, onClose]);

  // Open next to the building, kept inside the screen; above it if there's no room below.
  useLayoutEffect(() => {
    if (!target) return setPos(null);
    const h = box.current?.offsetHeight ?? 120;
    const left = Math.min(Math.max(8, target.sx - MENU_W / 2), window.innerWidth - MENU_W - 8);
    const below = target.sy + 16;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, target.sy - h - 16) : below;
    setPos({ left, top });
    box.current?.querySelector("button")?.focus();
  }, [target]);

  if (!target || !building || !def) return null;
  const burning = building.burningSince !== undefined;
  const cost = moveCost(state, content, building.type);
  const affordable = canAfford(state, cost);
  const refund = demolishPreview(state, content, target.x, target.y)?.refund ?? {};
  // Who works here: villagers fill worker buildings on their own.
  const slots = def.workers ?? 0;
  const index = state.buildings.indexOf(building);
  const working = slots ? buildingWorkers(state, content)[index] : 0;
  const noPath = slots > 0 && !building.damaged && !canStaff(state, content, building);
  const connected = roadBonuses(state, content)[index] > 0;
  const lent = workforce(state, content).borrowed[index] ?? 0;

  return (
    <div
      ref={box}
      role="menu"
      aria-label={`${def.name} actions`}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: MENU_W }}
      className="mat-card fixed z-40 rounded-xl border-2 border-amber-900/70 p-2 text-stone-800 shadow-2xl"
    >
      <p className="flex items-center gap-1.5 px-1 pb-1.5 font-display text-base text-amber-900">
        <span aria-hidden className="text-xl leading-none">
          {buildingArtUrl(def.id) ? <img src={buildingArtUrl(def.id)!} alt="" draggable={false} className="size-[1.2em]" /> : def.icon}
        </span>
        {def.name}
      </p>
      {def.heals && game && (() => {
        // Who rests inside (healing.ts): named villagers first, then how many others.
        const t = game.healing;
        const stay = healerStays(state, content).find((h) => h.index === index);
        const away = sickPlaces(state, content).home;
        if (!stay || stay.count === 0) return <p className="px-1 pb-1.5 text-xs text-stone-600">{t.none[lang]}</p>;
        const others = stay.count - stay.named.length;
        return (
          <div className="px-1 pb-1.5 text-xs text-stone-700">
            <p className="font-semibold text-emerald-900">{fill(t.inside[lang], { n: stay.count })}</p>
            {stay.named.length > 0 && <p>{stay.named.map((v) => v.name).join(", ")}{others > 0 ? ` ${fill(t.others[lang], { n: others })}` : ""}</p>}
            {away > 0 && <p className="mt-0.5 text-stone-500">{fill(t.home[lang], { n: away })}</p>}
          </div>
        );
      })()}
      {slots > 0 && (
        <p className="px-1 pb-1.5 text-xs text-stone-600">
          👥 {working} of {slots} workers
          {building.paused ? (
            <span className="mt-0.5 block rounded bg-stone-200 px-1 text-[11px] font-semibold text-stone-700">⏸ Paused: its workers are free for other work.</span>
          ) : lent > 0 ? (
            <span className="mt-0.5 block rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-900">
              🪓 {lent} lent to clearing forest; {lent === 1 ? "they come" : "they come"} back when the job is done.
            </span>
          ) : noPath ? (
            <span className="mt-0.5 block rounded bg-red-100 px-1 text-[11px] font-semibold text-red-900">🚫 No path: workers can't walk here. Join it with a Tulay, or move it.</span>
          ) : (
            working < slots && !building.damaged && <span className="block text-[11px] text-stone-500">Free villagers fill it on their own. More houses bring more.</span>
          )}
        </p>
      )}
      {def.produces && (
        <p className="px-1 pb-1.5 text-[11px] text-stone-600">
          {connected ? (
            <span className="font-semibold text-amber-800">🛤️ Connected: +{content.rules.roads.connectedBonusPercent}% output</span>
          ) : (
            <>🛤️ {game ? fill(game.doors.joinHouse[lang], { percent: content.rules.roads.connectedBonusPercent }) : `Join it to the Bahay ng Datu with a Daan for +${content.rules.roads.connectedBonusPercent}%`}</>
          )}
        </p>
      )}
      {def.upgrades && game && (
        <p className="px-1 pb-1.5 text-xs text-stone-600">
          {fill(game.kamalig.level[lang], { level: levelOf(building), max: maxLevelOf(def) })} · {fill(game.kamalig.stores[lang], { amount: formatAmount(storageAt(def, levelOf(building)).rice ?? 0) })}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        {def.upgrades && onUpgrade && game && (() => {
          const next = nextUpgrade(content, building);
          const why = upgradeBlocker(state, content, target.x, target.y);
          return (
            <button
              type="button"
              role="menuitem"
              disabled={why !== null}
              onClick={() => onUpgrade(target.x, target.y)}
              title={why === "damaged" ? game.kamalig.damaged[lang] : why === "cost" && next ? fill(game.kamalig.cost[lang], { cost: costText(upgradeCost(content, building)) }) : undefined}
              className="game-btn flex items-center justify-between border-2 border-amber-950 bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>{next ? fill(game.kamalig.upgrade[lang], { level: next.level }) : game.kamalig.top[lang]}</span>
              {next && (
                <span className="text-right text-xs font-normal">
                  {costText(upgradeCost(content, building))}
                  <span className="block">{fill(game.kamalig.stores[lang], { amount: formatAmount(next.storage?.rice ?? 0) })}</span>
                </span>
              )}
            </button>
          );
        })()}
        {def.balangayDock && onTrainBoat && (
          <button
            type="button"
            role="menuitem"
            disabled={state.balangays >= boatCap(state, content) || !canAfford(state, boatCost(content))}
            onClick={onTrainBoat}
            className="game-btn flex items-center justify-between border-2 border-sky-950 bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>⛵ Train a Balangay</span>
            <span className="text-xs font-normal">
              {state.balangays}/{boatCap(state, content)} · {costText(boatCost(content))}
            </span>
          </button>
        )}
        {def.burial && onRemembered && (
          <button
            type="button"
            role="menuitem"
            onClick={onRemembered}
            className="game-btn flex items-center justify-between border-2 border-amber-950/60 bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-950"
          >
            <span>🕯️ The remembered</span>
            <span className="text-xs font-normal">{state.remembered.length}</span>
          </button>
        )}
        {ART_LORE[def.id] && onLore && content.lore[ART_LORE[def.id]] && (
          <button
            type="button"
            role="menuitem"
            onClick={() => onLore(ART_LORE[def.id])}
            className="game-btn flex items-center justify-between border-2 border-amber-950/60 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-950"
          >
            <span>📜 {aboutLabel}</span>
          </button>
        )}
        {def.shrine && onShrine && (
          <button
            type="button"
            role="menuitem"
            onClick={onShrine}
            className="game-btn flex items-center justify-between border-2 border-green-950 bg-green-700 px-3 py-1.5 text-sm font-semibold text-white"
          >
            <span>🕯️ Offerings and rituals</span>
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          disabled={burning || !affordable}
          onClick={() => onMove(target.x, target.y)}
          title={burning ? "Put the fire out first" : affordable ? undefined : `Moving costs ${costText(cost)}`}
          className="game-btn flex items-center justify-between border-2 border-amber-950/60 bg-amber-200 px-3 py-1.5 text-sm font-semibold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>↔️ Move</span>
          <span className="text-xs font-normal">{costText(cost)}</span>
        </button>
        {slots > 0 && (
          <button
            type="button"
            role="menuitem"
            onClick={() => onPause(target.x, target.y, !building.paused)}
            className="game-btn flex items-center justify-between border-2 border-amber-950/60 bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-950"
          >
            <span>{building.paused ? "▶️ Resume" : "⏸ Pause"}</span>
            <span className="text-xs font-normal">{building.paused ? "back to work" : "free its workers"}</span>
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          onClick={() => onDemolish(target.x, target.y)}
          className="game-btn flex items-center justify-between border-2 border-red-950 bg-red-700 px-3 py-1.5 text-sm font-semibold text-white"
        >
          <span>🔨 Demolish</span>
          <span className="text-xs font-normal">+{costText(refund)}</span>
        </button>
      </div>
    </div>
  );
}

/** Asks before tearing a building down, with what you get back and what you lose. */
export function DemolishDialog(props: {
  state: GameState;
  content: Content;
  target: { x: number; y: number } | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { state, content, target, onCancel, onConfirm } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (target && !d.open) d.showModal();
    if (!target && d.open) d.close();
  }, [target]);
  const building = target ? buildingAt(state, target.x, target.y) : undefined;
  const def = building && content.buildings.find((d) => d.id === building.type);
  const preview = target && demolishPreview(state, content, target.x, target.y);
  const bridge = content.buildings.find((d) => d.bridge);
  const leaveEvery = content.rules.secondsPerVillagerLeavingOvercrowded;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="demolish-title"
      onClose={onCancel}
      onClick={(e) => e.target === dialog.current && onCancel()}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/60"
    >
      {def && preview && (
        <div className="mat-card space-y-3 p-5">
          <h2 id="demolish-title" className="font-display text-2xl text-amber-900">
            {def.icon} Demolish {def.name}?
          </h2>
          <p className="text-sm">
            You get back <span className="font-semibold">{costText(preview.refund)}</span>, half of what the last one cost.
            {def.workers ? " Its workers go back to the free pool." : ""}
          </p>
          {preview.villagersLeaving > 0 && (
            <p className="rounded-lg bg-amber-100 p-2 text-sm font-semibold text-amber-950">
              🛖 {preview.villagersLeaving} {preview.villagersLeaving === 1 ? "villager" : "villagers"} will have no home. One
              family leaves every {leaveEvery}s until everyone has a roof again.
            </p>
          )}
          {preview.cutsOffLand && (
            <p className="rounded-lg bg-red-100 p-2 text-sm font-semibold text-red-900">
              🌊 The far bank will be cut off: nobody can walk there, and you can't clear or build there until a new{" "}
              {bridge?.name ?? "bridge"} is built.
            </p>
          )}
          {preview.stranded > 0 && (
            <p className="rounded-lg bg-red-100 p-2 text-sm font-semibold text-red-900">
              🚫 {preview.stranded} {preview.stranded === 1 ? "workplace" : "workplaces"} will have no path. Nobody will work there until a{" "}
              {bridge?.name ?? "bridge"} joins them again.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              autoFocus
              onClick={onCancel}
              className="game-btn border-2 border-green-900 bg-green-700 px-4 py-2 text-sm font-semibold text-white"
            >
              Keep it
            </button>
            <button type="button" onClick={onConfirm} className="game-btn border-2 border-red-950 bg-red-700 px-4 py-2 text-sm font-semibold text-white">
              Demolish
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/** For a few seconds after building: take it back for the full cost. */
export function UndoBar(props: { state: GameState; content: Content; onUndo: () => void }) {
  const { state, content, onUndo } = props;
  const left = undoSecondsLeft(state, content);
  const last = state.lastBuild;
  const def = last && content.buildings.find((d) => d.id === last.type);
  if (left <= 0 || !last || !def) return null;
  return (
    <div
      role="status"
      className="wood-panel pointer-events-auto flex items-center gap-2 rounded-xl border-2 border-amber-950/70 py-1.5 pr-1.5 pl-3 text-amber-50 shadow-lg"
    >
      <span className="text-sm">
        Built {def.icon} <span className="font-display">{def.name}</span>
      </span>
      <button
        type="button"
        onClick={onUndo}
        aria-label={`Undo building ${def.name} and get back ${costText(last.cost)}`}
        className="game-btn border-2 border-amber-950/60 bg-amber-200 px-2.5 py-1 text-sm font-semibold text-amber-950"
      >
        ↶ Undo <span className="tabular-nums">({Math.ceil(left)}s)</span>
      </button>
    </div>
  );
}
