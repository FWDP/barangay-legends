import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { Resource } from "../engine/content";
import { buildingCost, canAfford, canMove, moveCost, owned, repairCost, roadCost, withoutBuilding } from "../engine/game";
import { buildingAt, canPlace, isUnlocked, tileAt } from "../engine/map";
import { activeJobs, affordableTiles, borrowedWorkers, canSelect, clearingCrews, jobSeconds, orderSelection, riceIsSafe, selectionCost, workforce } from "../engine/clearing";
import { BarangayMap } from "./BarangayMap";
import { BuildingMenu, DemolishDialog, UndoBar, type MenuTarget } from "./BuildingActions";
import { BuildToolbar } from "./BuildToolbar";
import { latestReportId, OfferBar, ReportDialog, unseenReport, VictoryDialog } from "./RegionOverlays";
import { RegionView } from "./RegionView";
import { activeBanners, EventBanner } from "./EventBanners";
import { FloatLayer, spawnFloat } from "./floats";
import { baleteWarning, bonusRuleText, costText, groveRuleText, RESOURCE_ICON } from "./format";
import { GatherButtons } from "./GatherButtons";
import { Hud } from "./Hud";
import { SettingsMenu } from "./SettingsMenu";
import { AdvisorBubble, useAdvisor } from "./Advisor";
import { HelpPanel } from "./HelpPanel";
import { TitleScreen } from "./TitleScreen";
import { useLang, useSettings } from "./settings";
import { initSound, isMuted, setMuted, sfx } from "./sound";
import { loadUiContent } from "./uiContent";
import { content, useGame } from "./useGame";
import { useGameSounds } from "./useGameSounds";
import { awayStory, offlineStory } from "./away";
import { AwayDialog, ChoiceBanner, ChoiceDialog } from "./StoryDialogs";
import { useReducedMotion, type Clash } from "./VillagerLayer";
import { BOAT_RETURN_MS, CLASH_MS, SAIL_SECONDS } from "./visitors";
import { tradingPaused } from "../engine/region";
import type { GameState } from "../engine/game";

const ui = loadUiContent(content);

/** Why a forest tile can't join the selection. */
const NOT_SELECTABLE = "Select forest next to your land (or next to a tile you've selected)";

