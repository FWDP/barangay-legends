// The look of a Palayan's field: a flat, muted paddy green with a few faint lines of standing
// water, so fields sit quietly in the map by day and at night. One definition for the map (and
// so visits and replays, which draw the same map) and the share card.

/** The field's green and its faint water lines. */
export const PADDY = { base: "#6f8f4e", edge: "#5d7a41", water: "rgba(196, 220, 200, 0.22)" } as const;

/** CSS for a field tile on the map: flat green, thin water lines between the rows of rice. */
export const PADDY_STYLE = {
  backgroundColor: PADDY.base,
  backgroundImage: `repeating-linear-gradient(0deg, transparent 0 22%, ${PADDY.water} 22% 26%)`,
  boxShadow: `inset 0 0 0 1px ${PADDY.edge}`,
} as const;

/** The same field on a canvas (the share card). */
export function drawPaddy(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.fillStyle = PADDY.base;
  g.fillRect(x, y, w, h);
  g.fillStyle = PADDY.water;
  for (let k = 1; k <= 3; k++) g.fillRect(x, y + (h * k) / 4 - h * 0.02, w, h * 0.04);
  g.strokeStyle = PADDY.edge;
  g.lineWidth = Math.max(1, w * 0.02);
  g.strokeRect(x, y, w, h);
}
