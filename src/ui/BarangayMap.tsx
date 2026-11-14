import { closesPlaza, entrancesBlockedBy, wouldHaveEntrance } from "../engine/doors";
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
import { buildingWorkers, rates, roadBonuses, unreachableWorkplaces, type GameState } from "../engine/game";
import {
  adjacencyBonusAt,
  buildingBonuses,
  buildingGroveBonuses,
  groveBonusAt,
  canPlaceRoad,
  crossingAt,
  layOutSpan,
  type BridgeTile,
  isClearable,
  isConnected,
  isPlaza,
  NEIGHBOURS,
  occupancy,
  tileAt,
  validTiles,
  type Point,
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
import { NightLayer } from "./NightLayer";
import { bonusPreviewText, RESOURCE_ICON } from "./format";
import { activeJobs, jobCost, workforce } from "../engine/clearing";
import { raidLanding } from "../engine/border";
import { shoreCoverage } from "../engine/defense";
import { fill, type GameText } from "./uiContent";
import type { Lang } from "./settings";
import { useReducedMotion, VillagerLayer, type Clash, type NamedHit } from "./VillagerLayer";
import type { Tapped } from "./villagers";
import { dockPoint, riverPath, SAIL_SECONDS, waitIndex } from "./visitors";
import { isClear, labelSize, placeLabel, type Rect } from "./labels";
import { isPranked } from "../engine/forest";
import { sarimanokAt } from "../engine/worship";
import { datuHouseBox, datuHouseUrl, houseStyleFor, type HouseStyle } from "./datuHouseArt";
import { clearingTiles, firePit, hasFirePit, houseFootprint, houseFront } from "../engine/plaza";
import { healerStays } from "../engine/healing";
import { buildingArtUrl, mapIcon } from "./buildingArt";

const INCOME_EVERY_MS = 3000;
const WAITING_TEXT = "⏸ Trade paused — raid in progress";
/** How far (in tiles) the title screen's view drifts each way. */
const SCENIC_DRIFT = 3;
/** One full sway of the title screen's drift, in seconds. */
const SCENIC_PERIOD_SECONDS = 140;
/** Tile size on the title screen: wide enough to see the barangay around the logo. */
const SCENIC_TILE = 26;
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
  /** Joined to the plaza by an unbroken Daan. */
  connected: boolean;
  /** A workplace nobody can walk to. */
  noPath: boolean;
  /** Paused by the player. */
  paused: boolean;
  /** Workers lent to clearing forest right now. */
  lent: number;
  /** Raised to this level (a Kamalig); 1 when not raised. */
  level: number;
  damaged: boolean;
  burning: boolean;
  repairText: string;
  /** A Libingan's look, from the barangay's tradition. */
  burialLook: "jars" | "longon";
  /** A healer's hut: how many sick villagers rest inside (engine/healing.ts). */
  inside: number;
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
  /** A named villager was tapped. */
  onVillager?: (v: Tapped) => void;
  /** Right-click on a building (desktop): open its menu. */
  onBuildingMenu: (x: number, y: number, sx: number, sy: number) => void;
  /** The player tapped a spirit in its tree (the anito of the balete): show its lore note. */
  onSpirit: (loreId: string, sx: number, sy: number) => void;
  /** Background for the title screen: no input, no controls, slowly drifting (unless reduced motion). */
  scenic?: boolean;
  /** A battle being shown at the Kuta (see App). */
  clash?: Clash | null;
  /** The player tapped the trade boat at the dock. */
  onBoat?: () => void;
  /** Laying Daan: tap a tile to lay one, tap a path to take it up; drag with a mouse to lay a line. */
  road?: { onLay: (tiles: Point[]) => void; onRemove: (x: number, y: number) => void; costText: string } | null;
  /** Forest tiles picked for clearing. */
  selection?: Point[];
  /** A mouse drag across the forest: the tiles in the rectangle (the App filters them). */
  onSelectArea?: (tiles: Point[]) => void;
  /** A building whose menu is open: a Kuta shows its defense radius. */
  focus?: Point | null;
  /** Trade is paused for a raid: the bangka waits offshore and can't be tapped. */
  tradeHeld?: boolean;
  /** The player tapped the Sarimanok crossing the sky. */
  onSarimanok?: () => void;
  /** A ritual being led at the Dambana right now (the short animation). */
  ritual?: { x: number; y: number; icon: string } | null;
  /**
   * Visiting another barangay: read-only (taps do nothing), every Kuta's defense radius shown,
   * and while planning a raid, where it would land.
   */
  visit?: { landing: Point | null } | null;
  /** Changed (e.g. a counter) to zoom out to the whole map: the camera only (dev panel). */
  wholeMap?: number;
  /** Drawn over the villagers and under the night's tint (an expedition replay). */
  overlay?: (cam: Camera, view: View) => ReactNode;
  /** The warning shown when a tile would shut the way into a building, e.g. "Would block the way into the Palayan". */
  blockedLabel?: (building: string) => string;
  /** The warning for a tile that would close the plaza in. */
  plazaLabel?: string;
  /** The Defense map (Depensa tab): every landing point and the Kutas' cover; and its words. */
  defense?: { on: boolean; text: GameText["defense"]; lang: Lang } | null;
}) {
  const { state, content, placing, moveFrom = null, onPlace, onTapTile, onVillager, onBuildingMenu, onSpirit, scenic = false, clash = null, onBoat, road = null, selection = [], onSelectArea, focus = null, tradeHeld = false, onSarimanok, ritual = null, visit = null, blockedLabel, plazaLabel, wholeMap = 0, overlay, defense = null } = props;
  // The rectangle being dragged over the forest (desktop), from its first tile to the current one.
  const [dragArea, setDragArea] = useState<{ from: Point; to: Point } | null>(null);
  // Tiles being painted with a mouse drag in road mode (laid on release).
  const [paint, setPaint] = useState<Point[]>([]);
  const plan = props.planState ?? state;
  const { map } = state;
  const area = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ w: 0, h: 0 });
  const [cam, setCamRaw] = useState<Camera | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const setCam = useCallback((c: Camera) => setCamRaw(clampCamera(c, map)), [map]);
  // Remember where the camera was for each barangay, so coming back (from the Rehiyon or a
  // visit) finds it where it was left.
  const camKey = `${map.seed}:${map.plaza.x},${map.plaza.y}:${map.width}`;
  useEffect(() => {
    if (cam && !scenic) savedCameras.set(camKey, cam);
  }, [cam, camKey, scenic]);

  // Where the controls drawn over the map are (Gather buttons, zoom buttons, banners, the
  // adviser), so floating labels keep clear of them. Measured after each render; only a real
  // change triggers another.
  const [avoid, setAvoid] = useState<Rect[]>([]);
  const avoidKey = useRef("");
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || scenic) return;
    const base = el.getBoundingClientRect();
    const rects = [...document.querySelectorAll("[data-map-overlay]")]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ left: r.left - base.left, top: r.top - base.top, right: r.right - base.left, bottom: r.bottom - base.top }));
    const key = rects.map((r) => [r.left, r.top, r.right, r.bottom].map(Math.round).join(",")).join(";");
    if (key !== avoidKey.current) {
      avoidKey.current = key;
      setAvoid(rects);
    }
  });

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
    if (view.w > 0 && scenic) {
      // Title screen: zoomed out but always filling the screen (the drift included). On wide
      // screens the barangay sits left of the menu; on phones, in the upper part by the logo.
      const room = 2 * (SCENIC_DRIFT + 1);
      const tile = Math.max(SCENIC_TILE, Math.ceil(view.w / (map.width - room)), Math.ceil(view.h / (map.height - room)));
      // Matches the title screen's layout, which moves its menu to the right from 1024px (lg).
      const wide = view.w >= 1024;
      const want = {
        x: map.plaza.x + 0.5 + (wide ? (view.w * 0.25) / tile : 0),
        y: map.plaza.y + 0.5 + (wide ? 0 : (view.h * 0.2) / tile),
      };
      const keepIn = (v: number, half: number, size: number) => Math.min(size - half - SCENIC_DRIFT - 1, Math.max(half + SCENIC_DRIFT + 1, v));
      setCamRaw({ tile, x: keepIn(want.x, view.w / 2 / tile, map.width), y: keepIn(want.y, view.h / 2 / tile, map.height) });
    } else if (view.w > 0) {
      const saved = savedCameras.get(camKey);
      setCamRaw((c) => (saved && !c ? clampCamera(saved, map) : cameraOn(map.plaza, view, c?.tile)));
    }
  }, [plazaKey, view.w > 0, scenic && view.w >= 1024]);

  // The whole map at once (smaller tiles than zooming allows; the next pan or zoom returns to normal).
  useEffect(() => {
    if (!wholeMap || view.w <= 0) return;
    setCamRaw({ x: map.width / 2, y: map.height / 2, tile: Math.max(4, Math.min(view.w / map.width, view.h / map.height)) });
  }, [wholeMap]);

  const centre = () => cam && setCam(cameraOn(map.plaza, view, cam.tile));
  const zoomBy = (factor: number) => cam && setCam(zoomAt(cam, view, factor, view.w / 2, view.h / 2));

  // ---- Data for the tiles in view ----

  const buildings = useMemo(() => {
    const bonuses = buildingBonuses(state, content);
    const groves = buildingGroveBonuses(state, content);
    const roads = roadBonuses(state, content);
    const stranded = new Set(unreachableWorkplaces(state, content));
    const lentOut = workforce(state, content).borrowed;
    const defs = new Map(content.buildings.map((d) => [d.id, d]));
    const byTile = new Map<string, BuildingInfo>();
    const look = content.traditions.find((t) => t.id === state.tradition)?.burialLook ?? "jars";
    const insideAt = new Map(healerStays(state, content).map((h) => [h.index, h.count]));
    state.buildings.forEach((b, i) => {
      const def = defs.get(b.type);
      if (!def) return;
      const repair = Object.entries(def.repairCost).map(([r, n]) => `${n} ${r}`).join(", ");
      byTile.set(`${b.x},${b.y}`, {
        def,
        key: buildingKey(b),
        bonus: bonuses[i] + roads[i] + Object.values(groves[i]).reduce((sum, g) => sum + (g ?? 0), 0),
        connected: roads[i] > 0,
        noPath: stranded.has(b),
        paused: b.paused === true,
        lent: lentOut[i] ?? 0,
        level: b.level ?? 1,
        damaged: b.damaged === true,
        burning: b.burningSince !== undefined,
        repairText: repair || "free",
        burialLook: look,
        inside: insideAt.get(i) ?? 0,
      });
    });
    return byTile;
  }, [state.buildings, map, content, state.legacyReach, state.clearing, state.villagers, state.sick.length, state.named, state.resources.rice > 0, state.tradition]);

  // The scenic drift moves the view up to SCENIC_DRIFT tiles, so draw that much more around it.
  // Bridge decks: which way each bridge tile runs and where its banks are, so the whole bridge
  // is drawn as one piece across the river.
  const decks = useMemo(() => {
    const out = new Map<string, BridgeTile>();
    for (const b of state.buildings) {
      const d = content.buildings.find((x) => x.id === b.type);
      if (d?.bridge && b.span) layOutSpan(map, b.span, out);
    }
    return out;
  }, [state.buildings, map, content]);

  const range = cam && view.w > 0 ? visibleRange(cam, view, map, scenic ? SCENIC_DRIFT + 1 : 1) : null;
  const rangeKey = range ? `${range.x0},${range.y0},${range.x1},${range.y1}` : "";

  // The grove that boosts the building being placed, if any (the Anito ng Balete's grove for camps).
  const grove = placing ? (content.groves.find((g) => g.affects === placing.id) ?? null) : null;

  // Valid tiles for the building being placed, within the view, with the bonus each would get.
  const placement = useMemo(() => {
    if (!placing || !range) return null;
    const taken = occupancy(plan);
    return new Map<string, { adjacency: number; grove: number; road: number; noPath: boolean; bank: number; shore: string }>(
      validTiles(plan, content, placing, range)
        .filter((t) => !(moveFrom && t.x === moveFrom.x && t.y === moveFrom.y))
        .map((t) => {
          const adjacency = adjacencyBonusAt(plan.map, taken, placing, t.x, t.y);
          const g = grove ? groveBonusAt(plan.map, content, placing, t.x, t.y, grove.resource) : 0;
          const road = placing.produces && isConnected(plan.map, t.x, t.y) ? content.rules.roads.connectedBonusPercent / 100 : 0;
          const noPath = (placing.workers ?? 0) > 0 && !wouldHaveEntrance(plan, content, t.x, t.y);
          // The landing points (the engine's own, see defense.ts) a Kuta here would cover.
          let bank = 0;
          let shore = "";
          if (placing.defense) {
            const cover = shoreCoverage(plan, content, t);
            bank = cover.filter((s) => s.byNew).length;
            const union = cover.filter((s) => s.covered || s.byNew).length;
            const dt = defense?.text;
            const lang = defense?.lang ?? "en";
            shore = cover.length === 0
              ? (dt?.noShore[lang] ?? "No shore where raiders can land")
              : bank === 0
                ? (dt?.placingNone[lang] ?? "🛡️ Covers no landing point")
                : fill(dt?.placing[lang] ?? "🛡️ Covers {covered} of {total} landing points ({left} left uncovered)", { covered: union, total: cover.length, left: cover.length - union });
          }
          return [`${t.x},${t.y}`, { adjacency, grove: g, road, noPath, bank, shore }];
        }),
    );
  }, [placing, plan.buildings, plan.map, content, rangeKey, moveFrom?.x, moveFrom?.y, defense?.lang]);

  // Placing a bridge: the crossing it would make from the hovered tile, drawn in full (or a red
  // "Can't cross here" on river where it can't).
  const crossing = placing?.bridge && hover ? crossingAt(plan.map, placing, hover.x, hover.y) : null;
  const crossingDecks = useMemo(() => (crossing ? layOutSpan(plan.map, crossing.span) : new Map<string, BridgeTile>()), [crossing?.span.map((p) => `${p.x},${p.y}`).join(";"), plan.map]);
  const cantCross = !!placing?.bridge && !!hover && !crossing && (tileAt(plan.map, hover.x, hover.y) === "river" || tileAt(plan.map, hover.x, hover.y) === "bridge");
  // Placing on a tile that would shut the last way into a building: say which one.
  const blockedHere = useMemo(() => {
    if (!placing || placing.bridge || !hover || placement?.has(`${hover.x},${hover.y}`)) return null;
    if (closesPlaza(plan, content, hover.x, hover.y)) return plazaLabel ?? "Would close off the Bahay ng Datu";
    const hit = entrancesBlockedBy(plan, content, hover.x, hover.y)[0];
    if (!hit) return null;
    const name = content.buildings.find((d) => d.id === hit.type)?.name ?? hit.type;
    return blockedLabel ? blockedLabel(name) : `Would block the way into the ${name}`;
  }, [placing, hover?.x, hover?.y, placement, plan.buildings, plan.map, content, blockedLabel]);

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

  // A Kuta's defense radius: around the tile being placed on, the Kuta whose menu is open, or
  // every Kuta while a raid is coming (where they'll land is marked too).
  const landing = scenic ? null : visit ? visit.landing : raidLanding(state, content);
  const radius = content.rules.military.kutaRadius;
  const kutaIds = useMemo(() => new Set(content.buildings.filter((b) => b.defense).map((b) => b.id)), [content]);
  const guardCenters: Point[] = [];
  if (!scenic) {
    if (placing?.defense && hover) guardCenters.push(hover);
    const focused = focus ? state.buildings.find((b) => b.x === focus.x && b.y === focus.y) : undefined;
    if (focused && kutaIds.has(focused.type)) guardCenters.push(focused);
    if (landing || placing?.defense || visit || defense?.on) for (const b of state.buildings) if (kutaIds.has(b.type) && !b.damaged) guardCenters.push(b);
  }
  const guardKey = guardCenters.map((p) => `${p.x},${p.y}`).join(";");
  const guard = useMemo(() => {
    const tiles = new Set<string>();
    if (!range) return tiles;
    for (const c of guardCenters) {
      for (let y = Math.max(range.y0, Math.ceil(c.y - radius)); y <= Math.min(range.y1, Math.floor(c.y + radius)); y++) {
        for (let x = Math.max(range.x0, Math.ceil(c.x - radius)); x <= Math.min(range.x1, Math.floor(c.x + radius)); x++) {
          if (Math.hypot(x - c.x, y - c.y) <= radius) tiles.add(`${x},${y}`);
        }
      }
    }
    return tiles;
  }, [guardKey, rangeKey, radius]);

  // The landing points on the shore: shown while placing a Kuta (with what the new one would
  // cover), on the Defense map, and while a raid is coming. Green: a Kuta covers it.
  const showShore = !scenic && !visit && (!!defense?.on || !!placing?.defense || !!landing);
  const planned = placing?.defense && hover && placement?.has(`${hover.x},${hover.y}`) ? hover : null;
  const shore = useMemo(() => {
    const out = new Map<string, "covered" | "new" | "open">();
    if (!showShore) return out;
    for (const s of shoreCoverage(plan, content, planned)) out.set(`${s.p.x},${s.p.y}`, s.covered ? "covered" : s.byNew ? "new" : "open");
    return out;
  }, [showShore, plan.buildings, plan.map, content, planned?.x, planned?.y]);

  // Now and then the anito of a balete shows itself. Which trees, and when, comes from a hash of the
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
    /** The press started on the trade boat. */
    boat?: boolean;
    /** The press started on another tappable thing on the map (the Sarimanok): its element, clicked on a tap. */
    tapEl?: HTMLElement | null;
    /** A mouse drag laying Daan. */
    painting?: boolean;
    /** A mouse drag selecting forest to clear. */
    selecting?: boolean;
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

  const namedHit = useRef<NamedHit | null>(null);
  const tapAt = (px: number, py: number, clientX: number, clientY: number) => {
    if (!cam || visit) return;
    const t = screenToTile(cam, view, px, py);
    if (tileAt(map, t.x, t.y) === null) return;
    if (road) {
      if (tileAt(map, t.x, t.y) === "daan") road.onRemove(t.x, t.y);
      else if (canPlaceRoad(state, content, t.x, t.y)) road.onLay([t]);
      return;
    }
    if (placing) {
      if (placement?.has(`${t.x},${t.y}`)) onPlace(t.x, t.y);
      else if (!placing.bridge && closesPlaza(plan, content, t.x, t.y)) spawnFloat(clientX, clientY, plazaLabel ?? "Would close off the Bahay ng Datu", "info");
      else if (!placing.bridge && entrancesBlockedBy(plan, content, t.x, t.y).length) {
        // Phones have no hover: say why the tile can't take it.
        const hit = entrancesBlockedBy(plan, content, t.x, t.y)[0];
        const name = content.buildings.find((d) => d.id === hit.type)?.name ?? hit.type;
        spawnFloat(clientX, clientY, blockedLabel ? blockedLabel(name) : `Would block the way into the ${name}`, "info");
      } else if (placing.bridge) {
        const tt = tileAt(map, t.x, t.y);
        if (tt === "river" || tt === "bridge") spawnFloat(clientX, clientY, "Can't cross here", "info");
      }
    } else {
      // A named villager (drawn with a star) comes before the tile under them.
      const who = onVillager && namedHit.current?.(px, py);
      if (who) onVillager(who);
      else onTapTile(t.x, t.y, clientX, clientY);
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!cam || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const spirit = !!(e.target as Element).closest?.("[data-spirit]");
    const boat = !!(e.target as Element).closest?.("[data-boat]");
    const tapEl = (e.target as Element).closest?.<HTMLElement>("[data-map-tap]") ?? null;
    // Road mode with a mouse: the drag paints a path instead of panning.
    if (road && e.pointerType === "mouse" && pointers.current.size === 1) {
      const t = screenToTile(cam, view, p.x, p.y);
      gesture.current = { x: p.x, y: p.y, cam, moved: false, painting: true };
      setPaint(tileAt(map, t.x, t.y) === "daan" ? [] : [t]);
      return;
    }
    // A mouse drag that starts on forest selects an area of it to clear (elsewhere it pans).
    if (!road && !placing && onSelectArea && e.pointerType === "mouse" && pointers.current.size === 1) {
      const t = screenToTile(cam, view, p.x, p.y);
      const tile = tileAt(map, t.x, t.y);
      if (tile === "forest" || tile === "balete") {
        gesture.current = { x: p.x, y: p.y, cam, moved: false, selecting: true, spirit, boat, tapEl };
        return;
      }
    }
    if (pointers.current.size === 1) gesture.current = { x: p.x, y: p.y, cam, moved: false, spirit, boat, tapEl };
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
    if (g.selecting && cam) {
      if (!g.moved && Math.hypot(p.x - g.x, p.y - g.y) > TAP_SLOP_PX) g.moved = true;
      if (g.moved) setDragArea({ from: screenToTile(cam, view, g.x, g.y), to: screenToTile(cam, view, p.x, p.y) });
      return;
    }
    if (g.painting && cam) {
      const t = screenToTile(cam, view, p.x, p.y);
      if (Math.hypot(p.x - g.x, p.y - g.y) > TAP_SLOP_PX) g.moved = true;
      setHover(t);
      setPaint((tiles) => {
        const last = tiles[tiles.length - 1];
        if (last && last.x === t.x && last.y === t.y) return tiles;
        // Fill in skipped tiles (a fast drag), stepping along x then y like the path is walked.
        const out = [...tiles];
        let cx = last?.x ?? t.x;
        let cy = last?.y ?? t.y;
        while (cx !== t.x || cy !== t.y) {
          if (cx !== t.x) cx += Math.sign(t.x - cx);
          else cy += Math.sign(t.y - cy);
          if (!out.some((q) => q.x === cx && q.y === cy)) out.push({ x: cx, y: cy });
        }
        if (!out.length) out.push(t);
        return out;
      });
      return;
    }
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
    if (pointers.current.size === 0 && g?.selecting) {
      if (e.type === "pointerup" && g.moved && dragArea && onSelectArea) {
        const r = dragArea;
        const tiles: Point[] = [];
        for (let y = Math.min(r.from.y, r.to.y); y <= Math.max(r.from.y, r.to.y); y++) {
          for (let x = Math.min(r.from.x, r.to.x); x <= Math.max(r.from.x, r.to.x); x++) tiles.push({ x, y });
        }
        onSelectArea(tiles);
      } else if (e.type === "pointerup" && !g.moved) {
        const p = local(e);
        if (g.tapEl) g.tapEl.click();
        else if (g.boat && onBoat) onBoat();
        else if (g.spirit && sighting?.lore) onSpirit(sighting.lore, e.clientX, e.clientY);
        else tapAt(p.x, p.y, e.clientX, e.clientY);
      }
      setDragArea(null);
      gesture.current = null;
      return;
    }
    if (pointers.current.size === 0 && g?.painting) {
      // A drag lays the whole line; a click is a normal tap (lay or take up one tile).
      if (e.type === "pointerup" && g.moved && road) road.onLay(paint.filter((t) => canPlaceRoad(state, content, t.x, t.y)));
      else if (e.type === "pointerup") {
        const p = local(e);
        tapAt(p.x, p.y, e.clientX, e.clientY);
      }
      setPaint([]);
      gesture.current = null;
      return;
    }
    if (pointers.current.size === 0) {
      if (g && !g.moved && e.type === "pointerup") {
        const p = local(e);
        if (g.tapEl) g.tapEl.click();
        else if (g.boat && onBoat) onBoat();
        else if (g.spirit && sighting?.lore) onSpirit(sighting.lore, e.clientX, e.clientY);
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
    if (scenic) return;
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
  }, [map, scenic]);

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

  useIncomeFloats(area, state, content, cam, view, !scenic && !visit);
  const reducedMotion = useReducedMotion();

  // Title screen: drift slowly over the barangay. The drift is only a couple of pixels a
  // second, so ten small steps a second look smooth and cost far less than animating every frame.
  const drift = useRef<HTMLDivElement>(null);
  const driftPx = cam ? SCENIC_DRIFT * cam.tile : 0;
  useEffect(() => {
    const el = drift.current;
    if (!el || !scenic || reducedMotion || !driftPx) return;
    const move = () => {
      const t = (2 * Math.PI * performance.now()) / 1000 / SCENIC_PERIOD_SECONDS;
      el.style.transform = `translate3d(${(driftPx * Math.sin(t)).toFixed(2)}px, ${(driftPx * 0.5 * Math.sin(t * 0.7)).toFixed(2)}px, 0)`;
    };
    move();
    const id = setInterval(move, 100);
    return () => {
      clearInterval(id);
      el.style.transform = "";
    };
  }, [scenic, reducedMotion, driftPx]);

  // Villagers carrying torches at night (the villager layer writes them, the night layer lights them).
  const torches = useRef<Point[]>([]);
  const typhoonComing = state.typhoon !== null;
  const dry = (seasonAt(content, state.time)?.season.productionPercent.rice ?? 100) < 100;

  // ---- Render only the tiles in view ----

  const cells: ReactNode[] = [];
  if (cam && range) {
    const jobs = new Map(state.clearing.map((j) => [`${j.x},${j.y}`, j]));
    // The Bahay ng Datu: its footprint (engine/plaza.ts), where it is drawn and its fire pit.
    const houseTiles = new Set(houseFootprint(state, content).map((p) => `${p.x},${p.y}`));
    const house = datuHouseBox(state, content);
    const fire = hasFirePit(state, content) ? firePit(state, content) : null;
    // The clearing beside the house, and its shade tree on the open tile farthest from the doorway.
    const open = clearingTiles(state, content);
    const clearingKeys = new Set(open.map((p) => `${p.x},${p.y}`));
    const door = houseFront(state, content);
    const far = (p: Point) => Math.hypot(p.x + 0.5 - door.x, p.y + 0.5 - door.y);
    const shade = open.length >= 4 ? [...open].sort((a, b) => far(b) - far(a) || a.y - b.y || a.x - b.x)[0] : null;
    const clearingDraw: ClearingDraw = {
      tiles: open.map((p) => ({ x: p.x - map.plaza.x, y: p.y - map.plaza.y })),
      // The tree stands at the clearing's outer edge, on the side away from the house.
      tree: shade ? { x: shade.x - map.plaza.x + (shade.x + 0.5 < door.x ? 0.12 : 0.88), y: shade.y - map.plaza.y + 0.15 } : null,
    };
    const working = new Set(activeJobs(state, content).map((j) => `${j.x},${j.y}`));
    const picked = new Map(selection.map((t, i) => [`${t.x},${t.y}`, i]));
    const r = dragArea;
    const inArea = (x: number, y: number) =>
      !!r && x >= Math.min(r.from.x, r.to.x) && x <= Math.max(r.from.x, r.to.x) && y >= Math.min(r.from.y, r.to.y) && y <= Math.max(r.from.y, r.to.y);
    const price = jobCost(state, content, selection.length);
    const clearLabel = `🪓 Select to clear · ${RESOURCE_ICON.rice} ${price.rice} · +${content.rules.clearing.wood} ${RESOURCE_ICON.wood}`;
    for (let y = range.y0; y <= range.y1; y++) {
      for (let x = range.x0; x <= range.x1; x++) {
        const tile = tileAt(map, x, y)!;
        const key = `${x},${y}`;
        const building = buildings.get(key) ?? null;
        const hovered = hover?.x === x && hover?.y === y;
        const clearable = !placing && !road && !visit && isClearable(map, x, y);
        const painted = paint.some((t) => t.x === x && t.y === y);
        const roadTarget = road ? (tile === "daan" || canPlaceRoad(state, content, x, y) ? 0 : "blocked") : null;
        cells.push(
          <Cell
            key={key}
            x={x}
            y={y}
            tile={tile}
            plaza={isPlaza(map, x, y)}
            underHouse={!isPlaza(map, x, y) && houseTiles.has(key)}
            clearing={clearingKeys.has(key)}
            ground={isPlaza(map, x, y) ? clearingDraw : undefined}
            houseAt={isPlaza(map, x, y) ? house.cx - x : undefined}
            houseSize={isPlaza(map, x, y) ? house.size : undefined}
            fireX={isPlaza(map, x, y) && fire ? fire.x - x : undefined}
            fireY={isPlaza(map, x, y) && fire ? fire.y - y : undefined}
            beach={tile !== "sea" && tile !== "river" && tile !== "bridge" && NEIGHBOURS.some(([dx, dy]) => tileAt(map, x + dx, y + dy) === "sea")}
            datuLevel={isPlaza(map, x, y) ? state.datuLevel : undefined}
            houseStyle={isPlaza(map, x, y) ? houseStyleFor(state, content) : undefined}
            building={building}
            fresh={building ? fresh.has(building.key) : false}
            lifted={moveFrom?.x === x && moveFrom?.y === y}
            target={roadTarget ?? (placement ? (placement.has(key) ? totalBonus(placement.get(key)!) : "blocked") : null)}
            pathPreview={painted && canPlaceRoad(state, content, x, y)}
            ghost={
              placing && hovered && placement?.has(key)
                ? { def: placing, ...placement.get(key)!, groveName: grove?.name ?? "" }
                : null
            }
            glow={glow.has(key)}
            guard={guard.has(key)}
            shore={shore.get(key)}
            shoreText={shore.has(key) && defense ? `${defense.text.landing[defense.lang]}: ${shore.get(key) === "open" ? defense.text.uncovered[defense.lang] : defense.text.covered[defense.lang]}` : undefined}
            deck={decks.get(key) ?? (tile === "bridge" ? FALLBACK_DECK : null)}
            deckPreview={crossingDecks.get(key) ?? null}
            cantCross={cantCross && hovered}
            warn={hovered ? blockedHere : null}
            spirit={
              tile === "balete" && sighting
                ? hash(x * 31 + sightingWindow, y * 17 + sightingWindow) < sighting.sighting!.chancePercent
                : false
            }
            onSpiritKey={onSpiritKey}
            clearable={clearable}
            hint={
              jobs.has(key) && hovered && !road
                ? working.has(key)
                  ? "🪓 Clearing · tap to stop"
                  : "⏳ Waiting for a free villager · tap to stop"
                : road && hovered
                ? tile === "daan"
                  ? "Tap to take up the path (free)"
                  : canPlaceRoad(state, content, x, y)
                    ? `🛤️ Daan · ${road.costText}`
                    : null
                : clearable && hovered
                  ? tile === "balete"
                    ? "🌳 Old balete tree"
                    : clearLabel
                  : null
            }
            progress={jobs.has(key) ? Math.min(1, jobs.get(key)!.progress / jobs.get(key)!.seconds) : null}
            waiting={jobs.has(key) && !working.has(key)}
            picked={picked.has(key) || (inArea(x, y) && tile === "forest")}
            onActivate={onActivate}
          />,
        );
      }
    }
  }
  const o = cam ? origin(cam, view) : { x: 0, y: 0 };
  // The docked trade boat's tap target (the boat itself is drawn on the villager canvas).
  const path = useMemo(() => riverPath(map), [map]);
  const offer = state.region?.offer ?? null;
  // Only while its offer is still open: an answered or expired offer leaves no label.
  const docked = offer && offer.expiresAt > state.time && !tradeHeld && !scenic && onBoat && path.length > 2 && (reducedMotion || state.time - (offer.expiresAt - content.rules.diplomacy.offers.expireSeconds) >= SAIL_SECONDS);
  const dock = docked ? { p: dockPoint(path, map.plaza), name: content.neighbors.find((n) => n.id === offer.from)?.name ?? offer.from } : null;
  // While trade is paused, a label where the bangka waits offshore. If it can't sit clear of the
  // controls it's left out: the offer bar at the top says the same thing.
  const waiting = offer && tradeHeld && !scenic && landing && path.length > 2 ? path[waitIndex(path, landing)] : null;
  const waitingWant = cam && waiting ? { x: o.x + waiting.x * cam.tile, y: o.y + waiting.y * cam.tile + cam.tile * 0.7 } : null;
  const waitingFit = cam && waitingWant ? placeLabel(waitingWant.x, waitingWant.y, labelSize(WAITING_TEXT), view, avoid) : null;
  // A label pushed far from its boat no longer reads as the boat's: then leave it to the top bar.
  const waitingAt = cam && waitingWant && waitingFit && Math.hypot(waitingFit.x - waitingWant.x, waitingFit.y - waitingWant.y) <= cam.tile * 1.5 ? waitingFit : null;
  // The docked boat's tap target only where it can actually be tapped (not under a control).
  const dockBox = cam && dock ? { left: o.x + dock.p.x * cam.tile - cam.tile * 0.65, top: o.y + dock.p.y * cam.tile - cam.tile * 0.65 - 18, right: o.x + dock.p.x * cam.tile + cam.tile * 0.65, bottom: o.y + dock.p.y * cam.tile + cam.tile * 0.65 } : null;
  const dockClear = !!dockBox && isClear(dockBox, view, avoid);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={area}
        {...(scenic
          ? { "aria-hidden": true, className: "forest-ground pointer-events-none absolute inset-0 overflow-hidden select-none" }
          : {
              tabIndex: 0,
              role: "application",
              "aria-label": "Your barangay. Drag to move, scroll or pinch to zoom, arrow keys to pan, C to centre.",
              className: `forest-ground absolute inset-0 touch-none overflow-hidden outline-none select-none focus-visible:ring-4 focus-visible:ring-amber-300 focus-visible:ring-inset ${
                placing || road ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
              }`,
              onPointerDown,
              onPointerMove,
              onPointerUp,
              onPointerCancel: onPointerUp,
              onPointerLeave: () => setHover(null),
              onKeyDown,
              onContextMenu,
              ...dnd,
            })}
      >
        <div ref={drift} className="absolute inset-0">
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
        {cam && !scenic && (
          <SpiritOverlays state={state} content={content} cam={cam} o={o} ritual={ritual} onSarimanok={onSarimanok} reducedMotion={reducedMotion} />
        )}
        {cam && view.w > 0 && <VillagerLayer state={state} content={content} cam={cam} view={view} reducedMotion={reducedMotion} clash={clash} hitRef={scenic ? undefined : namedHit} torches={scenic ? undefined : torches} />}
        {cam && view.w > 0 && overlay?.(cam, view)}
        {cam && landing && <LandingMarker cam={cam} view={view} landing={landing} avoid={avoid} />}
        {waitingAt && (
          <span
            role="status"
            className="map-chip pointer-events-none absolute z-10 -translate-x-1/2"
            style={{ left: waitingAt.x, top: waitingAt.y }}
          >
            {WAITING_TEXT}
          </span>
        )}
        {cam && dock && dockClear && (
          <span
            data-boat
            role="button"
            tabIndex={0}
            aria-label={`A bangka from ${dock.name} has docked. Open the trade offer`}
            title={`Bangka from ${dock.name}: tap to trade`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onBoat?.();
              }
            }}
            className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-start justify-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
            style={{ left: o.x + dock.p.x * cam.tile, top: o.y + dock.p.y * cam.tile, width: cam.tile * 1.3, height: cam.tile * 1.3 }}
          >
            <span aria-hidden className="map-chip map-chip-good -mt-[0.9em] motion-safe:animate-bounce">
              🛶 Trade
            </span>
          </span>
        )}
        </div>
        {/* The day/night and weather tints. Left out behind the title screen: its dark overlay hides
            them, and a blended tint over the drifting map is costly to composite. */}
        {!scenic && (
          <>
        {/* Dusk, night and dawn from the game's clock (not the device's): one cool-blue layer with the
            barangay's lights, never too dark to read (NightLayer). */}
        {cam && view.w > 0 && <NightLayer state={state} content={content} cam={cam} view={view} reducedMotion={reducedMotion} torches={torches} />}
        {/* The Bakunawa swallowing the moon: the night goes darker and redder. */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 transition-colors duration-[2000ms] ${state.eclipse ? "bg-red-950/45" : "bg-transparent"}`}
        />
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 transition-colors duration-[3000ms] ${
            typhoonComing ? "bg-slate-800/35" : dry ? "bg-amber-300/15 mix-blend-multiply" : "bg-transparent"
          }`}
        />
          </>
        )}
      </div>

      {/* Camera controls sit outside the gesture area, so tapping them never pans the map. Mid-right
          keeps them clear of the event banners (top) and the gather buttons (bottom). */}
      {!scenic && (
      <div data-map-overlay className="absolute top-1/2 right-2 z-10 flex -translate-y-1/2 flex-col gap-2">
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
      )}
    </div>
  );
}