/** The warning before felling an old balete: it can't be undone. */
function BaleteDialog(props: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { open: target, onCancel, onConfirm } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const lore = content.lore.balete;
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (target && !d.open) d.showModal();
    if (!target && d.open) d.close();
  }, [target]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="balete-title"
      onClose={onCancel}
      onClick={(e) => e.target === dialog.current && onCancel()}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/60"
    >
      <div className="mat-card space-y-3 p-5">
        <h2 id="balete-title" className="font-display text-2xl text-amber-900">
          🌳 Your selection includes the {lore?.name.toLowerCase() ?? "balete"}. Cut it down?
        </h2>
        {lore && <p className="text-sm text-stone-600">{lore.description}</p>}
        <p className="rounded-lg bg-red-100 p-2 text-sm font-semibold text-red-900">{baleteWarning(content)}</p>
        {lore?.tradition && <p className="text-xs text-stone-500">Tradition: {lore.tradition}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" autoFocus onClick={onCancel} className="game-btn border-2 border-green-900 bg-green-700 px-4 py-2 text-sm font-semibold text-white">
            Keep the tree
          </button>
          <button type="button" onClick={onConfirm} className="game-btn border-2 border-red-950 bg-red-700 px-4 py-2 text-sm font-semibold text-white">
            Cut it down too
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Stop clearing one tile: a full refund before work starts, half once it has. */
function CancelClearingDialog(props: { state: GameState; target: { x: number; y: number } | null; onClose: () => void; onConfirm: () => void }) {
  const { state, target, onClose, onConfirm } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const job = target ? state.clearing.find((j) => j.x === target.x && j.y === target.y) : undefined;
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (job && !d.open) d.showModal();
    if (!job && d.open) d.close();
  }, [!!job]);
  const started = !!job && job.progress > 0;
  const refund = job ? Object.fromEntries(Object.entries(job.paid).map(([r, n]) => [r, started ? Math.floor(n / 2) : n])) : {};
  return (
    <dialog
      ref={dialog}
      aria-labelledby="cancel-clear-title"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/60"
    >
      {job && (
        <div className="mat-card space-y-3 p-5">
          <h2 id="cancel-clear-title" className="font-display text-2xl text-amber-900">
            🪓 Stop clearing this tile?
          </h2>
          <p className="text-sm">
            {started ? (
              <>Work has started, so you get half back: <b>{costText(refund)}</b>.</>
            ) : (
              <>Nobody has started on it yet: you get it all back, <b>{costText(refund)}</b>.</>
            )}{" "}
            Tiles that only connected through this one are stopped too.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" autoFocus onClick={onClose} className="game-btn border-2 border-stone-400 bg-white px-4 py-2 text-sm font-semibold">
              Keep clearing
            </button>
            <button type="button" onClick={onConfirm} className="game-btn border-2 border-red-950 bg-red-700 px-4 py-2 text-sm font-semibold text-white">
              Stop and refund
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/** The selected tiles: how many, what they cost in total, and how many the barangay can pay for. */
function ClearSelectionBar(props: { state: GameState; selection: { x: number; y: number }[]; onClear: () => void; onCancel: () => void }) {
  const { state, selection, onClear, onCancel } = props;
  const n = selection.length;
  const total = selectionCost(state, content, n);
  const can = affordableTiles(state, content, n);
  const seconds = selection.reduce((t, _, i) => t + jobSeconds(state, content, i), 0);
  const crews = clearingCrews(state, content);
  const balete = selection.some((t) => tileAt(state.map, t.x, t.y) === "balete");
  return (
    <div role="status" className="wood-panel pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-xl border-2 border-amber-950/70 py-1.5 pr-1.5 pl-3 text-amber-50 shadow-lg">
      <span className="text-2xl leading-none" aria-hidden>
        🪓
      </span>
      <span className="min-w-0 flex-1 text-sm leading-tight">
        <span className="text-outline block font-display text-base">
          Clear {n} {n === 1 ? "tile" : "tiles"} · {costText(total)}
        </span>
        <span className="block text-xs text-amber-100/90">
          {can < n ? <b className="text-amber-300">You can pay for {can} of {n}. </b> : null}
          About {Math.ceil(seconds / Math.max(1, crews))}s with {crews} free {crews === 1 ? "crew" : "crews"} · +{content.rules.clearing.wood * n} 🪵
          {balete && " · 🌳 includes a balete"}
          {crews === 0 && " · waiting for free villagers"}
        </span>
      </span>
      <span className="flex gap-1.5">
        <button
          type="button"
          disabled={can === 0}
          onClick={onClear}
          className="game-btn border-2 border-green-950 bg-green-700 px-2.5 py-1 text-sm font-semibold text-white disabled:opacity-50"
        >
          {can < n ? `Clear ${can}` : "Clear"}
        </button>
        <button type="button" onClick={onCancel} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-2.5 py-1 text-sm font-semibold text-amber-950">
          Cancel
        </button>
      </span>
    </div>
  );
}

/** Jobs at work, borrowed hands and jobs waiting, when nothing is selected. Tap to see the queue. */
function ClearingQueueChip({ state, onOpen }: { state: GameState; onOpen: () => void }) {
  if (state.clearing.length === 0) return null;
  const active = activeJobs(state, content).length;
  const waiting = state.clearing.length - active;
  const borrowed = borrowedWorkers(state, content);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Clearing: ${active} at work, ${borrowed} borrowed, ${waiting} waiting. Open the queue`}
      className="pointer-events-auto rounded-full border border-amber-950/50 bg-stone-900/80 px-2.5 py-0.5 text-xs text-amber-50 shadow hover:bg-stone-900"
    >
      🪓 {active} clearing{borrowed > 0 && ` · ${borrowed} borrowed`}
      {waiting > 0 && ` · ${waiting} waiting`}
      {active === 0 && " · no free hands"} ›
    </button>
  );
}

/**
 * The clearing queue: each job with its progress (tap to stop it), and "Free workers": the
 * workplaces to pause so their villagers can clear instead of being borrowed.
 */
function ClearingQueueDialog(props: {
  state: GameState;
  open: boolean;
  onClose: () => void;
  onCancel: (x: number, y: number) => void;
  onPause: (x: number, y: number, paused: boolean) => void;
}) {
  const { state, open, onClose, onCancel, onPause } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const show = open && state.clearing.length > 0;
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (show && !d.open) d.showModal();
    if (!show && d.open) d.close();
  }, [show]);
  const working = new Set(activeJobs(state, content));
  const force = workforce(state, content);
  const borrow = content.rules.clearing.borrow;
  const safe = riceIsSafe(state, content);
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  // Suggestions: the workplaces clearing would borrow from, in the same order.
  const rank = (type: string) => (borrow.order.includes(type) ? borrow.order.indexOf(type) : borrow.order.length);
  const suggest = state.buildings
    .map((b, i) => ({ b, i, def: defs.get(b.type) }))
    // Never suggest pausing a food workplace: that's how a barangay starves.
    .filter(({ b, def }) => def?.workers && !def.produces?.rice && !b.paused && !b.damaged && (safe || !borrow.protect.includes(b.type)))
    .sort((a, b) => rank(a.b.type) - rank(b.b.type) || force.workers[b.i] + force.borrowed[b.i] - (force.workers[a.i] + force.borrowed[a.i]))
    .slice(0, 3);
  const paused = state.buildings.filter((b) => b.paused);
  const waiting = state.clearing.length - working.size;
  return (
    <dialog
      ref={dialog}
      aria-labelledby="queue-title"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/60"
    >
      {show && (
        <div className="mat-card max-h-[85dvh] space-y-3 overflow-y-auto p-5">
          <h2 id="queue-title" className="font-display text-2xl text-amber-900">
            🪓 Clearing the forest
          </h2>
          <p className="text-sm text-stone-600">
            {working.size} at work, {waiting} waiting. {force.free} free {force.free === 1 ? "villager" : "villagers"}
            {force.borrowed.some((n) => n > 0) && `, ${force.borrowed.reduce((a, b) => a + b, 0)} borrowed from workplaces`}.
          </p>
          <ol className="space-y-1.5">
            {state.clearing.map((j, n) => (
              <li key={`${j.x},${j.y}`} className="flex items-center gap-2 rounded-lg bg-white/60 px-2 py-1 text-sm">
                <span className="w-5 text-right text-xs text-stone-500 tabular-nums">{n + 1}</span>
                <span aria-hidden>{working.has(j) ? "🪓" : "⏳"}</span>
                <span className="min-w-0 flex-1">
                  {tileAt(state.map, j.x, j.y) === "balete" ? "Old balete" : "Forest"} at {j.x}, {j.y} ·{" "}
                  {working.has(j) ? `${Math.round((j.progress / j.seconds) * 100)}%` : j.progress > 0 ? `paused at ${Math.round((j.progress / j.seconds) * 100)}%` : "waiting"}
                </span>
                <button type="button" onClick={() => onCancel(j.x, j.y)} className="text-xs font-semibold text-red-800 underline">
                  Stop
                </button>
              </li>
            ))}
          </ol>
          <section className="rounded-xl border-2 border-amber-900/25 bg-white/50 p-3">
            <h3 className="font-display text-lg text-amber-900">Free workers</h3>
            <p className="text-xs text-stone-600">
              Pause a workplace and its villagers clear land instead. Paused buildings produce nothing until you resume them.
              {" Fields are never on this list: they feed everyone."}
            </p>
            <ul className="mt-2 space-y-1.5">
              {suggest.map(({ b, i, def }) => (
                <li key={`${b.x},${b.y}`} className="flex items-center gap-2 text-sm">
                  <span aria-hidden>{def!.icon}</span>
                  <span className="min-w-0 flex-1">
                    {def!.name} · {force.workers[i] + force.borrowed[i]} {force.workers[i] + force.borrowed[i] === 1 ? "worker" : "workers"}
                  </span>
                  <button type="button" onClick={() => onPause(b.x, b.y, true)} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-950">
                    ⏸ Pause
                  </button>
                </li>
              ))}
              {suggest.length === 0 && <li className="text-xs text-stone-500">No workplace to pause right now.</li>}
              {paused.map((b) => {
                const def = defs.get(b.type)!;
                return (
                  <li key={`p${b.x},${b.y}`} className="flex items-center gap-2 text-sm text-stone-600">
                    <span aria-hidden>{def.icon}</span>
                    <span className="min-w-0 flex-1">{def.name} · paused</span>
                    <button type="button" onClick={() => onPause(b.x, b.y, false)} className="game-btn border-2 border-green-950 bg-green-700 px-2 py-0.5 text-xs font-semibold text-white">
                      ▶️ Resume
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
          <div className="flex justify-end">
            <button type="button" autoFocus onClick={onClose} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-4 py-2 text-sm font-semibold text-amber-950">
              Close
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/** A short lore note (e.g. the kapre), with its tradition and source. Closes itself after a while. */
function LoreToast(props: { loreId: string | null; onClose: () => void }) {
  const { loreId, onClose } = props;
  const note = loreId ? content.lore[loreId] : null;
  useEffect(() => {
    if (!loreId) return;
    const t = setTimeout(onClose, 12000);
    return () => clearTimeout(t);
  }, [loreId, onClose]);
  if (!note) return null;
  return (
    <div
      role="status"
      className="mat-card pointer-events-auto absolute bottom-20 left-1/2 z-30 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-xl border-2 border-amber-900/70 p-3 text-stone-800 shadow-xl"
    >
      <div className="flex items-start gap-2">
        <span className="text-2xl leading-none" aria-hidden>
          🌳
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p>
            <span className="font-display text-base text-amber-900">{note.name}.</span> {note.description}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            {note.tradition && <>{note.tradition}. </>}Source: {note.sources[0]}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="game-btn border-2 border-amber-900/50 bg-amber-100 px-2 text-sm">
          ✕
        </button>
      </div>
    </div>
  );
}

export function App() {
  // The title screen shows first; the game stands still behind it until the player picks.
  const [screen, setScreen] = useState<"title" | "game">("title");
  // The "While you were away" story pauses the game, so its warnings don't run while the player reads.
  const [away, setAway] = useState<string[] | null>(null);
  const { state, dispatch, onReset, startNew, hasSave, continueGame } = useGame(screen === "game" && away === null);
  const [muted, setMutedState] = useState(isMuted);
  const [selected, setSelected] = useState<string | null>(null);
  // Forest tiles picked for clearing (in working order), and the dialogs that go with it.
  const [selection, setSelection] = useState<{ x: number; y: number }[]>([]);
  const [baleteAsk, setBaleteAsk] = useState(false);
  const [cancelJob, setCancelJob] = useState<{ x: number; y: number } | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [loreNote, setLoreNote] = useState<string | null>(null);
  const [view, setView] = useState<"barangay" | "rehiyon">("barangay");
  // Reports already in the save when it loads count as seen.
  const [seenReport, setSeenReport] = useState(() => latestReportId(state));
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [moving, setMoving] = useState<{ x: number; y: number } | null>(null);
  const [demolishing, setDemolishing] = useState<{ x: number; y: number } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  // Laying Daan footpaths (a placing mode of its own).
  const [roadMode, setRoadMode] = useState(false);
  const settings = useSettings();
  const lang = useLang();
  const closeLore = useCallback(() => setLoreNote(null), []);
  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => initSound(), []);
  useGameSounds(state, content);
  const reducedMotion = useReducedMotion();

  // A raid on the barangay plays out at the Kuta for a few seconds before its report shows.
  const [clash, setClash] = useState<(Clash & { id: number }) | null>(null);
  const newest = latestReportId(state);
  useEffect(() => {
    const r = state.region?.reports.find((x) => x.id === newest);
    if (!r || r.id <= seenReport || r.kind !== "defense") return;
    // Only when the player is watching it happen: on the map, tab visible, motion allowed.
    if (screen !== "game" || view !== "barangay" || reducedMotion || document.visibilityState !== "visible" || state.time - r.time > 2) return;
    setClash({ id: r.id, win: r.win === true, until: performance.now() + CLASH_MS });
    setTimeout(() => setClash((c) => (c?.id === r.id ? null : c)), CLASH_MS);
  }, [newest]);

  // The trade offer opens when the player taps the docked bangka (or the bar).
  const [offerOpen, setOfferOpen] = useState(false);
  const offer = state.region?.offer ?? null;
  const offerKey = offer ? `${offer.from}@${offer.expiresAt}` : "";
  useEffect(() => setOfferOpen(false), [offerKey]);
  const sailing = !!offer && !reducedMotion && state.time - (offer.expiresAt - content.rules.diplomacy.offers.expireSeconds) < SAIL_SECONDS;

  // Trading pauses from the raid warning until the waiting bangka is back at the dock (after the
  // clash, and the boat's way back: the same timing as on the map).
  const [tradeBack, setTradeBack] = useState(true);
  const raidOn = tradingPaused(state);
  useEffect(() => {
    if (raidOn) return setTradeBack(false);
    const t = setTimeout(() => setTradeBack(true), reducedMotion ? 0 : CLASH_MS + BOAT_RETURN_MS);
    return () => clearTimeout(t);
  }, [raidOn]);
  const tradeHeld = raidOn || !tradeBack;

  // A choice event, never shown during a raid.
  const [choiceOpen, setChoiceOpen] = useState(false);
  const raidComing = !!state.region?.incomingRaid;
  useEffect(() => {
    if (raidComing) setChoiceOpen(false);
  }, [raidComing]);

  // "While you were away": what happened while the tab was hidden (the game keeps running).
  const latestState = useRef(state);
  latestState.current = state;
  useEffect(() => {
    let before: GameState | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        before = latestState.current;
        return;
      }
      if (!before) return;
      const after = latestState.current;
      const lines = awayStory(before, after, content);
      before = null;
      if (lines.length === 0) return;
      setAway(lines);
      // The story already told of any battles: don't show their reports one by one too.
      setSeenReport(latestReportId(after));
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  // The adviser never talks over a battle report or a lore note.
  const advisor = useAdvisor(state, content, ui.advisor, {
    lang,
    tipsOn: settings.tips,
    blocked: screen === "title" || clash !== null || choiceOpen || away !== null || unseenReport(state, seenReport) !== undefined || loreNote !== null,
  });

  // Moving uses the same placing mode as building, with the building picked up first.
  const moved = moving ? buildingAt(state, moving.x, moving.y) : undefined;
  const movedDef = moved ? (content.buildings.find((b) => b.id === moved.type) ?? null) : null;
  const moveCostNow = moved ? moveCost(state, content, moved.type) : null;
  const moveAffordable = moveCostNow ? canAfford(state, moveCostNow) : false;
  const planState = useMemo(
    () => (moved ? withoutBuilding(state, content, moved) : undefined),
    [moved, state.buildings, state.map, state.clearing],
  );
  const building = content.buildings.find((b) => b.id === selected) ?? null;
  const placing = movedDef ?? building;
  const placingAffordable = moving
    ? moveAffordable && moved?.burningSince === undefined
    : building
      ? canAfford(state, buildingCost(content, building, owned(state, building.id)))
      : false;

  const cancelPlacing = useCallback(() => {
    setSelected(null);
    setMoving(null);
    setRoadMode(false);
  }, []);
  // Drop selected tiles that stop being selectable (cleared, queued, cut off); Esc clears it.
  useEffect(() => {
    if (selection.length === 0) return;
    const valid = orderSelection(state, selection);
    if (valid.length !== selection.length) setSelection(valid);
  }, [state.map, state.clearing]);
  useEffect(() => {
    if (selection.length === 0) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelection([]);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selection.length > 0]);
  // Drop the selection if it stops being affordable (or the moved building is gone), and let Esc cancel placing.
  useEffect(() => {
    if (placing && !placingAffordable) cancelPlacing();
    if (moving && !moved) setMoving(null);
  }, [placing, placingAffordable, moving, moved, cancelPlacing]);
  useEffect(() => {
    if (!selected && !moving && !roadMode) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancelPlacing();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected, moving, roadMode, cancelPlacing]);

  // Once the player owns every starting producer (a palayan and a woodcutter camp), gathering
  // is no longer the main income, so the buttons step back.
  const hasAutomation = content.buildings
    .filter((b) => b.unlock.start && b.produces)
    .every((b) => owned(state, b.id) > 0);

  // Keep the top of the map clear: placing shows one event banner, otherwise two.
  const banners = activeBanners(state, content).slice(0, placing ? 1 : 2);

  const gather = useCallback(
    (r: Resource, e: MouseEvent<HTMLButtonElement>) => {
      dispatch({ type: "gather", resource: r });
      sfx.gather(r);
      advisor.note("gather");
      // Keyboard presses have no pointer position, so float from the button instead.
      const rect = e.currentTarget.getBoundingClientRect();
      const fromPointer = e.clientX !== 0 || e.clientY !== 0;
      spawnFloat(
        fromPointer ? e.clientX : rect.left + rect.width / 2,
        fromPointer ? e.clientY : rect.top,
        `+${content.rules.gatherPerClick} ${RESOURCE_ICON[r]}`,
        r,
      );
    },
    [dispatch, advisor.note],
  );

  const place = (x: number, y: number) => {
    if (moving) {
      if (!placingAffordable || !canMove(state, content, moving.x, moving.y, x, y)) return;
      dispatch({ type: "move", x: moving.x, y: moving.y, toX: x, toY: y });
      sfx.build();
      setMoving(null);
      return;
    }
    if (!placing || !placingAffordable || !isUnlocked(state, placing) || !canPlace(state, content, placing, x, y)) return;
    dispatch({ type: "build", building: placing.id, x, y });
    sfx.build();
    setSelected(null);
  };

  const openMenu = (x: number, y: number, sx: number, sy: number) => {
    sfx.click();
    advisor.note("menu");
    setMenu({ x, y, sx, sy });
  };

  /** Tapping a tile: put out a fire, repair damage, open a building's menu, or start clearing forest. */
  const tapTile = (x: number, y: number, sx: number, sy: number) => {
    const say = (text: string) => spawnFloat(sx, sy, text, "info");
    const b = buildingAt(state, x, y);
    if (b?.burningSince !== undefined) {
      dispatch({ type: "extinguish", x, y });
      sfx.extinguish();
      say("Fire out! 💧");
      return;
    }
    if (b?.damaged) {
      const cost = repairCost(content, b.type);
      if (canAfford(state, cost)) {
        dispatch({ type: "repair", x, y });
        sfx.build();
        say("Repaired!");
      } else {
        say(`Need ${cost.wood} ${RESOURCE_ICON.wood}`);
      }
      return;
    }
    if (b) {
      openMenu(x, y, sx, sy);
      return;
    }
    const tile = tileAt(state.map, x, y);
    if (tile !== "forest" && tile !== "balete") return;
    // A tile already queued or being cleared: offer to cancel it.
    if (state.clearing.some((j) => j.x === x && j.y === y)) {
      sfx.click();
      setCancelJob({ x, y });
      return;
    }
    // Otherwise tapping adds the tile to the selection, or takes it out again.
    if (selection.some((p) => p.x === x && p.y === y)) {
      setSelection(orderSelection(state, selection.filter((p) => p.x !== x || p.y !== y)));
      sfx.click();
    } else if (canSelect(state, selection, x, y)) {
      setSelection(orderSelection(state, [...selection, { x, y }]));
      sfx.click();
    } else {
      say(NOT_SELECTABLE);
    }
  };

  /** A mouse drag over the forest selects an area. Balete trees are never swept up: tap them one by one. */
  const selectArea = (tiles: { x: number; y: number }[]) => {
    const forest = tiles.filter((t) => tileAt(state.map, t.x, t.y) === "forest");
    const next = orderSelection(state, [...selection, ...forest]);
    if (next.length !== selection.length) sfx.click();
    setSelection(next);
  };

  /** Queue the selection (or the part the barangay can afford). A balete asks first. */
  const confirmClearing = (confirmBalete: boolean) => {
    const order = orderSelection(state, selection);
    const n = affordableTiles(state, content, order.length);
    if (n === 0) return;
    const tiles = order.slice(0, n);
    if (!confirmBalete && tiles.some((t) => tileAt(state.map, t.x, t.y) === "balete")) {
      setBaleteAsk(true);
      return;
    }
    dispatch({ type: "clearArea", tiles, confirmBalete });
    sfx.gather("wood");
    setSelection([]);
  };

  const toggleSound = () => {
    setMuted(!muted);
    setMutedState(!muted);
    if (muted) sfx.click(); // just unmuted: confirm with a tick
  };

  const helpPanel = <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} help={ui.help} lang={lang} content={content} />;

  if (screen === "title") {
    return (
      <>
        <TitleScreen
          state={state}
          hasSave={hasSave}
          content={content}
          ui={ui}
          lang={lang}
          muted={muted}
          onToggleSound={toggleSound}
          onHelp={() => setHelpOpen(true)}
          onContinue={() => {
            // Credit the time since the last save, then tell what happened.
            const away = continueGame();
            if (away) {
              const lines = offlineStory(away.report, away.before, away.after, content);
              if (lines.length) setAway(lines);
            }
            setScreen("game");
          }}
          onNewGame={(names, mode) => {
            // Only local play exists; online (see online.ts) will branch here.
            if (mode !== "local") return;
            startNew(names);
            setSeenReport(0);
            setScreen("game");
          }}
        />
        {helpPanel}
      </>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-green-800 pt-[env(safe-area-inset-top)] text-stone-800">
      <Hud state={state} content={content}>
        {state.region && (
          <button
            type="button"
            onClick={() => {
              cancelPlacing();
              setMenu(null);
              setView(view === "barangay" ? "rehiyon" : "barangay");
              if (view === "barangay") advisor.note("rehiyon");
            }}
            aria-label={view === "barangay" ? "Open Rehiyon, the regional map" : "Back to your barangay"}
            title={view === "barangay" ? "Rehiyon" : "Barangay"}
            className={`game-btn flex h-8 items-center gap-1 border-2 border-amber-950/60 px-1.5 font-display sm:h-9 sm:px-2 text-sm text-amber-950 ${
              state.region.incomingRaid ? "bg-red-300 motion-safe:animate-pulse" : "bg-amber-200"
            }`}
          >
            <span aria-hidden className="text-lg leading-none">
              {view === "barangay" ? "🗺️" : "🛖"}
            </span>
            <span className="hidden sm:inline">{view === "barangay" ? "Rehiyon" : "Barangay"}</span>
          </button>
        )}
        <button
          type="button"
          onClick={toggleSound}
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
          aria-pressed={!muted}
          className="game-btn hidden size-9 items-center justify-center border-2 border-amber-950/60 bg-amber-200 text-lg sm:flex"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <button
          type="button"
          onClick={() => {
            sfx.click();
            setHelpOpen(true);
          }}
          aria-label={ui.help[lang].ui.title}
          title={ui.help[lang].ui.title}
          className="game-btn flex size-8 items-center justify-center border-2 border-amber-950/60 bg-amber-200 font-display text-lg text-amber-950 sm:size-9"
        >
          ?
        </button>
        <SettingsMenu onReset={onReset} muted={muted} onToggleSound={toggleSound} />
      </Hud>

      <main className="relative flex min-h-0 flex-1 flex-col">
        {view === "rehiyon" ? (
          <RegionView state={state} content={content} dispatch={dispatch} onLore={setLoreNote} />
        ) : (
        <BarangayMap
          state={state}
          content={content}
          placing={placing}
          moveFrom={moving}
          planState={planState}
          onPlace={place}
          onTapTile={tapTile}
          onBuildingMenu={openMenu}
          onSpirit={(id) => {
            sfx.click();
            setLoreNote(id);
          }}
          clash={clash}
          selection={selection}
          onSelectArea={selectArea}
          focus={menu ? { x: menu.x, y: menu.y } : null}
          road={
            roadMode
              ? {
                  costText: costText(roadCost(content)),
                  onLay: (tiles) => {
                    if (tiles.length === 0) return;
                    dispatch({ type: "road", tiles });
                    sfx.build();
                  },
                  onRemove: (x, y) => {
                    dispatch({ type: "removeRoad", x, y });
                    sfx.click();
                  },
                }
              : null
          }
          tradeHeld={tradeHeld}
          onBoat={() => {
            sfx.click();
            setOfferOpen(true);
          }}
        />
        )}
        <LoreToast loreId={loreNote} onClose={closeLore} />
        <div data-map-overlay className="pointer-events-none absolute top-2 left-1/2 z-10 flex w-max max-w-[calc(100%-1rem)] -translate-x-1/2 flex-col items-center gap-1.5">
          {view === "barangay" && selection.length > 0 && !placing && !roadMode && (
            <ClearSelectionBar state={state} selection={selection} onClear={() => confirmClearing(false)} onCancel={() => setSelection([])} />
          )}
          {view === "barangay" && selection.length === 0 && !placing && !roadMode && (
            <ClearingQueueChip
              state={state}
              onOpen={() => {
                sfx.click();
                setQueueOpen(true);
              }}
            />
          )}
          {view === "barangay" && roadMode && (
            <div
              role="status"
              className="wood-panel pointer-events-auto flex items-center gap-2 rounded-xl border-2 border-amber-950/70 py-1.5 pr-1.5 pl-3 text-amber-50 shadow-lg"
            >
              <span className="text-2xl leading-none" aria-hidden>
                🛤️
              </span>
              <span className="text-sm leading-tight">
                <span className="text-outline block font-display text-base">Lay Daan</span>
                <span className="block text-xs text-amber-100/90">
                  Tap tiles (or drag with a mouse) · {costText(roadCost(content))} each · tap a path to take it up
                </span>
              </span>
              <button
                type="button"
                onClick={cancelPlacing}
                className="game-btn border-2 border-amber-950/60 bg-amber-200 px-2.5 py-1 text-sm font-semibold text-amber-950"
              >
                Done
              </button>
            </div>
          )}
          {view === "barangay" && placing && (
            <div
              role="status"
              className="wood-panel pointer-events-auto flex items-center gap-2 rounded-xl border-2 border-amber-950/70 py-1.5 pr-1.5 pl-3 text-amber-50 shadow-lg"
            >
              <span className="text-2xl leading-none" aria-hidden>
                {placing.icon}
              </span>
              <span className="text-sm leading-tight">
                <span className="text-outline block font-display text-base">
                  {moving ? "Move" : "Place"} {placing.name}
                </span>
                <span className="block text-xs text-amber-100/90">
                  Tap a highlighted tile
                  {moveCostNow && <> · costs {costText(moveCostNow)}</>}
                  {bonusRuleText(placing, content) && <> · ✨ {bonusRuleText(placing, content)}</>}
                  {groveRuleText(placing, content) && <> · {groveRuleText(placing, content)}</>}
                </span>
              </span>
              <button
                type="button"
                onClick={cancelPlacing}
                className="game-btn border-2 border-amber-950/60 bg-amber-200 px-2.5 py-1 text-sm font-semibold text-amber-950"
              >
                Cancel
              </button>
            </div>
          )}
          {view === "barangay" && !placing && !roadMode && (
            <UndoBar
              state={state}
              content={content}
              onUndo={() => {
                dispatch({ type: "undo" });
                sfx.click();
              }}
            />
          )}
          <OfferBar
            state={state}
            content={content}
            dispatch={dispatch}
            folded={view === "barangay" && !offerOpen}
            sailing={sailing}
            held={tradeHeld}
            onOpen={() => !sailing && setOfferOpen(true)}
          />
          {!raidComing && (
            <ChoiceBanner
              state={state}
              content={content}
              onOpen={() => {
                sfx.click();
                setChoiceOpen(true);
              }}
            />
          )}
          {banners.map((b) => (
            <EventBanner key={b.id} banner={b} />
          ))}
        </div>
        <AdvisorBubble message={advisor.message} advisor={ui.advisor} lang={lang} onDismiss={advisor.dismiss} onSkip={advisor.skip} />
        {view === "barangay" && <GatherButtons amount={content.rules.gatherPerClick} quiet={hasAutomation} onGather={gather} />}
      </main>

      {view === "barangay" && (
        <BuildToolbar
          state={state}
          content={content}
          selected={selected}
          roadActive={roadMode}
          onRoad={() => {
            const on = !roadMode;
            if (on) sfx.pick();
            setSelected(null);
            setMoving(null);
            setMenu(null);
            setRoadMode(on);
          }}
          onSelect={(id) => {
            if (id && id !== selected) sfx.pick();
            setMoving(null);
            setRoadMode(false);
            setSelected(id);
          }}
        />
      )}
      <BuildingMenu
        state={state}
        content={content}
        target={view === "barangay" ? menu : null}
        onClose={closeMenu}
        onMove={(x, y) => {
          setMenu(null);
          setSelected(null);
          setMoving({ x, y });
          sfx.pick();
        }}
        onDemolish={(x, y) => {
          setMenu(null);
          setDemolishing({ x, y });
        }}
        onPause={(x, y, paused) => {
          dispatch({ type: "pause", x, y, paused });
          sfx.click();
          setMenu(null);
        }}
      />
      <ClearingQueueDialog
        state={state}
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
        onCancel={(x, y) => setCancelJob({ x, y })}
        onPause={(x, y, paused) => {
          dispatch({ type: "pause", x, y, paused });
          sfx.click();
        }}
      />
      <DemolishDialog
        state={state}
        content={content}
        target={demolishing}
        onCancel={() => setDemolishing(null)}
        onConfirm={() => {
          if (!demolishing) return;
          dispatch({ type: "demolish", x: demolishing.x, y: demolishing.y });
          sfx.build();
          setDemolishing(null);
        }}
      />
      <ReportDialog state={state} content={content} seen={seenReport} onSeen={setSeenReport} hold={clash !== null || away !== null} />
      <ChoiceDialog state={state} content={content} open={choiceOpen && !raidComing} onClose={() => setChoiceOpen(false)} dispatch={dispatch} />
      <AwayDialog lines={away} onClose={() => setAway(null)} />
      <VictoryDialog state={state} content={content} waiting={unseenReport(state, seenReport) !== undefined} />
      <FloatLayer />
      {helpPanel}
      <BaleteDialog
        open={baleteAsk}
        onCancel={() => setBaleteAsk(false)}
        onConfirm={() => {
          setBaleteAsk(false);
          confirmClearing(true);
        }}
      />
      <CancelClearingDialog
        state={state}
        target={cancelJob}
        onClose={() => setCancelJob(null)}
        onConfirm={() => {
          if (!cancelJob) return;
          dispatch({ type: "cancelClearing", x: cancelJob.x, y: cancelJob.y });
          sfx.click();
          setCancelJob(null);
        }}
      />
    </div>
  );
}
