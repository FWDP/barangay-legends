// The archipelago: the region's islands and where each barangay sits on them, generated from
// the seed. The player's home island holds the old river neighbors (content/neighbors with
// "home": true); the others are spread over the other islands. Positions are on a 0..1 map;
// travel between islands takes Balangay time, longer for farther islands.
import type { Content } from "./content";
import { rollAt } from "./rng";

export interface Island {
  id: string;
  name: string;
  /** Centre on the regional map (0..1) and size. */
  x: number;
  y: number;
  r: number;
}

/** Where a barangay is: its island, and its spot on the regional map. */
export interface Place {
  island: string;
  x: number;
  y: number;
}

export const HOME_ISLAND = "island-0";
const SALT = 5300;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Islands and places from a seed: 4–5 islands (rules.archipelago), the home island first with
 * the player at its centre and the home neighbors along its river; every other island gets at
 * least one of the other barangays.
 */
export function generateArchipelago(content: Content, seed: number, playerId: string): { islands: Island[]; places: Record<string, Place> } {
  const a = content.rules.archipelago;
  const roll = (i: number, k: number) => rollAt(seed >>> 0, i, SALT + k);
  const others = content.neighbors.filter((n) => !n.home);
  const want = a.minIslands + Math.floor(roll(0, 0) * (a.maxIslands - a.minIslands + 1));
  // At least one other barangay on each other island.
  const count = Math.max(1, Math.min(want, others.length + 1));
  const names = content.islands.length ? content.islands : Array.from({ length: count }, (_, i) => `Island ${i + 1}`);
  const islands: Island[] = [{ id: HOME_ISLAND, name: names[0], x: 0.3, y: 0.5, r: 0.17 }];
  // The others in a loose ring to the east, spaced apart.
  for (let i = 1; i < count; i++) {
    const angle = -Math.PI / 2 + ((i - 0.5) / (count - 1)) * Math.PI + (roll(i, 1) - 0.5) * 0.4;
    const dist = 0.38 + roll(i, 2) * 0.12;
    islands.push({
      id: `island-${i}`,
      name: names[i % names.length],
      x: clamp(0.3 + Math.cos(angle) * dist * 1.25, 0.12, 0.9),
      y: clamp(0.5 + Math.sin(angle) * dist, 0.12, 0.88),
      r: 0.08 + roll(i, 3) * 0.04,
    });
  }
  const places: Record<string, Place> = { [playerId]: { island: HOME_ISLAND, x: islands[0].x, y: islands[0].y } };
  // Home neighbors along the home island's river, upstream at the top.
  const home = islands[0];
  for (const n of content.neighbors.filter((x) => x.home)) {
    const pos = n.river?.position ?? 0.5;
    const side = n.river?.bank === "left" ? -1 : 1;
    places[n.id] = { island: HOME_ISLAND, x: home.x + side * home.r * 0.8, y: home.y - home.r * 0.75 + pos * home.r * 1.5 };
  }
  // The rest, shuffled by the seed, one island after another.
  const order = others.map((n, i) => ({ n, k: roll(100 + i, 4) })).sort((p, q) => p.k - q.k);
  const perIsland: Record<string, number> = {};
  order.forEach(({ n }, i) => {
    const island = islands[1 + (i % (count - 1 || 1))] ?? islands[0];
    const k = (perIsland[island.id] = (perIsland[island.id] ?? 0) + 1) - 1;
    // Spread around the island's middle, far enough apart that names don't run together.
    const angle = Math.PI / 2 + k * 2.1 + roll(200 + i, 5) * 0.4;
    const d = k === 0 ? 0 : island.r * 0.75;
    places[n.id] = { island: island.id, x: island.x + Math.cos(angle) * d, y: island.y + Math.sin(angle) * d };
  });
  return { islands, places };
}

/** Distance between two barangays' islands on the regional map (0 on the same island). */
export function islandDistance(islands: Island[], places: Record<string, Place>, a: string, b: string): number {
  const pa = places[a];
  const pb = places[b];
  if (!pa || !pb || pa.island === pb.island) return 0;
  const ia = islands.find((i) => i.id === pa.island);
  const ib = islands.find((i) => i.id === pb.island);
  if (!ia || !ib) return 0;
  return Math.hypot(ia.x - ib.x, ia.y - ib.y);
}

export const sameIsland = (places: Record<string, Place>, a: string, b: string) => !!places[a] && places[a]?.island === places[b]?.island;

/** Seconds a Balangay takes from one barangay to another (0 on the same island). */
export function travelSeconds(content: Content, islands: Island[], places: Record<string, Place>, a: string, b: string): number {
  if (sameIsland(places, a, b)) return 0;
  const s = content.rules.sea;
  return Math.max(s.minSeconds, Math.round(islandDistance(islands, places, a, b) * s.secondsPerUnit));
}
