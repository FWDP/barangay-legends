// The night over the map: soft pools of warm light (plaza fire, Bahay ng Datu, lived-in houses,
// Kuta torches, the Dambana, resin torches at the docks, and villagers carrying torches), coming on one by one
// at dusk and fading at dawn, with stars (the moon is in the HUD, Moon.tsx, never over the map).
// Display only. With reduced motion there's no flicker or twinkle: the glow is still.
import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { Content } from "../engine/content";
import type { GameState } from "../engine/game";
import type { Point } from "../engine/map";
import { origin, type Camera, type View } from "./camera";
import { barangayLights, darknessAt, LIGHT_LOOK, lightLevel, nightColor } from "./nightLight";

const FRAME_MS = 1000 / 30 - 2;

/** Fixed star positions (0..1 of the view), the same every night. */
/** A well-mixed hash (so the stars don't fall in lines). */
function mix(n: number): number {
  let x = n >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
const STARS = Array.from({ length: 70 }, (_, i) => {
  const h = (k: number) => mix(i * 7 + k * 100003 + 12345);
  return { x: h(1), y: h(2) * 0.55, r: 0.6 + h(3) * 1.1, tw: h(4) * 6.28 };
});

export function NightLayer(props: {
  state: GameState;
  content: Content;
  cam: Camera;
  view: View;
  reducedMotion: boolean;
  /** Villagers carrying torches, in tile coordinates (written by the villager layer). */
  torches?: RefObject<Point[]>;
}) {
  const { state, content, cam, view, reducedMotion, torches } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const lights = useMemo(() => barangayLights(state, content), [state.buildings, state.villagers, state.map, content]);
  // The latest of everything, for the animation loop.
  const shade = useRef<HTMLCanvasElement>(null);
  const live = useRef({ state, cam, view, lights });
  live.current = { state, cam, view, lights };
  const darkness = darknessAt(content, state.time);

  useEffect(() => {
    const c = canvas.current;
    const sh = shade.current;
    if (!c || !sh || darkness <= 0) return;
    const g = c.getContext("2d");
    const n = sh.getContext("2d");
    if (!g || !n) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < FRAME_MS) return;
      last = now;
      const { state: s, cam: k, view: v, lights: ls } = live.current;
      const w = Math.round(v.w * dpr);
      const h = Math.round(v.h * dpr);
      for (const el of [c, sh]) if (el.width !== w || el.height !== h) [el.width, el.height] = [w, h];
      for (const ctx of [g, n]) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, v.w, v.h);
      }
      const d = darknessAt(content, s.time);
      if (d <= 0) return;
      const t = reducedMotion ? 0 : now / 1000;
      const o = origin(k, v);
      const T = k.tile;

      // ---- The night: ONE smooth cool-blue layer over the whole map (multiplied, see the
      // canvas's blend mode), with warm pools of light that bring back the day's colour. Pools
      // only ever restore it, so overlapping lights never blow out and never tint the map. ----
      const night = nightColor(d);
      n.globalCompositeOperation = "source-over";
      n.globalAlpha = 1;
      n.fillStyle = `rgb(${night.r} ${night.g} ${night.b})`;
      n.fillRect(0, 0, v.w, v.h);
      const pool = (p: Point, r: number, a: number) => {
        const x = o.x + p.x * T;
        const y = o.y + p.y * T;
        const R = r * T;
        if (x < -R || y < -R || x > v.w + R || y > v.h + R || a <= 0.01) return;
        const grad = n.createRadialGradient(x, y, 0, x, y, R);
        // A warm white at the centre (multiplied, a gentle warmth), soft falloff to nothing.
        grad.addColorStop(0, `rgb(255 232 196 / ${a})`);
        grad.addColorStop(0.4, `rgb(255 222 176 / ${a * 0.6})`);
        grad.addColorStop(1, "rgb(255 214 160 / 0)");
        n.fillStyle = grad;
        n.fillRect(x - R, y - R, 2 * R, 2 * R);
      };
      let fire: Point | null = null;
      for (const l of ls) {
        const lvl = lightLevel(l, d);
        if (lvl <= 0) continue;
        const look = LIGHT_LOOK[l.kind];
        // A gentle flicker on flames; none with reduced motion.
        const flame = l.kind === "fire" || l.kind === "torch";
        const f = reducedMotion || !flame ? 1 : 1 + 0.05 * Math.sin(t * 7.3 + l.seed) + 0.03 * Math.sin(t * 12.1 + l.seed * 3);
        pool(l.p, look.r * f, Math.min(0.9, look.a * lvl * f));
        if (l.kind === "fire") fire = l.p;
      }
      for (const p of torches?.current ?? []) {
        const f = reducedMotion ? 1 : 1 + 0.08 * Math.sin(t * 9 + p.x * 5);
        pool(p, 0.9 * f, 0.6 * d);
      }

      // ---- Above it: stars, the moon, and the plaza fire's small bright embers. ----
      g.globalCompositeOperation = "source-over";
      for (const st of STARS) {
        g.globalAlpha = d * (reducedMotion ? 0.7 : 0.45 + 0.35 * Math.sin(t * 1.3 + st.tw));
        g.fillStyle = "#fef9c3";
        g.beginPath();
        g.arc(st.x * v.w, st.y * v.h, st.r, 0, Math.PI * 2);
        g.fill();
      }
      // The moon is not drawn here: it sits small in the HUD beside Araw N (Moon.tsx), never over
      // the map's tiles or buildings.
      if (fire) {
        // The fire itself: a small flickering orange glow, a fire, not a sun.
        const x = o.x + fire.x * T;
        const y = o.y + fire.y * T;
        const f = reducedMotion ? 1 : 1 + 0.12 * Math.sin(t * 9.1) + 0.06 * Math.sin(t * 15.7);
        const R = T * 0.45 * f;
        const grad = g.createRadialGradient(x, y, 0, x, y, R);
        grad.addColorStop(0, "rgb(255 210 120 / 0.55)");
        grad.addColorStop(0.5, "rgb(255 130 40 / 0.25)");
        grad.addColorStop(1, "rgb(255 100 30 / 0)");
        g.globalAlpha = d;
        g.fillStyle = grad;
        g.fillRect(x - R, y - R, 2 * R, 2 * R);
      }
      g.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [darkness > 0, reducedMotion, content, torches]);

  if (darkness <= 0) return null;
  return (
    <>
      <canvas ref={shade} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full mix-blend-multiply" />
      <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
    </>
  );
}
