import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { RESOURCES, type BuildingDef, type Content } from "../engine/content";
import { seasonAt } from "../engine/events";
import { buildingWorkers, rates, type GameState } from "../engine/game";
import {
  adjacencyBonusAt,
  buildingBonuses,
  buildingGroveBonuses,
  groveBonusAt,
  clearSeconds,
  isClearable,
  isPlaza,
  occupancy,
  tileAt,
  validTiles,
  type Tile,
} from "../engine/map";
import {
  cameraOn,
  clampCamera,
  origin,
  pan,
  screenToTile,
  tileCenter,
  visibleRange,
  zoomAt,
  type Camera,
  type View,
} from "./camera";
import { spawnFloat } from "./floats";
import { bonusPreviewText, RESOURCE_ICON } from "./format";

const INCOME_EVERY_MS = 3000;
const DAY_SECONDS = 240;
/** A press that moves less than this is a tap, not a drag. */
const TAP_SLOP_PX = 8;

export const buildingKey = (b: { type: string; x: number; y: number }) => `${b.type}@${b.x},${b.y}`;

/** Small integer hash so scenery is varied but identical on every reload. */
function hash(x: number, y: number): number {
  let h = Math.imul(y + 1000, 374761393) ^ Math.imul(x + 7, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % 100;
}

interface BuildingInfo {
  def: BuildingDef;
  key: string;
  bonus: number;
  damaged: boolean;
  burning: boolean;
  repairText: string;
}

export function BarangayMap(props: {
  state: GameState;
  content: Content;
  /** The building the player is placing (or moving), if any. */
  placing: BuildingDef | null;
  /** While moving: where the building stands now. */
  moveFrom?: { x: number; y: number } | null;
  /**
   * The state valid tiles and bonuses are worked out on. While moving, the building is
   * picked up first, so it doesn't count as its own neighbour.
   */
  planState?: GameState;
  onPlace: (x: number, y: number) => void;
  /** A tap on a tile outside placing mode: building menu, fire, repair, clear land. (sx, sy) is the screen point. */
  onTapTile: (x: number, y: number, sx: number, sy: number) => void;
  /** Right-click on a building (desktop): open its menu. */
  onBuildingMenu: (x: number, y: number, sx: number, sy: number) => void;
  /** The player tapped a resting spirit (the kapre): show its lore note. */
  onSpirit: (loreId: string, sx: number, sy: number) => void;
}) {
  const { state, content, placing, moveFrom = null, onPlace, onTapTile, onBuildingMenu, onSpirit } = props;
  const plan = props.planState ?? state;
  const { map } = state;
  const area = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ w: 0, h: 0 });
  const [cam, setCamRaw] = useState<Camera | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const setCam = useCallback((c: Camera) => setCamRaw(clampCamera(c, map)), [map]);

  useLayoutEffect(() => {
    const el = area.current!;
    const measure = () => setView({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Start centred on the plaza once the view has a size; re-centre if the barangay is replaced.
  const plazaKey = `${map.seed}:${map.plaza.x},${map.plaza.y}`;
  useEffect(() => {
    if (view.w > 0) setCamRaw((c) => cameraOn(map.plaza, view, c?.tile));
  }, [plazaKey, view.w > 0]);

  const centre = () => cam && setCam(cameraOn(map.plaza, view, cam.tile));
  const zoomBy = (factor: number) => cam && setCam(zoomAt(cam, view, factor, view.w / 2, view.h / 2));

  // ---- Data for the tiles in view ----

  const buildings = useMemo(() => {
    const bonuses = buildingBonuses(state, content);
    const groves = buildingGroveBonuses(state, content);
    const defs = new Map(content.buildings.map((d) => [d.id, d]));
    const byTile = new Map<string, BuildingInfo>();
    state.buildings.forEach((b, i) => {
      const def = defs.get(b.type);
      if (!def) return;
      const repair = Object.entries(def.repairCost).map(([r, n]) => `${n} ${r}`).join(", ");
      byTile.set(`${b.x},${b.y}`, {
        def,
        key: buildingKey(b),
        bonus: bonuses[i] + Object.values(groves[i]).reduce((sum, g) => sum + (g ?? 0), 0),
        damaged: b.damaged === true,
        burning: b.burningSince !== undefined,
        repairText: repair || "free",
      });
    });
    return byTile;
  }, [state.buildings, map, content]);

  const range = cam && view.w > 0 ? visibleRange(cam, view, map) : null;
  const rangeKey = range ? `${range.x0},${range.y0},${range.x1},${range.y1}` : "";

  // The grove that boosts the building being placed, if any (Kapre's grove for camps).
  const grove = placing ? (content.groves.find((g) => g.affects === placing.id) ?? null) : null;

  // Valid tiles for the building being placed, within the view, with the bonus each would get.
  const placement = useMemo(() => {
    if (!placing || !range) return null;
    const taken = occupancy(plan);
    return new Map<string, { adjacency: number; grove: number }>(
      validTiles(plan, content, placing, range)
        .filter((t) => !(moveFrom && t.x === moveFrom.x && t.y === moveFrom.y))
        .map((t) => {
          const adjacency = adjacencyBonusAt(plan.map, taken, placing, t.x, t.y);
          const g = grove ? groveBonusAt(plan.map, content, placing, t.x, t.y, grove.resource) : 0;
          return [`${t.x},${t.y}`, { adjacency, grove: g }];
        }),
    );
  }, [placing, plan.buildings, plan.map, content, rangeKey, moveFrom?.x, moveFrom?.y]);

  // The grove's reach, drawn as a soft glow while placing a building it boosts.
  const glow = useMemo(() => {
    const tiles = new Set<string>();
    if (!grove || !range) return tiles;
    const r = grove.radius;
    for (let y = Math.max(0, range.y0 - r); y <= Math.min(map.height - 1, range.y1 + r); y++) {
      for (let x = Math.max(0, range.x0 - r); x <= Math.min(map.width - 1, range.x1 + r); x++) {
        if (tileAt(map, x, y) !== grove.tile) continue;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) tiles.add(`${x + dx},${y + dy}`);
        }
      }
    }
    return tiles;
  }, [grove, map, rangeKey]);

  // Now and then a kapre rests in a balete. Which trees, and when, comes from a hash of the
  // tree's position and the current time window, so it's stable for a while (UI only).
  const sighting = content.groves.find((g) => g.sighting && g.lore);
  const sightingWindow = sighting ? Math.floor(Date.now() / 1000 / sighting.sighting!.windowSeconds) : 0;

  // Buildings that appear while playing bounce in (not ones that scroll into view).
  const known = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    const keys = new Set(state.buildings.map(buildingKey));
    const before = known.current;
    known.current = keys;
    if (!before) return;
    const added = [...keys].filter((k) => !before.has(k));
    if (added.length === 0) return;
    setFresh(new Set(added));
    const t = setTimeout(() => setFresh(new Set()), 800);
    return () => clearTimeout(t);
  }, [state.buildings]);

  // ---- Gestures: drag to pan, pinch or wheel to zoom, tap to act ----

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    x: number;
    y: number;
    cam: Camera;
    moved: boolean;
    /** The press started on a resting spirit. */
    spirit?: boolean;
    pinch?: { dist: number; mid: { x: number; y: number } };
  } | null>(null);
  const local = (e: { clientX: number; clientY: number }) => {
    const r = area.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const pinchOf = () => {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  const tapAt = (px: number, py: number, clientX: number, clientY: number) => {
    if (!cam) return;
    const t = screenToTile(cam, view, px, py);
    if (tileAt(map, t.x, t.y) === null) return;
    if (placing) {
      if (placement?.has(`${t.x},${t.y}`)) onPlace(t.x, t.y);
    } else {
      onTapTile(t.x, t.y, clientX, clientY);
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!cam || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const spirit = !!(e.target as Element).closest?.("[data-spirit]");
    if (pointers.current.size === 1) gesture.current = { x: p.x, y: p.y, cam, moved: false, spirit };
    else if (pointers.current.size === 2) gesture.current = { x: p.x, y: p.y, cam, moved: true, pinch: pinchOf() };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = local(e);
    if (!pointers.current.has(e.pointerId)) {
      if (e.pointerType === "mouse" && cam) setHover(screenToTile(cam, view, p.x, p.y));
      return;
    }
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.pinch && pointers.current.size >= 2) {
      const now = pinchOf();
      const zoomed = zoomAt(g.cam, view, now.dist / g.pinch.dist, g.pinch.mid.x, g.pinch.mid.y);
      setCam(pan(zoomed, now.mid.x - g.pinch.mid.x, now.mid.y - g.pinch.mid.y));
      return;
    }
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    if (!g.moved && Math.hypot(dx, dy) > TAP_SLOP_PX) g.moved = true;
    if (g.moved) {
      setHover(null);
      setCam(pan(g.cam, dx, dy));
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size === 0) {
      if (g && !g.moved && e.type === "pointerup") {
        const p = local(e);
        if (g.spirit && sighting?.lore) onSpirit(sighting.lore, e.clientX, e.clientY);
        else tapAt(p.x, p.y, e.clientX, e.clientY);
      }
      gesture.current = null;
    } else if (cam) {
      // One finger left after a pinch: carry on panning from here, never as a tap.
      const [rest] = [...pointers.current.values()];
      gesture.current = { x: rest.x, y: rest.y, cam, moved: true };
    }
  };

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const el = area.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCamRaw((c) => {
        if (!c) return c;
        const r = el.getBoundingClientRect();
        const zoomed = zoomAt(c, { w: r.width, h: r.height }, Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
        return clampCamera(zoomed, map);
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [map]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!cam) return;
    const step = cam.tile * 2;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (moves[e.key]) setCam(pan(cam, ...moves[e.key]));
    else if (e.key === "+" || e.key === "=") zoomBy(1.25);
    else if (e.key === "-") zoomBy(0.8);
    else if (e.key === "c") centre();
    else return;
    e.preventDefault();
  };

  // Right-click on a building opens the same menu as tapping it (desktop).
  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    if (!cam) return;
    const p = local(e);
    const t = screenToTile(cam, view, p.x, p.y);
    if (!buildings.has(`${t.x},${t.y}`)) return;
    e.preventDefault();
    if (!placing) onBuildingMenu(t.x, t.y, e.clientX, e.clientY);
  };

  // Drag and drop from the build toolbar (desktop).
  const dropTile = (e: DragEvent) => {
    if (!cam) return null;
    const p = local(e);
    return screenToTile(cam, view, p.x, p.y);
  };
  const dnd = placing
    ? {
        onDragOver: (e: DragEvent) => {
          const t = dropTile(e);
          setHover(t);
          if (t && placement?.has(`${t.x},${t.y}`)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        },
        onDragLeave: () => setHover(null),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          const t = dropTile(e);
          if (t && placement?.has(`${t.x},${t.y}`)) onPlace(t.x, t.y);
        },
      }
    : {};

  // Keyboard activation of a resting spirit.
  const spiritRef = useRef(onSpirit);
  spiritRef.current = onSpirit;
  const spiritLore = sighting?.lore;
  const onSpiritKey = useCallback(
    (el: Element) => {
      const r = el.getBoundingClientRect();
      if (spiritLore) spiritRef.current(spiritLore, r.left + r.width / 2, r.top);
    },
    [spiritLore],
  );

  // Keyboard activation of a building: its menu, or putting out a fire, or repairing.
  const activate = useRef(onTapTile);
  activate.current = onTapTile;
  const onActivate = useCallback((x: number, y: number, el: Element) => {
    const r = el.getBoundingClientRect();
    activate.current(x, y, r.left + r.width / 2, r.top);
  }, []);

  useIncomeFloats(area, state, content, cam, view);

  const dayOffset = useMemo(() => -((Date.now() / 1000) % DAY_SECONDS), []);
  const typhoonComing = state.typhoon !== null;
  const dry = (seasonAt(content, state.time)?.season.productionPercent.rice ?? 100) < 100;

  // ---- Render only the tiles in view ----

  const cells: ReactNode[] = [];
  if (cam && range) {
    const job = state.clearing;
    const clearLabel = `🪓 Clear · ${Math.ceil(clearSeconds(state, content))}s · +${content.rules.clearing.wood} ${RESOURCE_ICON.wood}`;
    for (let y = range.y0; y <= range.y1; y++) {
      for (let x = range.x0; x <= range.x1; x++) {
        const tile = tileAt(map, x, y)!;
        const key = `${x},${y}`;
        const building = buildings.get(key) ?? null;
        const hovered = hover?.x === x && hover?.y === y;
        const clearable = !placing && isClearable(map, x, y);
        cells.push(
          <Cell
            key={key}
            x={x}
            y={y}
            tile={tile}
            plaza={isPlaza(map, x, y)}
            building={building}
            fresh={building ? fresh.has(building.key) : false}
            lifted={moveFrom?.x === x && moveFrom?.y === y}
            target={placement ? (placement.has(key) ? totalBonus(placement.get(key)!) : "blocked") : null}
            ghost={
              placing && hovered && placement?.has(key)
                ? { def: placing, ...placement.get(key)!, groveName: grove?.name ?? "" }
                : null
            }
            glow={glow.has(key)}
            spirit={
              tile === "balete" && sighting
                ? hash(x * 31 + sightingWindow, y * 17 + sightingWindow) < sighting.sighting!.chancePercent
                : false
            }
            onSpiritKey={onSpiritKey}
            clearable={clearable}
            hint={clearable && hovered ? (tile === "balete" ? "🌳 Old balete tree" : clearLabel) : null}
            progress={job && job.x === x && job.y === y ? Math.min(1, job.progress / job.seconds) : null}
            onActivate={onActivate}
          />,
        );
      }
    }
  }
  const o = cam ? origin(cam, view) : { x: 0, y: 0 };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={area}
        tabIndex={0}
        role="application"
        aria-label="Your barangay. Drag to move, scroll or pinch to zoom, arrow keys to pan, C to centre."
        className={`forest-ground absolute inset-0 touch-none overflow-hidden outline-none select-none focus-visible:ring-4 focus-visible:ring-amber-300 focus-visible:ring-inset ${
          placing ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
        onContextMenu={onContextMenu}
        {...dnd}
      >
        {cam && (
          <div
            className="absolute top-0 left-0"
            style={{
              transform: `translate3d(${o.x}px, ${o.y}px, 0)`,
              fontSize: cam.tile * 0.62,
              ["--tile" as string]: `${cam.tile}px`,
            }}
          >
            {cells}
          </div>
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-multiply motion-safe:animate-day-night"
          style={{ animationDelay: `${dayOffset}s` }}
        />
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 transition-colors duration-[3000ms] ${
            typhoonComing ? "bg-slate-800/35" : dry ? "bg-amber-300/15 mix-blend-multiply" : "bg-transparent"
          }`}
        />
      </div>

      {/* Camera controls sit outside the gesture area, so tapping them never pans the map. Mid-right
          keeps them clear of the event banners (top) and the gather buttons (bottom). */}
      <div className="absolute top-1/2 right-2 z-10 flex -translate-y-1/2 flex-col gap-2">
        <CamButton label="Zoom in" onClick={() => zoomBy(1.25)}>
          +
        </CamButton>
        <CamButton label="Zoom out" onClick={() => zoomBy(0.8)}>
          −
        </CamButton>
        <CamButton label="Center on barangay" onClick={centre}>
          🏠
        </CamButton>
      </div>
    </div>
  );
}

