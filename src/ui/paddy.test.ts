import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PADDY, PADDY_STYLE } from "./paddy";

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe("Palayan fields", () => {
  it("are a flat, muted green (no bright lime or cyan), with faint water lines", () => {
    const [r, g, b] = rgb(PADDY.base);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    // Muted: not a bright, saturated green.
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(90);
    expect(g).toBeLessThan(180);
    expect(PADDY_STYLE.backgroundImage).toContain("repeating-linear-gradient");
  });

  it("the map no longer uses the old lime-to-cyan gradient, and the share card draws the same field", () => {
    expect(readFileSync("src/ui/BarangayMap.tsx", "utf8")).not.toMatch(/to-cyan|from-lime/);
    expect(readFileSync("src/ui/share.ts", "utf8")).toContain("drawPaddy(");
  });
});
