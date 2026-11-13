// Villagers drawn as small sprites on a canvas over the map, animated with
// requestAnimationFrame. Targets are derived from GameState every frame (see villagers.ts);
// sprite positions are display-only and never written back to the game.
import { useEffect, useRef, useState } from "react";
import type { Content } from "../engine/content";
import { isHungry } from "../engine/events";
import { overcrowded, type GameState } from "../engine/game";
import { layOutSpan, tileAt, type BridgeTile, type Point } from "../engine/map";
import { origin, type Camera, type View } from "./camera";
import {
  dayPhase,
  destination,
  edgeTile,
  exitPoint,
  isNight,
  MAX_SPRITES,
  newWalker,
  planVillagers,
  presentVillagers,
  SPEED,
  stepWalker,
  type Role,
  type VillagerPlan,
  type Walker,
} from "./villagers";
import {
  along,
  boatArriving,
  boatLeaving,
  fromTop,
  LEAVE_SECONDS,
  raiderCount,
  LANDING_SHARE,
  riverPath,
  bandAt,
  BOAT_RETURN_MS,
  CLASH_MS,
  nearestIndex,
  riverLine,
  waitIndex,
  lootTarget,
  lootWalk,
  sailToLanding,
} from "./visitors";
import { raidLanding } from "../engine/border";

/** A battle at the Kuta being shown right now (see App): who won, and when it ends (ms). */
export interface Clash {
  win: boolean;
  until: number;
}

/** The raid the layer is showing, remembered after the engine has resolved it. */
interface RaidMemory {
  from: string;
  top: boolean;
  /** Where they landed, where the battle is. */
  landing: Point;
  count: number;
  /** The karakoa's way in along the river. */
  sail: Point[];
  /** Winners' walk to their loot (A*), once worked out. */
  loot: Point[] | null;
  /** performance.now() when it struck, when the clash ended, and whether the barangay won. */
  struckAt?: number;
  retreatAt?: number;
  win?: boolean;
}

/** Raiders' pace walking to their loot (tiles per second), the time they spend taking it, and how long fleeing takes. */
const LOOT_WALK_SPEED = 2.5;
const LOOT_PAUSE = 1.2;
const FLEE_SECONDS = 2.5;

/** A band of raiders around a point. */
const spread = (p: Point, count: number): Point[] =>
  Array.from({ length: count }, (_, i) => ({ x: p.x + ((i % 3) - 1) * 0.3, y: p.y + (Math.floor(i / 3) - 0.5) * 0.3 }));

interface Sprite {
  p: Point;
  moving: boolean;
  /** Walk cycle, advanced while moving. */
  stride: number;
}

/** A villager on screen: where they are and the route they're walking (display only). */
interface Villager extends Sprite {
  walker: Walker;
}

interface Leaver extends Villager {
  id: number;
  to: Point;
}

const FRAME_MS = 1000 / 30 - 2;
/** The canvas grows and shrinks in steps of this many px. */
const GRID = 128;
const SKIN = ["#8d5524", "#a0673a", "#7a4a2a", "#b07a4a", "#94603a"];
const CLOTH = ["#1e3a8a", "#7f1d1d", "#a16207", "#e7e5e4", "#3f6212", "#7c2d12", "#164e63"];

const REDUCED = "(prefers-reduced-motion: reduce)";