function CamButton(props: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={props.label}
      title={props.label}
      className="game-btn flex size-11 items-center justify-center border-2 border-amber-900/60 bg-amber-50/90 font-display text-xl text-amber-900 shadow-lg"
    >
      {props.children}
    </button>
  );
}

/** Every few seconds, float the income earned since the last pulse above a working building in view. */
function useIncomeFloats(
  area: RefObject<HTMLDivElement | null>,
  state: GameState,
  content: Content,
  cam: Camera | null,
  view: View,
) {
  const latest = useRef({ state, cam, view });
  latest.current = { state, cam, view };

  useEffect(() => {
    let turn = 0;
    const id = setInterval(() => {
      const { state: s, cam: c, view: v } = latest.current;
      if (document.visibilityState !== "visible" || !area.current || !c) return;
      const { produced } = rates(s, content);
      const workers = buildingWorkers(s, content);
      const defs = new Map(content.buildings.map((d) => [d.id, d]));
      const r = visibleRange(c, v, s.map, 0);
      const box = area.current.getBoundingClientRect();
      turn++;
      for (const res of RESOURCES) {
        if (produced[res] <= 0) continue;
        const working = s.buildings.filter(
          (b, i) =>
            workers[i] > 0 &&
            (defs.get(b.type)?.produces?.[res] ?? 0) > 0 &&
            b.x >= r.x0 &&
            b.x <= r.x1 &&
            b.y >= r.y0 &&
            b.y <= r.y1,
        );
        if (working.length === 0) continue;
        const b = working[turn % working.length];
        const p = tileCenter(c, v, b.x, b.y);
        const amount = (produced[res] * INCOME_EVERY_MS) / 1000;
        spawnFloat(box.left + p.x, box.top + p.y - c.tile * 0.25, `+${amount.toFixed(1)} ${RESOURCE_ICON[res]}`, res);
      }
    }, INCOME_EVERY_MS);
    return () => clearInterval(id);
  }, [area, content]);
}

