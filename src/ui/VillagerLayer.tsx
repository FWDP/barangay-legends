// Villagers drawn as small sprites on a canvas over the map, animated with
// requestAnimationFrame. Targets are derived from GameState every frame (see villagers.ts);
// sprite positions are display-only and never written back to the game.
import { useEffect, useRef, useState } from "react";
import type { Content } from "../engine/content";
import { isHungry } from "../engine/events";
import { overcrowded, type GameState } from "../engine/game";
import type { Point } from "../engine/map";
import { origin, type Camera, type View } from "./camera";
import { dayPhase, destination, exitPoint, isNight, MAX_SPRITES, planVillagers, presentVillagers, SPEED, walk, type Role, type VillagerPlan } from "./villagers";

interface Sprite {
  p: Point;
  moving: boolean;
  /** Walk cycle, advanced while moving. */
  stride: number;
}

interface Leaver extends Sprite {
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

function drawPerson(g: CanvasRenderingContext2D, x: number, y: number, tile: number, id: number, role: Role | "leaving", sprite: Sprite, t: number) {
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
  g.fillStyle = sick ? "#7c9a5a" : CLOTH[id % CLOTH.length];
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
  } else if (role === "leaving") {
    // A bundle on the back.
    g.fillStyle = "#a16207";
    g.beginPath();
    g.arc(x - s * 0.2, top + s * 0.1, s * 0.13, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

/**
 * The villager canvas. Pointer events pass straight through to the map. With reduced motion,
 * villagers stand still at their spots and the canvas only redraws when the game changes.
 */
export function VillagerLayer(props: { state: GameState; content: Content; cam: Camera; view: View; reducedMotion: boolean }) {
  const { state, content, cam, view, reducedMotion } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ state, cam, view });
  latest.current = { state, cam, view };
  const sprites = useRef(new Map<number, Sprite>());
  const leavers = useRef<Leaver[]>([]);
  const before = useRef<GameState | null>(null);
  const started = useRef(false);
  const planned = useRef<{ state: GameState | null; plans: VillagerPlan[] }>({ state: null, plans: [] });

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
      leavers.current.push({ id: id + 1000 + leavers.current.length, p: { ...from.p }, moving: true, stride: 0, to: exitPoint(from.p, state.map) });
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
      const { state: s, cam: c, view: v } = latest.current;
      const o = origin(c, v);
      const T = c.tile;
      // Plans only change when the game does (ten times a second), not every frame.
      if (planned.current.state !== s) planned.current = { state: s, plans: planVillagers(s, content) };
      const plans = planned.current.plans;
      // The tint only cycles with motion on, so with reduced motion it is always day.
      const night = !reducedMotion && isNight(dayPhase(Date.now()));
      const hungry = isHungry(s);
      const visible = (p: Point) => {
        const x = o.x + p.x * T;
        const y = o.y + p.y * T;
        return x > -T && y > -T && x < v.w + T && y < v.h + T ? { x, y } : null;
      };

      const drawn: { x: number; y: number; f: () => void }[] = [];
      let animating = leavers.current.length > 0;
      const seen = new Set<number>();
      for (const plan of plans) {
        seen.add(plan.id);
        const to = destination(plan, t, night, s.map.plaza, hungry);
        let sp = sprites.current.get(plan.id);
        if (!sp) {
          // On first draw everyone is already in place; later arrivals walk in from the edge.
          const start = started.current && !reducedMotion ? exitPoint(to, s.map) : to;
          sp = { p: start, moving: false, stride: plan.id };
          sprites.current.set(plan.id, sp);
        }
        if (reducedMotion) {
          sp.p = to;
          sp.moving = false;
        } else {
          const step = walk(sp.p, to, SPEED[plan.role], dt);
          sp.p = step.p;
          sp.moving = step.moving;
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
        const step = walk(l.p, l.to, SPEED.leaving, dt);
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
        (b, d) => ({ x0: Math.min(b.x0, d.x - pad), y0: Math.min(b.y0, d.y - pad * 1.4), x1: Math.max(b.x1, d.x + pad), y1: Math.max(b.y1, d.y + pad * 0.4) }),
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
      drawn.sort((a, b) => a.y - b.y);
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
  }, [content, reducedMotion, reducedMotion ? state : null, reducedMotion ? cam : null, reducedMotion ? view : null]);

  return <canvas ref={canvas} aria-hidden width={1} height={1} className="pointer-events-none absolute top-0 left-0" />;
}