/** Whether the player asked for less motion; follows changes to the setting. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(REDUCED).matches);
  useEffect(() => {
    const query = window.matchMedia?.(REDUCED);
    if (!query) return;
    const on = () => setReduced(query.matches);
    query.addEventListener("change", on);
    return () => query.removeEventListener("change", on);
  }, []);
  return reduced;
}

type Look = Role | "leaving" | "raider" | "looter";

function drawPerson(g: CanvasRenderingContext2D, x: number, y: number, tile: number, id: number, role: Look, sprite: Sprite, t: number) {
  const s = Math.max(7, tile * 0.32);
  const swing = sprite.moving ? Math.sin(sprite.stride) * s * 0.12 : 0;
  // Workers busy at their post bob a little.
  const bob = !sprite.moving && role === "work" ? Math.abs(Math.sin(t * 5 + id)) * s * 0.05 : 0;
  const sick = role === "sick";
  g.globalAlpha = sick ? 0.85 : 1;

  g.fillStyle = "rgb(0 0 0 / 0.25)";
  g.beginPath();
  g.ellipse(x, y, s * 0.2, s * 0.07, 0, 0, Math.PI * 2);
  g.fill();

  g.strokeStyle = "#3b2414";
  g.lineWidth = Math.max(1, s * 0.08);
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(x - s * 0.05, y - s * 0.3);
  g.lineTo(x - s * 0.06 + swing, y);
  g.moveTo(x + s * 0.05, y - s * 0.3);
  g.lineTo(x + s * 0.06 - swing, y);
  g.stroke();

  const top = y - s * 0.72 - bob;
  const raider = role === "raider" || role === "looter";
  g.fillStyle = sick ? "#7c9a5a" : raider ? "#3b0a0a" : CLOTH[id % CLOTH.length];
  g.beginPath();
  g.roundRect(x - s * 0.17, top, s * 0.34, s * 0.44, s * 0.08);
  g.fill();

  g.fillStyle = sick ? "#9cae7a" : SKIN[(id * 3) % SKIN.length];
  g.beginPath();
  g.arc(x, top - s * 0.12, s * 0.13, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#1c1410";
  g.beginPath();
  g.arc(x, top - s * 0.15, s * 0.13, Math.PI, Math.PI * 2);
  g.fill();

  if (role === "warrior") {
    // A red putong (head cloth) and a spear.
    g.fillStyle = "#b91c1c";
    g.fillRect(x - s * 0.14, top - s * 0.2, s * 0.28, s * 0.06);
    g.strokeStyle = "#6b4a1c";
    g.lineWidth = Math.max(1, s * 0.05);
    g.beginPath();
    g.moveTo(x + s * 0.24, y - s * 0.05);
    g.lineTo(x + s * 0.24, top - s * 0.4);
    g.stroke();
    g.fillStyle = "#d6d3d1";
    g.beginPath();
    g.moveTo(x + s * 0.24, top - s * 0.55);
    g.lineTo(x + s * 0.3, top - s * 0.38);
    g.lineTo(x + s * 0.18, top - s * 0.38);
    g.fill();
  } else if (raider) {
    // A red head cloth, a long shield and a blade.
    g.fillStyle = "#dc2626";
    g.fillRect(x - s * 0.14, top - s * 0.2, s * 0.28, s * 0.06);
    g.fillStyle = "#78350f";
    g.beginPath();
    g.ellipse(x - s * 0.24, top + s * 0.2, s * 0.08, s * 0.24, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#e7e5e4";
    g.lineWidth = Math.max(1, s * 0.05);
    g.beginPath();
    g.moveTo(x + s * 0.2, top + s * 0.25);
    g.lineTo(x + s * 0.32, top - s * 0.15);
    g.stroke();
    if (role === "looter") {
      g.fillStyle = "#a16207";
      g.beginPath();
      g.arc(x + s * 0.05, top + s * 0.05, s * 0.14, 0, Math.PI * 2);
      g.fill();
    }
  } else if (role === "leaving") {
    // A bundle on the back.
    g.fillStyle = "#a16207";
    g.beginPath();
    g.arc(x - s * 0.2, top + s * 0.1, s * 0.13, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

/** A boat seen from above, pointing along `heading`: a bangka with outriggers, or a karakoa. */
function drawBoat(g: CanvasRenderingContext2D, x: number, y: number, tile: number, heading: number, kind: "bangka" | "karakoa", t: number) {
  const L = tile * (kind === "karakoa" ? 1.7 : 0.95);
  const W = tile * (kind === "karakoa" ? 0.34 : 0.22);
  g.save();
  g.translate(x, y);
  g.rotate(heading);
  // Outrigger floats on both sides.
  g.strokeStyle = "#5b3a1a";
  g.lineWidth = Math.max(1, tile * 0.04);
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(-L * 0.35, side * W * 1.6);
    g.lineTo(L * 0.35, side * W * 1.6);
    g.moveTo(-L * 0.12, 0);
    g.lineTo(-L * 0.12, side * W * 1.6);
    g.moveTo(L * 0.12, 0);
    g.lineTo(L * 0.12, side * W * 1.6);
    g.stroke();
  }
  // The hull, pointed at both ends.
  g.fillStyle = kind === "karakoa" ? "#7c2d12" : "#6b4423";
  g.beginPath();
  g.moveTo(-L / 2, 0);
  g.quadraticCurveTo(0, -W, L / 2, 0);
  g.quadraticCurveTo(0, W, -L / 2, 0);
  g.fill();
  if (kind === "karakoa") {
    // Painted bands, a row of paddlers and a banner at the stern.
    g.strokeStyle = "#fbbf24";
    g.lineWidth = Math.max(1, tile * 0.03);
    g.beginPath();
    g.moveTo(-L * 0.4, 0);
    g.lineTo(L * 0.4, 0);
    g.stroke();
    g.fillStyle = "#1c1410";
    for (let i = -3; i <= 3; i++) {
      g.beginPath();
      g.arc(i * L * 0.1, Math.sin(t * 6 + i) * W * 0.15, W * 0.22, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#dc2626";
    g.fillRect(-L * 0.5, -W * 1.4, W * 0.9, W * 0.6);
  } else {
    // A small sail and one paddler.
    g.fillStyle = "#f5e6c8";
    g.beginPath();
    g.moveTo(L * 0.05, 0);
    g.lineTo(-L * 0.25, -W * 1.5);
    g.lineTo(-L * 0.25, W * 0.2);
    g.fill();
    g.fillStyle = "#1c1410";
    g.beginPath();
    g.arc(L * 0.25, 0, W * 0.3, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/**
 * A Tulay's deck, drawn over a boat passing underneath. Matches the map's bridge-tile look:
 * bamboo planks between two dark rails.
 */
function drawDeck(g: CanvasRenderingContext2D, x: number, y: number, tile: number, dir: "h" | "v") {
  const across = tile * 0.72;
  const off = tile * 0.14;
  // A hair over the tile's length so neighbouring pieces meet without a seam.
  const [dx, dy, w, h] = dir === "h" ? [x - 0.5, y + off, tile + 1, across] : [x + off, y - 0.5, across, tile + 1];
  g.fillStyle = "rgb(0 0 0 / 0.3)";
  g.fillRect(dx + (dir === "v" ? 2 : 0), dy + (dir === "h" ? 2 : 0), w, h);
  g.fillStyle = "#d8bb6c";
  g.fillRect(dx, dy, w, h);
  g.fillStyle = "#6b4a1c";
  if (dir === "h") {
    g.fillRect(dx, dy, w, h * 0.1);
    g.fillRect(dx, dy + h * 0.9, w, h * 0.1);
  } else {
    g.fillRect(dx, dy, w * 0.1, h);
    g.fillRect(dx + w * 0.9, dy, w * 0.1, h);
  }
  g.fillStyle = "rgb(90 60 20 / 0.45)";
  for (let i = 0; i < 5; i++) {
    if (dir === "h") g.fillRect(x + (tile * i) / 4.5, dy, Math.max(1, tile * 0.03), h);
    else g.fillRect(dx, y + (tile * i) / 4.5, w, Math.max(1, tile * 0.03));
  }
}

/** Flashes of blades where the two sides meet. */
function drawSparks(g: CanvasRenderingContext2D, x: number, y: number, tile: number, t: number) {
  const beat = Math.floor(t * 6);
  g.strokeStyle = "#fde047";
  g.lineWidth = Math.max(1, tile * 0.04);
  for (let i = 0; i < 3; i++) {
    const a = ((beat * 7 + i * 13) % 17) / 17;
    const sx = x + (a - 0.5) * tile * 0.9;
    const sy = y - tile * 0.25 + (((beat * 5 + i * 3) % 7) / 7 - 0.5) * tile * 0.5;
    const r = tile * 0.09;
    g.beginPath();
    g.moveTo(sx - r, sy);
    g.lineTo(sx + r, sy);
    g.moveTo(sx, sy - r);
    g.lineTo(sx, sy + r);
    g.stroke();
  }
}

/**
 * The villager canvas. Pointer events pass straight through to the map. With reduced motion,
 * villagers stand still at their spots and the canvas only redraws when the game changes.
 */
export function VillagerLayer(props: { state: GameState; content: Content; cam: Camera; view: View; reducedMotion: boolean; clash?: Clash | null }) {
  const { state, content, cam, view, reducedMotion, clash = null } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ state, cam, view, clash });
  latest.current = { state, cam, view, clash };
  // Trade boat and raid shown last frame, for boats casting off and raiders going home.
  const boat = useRef<{
    from: string;
    top: boolean;
    leftAt?: number;
    p?: Point;
    heading?: number;
    /** Waiting offshore during a raid: where it set out from and when, then when it turned back. */
    hold?: { from: Point; at: number; backFrom?: Point; backAt?: number };
  } | null>(null);
  // When the last raid ended (its warning), so a waiting boat comes back after the clash.
  const raidEnded = useRef<number | null>(null);
  const raid = useRef<RaidMemory | null>(null);
  const river = useRef<{ map: GameState["map"] | null; path: Point[] }>({ map: null, path: [] });
  const sprites = useRef(new Map<number, Villager>());
  const leavers = useRef<Leaver[]>([]);
  const before = useRef<GameState | null>(null);
  const started = useRef(false);
  const planned = useRef<{ state: GameState | null; rally: string; plans: VillagerPlan[] }>({ state: null, rally: "", plans: [] });

  // Families leaving (hunger, or a demolished house) walk off the map with their bundles.
  useEffect(() => {
    const prev = before.current;
    before.current = state;
    if (!prev) return;
    const was = presentVillagers(prev);
    const now = presentVillagers(state);
    if (now >= was || reducedMotion) return;
    const goingAway = isHungry(prev) || state.hunger > 0 || overcrowded(prev, content) > 0;
    for (let k = now; k < was; k++) {
      const id = Math.min(k, MAX_SPRITES - 1);
      const from = sprites.current.get(id);
      if (k < MAX_SPRITES) sprites.current.delete(id);
      if (!goingAway || !from || leavers.current.length > 12) continue;
      // Off the map by the nearest walkable edge, never across the river.
      const edge = edgeTile(state.map, from.p);
      const off = exitPoint({ x: edge.x + 0.5, y: edge.y + 0.5 }, state.map);
      leavers.current.push({ id: id + 1000 + leavers.current.length, p: { ...from.p }, moving: true, stride: 0, to: off, walker: { ...newWalker(from.p), route: [] } });
    }
  }, [state.villagers, state.warriors, reducedMotion]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const g = el.getContext("2d");
    if (!g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // What the canvas showed last time, to skip redrawing a scene where nothing moves.
    let shown = "";
    // The canvas only covers the area the villagers are in (snapped to a grid so it rarely
    // changes size), so each frame the browser uploads a small patch, not the whole screen.
    let area = { x0: 0, y0: 0, x1: 0, y1: 0 };

    const draw = (dt: number, t: number) => {
      const { state: s, cam: c, view: v, clash: fight } = latest.current;
      const o = origin(c, v);
      const T = c.tile;
      // Plans only change when the game does (ten times a second), not every frame.
      // Warriors go to the landing while a raid is coming and while the battle there plays out.
      const rally = s.region?.incomingRaid ? raidLanding(s, content) : raid.current && raid.current.retreatAt === undefined ? raid.current.landing : null;
      const rallyKey = rally ? `${rally.x},${rally.y}` : "";
      if (planned.current.state !== s || planned.current.rally !== rallyKey) planned.current = { state: s, rally: rallyKey, plans: planVillagers(s, content, undefined, rally) };
      const plans = planned.current.plans;
      // The tint only cycles with motion on, so with reduced motion it is always day.
      const night = !reducedMotion && isNight(dayPhase(Date.now()));
      const hungry = isHungry(s);
      const roadSpeed = content.rules.roads.walkSpeedPercent / 100;
      const visible = (p: Point) => {
        const x = o.x + p.x * T;
        const y = o.y + p.y * T;
        return x > -T && y > -T && x < v.w + T && y < v.h + T ? { x, y } : null;
      };

      // Layers, bottom to top: boats (0), bridge decks over them (1), everything on land (2).
      const drawn: { x: number; y: number; r?: number; layer?: number; f: () => void }[] = [];
      let animating = leavers.current.length > 0;

      // ---- Visitors: trade boats and raiders, from the region's offer and raid ----
      if (river.current.map !== s.map) river.current = { map: s.map, path: riverPath(s.map) };
      const path = river.current.path;
      const now = performance.now();
      const plaza = s.map.plaza;
      if (path.length > 2) {
        const offer = s.region?.offer ?? null;
        const offers = content.rules.diplomacy.offers;
        // Trading pauses during a raid: the bangka waits offshore, out of the raiders' way, until
        // the raid and its clash are over, then comes back.
        if (s.region?.incomingRaid) raidEnded.current = null;
        else if (raid.current && raidEnded.current === null) raidEnded.current = now;
        const held = !!s.region?.incomingRaid || (raidEnded.current !== null && now < raidEnded.current + CLASH_MS);
        if (offer && held && !reducedMotion) {
          const top = fromTop(content, offer.from);
          const b0 = boat.current?.from === offer.from && !boat.current.leftAt ? boat.current : null;
          const start = b0?.p ?? boatArriving(path, plaza, top, 0).p;
          const hold = b0?.hold && !b0.hold.backAt ? b0.hold : { from: start, at: now };
          const out = riverLine(path, hold.from, waitIndex(path, raidLanding(s, content) ?? raid.current?.landing ?? null));
          const at = along(out, Math.min(1, (now - hold.at) / 1000 / LEAVE_SECONDS));
          boat.current = { from: offer.from, top, p: at.p, heading: at.heading, hold };
          animating = true;
        } else if (offer) {
          const top = fromTop(content, offer.from);
          const since = s.time - (offer.expiresAt - offers.expireSeconds);
          const where = boatArriving(path, plaza, top, reducedMotion ? Infinity : since);
          const b0 = boat.current?.from === offer.from && !boat.current.leftAt ? boat.current : null;
          if (b0?.hold && !reducedMotion) {
            // Coming back from waiting offshore.
            b0.hold.backAt ??= now;
            b0.hold.backFrom ??= b0.p ?? where.p;
            const back = [...riverLine(path, b0.hold.backFrom, nearestIndex(path, where.p)), where.p];
            const f = (now - b0.hold.backAt) / BOAT_RETURN_MS;
            const at = along(back, Math.min(1, f));
            boat.current = { ...b0, p: at.p, heading: at.heading, hold: f < 1 ? b0.hold : undefined };
            animating = true;
          } else {
            const prev = b0?.p;
            // Ease toward the target: the game moves ten times a second, the canvas thirty.
            const p = prev && !reducedMotion ? { x: prev.x + (where.p.x - prev.x) * Math.min(1, dt * 8), y: prev.y + (where.p.y - prev.y) * Math.min(1, dt * 8) } : where.p;
            boat.current = { from: offer.from, top, p, heading: where.heading };
            if (!where.docked) animating = true;
          }
        } else if (boat.current && !reducedMotion) {
          boat.current.leftAt ??= now;
          const away = boatLeaving(path, plaza, boat.current.top, (now - boat.current.leftAt) / 1000);
          if (away) {
            boat.current.p = away.p;
            boat.current.heading = away.heading;
            animating = true;
          } else boat.current = null;
        } else boat.current = null;
        const b = boat.current;
        const bp = b?.p && visible(b.p);
        if (b && bp) drawn.push({ x: bp.x, y: bp.y, r: T * 0.7, layer: 0, f: () => drawBoat(g, bp.x, bp.y, T, b.heading ?? Math.PI / 2, "bangka", t) });

        const incoming = s.region?.incomingRaid ?? null;
        const warning = content.rules.diplomacy.aiRaid.warningSeconds;
        let scene: { karakoa: { p: Point; heading: number } | null; raiders: Point[]; look: Look; sparks: Point | null } | null = null;
        const landingNow = incoming ? raidLanding(s, content) : null;
        if (incoming && landingNow) {
          // The warning: the karakoa sails in and beaches beside the landing, and the raiders
          // wait there. The warriors walk out to meet them (see planVillagers' rally).
          const top = fromTop(content, incoming.from);
          const warriors = s.region?.neighbors.find((n) => n.id === incoming.from)?.state.warriors ?? 3;
          raid.current = { from: incoming.from, top, landing: landingNow, count: raiderCount(warriors), sail: sailToLanding(path, landingNow, top), loot: null };
          const progress = reducedMotion ? 1 : Math.min(1, Math.max(0, 1 - (incoming.strikeAt - s.time) / warning));
          const ashore = progress >= LANDING_SHARE;
          scene = { karakoa: along(raid.current.sail, progress / LANDING_SHARE), raiders: ashore ? bandAt(landingNow, raid.current.count) : [], look: "raider", sparks: null };
          animating = !reducedMotion;
        } else if (raid.current && !reducedMotion) {
          const r = raid.current;
          r.struckAt ??= now;
          const beached = along(r.sail, 1);
          const band = bandAt(r.landing, r.count);
          if (fight && now < fight.until) {
            // The clash, at the landing: both sides lunge back and forth.
            r.win = fight.win;
            scene = {
              karakoa: beached,
              raiders: band.map((p, i) => ({ x: p.x + Math.sin(t * 11 + i * 2) * 0.12, y: p.y + Math.cos(t * 9 + i) * 0.06 })),
              look: "raider",
              sparks: { x: r.landing.x + 0.5, y: r.landing.y + 0.3 },
            };
          } else if (!fight && r.retreatAt === undefined && now - r.struckAt < 600) {
            // The report is on its way; hold the line for a moment.
            scene = { karakoa: beached, raiders: band, look: "raider", sparks: null };
          } else {
            r.retreatAt ??= now;
            const since = (now - r.retreatAt) / 1000;
            if (r.win === false) {
              // They won: a short walk in to the fields (or a Kamalig, once there is one), then back to the boat with the loot.
              r.loot ??= lootWalk(s.map, r.landing, lootTarget(s, content, r.landing)) ?? [];
              const walkSeconds = Math.max(1, r.loot.length / LOOT_WALK_SPEED);
              const out = since / walkSeconds;
              const back = (since - walkSeconds - LOOT_PAUSE) / walkSeconds;
              if (r.loot.length > 1 && out < 1) {
                scene = { karakoa: beached, raiders: spread(along(r.loot, out).p, r.count), look: "raider", sparks: null };
              } else if (r.loot.length > 1 && back < 0) {
                scene = { karakoa: beached, raiders: spread(r.loot[r.loot.length - 1], r.count), look: "looter", sparks: null };
              } else if (r.loot.length > 1 && back < 1) {
                scene = { karakoa: beached, raiders: spread(along([...r.loot].reverse(), back).p, r.count), look: "looter", sparks: null };
              } else {
                const leave = (since - (r.loot.length > 1 ? 2 * walkSeconds + LOOT_PAUSE : 0)) / LEAVE_SECONDS;
                if (leave < 1) scene = { karakoa: along([...r.sail].reverse(), leave), raiders: [], look: "raider", sparks: null };
                else raid.current = null;
              }
            } else {
              // Beaten: they run for the boat and row away.
              const run = since / FLEE_SECONDS;
              if (run < 1) {
                const to = beached.p;
                scene = { karakoa: beached, raiders: band.map((p) => ({ x: p.x + (to.x - p.x) * run, y: p.y + (to.y - p.y) * run })), look: "raider", sparks: null };
              } else if (run < 1 + LEAVE_SECONDS / FLEE_SECONDS) {
                scene = { karakoa: along([...r.sail].reverse(), (since - FLEE_SECONDS) / LEAVE_SECONDS), raiders: [], look: "raider", sparks: null };
              } else raid.current = null;
            }
          }
          animating = true;
        } else raid.current = null;
        if (scene) {
          const k = scene.karakoa && visible(scene.karakoa.p);
          if (k && scene.karakoa) {
            const heading = scene.karakoa.heading;
            drawn.push({ x: k.x, y: k.y, r: T * 1.1, layer: 0, f: () => drawBoat(g, k.x, k.y, T, heading, "karakoa", t) });
          }
          scene.raiders.forEach((p, i) => {
            const at = visible(p);
            const look = scene!.look;
            const sprite: Sprite = { p, moving: !reducedMotion && !scene!.sparks, stride: t * 9 + i };
            if (at) drawn.push({ x: at.x, y: at.y, f: () => drawPerson(g, at.x, at.y, T, 2000 + i, look, sprite, t) });
          });
          const sp = scene.sparks && visible(scene.sparks);
          if (sp) drawn.push({ x: sp.x, y: sp.y + T, r: T * 0.8, f: () => drawSparks(g, sp.x, sp.y, T, t) });
        }
      }

      const seen = new Set<number>();
      for (const plan of plans) {
        seen.add(plan.id);
        const to = destination(plan, t, night, s.map.plaza, hungry);
        let sp = sprites.current.get(plan.id);
        if (!sp) {
          // On first draw everyone is already in place; later arrivals walk in from the map's edge.
          const edge = edgeTile(s.map, to);
          const start = started.current && !reducedMotion ? { x: edge.x + 0.5, y: edge.y + 0.5 } : to;
          sp = { p: start, moving: false, stride: plan.id, walker: newWalker(start) };
          sprites.current.set(plan.id, sp);
        }
        if (reducedMotion) {
          sp.p = to;
          sp.moving = false;
        } else {
          // Along the A* route: on land and bridges only, faster on Daan.
          sp.walker = stepWalker({ ...sp.walker, p: sp.p }, to, s.map, SPEED[plan.role], dt, roadSpeed);
          sp.p = sp.walker.p;
          sp.moving = sp.walker.moving;
          if (sp.moving) sp.stride += dt * 9 * (SPEED[plan.role] / SPEED.work);
        }
        // At night, villagers who reached home are indoors.
        if (night && !sp.moving && plan.role !== "warrior") continue;
        const at = visible(sp.p);
        if (!at) continue;
        const sprite = sp;
        // Walking legs, or a worker bobbing at their post.
        if (!reducedMotion && (sp.moving || plan.role === "work")) animating = true;
        drawn.push({ x: at.x, y: at.y, f: () => drawPerson(g, at.x, at.y, T, plan.id, plan.role, sprite, t) });
      }
      for (const id of sprites.current.keys()) if (!seen.has(id)) sprites.current.delete(id);

      leavers.current = leavers.current.filter((l) => {
        // Walk to the edge tile over land, then step off the map.
        const edge = edgeTile(s.map, l.to);
        const atEdge = Math.floor(l.p.x) === edge.x && Math.floor(l.p.y) === edge.y;
        l.walker = stepWalker({ ...l.walker, p: l.p }, atEdge ? l.to : { x: edge.x + 0.5, y: edge.y + 0.5 }, s.map, SPEED.leaving, dt, roadSpeed);
        if (atEdge && !l.walker.route.length && Math.hypot(l.p.x - l.to.x, l.p.y - l.to.y) > 0.01) {
          // Off the map: plain steps (the route planner only knows tiles on the map).
          const d = Math.hypot(l.to.x - l.p.x, l.to.y - l.p.y);
          const m = Math.min(d, SPEED.leaving * dt);
          l.walker = { ...l.walker, p: { x: l.p.x + ((l.to.x - l.p.x) / d) * m, y: l.p.y + ((l.to.y - l.p.y) / d) * m }, moving: d > m };
        }
        const step = { p: l.walker.p, moving: l.walker.moving || Math.hypot(l.walker.p.x - l.to.x, l.walker.p.y - l.to.y) > 0.01 };
        l.p = step.p;
        l.moving = step.moving;
        l.stride += dt * 9;
        const at = visible(l.p);
        if (at) drawn.push({ x: at.x, y: at.y, f: () => drawPerson(g, at.x, at.y, T, l.id, "leaving", l, t) });
        return step.moving;
      });

      started.current = true;
      const scene = `${o.x},${o.y},${T},${v.w},${v.h},${night},${drawn.length}`;
      if (!animating && scene === shown) return;
      shown = animating ? "" : scene;
      const pad = Math.max(7, T * 0.32) * 1.2;
      const box = drawn.reduce(
        (b, d) => {
          const r = d.r ?? pad;
          return { x0: Math.min(b.x0, d.x - r), y0: Math.min(b.y0, d.y - r * 1.4), x1: Math.max(b.x1, d.x + r), y1: Math.max(b.y1, d.y + r) };
        },
        { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
      );
      const inside = box.x0 >= area.x0 && box.y0 >= area.y0 && box.x1 <= area.x1 && box.y1 <= area.y1;
      const tooBig = (area.x1 - area.x0) * (area.y1 - area.y0) > 4 * Math.max(GRID * GRID, (box.x1 - box.x0) * (box.y1 - box.y0));
      if (drawn.length && (!inside || tooBig)) {
        const snap = (n: number, up: boolean) => (up ? Math.ceil(n / GRID) : Math.floor(n / GRID)) * GRID;
        area = {
          x0: Math.max(0, snap(box.x0 - GRID / 2, false)),
          y0: Math.max(0, snap(box.y0 - GRID / 2, false)),
          x1: Math.min(snap(v.w, true), snap(box.x1 + GRID / 2, true)),
          y1: Math.min(snap(v.h, true), snap(box.y1 + GRID / 2, true)),
        };
        el.width = Math.max(1, Math.round((area.x1 - area.x0) * dpr));
        el.height = Math.max(1, Math.round((area.y1 - area.y0) * dpr));
        el.style.transform = `translate(${area.x0}px, ${area.y0}px)`;
        el.style.width = `${area.x1 - area.x0}px`;
        el.style.height = `${area.y1 - area.y0}px`;
      }
      g.setTransform(dpr, 0, 0, dpr, -area.x0 * dpr, -area.y0 * dpr);
      g.clearRect(area.x0, area.y0, area.x1 - area.x0, area.y1 - area.y0);
      // Back to front, so nearer villagers overlap farther ones.
      // A boat passing under a Tulay goes beneath the deck: repaint the deck tiles it overlaps.
      const decks = new Set<string>();
      for (const d of drawn) {
        if (d.layer !== 0) continue;
        const cx = (d.x - o.x) / T;
        const cy = (d.y - o.y) / T;
        for (let y = Math.floor(cy - 1.2); y <= Math.floor(cy + 1.2); y++) {
          for (let x = Math.floor(cx - 1.2); x <= Math.floor(cx + 1.2); x++) if (tileAt(s.map, x, y) === "bridge") decks.add(`${x},${y}`);
        }
      }
      const deckDirs = new Map<string, BridgeTile>();
      if (decks.size > 0) for (const b of s.buildings) if (b.span?.length) layOutSpan(s.map, b.span, deckDirs);
      for (const key of decks) {
        const [x, y] = key.split(",").map(Number);
        drawn.push({ x: o.x + (x + 0.5) * T, y: o.y + (y + 0.5) * T, r: T, layer: 1, f: () => drawDeck(g, o.x + x * T, o.y + y * T, T, deckDirs.get(key)?.dir ?? "h") });
      }
      drawn.sort((a, b) => (a.layer ?? 2) - (b.layer ?? 2) || a.y - b.y);
      for (const d of drawn) d.f();
    };

    if (reducedMotion) {
      draw(0, 0);
      return;
    }
    // About 30 frames a second is plenty for small walkers and halves the work on phones.
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < FRAME_MS) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      draw(dt, now / 1000);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // With reduced motion, redraw whenever the game, camera or view changes.
  }, [content, reducedMotion, reducedMotion ? state : null, reducedMotion ? cam : null, reducedMotion ? view : null, reducedMotion ? clash : null]);

  return <canvas ref={canvas} aria-hidden width={1} height={1} className="pointer-events-none absolute top-0 left-0" />;
}
