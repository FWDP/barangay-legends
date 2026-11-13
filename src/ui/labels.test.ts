import { describe, expect, it } from "vitest";
import { isClear, labelSize, placeLabel, type Rect } from "./labels";

// A phone-sized map view, with the Gather buttons across the bottom and zoom buttons on the right.
const view = { w: 375, h: 600 };
const gather: Rect = { left: 40, top: 520, right: 365, bottom: 590 };
const zoom: Rect = { left: 320, top: 230, right: 370, bottom: 370 };
const size = { w: 200, h: 24 };
const overlaps = (p: { x: number; y: number }, r: Rect) => p.x - size.w / 2 < r.right && p.x + size.w / 2 > r.left && p.y < r.bottom && p.y + size.h > r.top;

describe("floating map labels", () => {
  it("stay where they're wanted when nothing is in the way", () => {
    expect(placeLabel(180, 100, size, view, [gather, zoom])).toEqual({ x: 180, y: 100 });
  });

  it("move up out from under the Gather buttons", () => {
    const p = placeLabel(180, 540, size, view, [gather, zoom])!;
    expect(overlaps(p, gather)).toBe(false);
    expect(p.y + size.h).toBeLessThanOrEqual(gather.top);
  });

  it("move aside from the zoom buttons", () => {
    const p = placeLabel(330, 280, size, view, [gather, zoom])!;
    expect(overlaps(p, zoom)).toBe(false);
  });

  it("stay inside the view", () => {
    const p = placeLabel(-50, -20, size, view, [])!;
    expect(p.x - size.w / 2).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    const q = placeLabel(500, 900, size, view, [])!;
    expect(q.x + size.w / 2).toBeLessThanOrEqual(view.w);
    expect(q.y + size.h).toBeLessThanOrEqual(view.h);
  });

  it("are hidden (null) when there's nowhere clear", () => {
    const wall: Rect = { left: 0, top: 0, right: 375, bottom: 600 };
    expect(placeLabel(180, 300, size, view, [wall])).toBeNull();
    expect(placeLabel(180, 300, { w: 500, h: 24 }, view, [])).toBeNull();
  });

  it("estimates a label's size from its text", () => {
    const short = labelSize("⚔️ Landing");
    const long = labelSize("⏸ Trade paused — raid in progress");
    expect(long.w).toBeGreaterThan(short.w);
    expect(short.h).toBeGreaterThan(10);
  });

  it("knows when a spot is clear", () => {
    expect(isClear({ left: 10, top: 10, right: 50, bottom: 40 }, view, [gather])).toBe(true);
    expect(isClear({ left: 100, top: 530, right: 140, bottom: 560 }, view, [gather])).toBe(false);
    expect(isClear({ left: -5, top: 10, right: 50, bottom: 40 }, view, [])).toBe(false);
  });
});
