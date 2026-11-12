import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { RESOURCES, type BuildingDef, type Content } from "../engine/content";
import { seasonAt } from "../engine/events";
import { buildingWorkers, rates, type GameState } from "../engine/game";
import { adjacencyBonusAt, occupancy, validTiles } from "../engine/map";
import { spawnFloatAt } from "./floats";
import { bonusPreviewText, RESOURCE_ICON } from "./format";
import { buildingKey, fillView, layoutMap, type Decor, type Ground, type MapCell } from "./mapLayout";

const GROUND: Record<Ground, string> = {
  // The original greens: translucent green-600 over a green-800 base.
  land: "bg-green-600/60",
  wild: "bg-green-700/60",
  forest: "bg-green-900/40",
  river: "river-tile",
};

const SCENERY: Record<Exclude<Decor, null>, { icon: string; className: string }> = {
  tree: { icon: "🌳", className: "text-[0.95em]" },
  palm: { icon: "🌴", className: "text-[0.95em]" },
  sprout: { icon: "🌱", className: "text-[0.4em] opacity-60" },
};

const INCOME_EVERY_MS = 3000;
/** Room at the top of the map for the placing banner and alerts, so they never hide tiles. */
const BANNER_SPACE = 64;
const DAY_SECONDS = 240;

/** Valid tiles for the building being placed, with the bonus each would get. */
type Placement = Map<string, number>;

export function BarangayMap(props: {
  state: GameState;
  content: Content;
  /** The building the player is placing, if any. */
  placing: BuildingDef | null;
  onPlace: (x: number, y: number) => void;
  /** Tapping a building outside placing mode (to put out a fire or repair it). */
  onTapBuilding: (x: number, y: number, el: Element) => void;
}) {
  const { state, content, placing, onPlace, onTapBuilding } = props;
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = area.current!;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-layout only when buildings change, not on every resource tick.
  const layout = useMemo(() => layoutMap(state, content), [state.buildings, content]);
  const view = useMemo(() => fillView(layout, content, size.w, size.h, 64, BANNER_SPACE), [layout, content, size]);

  const placement = useMemo<Placement | null>(() => {
    if (!placing) return null;
    const taken = occupancy(state);
    return new Map(
      validTiles(state, content).map((t) => [`${t.y}:${t.x}`, adjacencyBonusAt(content, taken, placing, t.x, t.y)]),
    );
  }, [placing, state.buildings, content]);

  useEffect(() => {
    if (!placing) setHover(null);
  }, [placing]);

  // Buildings that mount after the map first appears are new builds and bounce in.
  const mounted = useRef(false);
  useEffect(() => {
    if (size.w > 0) mounted.current = true;
  }, [size.w]);

  useIncomeFloats(area, state, content);

  // Start the day/night cycle where the clock says, so a reload doesn't reset it to noon.
  const dayOffset = useMemo(() => -((Date.now() / 1000) % DAY_SECONDS), []);

  const cellKeyFrom = (target: EventTarget) => (target as Element).closest<HTMLElement>("[data-cell]")?.dataset.cell ?? null;
  const placeAt = (key: string | null) => {
    if (!key || !placement?.has(key)) return;
    const [y, x] = key.split(":").map(Number);
    onPlace(x, y);
  };

  const handlers = placing
    ? {
        onPointerMove: (e: PointerEvent) => e.pointerType === "mouse" && setHover(cellKeyFrom(e.target)),
        onPointerLeave: () => setHover(null),
        onClick: (e: { target: EventTarget }) => placeAt(cellKeyFrom(e.target)),
        onDragOver: (e: DragEvent) => {
          const key = cellKeyFrom(e.target);
          setHover(key);
          if (key && placement?.has(key)) {
            e.preventDefault(); // allow the drop
            e.dataTransfer.dropEffect = "copy";
          }
        },
        onDragLeave: (e: DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setHover(null);
        },
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          placeAt(cellKeyFrom(e.target));
        },
      }
    : {
        onClick: (e: { target: EventTarget }) => {
          const el = (e.target as Element).closest<HTMLElement>("[data-cell]");
          const key = el?.dataset.cell;
          if (!el || !key) return;
          const [y, x] = key.split(":").map(Number);
          onTapBuilding(x, y, el);
        },
      };

  const typhoonComing = state.typhoon !== null;
  const dry = (seasonAt(content, state.time)?.season.productionPercent.rice ?? 100) < 100;

  return (
    <div ref={area} className="relative min-h-0 flex-1 overflow-hidden bg-green-800" aria-label="Your barangay">
      {size.w > 0 && (
        <div
          className={`absolute left-1/2 grid -translate-x-1/2 -translate-y-1/2 ${placing ? "cursor-pointer" : ""}`}
          style={{
            top: `calc(50% + ${BANNER_SPACE / 2}px)`,
            gridTemplateColumns: `repeat(${view.cols}, ${view.tile}px)`,
            gridAutoRows: `${view.tile}px`,
            fontSize: view.tile * 0.62,
          }}
          {...handlers}
        >
          {view.cells.map((cell) => (
            <Cell
              key={cell.key}
              cell={cell}
              animateNew={mounted}
              target={placement ? (placement.has(cell.key) ? placement.get(cell.key)! : "blocked") : null}
              ghost={placing && hover === cell.key && placement?.has(cell.key) ? placing : null}
            />
          ))}
        </div>
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 mix-blend-multiply motion-safe:animate-day-night"
        style={{ animationDelay: `${dayOffset}s` }}
      />
      {/* Weather: a dry-season warmth, and darkening skies while a typhoon approaches. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 transition-colors duration-[3000ms] ${
          typhoonComing ? "bg-slate-800/35" : dry ? "bg-amber-300/15 mix-blend-multiply" : "bg-transparent"
        }`}
      />
    </div>
  );
}

/** Every few seconds, float the income earned since the last pulse above a working building. */
function useIncomeFloats(area: RefObject<HTMLDivElement | null>, state: GameState, content: Content) {
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    let turn = 0;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible" || !area.current) return;
      const s = latest.current;
      const { produced } = rates(s, content);
      const workers = buildingWorkers(s, content);
      const defs = new Map(content.buildings.map((d) => [d.id, d]));
      turn++;
      for (const r of RESOURCES) {
        if (produced[r] <= 0) continue;
        const keys = s.buildings
          .filter((b, i) => workers[i] > 0 && (defs.get(b.type)?.produces?.[r] ?? 0) > 0)
          .map(buildingKey);
        if (keys.length === 0) continue;
        const el = area.current.querySelector(`[data-building="${keys[turn % keys.length]}"]`);
        const amount = (produced[r] * INCOME_EVERY_MS) / 1000;
        if (el) spawnFloatAt(el, `+${amount.toFixed(1)} ${RESOURCE_ICON[r]}`, r);
      }
    }, INCOME_EVERY_MS);
    return () => clearInterval(id);
  }, [area, content]);
}