const GROUND: Record<Tile, string> = {
  cleared: "bg-green-600/60",
  forest: "bg-green-900/40",
  balete: "bg-emerald-950/60",
  river: "river-tile",
  bridge: "river-tile",
};

const Cell = memo(function Cell(props: {
  x: number;
  y: number;
  tile: Tile;
  plaza: boolean;
  building: BuildingInfo | null;
  fresh: boolean;
  /** The building here is being moved. */
  lifted: boolean;
  /** While placing: the bonus this tile would give, or "blocked". Null when not placing. */
  target: number | "blocked" | null;
  ghost: GhostInfo | null;
  /** Inside a grove's reach, while placing a building it boosts. */
  glow: boolean;
  /** A kapre is resting in this balete. */
  spirit: boolean;
  onSpiritKey: (el: Element) => void;
  clearable: boolean;
  hint: string | null;
  /** Clearing progress 0..1 on the tile being cleared. */
  progress: number | null;
  onActivate: (x: number, y: number, el: Element) => void;
}) {
  const { x, y, tile, plaza, building, fresh, lifted, target, ghost, glow, spirit, onSpiritKey, clearable, hint, progress, onActivate } = props;
  const h = hash(x, y);
  const valid = typeof target === "number";
  const paddy = building?.def.produces?.rice;

  return (
    <div
      data-tile={`${x},${y}`}
      className={`absolute flex items-center justify-center ${GROUND[tile]} ${target === "blocked" ? "brightness-75" : ""}`}
      style={{ left: `calc(${x} * var(--tile))`, top: `calc(${y} * var(--tile))`, width: "var(--tile)", height: "var(--tile)" }}
    >
      {tile === "bridge" && <div aria-hidden className="bridge-tile absolute inset-x-0 inset-y-[14%]" />}
      {tile === "forest" && progress === null && (
        <span aria-hidden className="pointer-events-none text-[0.95em] leading-none">
          {h < 70 ? "🌳" : "🌴"}
        </span>
      )}
      {glow && (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-amber-200/20 shadow-[inset_0_0_14px_rgb(253_230_138_/_0.55)]" />
      )}
      {tile === "balete" && spirit && <RestingSpirit onKey={onSpiritKey} />}
      {tile === "balete" && (
        <span
          role="img"
          aria-label="Old balete tree"
          title="Old balete tree"
          className="text-[1.2em] leading-none drop-shadow-[0_0_6px_rgb(253_230_138_/_0.8)]"
        >
          🌳
        </span>
      )}
      {tile === "cleared" && !building && !plaza && h < 14 && (
        <span aria-hidden className="pointer-events-none text-[0.4em] leading-none opacity-60">
          🌱
        </span>
      )}
      {plaza && <FirePit />}
      {clearable && progress === null && (
        <div aria-hidden className="pointer-events-none absolute inset-[4%] rounded-md border border-dashed border-lime-200/40" />
      )}
      {progress !== null && <ClearingProgress progress={progress} />}
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
      {building ? (
        <Building x={x} y={y} info={building} fresh={fresh} lifted={lifted} onActivate={onActivate} />
      ) : ghost ? (
        <Ghost info={ghost} />
      ) : null}
      {hint && <Label text={hint} />}
    </div>
  );
});

