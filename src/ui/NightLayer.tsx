// The night over the map: soft pools of warm light (plaza fire, Bahay ng Datu, lived-in houses,
// Kuta torches, the Dambana, dock lanterns, and villagers carrying torches), coming on one by one
// at dusk and fading at dawn, with stars and the moon (dark red while the Bakunawa swallows it).
// Display only. With reduced motion there's no flicker or twinkle: the glow is still.
import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { Content } from "../engine/content";
import type { GameState } from "../engine/game";
import type { Point } from "../engine/map";
import { origin, type Camera, type View } from "./camera";
import { barangayLights, darknessAt, LIGHT_LOOK, lightLevel } from "./nightLight";

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
  const live = useRef({ state, cam, view, lights });
  live.current = { state, cam, view, lights };
  const darkness = darknessAt(content, state.time);

  useEffect(() => {
    const c = canvas.current;
    if (!c || darkness <= 0) return;
    const g = c.getContext("2d");
    if (!g) return;
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
      if (c.width !== w || c.height !== h) [c.width, c.height] = [w, h];
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, v.w, v.h);
      const d = darknessAt(content, s.time);
      if (d <= 0) return;
      const t = reducedMotion ? 0 : now / 1000;
      // Stars and the moon.
      g.globalCompositeOperation = "source-over";
      for (const st of STARS) {
        g.globalAlpha = d * (reducedMotion ? 0.7 : 0.45 + 0.35 * Math.sin(t * 1.3 + st.tw));
        g.fillStyle = "#fef9c3";
        g.beginPath();
        g.arc(st.x * v.w, st.y * v.h, st.r, 0, Math.PI * 2);
        g.fill();
      }
      const mx = v.w * 0.84;
      const my = Math.max(60, v.h * 0.16);
      const mr = Math.max(10, Math.min(v.w, v.h) * 0.035);
      g.globalAlpha = d;
      const eclipse = s.eclipse !== null;
      g.fillStyle = eclipse ? "#7f1d1d" : "#fef3c7";
      g.shadowColor = eclipse ? "rgb(220 38 38 / 0.8)" : "rgb(254 243 199 / 0.9)";
      g.shadowBlur = mr;
      g.beginPath();
      g.arc(mx, my, mr, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      if (eclipse) {
        // The serpent's shadow across the moon.
        g.fillStyle = "rgb(15 10 30 / 0.85)";
        g.beginPath();
        g.arc(mx + mr * 0.45, my - mr * 0.1, mr * 0.95, 0, Math.PI * 2);
        g.fill();
      }
      // Warm light: added on top, so pools overlap softly.
      g.globalCompositeOperation = "lighter";
      const o = origin(k, v);
      const T = k.tile;
      const pool = (p: Point, r: number, a: number) => {
        const x = o.x + p.x * T;
        const y = o.y + p.y * T;
        const R = r * T;
        if (x < -R || y < -R || x > v.w + R || y > v.h + R || a <= 0.01) return;
        const grad = g.createRadialGradient(x, y, 0, x, y, R);
        grad.addColorStop(0, `rgb(255 196 110 / ${a})`);
        grad.addColorStop(0.45, `rgb(255 150 60 / ${a * 0.45})`);
        grad.addColorStop(1, "rgb(255 120 40 / 0)");
        g.globalAlpha = 1;
        g.fillStyle = grad;
        g.fillRect(x - R, y - R, 2 * R, 2 * R);
      };
      for (const l of ls) {
        const lvl = lightLevel(l, d);
        if (lvl <= 0) continue;
        const look = LIGHT_LOOK[l.kind];
        // A gentle flicker on flames; none with reduced motion.
        const flame = l.kind === "fire" || l.kind === "torch";
        const f = reducedMotion || !flame ? 1 : 1 + 0.07 * Math.sin(t * 7.3 + l.seed) + 0.04 * Math.sin(t * 12.1 + l.seed * 3);
        pool(l.p, look.r * f, look.a * lvl * f);
      }
      for (const p of torches?.current ?? []) {
        const f = reducedMotion ? 1 : 1 + 0.08 * Math.sin(t * 9 + p.x * 5);
        pool(p, 0.8 * f, 0.4 * d);
      }
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [darkness > 0, reducedMotion, content, torches]);

  if (darkness <= 0) return null;
  return <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