const Cell = memo(function Cell(props: {
  cell: MapCell;
  animateNew: { current: boolean };
  /** While placing: the bonus this tile would give, or "blocked". Null when not placing. */
  target: number | "blocked" | null;
  ghost: BuildingDef | null;
}) {
  const { cell, animateNew, target, ghost } = props;
  const paddy = cell.building?.def.produces?.rice;
  const valid = typeof target === "number";

  return (
    <div
      data-cell={cell.key}
      className={`relative flex items-center justify-center ${GROUND[cell.ground]} ${target === "blocked" ? "brightness-75" : ""}`}
    >
      {cell.plaza && <div className="absolute inset-[12%] rounded-full bg-amber-200/80 shadow-inner" title="Plaza" />}
      {paddy && (
        <div className="absolute inset-[6%] rounded-sm bg-linear-to-br from-lime-300 via-lime-200 to-cyan-200 shadow-inner" />
      )}
      {valid && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-[5%] rounded-md border-2 border-dashed ${
            target > 0 ? "border-amber-300 bg-amber-200/30" : "border-white/70 bg-white/15"
          }`}
        />
      )}
      {valid && target > 0 && !ghost && (
        <span className="text-outline pointer-events-none absolute top-0 right-0.5 font-display text-[0.32em] text-amber-200">
          +{Math.round(target * 100)}%
        </span>
      )}
      {cell.building ? (
        <Building
          key={cell.building.key}
          id={cell.building.key}
          def={cell.building.def}
          bonus={cell.building.bonus}
          damaged={cell.building.damaged}
          burning={cell.building.burning}
          repairText={cell.building.repairText}
          animateNew={animateNew}
        />
      ) : ghost ? (
        <Ghost def={ghost} bonus={target as number} />
      ) : (
        cell.decor && (
          <span aria-hidden className={`pointer-events-none leading-none select-none ${SCENERY[cell.decor].className}`}>
            {SCENERY[cell.decor].icon}
          </span>
        )
      )}
    </div>
  );
});

function Ghost({ def, bonus }: { def: BuildingDef; bonus: number }) {
  return (
    <>
      <span aria-hidden className="pointer-events-none leading-none opacity-60 select-none">
        {def.icon}
      </span>
      <span
        role="status"
        className={`pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-md border px-1.5 py-0.5 font-display text-xs whitespace-nowrap shadow-lg ${
          bonus > 0 ? "border-amber-900 bg-amber-300 text-amber-950" : "border-stone-600 bg-stone-800/90 text-stone-200"
        }`}
      >
        {bonusPreviewText(def, bonus)}
      </span>
    </>
  );
}

function Building(props: {
  id: string;
  def: BuildingDef;
  bonus: number;
  damaged: boolean;
  burning: boolean;
  repairText: string;
  animateNew: { current: boolean };
}) {
  const { id, def, bonus, damaged, burning, repairText, animateNew } = props;
  // Decided once, at mount: only buildings placed while playing bounce in.
  const [bounce] = useState(() => animateNew.current);
  const label = burning
    ? `${def.name}, on fire! Tap to put it out`
    : damaged
      ? `${def.name}, damaged. Tap to repair for ${repairText}`
      : bonus > 0
        ? `${def.name}, +${Math.round(bonus * 100)}% bonus`
        : def.name;
  const tappable = burning || damaged;
  return (
    <>
      <span
        role={tappable ? "button" : "img"}
        tabIndex={tappable ? 0 : undefined}
        onKeyDown={
          tappable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.currentTarget.click(); // bubbles to the map's tap handler
                }
              }
            : undefined
        }
        aria-label={label}
        title={label}
        data-building={id}
        className={`relative leading-none drop-shadow-[0_2px_1px_rgb(0_0_0_/_0.35)] select-none ${bounce ? "motion-safe:animate-bounce-in" : ""} ${
          damaged ? "opacity-60 grayscale" : ""
        } ${tappable ? "cursor-pointer" : ""}`}
      >
        {def.icon}
      </span>
      {burning && (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[30%] text-center text-[0.7em] leading-none motion-safe:animate-flicker">
          🔥
        </span>
      )}
      {damaged && (
        <span aria-hidden className="pointer-events-none absolute right-0 bottom-0 rounded-full bg-amber-100/90 px-0.5 text-[0.35em] leading-none shadow">
          🛠️
        </span>
      )}
      {bonus > 0 && !damaged && (
        <span aria-hidden className="pointer-events-none absolute top-0 right-0.5 text-[0.3em] leading-none">
          ✨
        </span>
      )}
    </>
  );
}
