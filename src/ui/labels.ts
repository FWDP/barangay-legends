// Keeping floating map labels readable: inside the map view and never under the controls
// drawn over it (Gather buttons, zoom buttons, banners, the adviser). Pure, so it's tested.

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Size {
  w: number;
  h: number;
}

/** Gap kept between a label and the view's edge or a control. */
export const LABEL_MARGIN = 6;

const overlaps = (a: Rect, b: Rect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** A label of `size` centred horizontally on x, with its top at y. */
const box = (x: number, y: number, size: Size): Rect => ({ left: x - size.w / 2, top: y, right: x + size.w / 2, bottom: y + size.h });

/** A rough size for a one-line label, before it's rendered. */
export function labelSize(text: string, fontPx = 11): Size {
  return { w: Math.ceil([...text].length * fontPx * 0.58 + 16), h: Math.ceil(fontPx * 1.5 + 8) };
}

/**
 * Where to draw a label wanted at (x, y) (horizontal centre, top edge) in a view of `view`
 * size: as near as possible to where it was wanted, inside the view and clear of every
 * `avoid` rectangle. Tries the spot itself, then above, beside and below each control in the
 * way; returns null if none fits (the caller hides the label).
 */
export function placeLabel(x: number, y: number, size: Size, view: Size, avoid: Rect[], margin = LABEL_MARGIN): { x: number; y: number } | null {
  const minX = margin + size.w / 2;
  const maxX = view.w - margin - size.w / 2;
  const minY = margin;
  const maxY = view.h - margin - size.h;
  if (minX > maxX || minY > maxY) return null;
  const clampX = (v: number) => Math.min(maxX, Math.max(minX, v));
  const clampY = (v: number) => Math.min(maxY, Math.max(minY, v));
  const fits = (p: { x: number; y: number }) => !avoid.some((r) => overlaps(box(p.x, p.y, size), r));
  const start = { x: clampX(x), y: clampY(y) };
  if (fits(start)) return start;
  const candidates: { x: number; y: number }[] = [];
  for (const r of avoid) {
    if (!overlaps(box(start.x, start.y, size), r)) continue;
    candidates.push(
      { x: start.x, y: clampY(r.top - margin - size.h) }, // above
      { x: clampX(r.left - margin - size.w / 2), y: start.y }, // to the left
      { x: clampX(r.right + margin + size.w / 2), y: start.y }, // to the right
      { x: start.x, y: clampY(r.bottom + margin) }, // below
    );
  }
  const ok = candidates.filter(fits);
  if (ok.length === 0) return null;
  return ok.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a));
}

/** Does a rectangle sit clear of every control (and inside the view)? */
export function isClear(r: Rect, view: Size, avoid: Rect[]): boolean {
  if (r.left < 0 || r.top < 0 || r.right > view.w || r.bottom > view.h) return false;
  return !avoid.some((a) => overlaps(r, a));
}