function ClearingProgress({ progress }: { progress: number }) {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-[4%] rounded-md border-2 border-amber-300 bg-amber-900/20" />
      <span aria-hidden className="pointer-events-none text-[0.6em] leading-none motion-safe:animate-flicker">
        🪓
      </span>
      <div
        role="progressbar"
        aria-label="Clearing land"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="pointer-events-none absolute inset-x-[10%] bottom-[8%] h-[10%] overflow-hidden rounded-full bg-black/50"
      >
        <div className="h-full bg-amber-300" style={{ width: `${progress * 100}%` }} />
      </div>
    </>
  );
}

/** The plaza: a ring of stones around a small fire, where the barangay gathers. */
function FirePit() {
  return (
    <div
      title="Plaza: the gathering spot"
      className="pointer-events-none absolute inset-[14%] flex items-center justify-center rounded-full border-[0.12em] border-dotted border-stone-500 bg-amber-200/70 shadow-inner"
    >
      <span aria-hidden className="text-[0.45em] leading-none">
        🔥
      </span>
    </div>
  );
}

function Label({ text, good }: { text: string; good?: boolean }) {
  return (
    <span
      role="status"
      className={`pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 rounded-md border px-1.5 py-0.5 font-display text-xs whitespace-nowrap shadow-lg ${
        good ? "border-amber-900 bg-amber-300 text-amber-950" : "border-stone-600 bg-stone-800/90 text-stone-100"
      }`}
    >
      {text}
    </span>
  );
}

