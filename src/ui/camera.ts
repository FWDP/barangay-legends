// Camera math for the map view: pan, zoom and which tiles are on screen. Pure, so it is tested.
import type { MapState, Point } from "../engine/map";

export interface Camera {
  /** The map point (in tiles) at the centre of the view. */
  x: number;
  y: number;
  /** Size of one tile on screen, in px. */
  tile: number;
}

export interface View {
  w: number;
  h: number;
}

/** Zoom limits: wide view (small tiles) to close view (big tiles). */
export const MIN_TILE = 18;
export const MAX_TILE = 80;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keeps the zoom in range and the centre on the map. */
export function clampCamera(cam: Camera, map: Pick<MapState, "width" | "height">): Camera {
  return {
    x: clamp(cam.x, 0, map.width),
    y: clamp(cam.y, 0, map.height),
    tile: clamp(cam.tile, MIN_TILE, MAX_TILE),
  };
}

/** Centred on the middle of a tile, at a zoom where the start area (7 × 7) and a margin fit. */
export function cameraOn(p: Point, view: View, tile?: number): Camera {
  const fit = Math.floor(Math.min(view.w, view.h) / 11);
  return { x: p.x + 0.5, y: p.y + 0.5, tile: clamp(tile ?? clamp(fit, 30, 56), MIN_TILE, MAX_TILE) };
}

/** Where the map's (0, 0) corner sits on screen. Tiles are drawn at origin + (x, y) × tile. */
export function origin(cam: Camera, view: View): Point {
  return { x: view.w / 2 - cam.x * cam.tile, y: view.h / 2 - cam.y * cam.tile };
}

/** The tile under a point in the view (px from the view's top-left). */
export function screenToTile(cam: Camera, view: View, px: number, py: number): Point {
  return {
    x: Math.floor(cam.x + (px - view.w / 2) / cam.tile),
    y: Math.floor(cam.y + (py - view.h / 2) / cam.tile),
  };
}

/** The centre of a tile, in px from the view's top-left. */
export function tileCenter(cam: Camera, view: View, x: number, y: number): Point {
  const o = origin(cam, view);
  return { x: o.x + (x + 0.5) * cam.tile, y: o.y + (y + 0.5) * cam.tile };
}

/** Tiles at least partly on screen (plus a margin), clipped to the map. Only these are drawn. */
export function visibleRange(cam: Camera, view: View, map: Pick<MapState, "width" | "height">, margin = 1) {
  const halfW = view.w / 2 / cam.tile;
  const halfH = view.h / 2 / cam.tile;
  return {
    x0: Math.max(0, Math.floor(cam.x - halfW) - margin),
    y0: Math.max(0, Math.floor(cam.y - halfH) - margin),
    x1: Math.min(map.width - 1, Math.ceil(cam.x + halfW) + margin),
    y1: Math.min(map.height - 1, Math.ceil(cam.y + halfH) + margin),
  };
}

/** Moves the view by a drag of (dx, dy) px: the map follows the finger. */
export function pan(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, x: cam.x - dx / cam.tile, y: cam.y - dy / cam.tile };
}

/** Zooms by `factor`, keeping the map point under (px, py) in place (cursor or pinch centre). */
export function zoomAt(cam: Camera, view: View, factor: number, px: number, py: number): Camera {
  const tile = clamp(cam.tile * factor, MIN_TILE, MAX_TILE);
  const worldX = cam.x + (px - view.w / 2) / cam.tile;
  const worldY = cam.y + (py - view.h / 2) / cam.tile;
  return { x: worldX - (px - view.w / 2) / tile, y: worldY - (py - view.h / 2) / tile, tile };
}
