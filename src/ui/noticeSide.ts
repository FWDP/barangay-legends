// Where the notice stack sits: at the top of the map, unless there it would cover the raid's
// landing or the raiders' way in (the map marks them with data-raid-zone); then at the bottom,
// unless that covers more of them. Measured after each render; only a real change re-renders.
import { useLayoutEffect, useRef, useState } from "react";

export type Side = "top" | "bottom";

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** How much of the zones a box covers (area, in px²). */
export function coverage(box: Box | null, zones: Box[]): number {
  if (!box) return 0;
  let area = 0;
  for (const z of zones) {
    const w = Math.min(box.right, z.right) - Math.max(box.left, z.left);
    const h = Math.min(box.bottom, z.bottom) - Math.max(box.top, z.top);
    if (w > 0 && h > 0) area += w * h;
  }
  return area;
}

/**
 * The side to use, given where the stack is now (`side`, its box `here`), where it last was at
 * the top and at the bottom (null if never, or since the zones moved) and the zones to keep clear.
 * Top is preferred; it moves only to a side known (or not yet known) to cover less, so it never
 * flips back and forth when both sides cover some of the raid.
 */
export function chooseSide(side: Side, here: Box | null, last: { top: Box | null; bottom: Box | null }, zones: Box[]): Side {
  if (zones.length === 0) return "top";
  const top = side === "top" ? here : last.top;
  const bottom = side === "bottom" ? here : last.bottom;
  const topHit = coverage(top, zones);
  if (topHit === 0) return "top";
  if (side === "top") return bottom === null || coverage(bottom, zones) < topHit ? "bottom" : "top";
  return coverage(bottom, zones) < topHit ? "bottom" : "top";
}

const box = (r: DOMRect): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });

/** The notice stack's side while a raid is on (always the top otherwise). */
export function useNoticeSide(raid: boolean): Side {
  const [side, setSide] = useState<Side>("top");
  const last = useRef<{ top: Box | null; bottom: Box | null; zones: string }>({ top: null, bottom: null, zones: "" });
  useLayoutEffect(() => {
    if (!raid) {
      last.current = { top: null, bottom: null, zones: "" };
      if (side !== "top") setSide("top");
      return;
    }
    const zones = [...document.querySelectorAll("[data-raid-zone]")].map((e) => box(e.getBoundingClientRect())).filter((z) => z.right > z.left && z.bottom > z.top);
    // When the zones move (the camera, or the landing seen), the other side must be measured again.
    const key = zones.map((z) => [z.left, z.top, z.right, z.bottom].map((v) => Math.round(v / 8)).join(",")).join(";");
    if (key !== last.current.zones) last.current = { top: side === "top" ? last.current.top : null, bottom: side === "bottom" ? last.current.bottom : null, zones: key };
    const stack = document.querySelector("[data-notice-side]");
    const here = stack ? box(stack.getBoundingClientRect()) : null;
    if (here) last.current[side] = here;
    const next = chooseSide(side, here, last.current, zones);
    if (next !== side) setSide(next);
  });
  return side;
}
