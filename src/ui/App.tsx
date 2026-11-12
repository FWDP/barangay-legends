import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { Resource } from "../engine/content";
import { buildingCost, canAfford, canMove, healthyWorkers, moveCost, owned, repairCost, withoutBuilding } from "../engine/game";
import { buildingAt, canPlace, clearBlocker, clearSeconds, isUnlocked, tileAt, type ClearBlocker } from "../engine/map";
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
import { awayStory } from "./away";
import { AwayDialog, ChoiceBanner, ChoiceDialog } from "./StoryDialogs";
import { useReducedMotion, type Clash } from "./VillagerLayer";
import { CLASH_MS, SAIL_SECONDS } from "./visitors";
import type { GameState } from "../engine/game";

const ui = loadUiContent(content);

const CLEAR_BLOCKED: Record<Exclude<ClearBlocker, "balete">, string> = {
  "not-forest": "Nothing to clear",
  "not-adjacent": "Clear next to your land first",
  busy: "Already clearing a tile",
  hungry: "Too hungry to work",
  workers: `Need ${content.rules.clearing.workers} healthy villagers`,
};

/** The warning before felling an old balete: it can't be undone. */
function BaleteDialog(props: { target: { x: number; y: number } | null; onCancel: () => void; onConfirm: () => void }) {
  const { target, onCancel, onConfirm } = props;
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
          🌳 Cut down the {lore?.name.toLowerCase() ?? "balete"}?
        </h2>
        {lore && <p className="text-sm text-stone-600">{lore.description}</p>}
        <p className="rounded-lg bg-red-100 p-2 text-sm font-semibold text-red-900">{baleteWarning(content)}</p>
        {lore?.tradition && <p className="text-xs text-stone-500">Tradition: {lore.tradition}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" autoFocus onClick={onCancel} className="game-btn border-2 border-green-900 bg-green-700 px-4 py-2 text-sm font-semibold text-white">
            Keep the tree
          </button>
          <button type="button" onClick={onConfirm} className="game-btn border-2 border-red-950 bg-red-700 px-4 py-2 text-sm font-semibold text-white">
            Cut it down
          </button>
        </div>
      </div>
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
  const { state, dispatch, onReset, startNew, hasSave } = useGame(screen === "game");
  const [muted, setMutedState] = useState(isMuted);
  const [selected, setSelected] = useState<string | null>(null);
  const [balete, setBalete] = useState<{ x: number; y: number } | null>(null);
  const [loreNote, setLoreNote] = useState<string | null>(null);
  const [view, setView] = useState<"barangay" | "rehiyon">("barangay");
  // Reports already in the save when it loads count as seen.
  const [seenReport, setSeenReport] = useState(() => latestReportId(state));
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [moving, setMoving] = useState<{ x: number; y: number } | null>(null);
  const [demolishing, setDemolishing] = useState<{ x: number; y: number } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
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

  // A choice event, never shown during a raid.
  const [choiceOpen, setChoiceOpen] = useState(false);
  const raidComing = !!state.region?.incomingRaid;
  useEffect(() => {
    if (raidComing) setChoiceOpen(false);
  }, [raidComing]);

  // "While you were away": what happened while the tab was hidden (the game keeps running).
  const [away, setAway] = useState<string[] | null>(null);
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
  }, []);
  // Drop the selection if it stops being affordable (or the moved building is gone), and let Esc cancel placing.
  useEffect(() => {
    if (placing && !placingAffordable) cancelPlacing();
    if (moving && !moved) setMoving(null);
  }, [placing, placingAffordable, moving, moved, cancelPlacing]);
  useEffect(() => {
    if (!selected && !moving) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancelPlacing();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected, moving, cancelPlacing]);

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
    const blocker = clearBlocker(state, content, x, y, false, healthyWorkers(state));
    if (blocker === "balete") {
      setBalete({ x, y });
    } else if (blocker) {
      say(CLEAR_BLOCKED[blocker]);
    } else {
      dispatch({ type: "clear", x, y });
      sfx.gather("wood");
      say(`🪓 Clearing · ${Math.ceil(clearSeconds(state, content))}s`);
    }
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
          onContinue={() => setScreen("game")}
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
          onBoat={() => {
            sfx.click();
            setOfferOpen(true);
          }}
        />
        )}
        <LoreToast loreId={loreNote} onClose={closeLore} />
        <div className="pointer-events-none absolute top-2 left-1/2 z-10 flex w-max max-w-[calc(100%-1rem)] -translate-x-1/2 flex-col items-center gap-1.5">
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
          {view === "barangay" && !placing && (
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
          onSelect={(id) => {
            if (id && id !== selected) sfx.pick();
            setMoving(null);
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
        target={balete}
        onCancel={() => setBalete(null)}
        onConfirm={() => {
          if (!balete) return;
          dispatch({ type: "clear", x: balete.x, y: balete.y, confirmBalete: true });
          sfx.gather("wood");
          setBalete(null);
        }}
      />
    </div>
  );
}
