import { describe, expect, it } from "vitest";
import {
  cameraOn,
  clampCamera,
  MAX_TILE,
  MIN_TILE,
  pan,
  screenToTile,
  tileCenter,
  visibleRange,
  zoomAt,
} from "./camera";

const map = { width: 60, height: 40 };
const phone = { w: 375, h: 470 };

describe("camera", () => {
  it("starts centred on a tile (the plaza), with the start area in view", () => {
    const cam = cameraOn({ x: 20, y: 18 }, phone);
    expect(screenToTile(cam, phone, phone.w / 2, phone.h / 2)).toEqual({ x: 20, y: 18 });
    expect(cam.tile * 7).toBeLessThan(phone.w);
  });

  it("converts between screen points and tiles", () => {
    const cam = { x: 10, y: 10, tile: 40 };
    const c = tileCenter(cam, phone, 12, 9);
    expect(screenToTile(cam, phone, c.x, c.y)).toEqual({ x: 12, y: 9 });
  });

  it("pans with the drag", () => {
    const cam = { x: 10, y: 10, tile: 40 };
    expect(pan(cam, 80, -40)).toEqual({ x: 8, y: 11, tile: 40 });
  });

  it("zooms around the cursor, within limits", () => {
    const cam = { x: 10, y: 10, tile: 40 };
    const under = screenToTile(cam, phone, 300, 100);
    const zoomed = zoomAt(cam, phone, 1.5, 300, 100);
    expect(zoomed.tile).toBe(60);
    expect(screenToTile(zoomed, phone, 300, 100)).toEqual(under);
    expect(zoomAt(cam, phone, 100, 0, 0).tile).toBe(MAX_TILE);
    expect(zoomAt(cam, phone, 0.01, 0, 0).tile).toBe(MIN_TILE);
  });

  it("keeps the centre on the map", () => {
    expect(clampCamera({ x: -5, y: 99, tile: 500 }, map)).toEqual({ x: 0, y: 40, tile: MAX_TILE });
  });

  it("draws only the tiles in view", () => {
    const r = visibleRange({ x: 30, y: 20, tile: 40 }, phone, map);
    const count = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
    expect(count).toBeLessThan(250); // out of 2,400
    expect(r.x0).toBeLessThanOrEqual(30 - phone.w / 2 / 40);
    const corner = visibleRange({ x: 0, y: 0, tile: 40 }, phone, map);
    expect([corner.x0, corner.y0]).toEqual([0, 0]);
  });
});