interface GhostInfo {
  def: BuildingDef;
  adjacency: number;
  grove: number;
  groveName: string;
}

const totalBonus = (b: { adjacency: number; grove: number }) => b.adjacency + b.grove;

function Ghost({ info }: { info: GhostInfo }) {
  const { def, adjacency, grove, groveName } = info;
  const text = def.bridge ? "Bridge to the far bank" : bonusPreviewText(def, adjacency, { name: groveName, bonus: grove });
  return (
    <>
      <span aria-hidden className="pointer-events-none leading-none opacity-60 select-none">
        {def.icon}
      </span>
      <Label text={text} good={adjacency + grove > 0 || !!def.bridge} />
    </>
  );
}

/** A kapre resting in the balete: eyes among the leaves and a curl of cigar smoke. */
function RestingSpirit({ onKey }: { onKey: (el: Element) => void }) {
  return (
    <span
      data-spirit
      role="button"
      tabIndex={0}
      aria-label="A kapre is resting in the balete. Tap for its story."
      title="A kapre is resting here"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onKey(e.currentTarget);
        }
      }}
      className="absolute inset-x-0 top-0 z-10 flex h-[65%] cursor-help items-start justify-center pt-[12%]"
    >
      <span aria-hidden className="text-[0.32em] leading-none motion-safe:animate-peek">
        👀
      </span>
      <span aria-hidden className="absolute top-0 right-[12%] text-[0.35em] leading-none opacity-0 motion-safe:animate-smoke motion-reduce:opacity-70">
        💨
      </span>
    </span>
  );
}