/**
 * Where raiders will land: a pulsing marker on the tile, or, when it's off screen, an arrow at
 * the edge of the view pointing to it.
 */
function LandingMarker({ cam, view, landing, avoid }: { cam: Camera; view: View; landing: Point; avoid: Rect[] }) {
  const p = tileCenter(cam, view, landing.x, landing.y);
  const inside = p.x >= 0 && p.y >= 0 && p.x <= view.w && p.y <= view.h;
  if (inside) {
    // The ring stays on the tile; the "Landing" pill moves clear of any control over it.
    const size = labelSize("⚔️ Landing", 12);
    const at = placeLabel(p.x, p.y - size.h / 2, size, view, avoid);
    return (
      <>
        <span
          aria-hidden
          className="pointer-events-none absolute z-10 rounded-full bg-red-500/40 motion-safe:animate-ping"
          style={{ left: p.x - cam.tile / 2, top: p.y - cam.tile / 2, width: cam.tile, height: cam.tile }}
        />
        {at && (
          <span
            aria-hidden
            className="map-chip map-chip-warn pointer-events-none absolute z-10 -translate-x-1/2"
            style={{ left: at.x, top: at.y }}
          >
            ⚔️ Landing
          </span>
        )}
      </>
    );
  }
  // Off screen: an arrow at the edge of the clear part of the view, pointing the way.
  const m = 28;
  const size = { w: 44, h: 26 };
  const at = placeLabel(Math.min(view.w - m, Math.max(m, p.x)), Math.min(view.h - m, Math.max(m, p.y)) - size.h / 2, size, view, avoid);
  if (!at) return null;
  const angle = Math.atan2(p.y - (at.y + size.h / 2), p.x - at.x);
  return (
    <div
      role="img"
      aria-label="Raiders will land off screen in this direction"
      className="map-chip map-chip-warn pointer-events-none absolute z-10 -translate-x-1/2"
      style={{ left: at.x, top: at.y }}
    >
      ⚔️
      <span aria-hidden className="inline-block" style={{ transform: `rotate(${angle}rad)` }}>
        ➜
      </span>
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
  enabled: boolean,
) {
  const latest = useRef({ state, cam, view });
  latest.current = { state, cam, view };

  useEffect(() => {
    if (!enabled) return;
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
  }, [area, content, enabled]);
}

/** Each barangay's last camera (see BarangayMap). Only for this session. */
const savedCameras = new Map<string, Camera>();

const GROUND: Record<Tile, string> = {
  cleared: "bg-green-600/60",
  daan: "daan-tile",
  forest: "bg-green-900/40",
  balete: "bg-emerald-950/60",
  river: "river-tile",
  bridge: "river-tile",
  sea: "sea-tile",
};

const Cell = memo(function Cell(props: {
  /** The Bahay ng Datu's level and style (drawn on the plaza). */
  datuLevel?: number;
  houseStyle?: HouseStyle;
  /** On the plaza: the house's centre (tiles right of this tile's left edge) and size (tiles), see datuHouseArt.datuHouseBox. */
  houseAt?: number;
  houseSize?: number;
  /** One of the clearing's open tiles (drawn by the house's tile; here: no sprouts). */
  clearing?: boolean;
  /** On the house's tile: the clearing's open tiles and its shade tree, in tiles from this tile. */
  ground?: ClearingDraw;
  /** On the plaza: the fire pit, in tiles from this tile's top-left corner (none if built over). */
  fireX?: number;
  fireY?: number;
  /** Under the big Bahay ng Datu (not the plaza tile itself, which draws it). */
  underHouse?: boolean;
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
  /** The anito of the balete shows itself in this tree. */
  spirit: boolean;
  onSpiritKey: (el: Element) => void;
  clearable: boolean;
  hint: string | null;
  /** Clearing progress 0..1 on the tile being cleared. */
  progress: number | null;
  onActivate: (x: number, y: number, el: Element) => void;
  /** Part of a Daan being dragged out (not laid yet). */
  pathPreview?: boolean;
  /** A clearing job here is queued but nobody is on it yet. */
  waiting?: boolean;
  /** Picked for clearing (not confirmed yet). */
  picked?: boolean;
  /** Inside a Kuta's defense radius (shown while placing or looking at a Kuta, and during a raid warning). */
  guard?: boolean;
  /** A landing point on the shore: covered by a Kuta, covered by the Kuta being placed, or open. */
  shore?: "covered" | "new" | "open";
  shoreText?: string;
  /** A bridge deck on this tile, and a planned one (placing a Tulay). */
  deck?: BridgeTile | null;
  deckPreview?: BridgeTile | null;
  /** Placing a Tulay over this river tile can't work. */
  cantCross?: boolean;
  /** A warning over the tile (placing here would block a doorway). */
  warn?: string | null;
  /** Land by the sea: drawn as sandy beach. */
  beach?: boolean;
}) {
  const { x, y, tile, plaza, datuLevel, houseStyle, houseAt, houseSize, fireX, fireY, underHouse, clearing, ground, building, fresh, lifted, target, ghost, glow, spirit, onSpiritKey, clearable, hint, progress, onActivate, pathPreview, waiting, picked, guard, deck, deckPreview, cantCross, beach, warn, shore, shoreText } = props;
  const h = hash(x, y);
  const valid = typeof target === "number";
  const paddy = building?.def.produces?.rice;

  return (
    <div
      data-tile={`${x},${y}`}
      // The plaza draws over its neighbors: the Bahay ng Datu is bigger than its tile.
      className={`absolute flex items-center justify-center ${GROUND[tile]} ${target === "blocked" ? "brightness-75" : ""} ${plaza ? "z-[1]" : ""}`}
      style={{ left: `calc(${x} * var(--tile))`, top: `calc(${y} * var(--tile))`, width: "var(--tile)", height: "var(--tile)" }}
    >
      {beach && tile !== "daan" && <div aria-hidden className="beach-tile pointer-events-none absolute inset-0" />}
      {deck && <Deck deck={deck} />}
      {deckPreview && <Deck deck={deckPreview} preview />}
      {cantCross && <Label text="Can't cross here" warn />}
      {warn && <Label text={warn} warn />}
      {pathPreview && <div aria-hidden className="daan-tile pointer-events-none absolute inset-0 opacity-70" />}
      {tile === "forest" && progress === null && (
        <span aria-hidden className="pointer-events-none text-[0.95em] leading-none">
          {h < 70 && !beach ? "🌳" : "🌴"}
        </span>
      )}
      {guard && <div aria-hidden className="pointer-events-none absolute inset-0 bg-sky-200/15 shadow-[inset_0_0_10px_rgb(186_230_253_/_0.45)]" />}
      {shore && (
        <div
          role="img"
          aria-label={shoreText}
          title={shoreText}
          className={`pointer-events-none absolute inset-[6%] z-[2] flex items-center justify-center rounded-full border-[0.06em] border-dashed ${
            shore === "open" ? "border-red-600 bg-red-500/30" : shore === "new" ? "border-lime-300 bg-lime-400/35 motion-safe:animate-pulse" : "border-emerald-700 bg-emerald-500/30"
          }`}
        >
          <span aria-hidden className="text-[0.4em] leading-none">{shore === "open" ? "⚠️" : "🛡️"}</span>
        </div>
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
      {tile === "cleared" && !building && !plaza && !underHouse && !clearing && h < 14 && (
        <span aria-hidden className="pointer-events-none text-[0.4em] leading-none opacity-60">
          🌱
        </span>
      )}
      {plaza && ground && ground.tiles.length > 0 && <Clearing ground={ground} />}
      {plaza && <DatuHouse level={datuLevel ?? 1} style={houseStyle ?? "lowland"} at={houseAt ?? 0.5} size={houseSize ?? 1.16} fire={fireX !== undefined && fireY !== undefined ? { x: fireX, y: fireY } : null} />}
      {clearable && progress === null && (
        <div aria-hidden className="pointer-events-none absolute inset-[4%] rounded-md border border-dashed border-lime-200/40" />
      )}
      {progress !== null && <ClearingProgress progress={progress} waiting={!!waiting} />}
      {picked && progress === null && (
        <div aria-hidden className="pointer-events-none absolute inset-[4%] flex items-center justify-center rounded-md border-2 border-dashed border-amber-300 bg-amber-300/25">
          <span className="text-[0.45em] leading-none opacity-90">🪓</span>
        </div>
      )}
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
        <span className="map-chip map-chip-good pointer-events-none absolute top-0 right-0.5 text-[0.24em]">
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

/** Used for a stray bridge tile with no building (shouldn't happen): drawn across. */
const FALLBACK_DECK: BridgeTile = { dir: "h", start: false, end: false };

/**
 * One tile of a bridge deck. Each piece runs the full length of its tile (a hair over, so
 * neighbours meet with no seam or water between), with posts where the bridge meets a bank.
 */
function Deck({ deck, preview = false }: { deck: BridgeTile; preview?: boolean }) {
  const h = deck.dir === "h";
  const post = "absolute size-[18%] rounded-[2px] bg-amber-950 shadow";
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute ${h ? "bridge-tile inset-y-[14%] -inset-x-px" : "bridge-tile-v inset-x-[14%] -inset-y-px"} ${preview ? "opacity-70 ring-2 ring-amber-300" : ""}`}
    >
      {deck.start && (
        <>
          <span className={`${post} ${h ? "-top-[6%] left-0" : "top-0 -left-[6%]"}`} />
          <span className={`${post} ${h ? "-bottom-[6%] left-0" : "top-0 -right-[6%]"}`} />
        </>
      )}
      {deck.end && (
        <>
          <span className={`${post} ${h ? "-top-[6%] right-0" : "bottom-0 -left-[6%]"}`} />
          <span className={`${post} ${h ? "-bottom-[6%] right-0" : "bottom-0 -right-[6%]"}`} />
        </>
      )}
    </div>
  );
}

function ClearingProgress({ progress, waiting }: { progress: number; waiting: boolean }) {
  return (
    <>
      <div aria-hidden className={`pointer-events-none absolute inset-[4%] rounded-md border-2 ${waiting ? "border-dashed border-amber-200/70 bg-stone-900/25" : "border-amber-300 bg-amber-900/20"}`} />
      <span aria-hidden className={`pointer-events-none text-[0.6em] leading-none ${waiting ? "opacity-70" : "motion-safe:animate-flicker"}`}>
        {waiting ? "⏳" : "🪓"}
      </span>
      <div
        role="progressbar"
        aria-label={waiting ? "Waiting to be cleared" : "Clearing land"}
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

/** The clearing as drawn from the house's tile: its open tiles and the shade tree (tile units from that tile). */
interface ClearingDraw {
  tiles: Point[];
  tree: Point | null;
}

/**
 * The clearing by the Bahay ng Datu, drawn from the house's tile (which draws over its
 * neighbours): one soft, uneven patch of trodden earth over its open tiles (blurred discs, so no
 * square edges), and a big shade tree at its outer edge. Behind the house and the fire.
 */
function Clearing({ ground }: { ground: ClearingDraw }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 1 1" preserveAspectRatio="none">
        <defs>
          <filter id="clearing-soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.07" />
          </filter>
        </defs>
        <g filter="url(#clearing-soft)" fill="rgb(222 184 120)" opacity="0.72">
          {ground.tiles.map((p, i) => (
            <ellipse key={i} cx={p.x + 0.5 + (((i * 37) % 9) - 4) * 0.015} cy={p.y + 0.5 + (((i * 53) % 9) - 4) * 0.015} rx={0.58} ry={0.54} />
          ))}
        </g>
      </svg>
      {ground.tree && (
        <>
          <span className="absolute size-[0.9em] -translate-x-1/2 -translate-y-1/4 rounded-full bg-green-950/25 blur-[2px]" style={{ left: `${ground.tree.x * 100}%`, top: `${ground.tree.y * 100}%` }} />
          <span title="Shade tree" className="absolute -translate-x-1/2 -translate-y-3/4 text-[1.05em] leading-none" style={{ left: `${ground.tree.x * 100}%`, top: `${ground.tree.y * 100}%` }}>
            🌳
          </span>
        </>
      )}
    </div>
  );
}

/**
 * The house's tile: the Bahay ng Datu, a larger raised house at its center (bigger with each level),
 * with the fire pit out in the clearing in front of it, where the barangay gathers. Tap it for the house.
 */
function DatuHouse({ level, style, at, size: tiles, fire }: { level: number; style: HouseStyle; at: number; size: number; fire: Point | null }) {
  // Bigger with each level, centred on its footprint (the big house spans more than this tile);
  // its ground line sits on the footprint's front edge, this tile's bottom.
  const size = tiles * 100;
  return (
    <div title={`Bahay ng Datu (level ${level}) and the fire in its clearing`} className="pointer-events-none absolute inset-0">
      <img
        src={datuHouseUrl(level, style)}
        alt=""
        draggable={false}
        className="absolute max-w-none -translate-x-1/2 drop-shadow-[0_2px_1px_rgb(0_0_0_/_0.35)]"
        style={{ left: `${at * 100}%`, width: `${size}%`, height: `${size}%`, bottom: "-4%" }}
      />
      {/* The level, on the ground below the house (never over it). */}
      {level > 1 && (
        <span aria-hidden style={{ left: `${at * 100}%` }} className="absolute bottom-[-24%] -translate-x-1/2 rounded-full border-[0.03em] border-amber-900 bg-amber-300 px-[0.2em] text-[0.2em] leading-tight font-bold text-amber-950 shadow">
          Lv {level}
        </span>
      )}
      {fire && (
        <span
          aria-hidden
          className="absolute flex size-[0.42em] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[0.05em] border-dotted border-stone-500 bg-amber-200/80 shadow-inner"
          style={{ left: `${fire.x * 100}%`, top: `${fire.y * 100}%` }}
        >
          <span className="text-[0.26em] leading-none">🔥</span>
        </span>
      )}
    </div>
  );
}

function Label({ text, good, warn }: { text: string; good?: boolean; warn?: boolean }) {
  return (
    <span
      role="status"
      className={`map-chip pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 ${warn ? "map-chip-warn" : good ? "map-chip-good" : ""}`}
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
  /** The Connected bonus this tile would get. */
  road: number;
  /** Workers couldn't walk here. */
  noPath: boolean;
  /** For a Kuta: landing points within its defense radius, and the line saying so. */
  bank: number;
  shore: string;
}

const totalBonus = (b: { adjacency: number; grove: number; road: number }) => b.adjacency + b.grove + b.road;

/** A building as it stands on the map: its custom art, its icon, or nothing (a Tulay). */
function ArtOrIcon({ def }: { def: BuildingDef }) {
  const art = buildingArtUrl(def.id);
  if (art) return <img src={art} alt="" draggable={false} className="inline-block size-[1.05em] align-bottom" />;
  return <>{mapIcon(def)}</>;
}

function Ghost({ info }: { info: GhostInfo }) {
  const { def, adjacency, grove, groveName, road, noPath, bank, shore } = info;
  if (def.defense) {
    return (
      <>
        <span aria-hidden className="pointer-events-none leading-none opacity-60 select-none">
          <ArtOrIcon def={def} />
        </span>
        <Label text={shore} good={bank > 0} />
      </>
    );
  }
  if (noPath) {
    return (
      <>
        <span aria-hidden className="pointer-events-none leading-none opacity-60 select-none">
          <ArtOrIcon def={def} />
        </span>
        <Label text="🚫 No path: workers can't walk here" warn />
      </>
    );
  }
  const base = def.bridge ? "Bridge across to the far bank" : bonusPreviewText(def, adjacency, { name: groveName, bonus: grove });
  const text = road > 0 ? `${base} · 🛤️ Connected +${Math.round(road * 100)}%` : base;
  return (
    <>
      {mapIcon(def) && (
        <span aria-hidden className="pointer-events-none leading-none opacity-60 select-none">
          <ArtOrIcon def={def} />
        </span>
      )}
      <Label text={text} good={adjacency + grove + road > 0 || !!def.bridge} />
    </>
  );
}

/**
 * The anito of the balete, present in its tree: a soft glow in the crown, a faint tall shape
 * and a few rustling leaves. Never a giant or a cigar (content/lore/anito-ng-balete.json).
 */
function RestingSpirit({ onKey }: { onKey: (el: Element) => void }) {
  return (
    <span
      data-spirit
      role="button"
      tabIndex={0}
      aria-label="The anito of the balete is near. Tap for its story."
      title="The anito of the balete is near"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onKey(e.currentTarget);
        }
      }}
      className="absolute inset-x-0 top-0 z-10 flex h-[65%] cursor-help items-start justify-center pt-[12%]"
    >
      <span aria-hidden className="absolute top-[8%] left-1/2 size-[70%] -translate-x-1/2 rounded-full bg-amber-100/45 blur-[3px] motion-safe:animate-pulse" />
      <span aria-hidden className="absolute top-[18%] left-1/2 h-[70%] w-[22%] -translate-x-1/2 rounded-t-full bg-linear-to-b from-amber-50/55 to-transparent blur-[1px] motion-safe:animate-peek" />
      <span aria-hidden className="absolute top-[4%] right-[10%] text-[0.3em] leading-none opacity-0 motion-safe:animate-smoke motion-reduce:opacity-70">
        🍃
      </span>
      <span aria-hidden className="absolute top-[14%] left-[8%] text-[0.26em] leading-none opacity-0 motion-safe:animate-smoke motion-reduce:opacity-60 [animation-delay:1.3s]">
        🍃
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
  const { def, bonus, damaged, burning, repairText, connected, noPath, paused, lent, burialLook, level, inside } = info;
  // Decided once, at mount: only buildings that were just built bounce in.
  const [bounce] = useState(fresh);
  const label = burning
    ? `${def.name}, on fire! Tap to put it out`
    : damaged
      ? `${def.name}, damaged. Tap to repair for ${repairText}`
      : paused
        ? `${def.name}, paused. Tap to resume, move or demolish`
        : noPath
        ? `${def.name}: no path. Workers can't walk here. Tap to move or demolish`
        : bonus > 0
          ? `${def.name}, +${Math.round(bonus * 100)}% bonus${connected ? ", connected by Daan" : ""}. Tap to move or demolish`
          : `${def.name}${level > 1 ? ` (level ${level})` : ""}. Tap to move or demolish`;
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
          damaged ? "opacity-60 grayscale" : paused ? "opacity-70 saturate-50" : ""
        } ${lifted ? "opacity-40" : ""} cursor-pointer`}
      >
        {/* A bridge is drawn as its deck; the button over it is just the tap target. */}
        {def.bridge ? (
          <span className="inline-block size-[0.9em]" />
        ) : buildingArtUrl(def.id) ? (
          <img src={buildingArtUrl(def.id)!} alt="" draggable={false} className="inline-block size-[1.05em] align-bottom" />
        ) : def.burial && burialLook === "longon" ? (
          "⚰️"
        ) : (
          def.icon
        )}
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
      {paused && !damaged && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0.5 rounded-full bg-stone-800/85 px-0.5 text-[0.3em] leading-tight text-white shadow"
        >
          ⏸
        </span>
      )}
      {lent > 0 && !paused && !damaged && (
        <span
          aria-hidden
          title={`${lent} lent to clearing`}
          className="pointer-events-none absolute top-0 left-0.5 rounded-full bg-amber-300 px-0.5 text-[0.26em] leading-tight font-semibold text-amber-950 shadow"
        >
          🪓{lent}
        </span>
      )}
      {noPath && !damaged && (
        <span
          aria-hidden
          className="map-chip map-chip-warn pointer-events-none absolute -top-[0.15em] left-1/2 -translate-x-1/2 text-[0.26em]"
        >
          🚫 No path
        </span>
      )}
      {connected && !damaged && !noPath && (
        <span aria-hidden className="pointer-events-none absolute bottom-0 left-0.5 text-[0.28em] leading-none">
          🛤️
        </span>
      )}
      {bonus > 0 && !damaged && (
        <span aria-hidden className="pointer-events-none absolute top-0 right-0.5 text-[0.3em] leading-none">
          ✨
        </span>
      )}
      {/* A healer's hut: how many sick rest inside (tap the hut for their names). */}
      {inside > 0 && !damaged && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 right-0 flex items-center gap-[0.05em] rounded-full border-[0.03em] border-emerald-950/40 bg-emerald-50 px-[0.18em] text-[0.3em] leading-tight font-bold text-emerald-900 shadow-sm"
        >
          🌿{inside}
        </span>
      )}
      {/* A raised building's level, on the ground below it (like the Bahay ng Datu's). */}
      {level > 1 && (
        <span aria-hidden className="pointer-events-none absolute bottom-[-6%] left-1/2 -translate-x-1/2 rounded-full border-[0.03em] border-amber-900 bg-amber-300 px-[0.2em] text-[0.22em] leading-tight font-bold whitespace-nowrap text-amber-950 shadow">
          Lv {level}
        </span>
      )}
    </>
  );
}

/**
 * Things the spirits and the babaylan put on the map: saplings growing on replanted tiles, a
 * balete spirit's prank on a Woodcutter Camp, the babaylan's ritual at the Dambana, and the Sarimanok
 * flying across (tap it).
 */
function SpiritOverlays(props: {
  state: GameState;
  content: Content;
  cam: Camera;
  o: Point;
  ritual: { x: number; y: number; icon: string } | null;
  onSarimanok?: () => void;
  reducedMotion: boolean;
}) {
  const { state, content, cam, o, ritual, onSarimanok, reducedMotion } = props;
  const T = cam.tile;
  const at = (x: number, y: number) => ({ left: o.x + x * T, top: o.y + y * T });
  const bird = state.sarimanok ? sarimanokAt(state.sarimanok, state.time) : null;
  const camps = state.buildings.filter((b) => isPranked(state, b.x, b.y));
  // A raid is coming: a lookout stands on each Kuta's raised platform.
  const lookouts = state.region?.incomingRaid ? state.buildings.filter((b) => !b.damaged && content.buildings.find((d) => d.id === b.type)?.defense) : [];
  return (
    <>
      {lookouts.map((b) => (
        <span
          key={`l${b.x},${b.y}`}
          aria-hidden
          title="A lookout watches for the raiders"
          className="pointer-events-none absolute z-[3]"
          style={{ ...at(b.x + 0.66, b.y - 0.06), width: T * 0.2, height: T * 0.26 }}
        >
          <svg viewBox="0 0 10 13" className="h-full w-full drop-shadow-[0_1px_1px_rgb(0_0_0_/_0.5)]">
            <circle cx="5" cy="2.6" r="1.8" fill="#8d5524" />
            <rect x="3.1" y="0.6" width="3.8" height="1" fill="#b91c1c" />
            <path d="M3 5 H7 L7.4 12 H2.6 Z" fill="#7f1d1d" />
            <line x1="8.6" y1="0.4" x2="8.6" y2="12.6" stroke="#6b4a1c" strokeWidth="0.7" />
          </svg>
        </span>
      ))}
      {state.replanting.map((j) => (
        <span
          key={`r${j.x},${j.y}`}
          aria-hidden
          className="pointer-events-none absolute flex flex-col items-center justify-center"
          style={{ ...at(j.x, j.y), width: T, height: T, fontSize: T * 0.45 }}
        >
          <span className="leading-none">🌱</span>
          <span className="mt-0.5 h-1 w-3/5 overflow-hidden rounded-full bg-black/30">
            <span className="block h-full bg-lime-400" style={{ width: `${Math.round((100 * j.progress) / j.seconds)}%` }} />
          </span>
        </span>
      ))}
      {camps.map((b) => (
        <span
          key={`p${b.x},${b.y}`}
          aria-hidden
          title="The anito of the balete hid the tools"
          className="pointer-events-none absolute -translate-y-1/3 rounded-full bg-stone-900/75 px-1 text-center leading-tight motion-safe:animate-bounce"
          style={{ ...at(b.x + 0.55, b.y - 0.1), fontSize: T * 0.3 }}
        >
          🌲❓
        </span>
      ))}
      {ritual && (
        <span
          aria-hidden
          className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center"
          style={{ left: o.x + (ritual.x + 0.5) * T, top: o.y + (ritual.y + 0.2) * T, fontSize: T * 0.5 }}
        >
          <span className="leading-none motion-safe:animate-ping">✨</span>
          <span className="leading-none motion-safe:animate-bounce">{ritual.icon}</span>
          <span className="leading-none">🙌</span>
        </span>
      )}
      {ritual && (
        // A soft glow round the Dambana and smoke rising from its offerings while the babaylan leads the rite.
        <span aria-hidden className="pointer-events-none absolute z-[5]" style={{ left: o.x + ritual.x * T, top: o.y + ritual.y * T, width: T, height: T }}>
          <span
            className="absolute rounded-full motion-safe:animate-pulse"
            style={{ inset: -T * 0.45, background: "radial-gradient(circle, rgb(253 224 71 / 0.55) 0%, rgb(251 191 36 / 0.25) 45%, transparent 70%)" }}
          />
          {[0, 0.9, 1.7].map((delay, i) => (
            <span
              key={i}
              className="absolute rounded-full bg-stone-200/70 motion-safe:animate-smoke"
              style={{ left: T * (0.4 + i * 0.08), top: T * 0.15, width: T * 0.22, height: T * 0.22, animationDelay: `${delay}s`, filter: "blur(1px)" }}
            />
          ))}
        </span>
      )}
      {bird && content.visitor && (
        <button
          type="button"
          data-map-tap
          aria-label={`${content.visitor.name.en}: tap for a gift`}
          onClick={onSarimanok}
          className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
          style={{
            ...at(bird.x, bird.y),
            width: Math.max(44, T * 1.2),
            height: Math.max(44, T * 1.2),
            fontSize: Math.max(26, T * 0.8),
            transition: reducedMotion ? undefined : "left 0.15s linear, top 0.15s linear",
          }}
        >
          <span className="drop-shadow-[0_0_8px_rgba(250,204,21,0.9)] motion-safe:animate-bounce">🦚</span>
        </button>
      )}
    </>
  );
}
