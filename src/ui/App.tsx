import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import type { Resource } from "../engine/content";
import { buildingCost, canAfford, healthyWorkers, owned, repairCost } from "../engine/game";
import { buildingAt, canPlace, clearBlocker, clearSeconds, isUnlocked, tileAt, type ClearBlocker } from "../engine/map";
import { BarangayMap } from "./BarangayMap";
import { BuildToolbar } from "./BuildToolbar";
import { activeBanners, EventBanner } from "./EventBanners";
import { FloatLayer, spawnFloat } from "./floats";
import { baleteWarning, bonusRuleText, groveRuleText, RESOURCE_ICON } from "./format";
import { GatherButtons } from "./GatherButtons";
import { Hud } from "./Hud";
import { SettingsMenu } from "./SettingsMenu";
import { isMuted, setMuted, sfx } from "./sound";
import { content, useGame } from "./useGame";

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
  const { state, dispatch, onReset } = useGame();
  const [muted, setMutedState] = useState(isMuted);
  const [selected, setSelected] = useState<string | null>(null);
  const [balete, setBalete] = useState<{ x: number; y: number } | null>(null);
  const [loreNote, setLoreNote] = useState<string | null>(null);
  const closeLore = useCallback(() => setLoreNote(null), []);
  const placing = content.buildings.find((b) => b.id === selected) ?? null;
  const placingAffordable = placing ? canAfford(state, buildingCost(content, placing, owned(state, placing.id))) : false;

  // Drop the selection if it stops being affordable, and let Esc cancel placing.
  useEffect(() => {
    if (placing && !placingAffordable) setSelected(null);
  }, [placing, placingAffordable]);
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

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
    [dispatch],
  );

  const place = (x: number, y: number) => {
    if (!placing || !placingAffordable || !isUnlocked(state, placing) || !canPlace(state, content, placing, x, y)) return;
    dispatch({ type: "build", building: placing.id, x, y });
    sfx.build();
    setSelected(null);
  };

  /** Tapping a tile: put out a fire, repair damage, or start clearing forest. */
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

  return (
    <div className="fixed inset-0 flex flex-col bg-green-800 pt-[env(safe-area-inset-top)] text-stone-800">
      <Hud state={state} content={content}>
        <button
          type="button"
          onClick={toggleSound}
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
          aria-pressed={!muted}
          className="game-btn hidden size-9 items-center justify-center border-2 border-amber-950/60 bg-amber-200 text-lg sm:flex"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <SettingsMenu onReset={onReset} muted={muted} onToggleSound={toggleSound} />
      </Hud>

      <main className="relative flex min-h-0 flex-1 flex-col">
        <BarangayMap
          state={state}
          content={content}
          placing={placing}
          onPlace={place}
          onTapTile={tapTile}
          onSpirit={(id) => {
            sfx.click();
            setLoreNote(id);
          }}
        />
        <LoreToast loreId={loreNote} onClose={closeLore} />
        <div className="pointer-events-none absolute top-2 left-1/2 z-10 flex w-max max-w-[calc(100%-1rem)] -translate-x-1/2 flex-col items-center gap-1.5">
          {placing && (
            <div
              role="status"
              className="wood-panel pointer-events-auto flex items-center gap-2 rounded-xl border-2 border-amber-950/70 py-1.5 pr-1.5 pl-3 text-amber-50 shadow-lg"
            >
              <span className="text-2xl leading-none" aria-hidden>
                {placing.icon}
              </span>
              <span className="text-sm leading-tight">
                <span className="text-outline block font-display text-base">Place {placing.name}</span>
                <span className="block text-xs text-amber-100/90">
                  Tap a highlighted tile
                  {bonusRuleText(placing, content) && <> · ✨ {bonusRuleText(placing, content)}</>}
                  {groveRuleText(placing, content) && <> · {groveRuleText(placing, content)}</>}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="game-btn border-2 border-amber-950/60 bg-amber-200 px-2.5 py-1 text-sm font-semibold text-amber-950"
              >
                Cancel
              </button>
            </div>
          )}
          {banners.map((b) => (
            <EventBanner key={b.id} banner={b} />
          ))}
        </div>
        <GatherButtons amount={content.rules.gatherPerClick} quiet={hasAutomation} onGather={gather} />
      </main>

      <BuildToolbar state={state} content={content} selected={selected} onSelect={setSelected} />
      <FloatLayer />
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