function Building(props: {
  x: number;
  y: number;
  info: BuildingInfo;
  fresh: boolean;
  lifted: boolean;
  onActivate: (x: number, y: number, el: Element) => void;
}) {
  const { x, y, info, fresh, lifted, onActivate } = props;
  const { def, bonus, damaged, burning, repairText } = info;
  // Decided once, at mount: only buildings that were just built bounce in.
  const [bounce] = useState(fresh);
  const label = burning
    ? `${def.name}, on fire! Tap to put it out`
    : damaged
      ? `${def.name}, damaged. Tap to repair for ${repairText}`
      : bonus > 0
        ? `${def.name}, +${Math.round(bonus * 100)}% bonus. Tap to move or demolish`
        : `${def.name}. Tap to move or demolish`;
  return (
    <>
      {lifted && (
        <div aria-hidden className="pointer-events-none absolute inset-[5%] rounded-md border-2 border-dashed border-amber-300 bg-amber-900/30" />
      )}
      <span
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onActivate(x, y, e.currentTarget);
          }
        }}
        aria-label={label}
        title={label}
        data-building={info.key}
        className={`relative leading-none drop-shadow-[0_2px_1px_rgb(0_0_0_/_0.35)] select-none ${bounce ? "motion-safe:animate-bounce-in" : ""} ${
          damaged ? "opacity-60 grayscale" : ""
        } ${lifted ? "opacity-40" : ""} cursor-pointer`}
      >
        {def.icon}
      </span>
      {burning && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-[30%] text-center text-[0.7em] leading-none motion-safe:animate-flicker"
        >
          🔥
        </span>
      )}
      {damaged && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 bottom-0 rounded-full bg-amber-100/90 px-0.5 text-[0.35em] leading-none shadow"
        >
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
