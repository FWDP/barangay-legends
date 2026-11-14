// Villagers drawn as small sprites on a canvas over the map, animated with
// requestAnimationFrame. Targets are derived from GameState every frame (see villagers.ts);
// sprite positions are display-only and never written back to the game.
import { useEffect, useRef, useState } from "react";
import type { Content } from "../engine/content";
import { isHungry } from "../engine/events";
import { overcrowded, type GameState } from "../engine/game";
import { layOutSpan, tileAt, type BridgeTile, type Point } from "../engine/map";
import type { NamedVillager } from "../engine/people";
import { isEveningAt, isNightAt } from "../engine/daynight";
import { origin, type Camera, type View } from "./camera";
import {
  carriesTorch,
  goal,
  edgeTile,
  keepOnLand,
  onLand,
  exitPoint,
  MAX_SPRITES,
  namedSprites,
  newWalker,
  planVillagers,
  routeTo,
  presentVillagers,
  SPEED,
  speedOf,
  stepWalker,
  type Appearance,
  type Role,
  type Tapped,
  type VillagerPlan,
  type Walker,
} from "./villagers";
import {
  along,
  boatArriving,
  boatLeaving,
  fromTop,
  LEAVE_SECONDS,
  raiderCount,
  LANDING_SHARE,
  riverPath,
  bandAt,
  BOAT_RETURN_MS,
  CLASH_MS,
  nearestIndex,
  riverLine,
  waitIndex,
  lootTarget,
  lootWalk,
  sailToLanding,
  dockPoint,
} from "./visitors";
import { hasDatuUnlock } from "../engine/datu";
import { alliedDefenders } from "../engine/region";
import { raidLanding } from "../engine/border";
import { solidTiles } from "../engine/doors";
import { gatheringSpots, houseFront } from "../engine/plaza";
import { householdOf } from "../engine/household";
import { namedGender } from "../engine/people";
import { datuHouseBox, datuHouseImage, eraseImage, houseStyleFor } from "./datuHouseArt";

/** A battle at the Kuta being shown right now (see App): who won, and when it ends (ms). */
export interface Clash {
  win: boolean;
  until: number;
}

/** The raid the layer is showing, remembered after the engine has resolved it. */
interface RaidMemory {
  from: string;
  top: boolean;
  /** Where they landed, where the battle is. */
  landing: Point;
  count: number;
  /** The karakoa's way in along the river. */
  sail: Point[];
  /** Winners' walk to their loot (A*), once worked out. */
  loot: Point[] | null;
  /** performance.now() when it struck, when the clash ended, and whether the barangay won. */
  struckAt?: number;
  retreatAt?: number;
  win?: boolean;
}

/** Raiders' pace walking to their loot (tiles per second), the time they spend taking it, and how long fleeing takes. */
const LOOT_WALK_SPEED = 2.5;
const LOOT_PAUSE = 1.2;
const FLEE_SECONDS = 2.5;

/** A band of raiders around a point. */
const spread = (p: Point, count: number): Point[] =>
  Array.from({ length: count }, (_, i) => ({ x: p.x + ((i % 3) - 1) * 0.3, y: p.y + (Math.floor(i / 3) - 0.5) * 0.3 }));

interface Sprite {
  p: Point;
  moving: boolean;
  /** Walk cycle, advanced while moving. */
  stride: number;
}

/** A villager on screen: where they are and the route they're walking (display only). */
interface Villager extends Sprite {
  walker: Walker;
  /** 1 when outside; fades to 0 going in a doorway, back to 1 coming out. */
  alpha?: number;
}

interface Leaver extends Villager {
  id: number;
  to: Point;
}

const FRAME_MS = 1000 / 30 - 2;
/** The canvas grows and shrinks in steps of this many px. */
const GRID = 128;
const SKIN = ["#8d5524", "#a0673a", "#7a4a2a", "#b07a4a", "#94603a"];
const CLOTH = ["#1e3a8a", "#7f1d1d", "#a16207", "#e7e5e4", "#3f6212", "#7c2d12", "#164e63"];

const REDUCED = "(prefers-reduced-motion: reduce)";

/** Whether the player asked for less motion; follows changes to the setting. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(REDUCED).matches);
  useEffect(() => {
    const query = window.matchMedia?.(REDUCED);
    if (!query) return;
    const on = () => setReduced(query.matches);
    query.addEventListener("change", on);
    return () => query.removeEventListener("change", on);
  }, []);
  return reduced;
}

export type Look = Role | "leaving" | "raider" | "looter" | "datu" | "spouse" | "attendant" | "envoy" | "defender" | "ally";

/** How long a mourning marker stays where someone died. */
const MARKER_MS = 12000;

/** A mourning marker: a small burial jar (like the Libingan's) on a mat of flowers. Gentle, never more; no candle. */
function drawMarker(g: CanvasRenderingContext2D, x: number, y: number, tile: number) {
  const s = Math.max(7, tile * 0.32);
  g.globalAlpha = 0.9;
  g.fillStyle = "#fef3c7";
  g.beginPath();
  g.ellipse(x, y, s * 0.3, s * 0.1, 0, 0, Math.PI * 2);
  g.fill();
  // The jar: a round clay body, a short neck and a lid.
  g.fillStyle = "#b45309";
  g.strokeStyle = "#78350f";
  g.lineWidth = Math.max(0.6, s * 0.03);
  g.beginPath();
  g.ellipse(x, y - s * 0.2, s * 0.14, s * 0.17, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillRect(x - s * 0.07, y - s * 0.42, s * 0.14, s * 0.08);
  g.fillStyle = "#92400e";
  g.beginPath();
  g.ellipse(x, y - s * 0.43, s * 0.1, s * 0.035, 0, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
}

/** A small gold star over a named villager's head: tap them to hear their story. */
function drawStar(g: CanvasRenderingContext2D, x: number, y: number, tile: number) {
  const s = Math.max(7, tile * 0.32);
  const cx = x;
  const cy = y - s * 1.25;
  const R = Math.max(3, s * 0.2);
  g.globalAlpha = 1;
  g.fillStyle = "#facc15";
  g.strokeStyle = "#78350f";
  g.lineWidth = Math.max(1, s * 0.05);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? R : R * 0.45;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.stroke();
}

/** A small torch held up beside a villager, flickering gently (still with reduced motion). */
function drawTorch(g: CanvasRenderingContext2D, x: number, y: number, tile: number, t: number, still: boolean) {
  const s = Math.max(7, tile * 0.32);
  const hx = x + s * 0.28;
  const top = y - s * 1.05;
  g.strokeStyle = "#5b3a1e";
  g.lineWidth = Math.max(1, s * 0.08);
  g.beginPath();
  g.moveTo(hx, y - s * 0.45);
  g.lineTo(hx, top);
  g.stroke();
  const f = still ? 1 : 1 + 0.15 * Math.sin(t * 11 + x);
  g.fillStyle = "#fbbf24";
  g.beginPath();
  g.ellipse(hx, top - s * 0.1 * f, s * 0.09, s * 0.16 * f, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fde68a";
  g.beginPath();
  g.ellipse(hx, top - s * 0.05, s * 0.045, s * 0.08, 0, 0, Math.PI * 2);
  g.fill();
}

/** Default looks for sprites without a resident (replays, visitors): adult, by sprite number. */
const lookFor = (id: number, role: Look): Appearance => ({
  gender: role === "warrior" || role === "raider" || role === "looter" || role === "defender" || role === "ally" || role === "datu" || id % 2 ? "man" : "woman",
  age: "adult",
  malong: false,
});

/** Blouse and wrap colors: undyed abaca and cotton, indigo, and the reds, browns and yellows of plant dyes. */
const BARO = ["#f5f0e1", "#e7dcc0", "#d6c7a1", "#c9b48a"];
const TAPIS = ["#7f1d1d", "#1e3a8a", "#3f6212", "#7c2d12", "#164e63", "#a16207"];

/**
 * A villager at map scale, in precolonial dress (content/lore/precolonial-dress.json): women in a
 * baro (blouse) with a wrapped tapis or patadyong skirt and their hair tied back; men in a bahag
 * (loincloth) with a short kanggan jacket, some with a putong (head cloth); in a malong
 * tradition, the tube cloth for both. Children are smaller; elders grey, a little stooped, with a
 * stick. The skirt-or-legs silhouette keeps women and men apart even at 375px.
 */
export function drawPerson(g: CanvasRenderingContext2D, x: number, y: number, tile: number, id: number, role: Look, sprite: Sprite, t: number, alpha = 1, lookIn?: Appearance) {
  const look = lookIn ?? lookFor(id, role);
  const child = look.age === "child";
  const elder = look.age === "elder";
  const woman = look.gender === "woman";
  const s = Math.max(7, tile * 0.32) * (child ? 0.72 : 1);
  const swing = sprite.moving ? Math.sin(sprite.stride) * s * 0.12 : 0;
  // Workers busy at their post bob a little.
  const bob = !sprite.moving && role === "work" ? Math.abs(Math.sin(t * 5 + id)) * s * 0.05 : 0;
  const sick = role === "sick";
  g.globalAlpha = (sick ? 0.85 : 1) * alpha;
  const skin = sick ? "#9cae7a" : SKIN[(id * 3) % SKIN.length];
  const raider = role === "raider" || role === "looter";
  // The datu's household dresses finer; dependents (alipin, oripun) in plain undyed cloth.
  const fine = role === "datu" || role === "spouse";
  const plain = look.cls === "dependent" && !fine;
  const special = fine ? "#991b1b" : role === "envoy" ? "#e7e5e4" : raider ? "#3b0a0a" : plain ? "#b8a47e" : null;
  const cloth = sick ? "#7c9a5a" : special ?? CLOTH[id % CLOTH.length];
  const wrap = sick ? "#6b8a4a" : fine ? "#1e3a8a" : plain ? "#8b6b4a" : TAPIS[(id * 5) % TAPIS.length];
  const lean = elder ? s * 0.06 : 0;

  g.fillStyle = "rgb(0 0 0 / 0.25)";
  g.beginPath();
  g.ellipse(x, y, s * 0.2, s * 0.07, 0, 0, Math.PI * 2);
  g.fill();

  const top = y - s * 0.72 - bob + (elder ? s * 0.04 : 0);
  const waist = top + s * 0.44;
  const malong = look.malong && !raider;
  if (woman) {
    // Legs show only at the feet under the skirt.
    g.strokeStyle = skin;
    g.lineWidth = Math.max(1, s * 0.07);
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x - s * 0.05, y - s * 0.1);
    g.lineTo(x - s * 0.06 + swing * 0.5, y);
    g.moveTo(x + s * 0.05, y - s * 0.1);
    g.lineTo(x + s * 0.06 - swing * 0.5, y);
    g.stroke();
    // The wrapped skirt (or a malong from the chest), flaring a little to the ankles.
    const from = malong ? top + s * 0.12 : waist - s * 0.06;
    g.fillStyle = wrap;
    g.beginPath();
    g.moveTo(x - s * 0.15, from);
    g.lineTo(x + s * 0.15, from);
    g.lineTo(x + s * 0.21, y - s * 0.08);
    g.lineTo(x - s * 0.21, y - s * 0.08);
    g.closePath();
    g.fill();
    // A band woven across it.
    g.fillStyle = malong ? "#facc15" : "rgb(255 255 255 / 0.35)";
    g.fillRect(x - s * 0.19, y - s * 0.26, s * 0.38, s * 0.05);
    // The baro: a short blouse (under the malong's top edge if worn).
    if (!malong) {
      g.fillStyle = sick ? cloth : fine ? "#991b1b" : plain ? "#e7dcc0" : special ?? BARO[id % BARO.length];
      g.beginPath();
      g.roundRect(x - s * 0.16 + lean, top, s * 0.32, s * 0.4, s * 0.08);
      g.fill();
    } else {
      g.fillStyle = skin;
      g.beginPath();
      g.roundRect(x - s * 0.12 + lean, top, s * 0.24, s * 0.16, s * 0.06);
      g.fill();
    }
  } else {
    // Bare legs (a bahag leaves them free), or a malong to the knees.
    g.strokeStyle = raider ? "#3b2414" : skin;
    g.lineWidth = Math.max(1, s * 0.08);
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x - s * 0.05, y - s * 0.3);
    g.lineTo(x - s * 0.06 + swing, y);
    g.moveTo(x + s * 0.05, y - s * 0.3);
    g.lineTo(x + s * 0.06 - swing, y);
    g.stroke();
    if (malong) {
      g.fillStyle = wrap;
      g.fillRect(x - s * 0.17, waist - s * 0.06, s * 0.34, s * 0.3);
      g.fillStyle = "#facc15";
      g.fillRect(x - s * 0.17, waist + s * 0.08, s * 0.34, s * 0.04);
    } else {
      // The bahag: a band at the hips and a flap hanging in front.
      g.fillStyle = sick ? cloth : role === "datu" ? "#b91c1c" : wrap;
      g.fillRect(x - s * 0.15, waist - s * 0.06, s * 0.3, s * 0.08);
      g.fillRect(x - s * 0.05, waist - s * 0.02, s * 0.1, s * 0.18);
    }
    // The kanggan: a short jacket (the datu's finer, envoys' pale), over a bare chest.
    g.fillStyle = cloth;
    g.beginPath();
    g.roundRect(x - s * 0.17 + lean, top, s * 0.34, s * 0.4, s * 0.08);
    g.fill();
    g.fillStyle = skin;
    g.fillRect(x - s * 0.035 + lean, top + s * 0.04, s * 0.07, s * 0.3);
  }

  // The head.
  const hx = x + lean;
  g.fillStyle = skin;
  g.beginPath();
  g.arc(hx, top - s * 0.12, s * 0.13, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = elder ? "#d6d3d1" : "#1c1410";
  g.beginPath();
  g.arc(hx, top - s * 0.15, s * 0.13, Math.PI, Math.PI * 2);
  g.fill();
  if (woman) {
    // Hair tied back in a knot.
    g.beginPath();
    g.arc(hx - s * 0.13, top - s * 0.17, s * 0.075, 0, Math.PI * 2);
    g.fill();
  } else if (!raider && role !== "warrior" && role !== "defender" && role !== "ally" && role !== "datu" && !child && (look.cls === "warrior" || id % 3 === 0)) {
    // Some men wear a putong, a cloth wound round the head (the warrior class a red one).
    g.fillStyle = look.cls === "warrior" ? "#991b1b" : "#7c2d12";
    g.fillRect(hx - s * 0.14, top - s * 0.21, s * 0.28, s * 0.06);
  }
  if ((look.cls === "nobility" || fine) && !child) {
    // Gold: a necklace and ear ornaments, the mark of a noble family.
    g.strokeStyle = "#facc15";
    g.lineWidth = Math.max(1, s * 0.045);
    g.beginPath();
    g.arc(hx, top + s * 0.02, s * 0.09, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    g.fillStyle = "#facc15";
    g.beginPath();
    g.arc(hx - s * 0.13, top - s * 0.08, s * 0.035, 0, Math.PI * 2);
    g.arc(hx + s * 0.13, top - s * 0.08, s * 0.035, 0, Math.PI * 2);
    g.fill();
  }
  if (elder) {
    // A walking stick.
    g.strokeStyle = "#6b4a1c";
    g.lineWidth = Math.max(1, s * 0.05);
    g.beginPath();
    g.moveTo(x + s * 0.22, top + s * 0.18);
    g.lineTo(x + s * 0.25, y);
    g.stroke();
  }

  if (role === "datu") {
    // The datu: a red putong with its end standing up, a finer kanggan trimmed in gold, gold
    // ornaments (above). A woman datu wears the red cloth over her hair and a red baro.
    g.fillStyle = "#b91c1c";
    g.fillRect(hx - s * 0.16, top - s * 0.25, s * 0.32, s * 0.09);
    g.beginPath();
    g.moveTo(hx + s * 0.12, top - s * 0.24);
    g.lineTo(hx + s * 0.27, top - s * 0.36);
    g.lineTo(hx + s * 0.17, top - s * 0.15);
    g.fill();
    g.fillStyle = "#facc15";
    g.fillRect(hx - s * 0.16, top - s * 0.18, s * 0.32, s * 0.025);
    g.fillRect(x - s * 0.17 + lean, top + s * 0.33, s * 0.34, s * 0.04);
    g.fillRect(x - s * 0.02 + lean, top, s * 0.04, s * 0.36);
  } else if (role === "envoy") {
    // An envoy carries a gift bundle.
    g.fillStyle = "#a16207";
    g.fillRect(x + s * 0.14, top + s * 0.08, s * 0.14, s * 0.14);
  } else if (role === "warrior" || role === "defender" || role === "ally") {
    // A putong (head cloth: red for the barangay's own, blue for another's, gold for allies) and a spear.
    g.fillStyle = role === "defender" ? "#1d4ed8" : role === "ally" ? "#ca8a04" : "#b91c1c";
    g.fillRect(x - s * 0.14, top - s * 0.2, s * 0.28, s * 0.06);
    g.strokeStyle = "#6b4a1c";
    g.lineWidth = Math.max(1, s * 0.05);
    g.beginPath();
    g.moveTo(x + s * 0.24, y - s * 0.05);
    g.lineTo(x + s * 0.24, top - s * 0.4);
    g.stroke();
    g.fillStyle = "#d6d3d1";
    g.beginPath();
    g.moveTo(x + s * 0.24, top - s * 0.55);
    g.lineTo(x + s * 0.3, top - s * 0.38);
    g.lineTo(x + s * 0.18, top - s * 0.38);
    g.fill();
  } else if (raider) {
    // A red head cloth, a long shield and a blade.
    g.fillStyle = "#dc2626";
    g.fillRect(x - s * 0.14, top - s * 0.2, s * 0.28, s * 0.06);
    g.fillStyle = "#78350f";
    g.beginPath();
    g.ellipse(x - s * 0.24, top + s * 0.2, s * 0.08, s * 0.24, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#e7e5e4";
    g.lineWidth = Math.max(1, s * 0.05);
    g.beginPath();
    g.moveTo(x + s * 0.2, top + s * 0.25);
    g.lineTo(x + s * 0.32, top - s * 0.15);
    g.stroke();
    if (role === "looter") {
      g.fillStyle = "#a16207";
      g.beginPath();
      g.arc(x + s * 0.05, top + s * 0.05, s * 0.14, 0, Math.PI * 2);
      g.fill();
    }
  } else if (role === "leaving") {
    // A bundle on the back.
    g.fillStyle = "#a16207";
    g.beginPath();
    g.arc(x - s * 0.2, top + s * 0.1, s * 0.13, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

/** A boat seen from above, pointing along `heading`: a bangka with outriggers, or a karakoa. */
export function drawBoat(g: CanvasRenderingContext2D, x: number, y: number, tile: number, heading: number, kind: "bangka" | "karakoa" | "balangay", t: number) {
  const L = tile * (kind === "karakoa" ? 1.7 : kind === "balangay" ? 1.4 : 0.95);
  const W = tile * (kind === "karakoa" ? 0.34 : kind === "balangay" ? 0.3 : 0.22);
  g.save();
  g.translate(x, y);
  g.rotate(heading);
  // Outrigger floats on both sides.
  g.strokeStyle = "#5b3a1a";
  g.lineWidth = Math.max(1, tile * 0.04);
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(-L * 0.35, side * W * 1.6);
    g.lineTo(L * 0.35, side * W * 1.6);
    g.moveTo(-L * 0.12, 0);
    g.lineTo(-L * 0.12, side * W * 1.6);
    g.moveTo(L * 0.12, 0);
    g.lineTo(L * 0.12, side * W * 1.6);
    g.stroke();
  }
  // The hull, pointed at both ends.
  g.fillStyle = kind === "karakoa" ? "#7c2d12" : "#6b4423";
  g.beginPath();
  g.moveTo(-L / 2, 0);
  g.quadraticCurveTo(0, -W, L / 2, 0);
  g.quadraticCurveTo(0, W, -L / 2, 0);
  g.fill();
  if (kind === "karakoa") {
    // Painted bands, a row of paddlers and a banner at the stern.
    g.strokeStyle = "#fbbf24";
    g.lineWidth = Math.max(1, tile * 0.03);
    g.beginPath();
    g.moveTo(-L * 0.4, 0);
    g.lineTo(L * 0.4, 0);
    g.stroke();
    g.fillStyle = "#1c1410";
    for (let i = -3; i <= 3; i++) {
      g.beginPath();
      g.arc(i * L * 0.1, Math.sin(t * 6 + i) * W * 0.15, W * 0.22, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#dc2626";
    g.fillRect(-L * 0.5, -W * 1.4, W * 0.9, W * 0.6);
  } else {
    // A small sail and one paddler.
    g.fillStyle = "#f5e6c8";
    g.beginPath();
    g.moveTo(L * 0.05, 0);
    g.lineTo(-L * 0.25, -W * 1.5);
    g.lineTo(-L * 0.25, W * 0.2);
    g.fill();
    g.fillStyle = "#1c1410";
    g.beginPath();
    g.arc(L * 0.25, 0, W * 0.3, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/**
 * A Tulay's deck, drawn over a boat passing underneath. Matches the map's bridge-tile look:
 * bamboo planks between two dark rails.
 */
function drawDeck(g: CanvasRenderingContext2D, x: number, y: number, tile: number, dir: "h" | "v") {
  const across = tile * 0.72;
  const off = tile * 0.14;
  // A hair over the tile's length so neighbouring pieces meet without a seam.
  const [dx, dy, w, h] = dir === "h" ? [x - 0.5, y + off, tile + 1, across] : [x + off, y - 0.5, across, tile + 1];
  g.fillStyle = "rgb(0 0 0 / 0.3)";
  g.fillRect(dx + (dir === "v" ? 2 : 0), dy + (dir === "h" ? 2 : 0), w, h);
  g.fillStyle = "#d8bb6c";
  g.fillRect(dx, dy, w, h);
  g.fillStyle = "#6b4a1c";
  if (dir === "h") {
    g.fillRect(dx, dy, w, h * 0.1);
    g.fillRect(dx, dy + h * 0.9, w, h * 0.1);
  } else {
    g.fillRect(dx, dy, w * 0.1, h);
    g.fillRect(dx + w * 0.9, dy, w * 0.1, h);
  }
  g.fillStyle = "rgb(90 60 20 / 0.45)";
  for (let i = 0; i < 5; i++) {
    if (dir === "h") g.fillRect(x + (tile * i) / 4.5, dy, Math.max(1, tile * 0.03), h);
    else g.fillRect(dx, y + (tile * i) / 4.5, w, Math.max(1, tile * 0.03));
  }
}

/** Flashes of blades where the two sides meet. */
export function drawSparks(g: CanvasRenderingContext2D, x: number, y: number, tile: number, t: number) {
  const beat = Math.floor(t * 6);
  g.strokeStyle = "#fde047";
  g.lineWidth = Math.max(1, tile * 0.04);
  for (let i = 0; i < 3; i++) {
    const a = ((beat * 7 + i * 13) % 17) / 17;
    const sx = x + (a - 0.5) * tile * 0.9;
    const sy = y - tile * 0.25 + (((beat * 5 + i * 3) % 7) / 7 - 0.5) * tile * 0.5;
    const r = tile * 0.09;
    g.beginPath();
    g.moveTo(sx - r, sy);
    g.lineTo(sx + r, sy);
    g.moveTo(sx, sy - r);
    g.lineTo(sx, sy + r);
    g.stroke();
  }
}

/**
 * The villager canvas. Pointer events pass straight through to the map. With reduced motion,
 * villagers stand still at their spots and the canvas only redraws when the game changes.
 */
/** Finds the named villager drawn at a point of the map view (px), or null. */
export type NamedHit = (x: number, y: number) => Tapped | null;

export function VillagerLayer(props: {
  state: GameState;
  content: Content;
  cam: Camera;
  view: View;
  reducedMotion: boolean;
  clash?: Clash | null;
  /** Set to a hit test for the named villagers as they're drawn. */
  hitRef?: { current: NamedHit | null };
  /** Filled with the villagers carrying torches at night (tile coordinates), for the night's lights. */
  torches?: { current: Point[] };
}) {
  const { state, content, cam, view, reducedMotion, clash = null, hitRef, torches } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ state, cam, view, clash });
  latest.current = { state, cam, view, clash };
  // Trade boat and raid shown last frame, for boats casting off and raiders going home.
  const boat = useRef<{
    from: string;
    top: boolean;
    leftAt?: number;
    p?: Point;
    heading?: number;
    /** Waiting offshore during a raid: where it set out from and when, then when it turned back. */
    hold?: { from: Point; at: number; backFrom?: Point; backAt?: number };
  } | null>(null);
  // When the last raid ended (its warning), so a waiting boat comes back after the clash.
  const raidEnded = useRef<number | null>(null);
  const raid = useRef<RaidMemory | null>(null);
  const river = useRef<{ map: GameState["map"] | null; path: Point[] }>({ map: null, path: [] });
  const sprites = useRef(new Map<number, Villager>());
  const leavers = useRef<Leaver[]>([]);
  // The datu walking their rounds, envoys coming to the Bahay ng Datu, and mourning markers.
  const datu = useRef<Villager | null>(null);
  // The datu's attendants (walking with the datu) and spouse (by the house and at gatherings).
  const household = useRef<Villager[]>([]);
  /** Where the datu, attendants and spouse stand right now (map tiles), for tapping them. */
  const householdSpots = useRef<{ datu: Point; attendants: (Point | undefined)[]; spouse?: Point } | null>(null);
  const envoys = useRef<{ key: string; walkers: Villager[] } | null>(null);
  const markers = useRef<{ p: Point; until: number }[]>([]);
  const allyRoutes = useRef(new Map<string, Point[]>());
  const before = useRef<GameState | null>(null);
  const started = useRef(false);
  const planned = useRef<{ state: GameState | null; rally: string; plans: VillagerPlan[]; named: Map<number, NamedVillager> }>({ state: null, rally: "", plans: [], named: new Map() });

  // Families leaving (hunger, or a demolished house) walk off the map with their bundles.
  useEffect(() => {
    const prev = before.current;
    before.current = state;
    if (!prev) return;
    const was = presentVillagers(prev);
    const now = presentVillagers(state);
    if (now >= was || reducedMotion) return;
    const goingAway = isHungry(prev) || state.hunger > 0 || overcrowded(prev, content) > 0;
    // Those who died: the sprite stops, and a small mourning marker stays a while. No one walks off.
    let died = Math.max(0, state.stats.deaths - prev.stats.deaths);
    for (let k = now; k < was; k++) {
      const id = Math.min(k, MAX_SPRITES - 1);
      const from = sprites.current.get(id);
      if (k < MAX_SPRITES) sprites.current.delete(id);
      if (died > 0) {
        died--;
        markers.current.push({ p: from ? { ...from.p } : houseFront(state, content), until: performance.now() + MARKER_MS });
        continue;
      }
      if (!goingAway || !from || leavers.current.length > 12) continue;
      // Off the map by the nearest walkable edge, never across the river.
      const edge = edgeTile(state.map, from.p);
      const off = exitPoint({ x: edge.x + 0.5, y: edge.y + 0.5 }, state.map);
      leavers.current.push({ id: id + 1000 + leavers.current.length, p: { ...from.p }, moving: true, stride: 0, to: off, walker: { ...newWalker(from.p), route: [] } });
    }
  }, [state.villagers, state.warriors, state.stats.deaths, reducedMotion]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const g = el.getContext("2d");
    if (!g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // What the canvas showed last time, to skip redrawing a scene where nothing moves.
    let shown = "";
    // The canvas only covers the area the villagers are in (snapped to a grid so it rarely
    // changes size), so each frame the browser uploads a small patch, not the whole screen.
    let area = { x0: 0, y0: 0, x1: 0, y1: 0 };

    const draw = (dt: number, t: number) => {
      const { state: s, cam: c, view: v, clash: fight } = latest.current;
      const o = origin(c, v);
      const T = c.tile;
      // Plans only change when the game does (ten times a second), not every frame.
      // Warriors go to the landing while a raid is coming and while the battle there plays out.
      const rally = s.region?.incomingRaid ? raidLanding(s, content) : raid.current && raid.current.retreatAt === undefined ? raid.current.landing : null;
      const rallyKey = rally ? `${rally.x},${rally.y}` : "";
      if (planned.current.state !== s || planned.current.rally !== rallyKey) {
        const plans = planVillagers(s, content, undefined, rally);
        planned.current = { state: s, rally: rallyKey, plans, named: namedSprites(plans, s, content) };
      }
      const { plans, named } = planned.current;
      const spots: { x: number; y: number; v: Tapped }[] = [];
      const typeAt = new Map(s.buildings.map((b) => [`${b.x},${b.y}`, b.type]));
      // The game's own night (rules.dayNight), the same clock as the map's tint. Each villager
      // keeps their own moment (a few seconds apart), so they don't all head home at once.
      const nightFor = (id: number) => isNightAt(content, s.time + ((id * 7919) % 17) - 8);
      const eveningFor = (id: number) => isEveningAt(content, s.time + ((id * 7919) % 17) - 8);
      const night = isNightAt(content, s.time);
      // Buildings are solid: routes go around them to the doorways.
      const blocked = solidTiles(s, content);
      const lit: Point[] = [];
      const hungry = isHungry(s);
      const roadSpeed = content.rules.roads.walkSpeedPercent / 100;
      const visible = (p: Point) => {
        const x = o.x + p.x * T;
        const y = o.y + p.y * T;
        return x > -T && y > -T && x < v.w + T && y < v.h + T ? { x, y } : null;
      };
      // Where a person is drawn: never on open river or sea (only on land or a Tulay; boat crews
      // are drawn inside their boats by drawBoat). Walks follow the A* routes already; this is the
      // last guard for spreads and offsets near a bank.
      const person = (p: Point) => visible(keepOnLand(s.map, p));

      // Layers, bottom to top: boats (0), bridge decks over them (1), everything on land (2).
      const drawn: { x: number; y: number; r?: number; layer?: number; f: () => void }[] = [];
      let animating = leavers.current.length > 0;

      // ---- Visitors: trade boats and raiders, from the region's offer and raid ----
      if (river.current.map !== s.map) river.current = { map: s.map, path: riverPath(s.map) };
      const path = river.current.path;
      const now = performance.now();
      const plaza = s.map.plaza;
      // In front of the Bahay ng Datu's doorway: where the datu stands and envoys come.
      const front = houseFront(s, content);
      if (path.length > 2) {
        const offer = s.region?.offer ?? null;
        const offers = content.rules.diplomacy.offers;
        // Trading pauses during a raid: the bangka waits offshore, out of the raiders' way, until
        // the raid and its clash are over, then comes back.
        if (s.region?.incomingRaid) raidEnded.current = null;
        else if (raid.current && raidEnded.current === null) raidEnded.current = now;
        const held = !!s.region?.incomingRaid || (raidEnded.current !== null && now < raidEnded.current + CLASH_MS);
        if (offer && held && !reducedMotion) {
          const top = fromTop(content, offer.from);
          const b0 = boat.current?.from === offer.from && !boat.current.leftAt ? boat.current : null;
          const start = b0?.p ?? boatArriving(path, plaza, top, 0).p;
          const hold = b0?.hold && !b0.hold.backAt ? b0.hold : { from: start, at: now };
          const out = riverLine(path, hold.from, waitIndex(path, raidLanding(s, content) ?? raid.current?.landing ?? null));
          const at = along(out, Math.min(1, (now - hold.at) / 1000 / LEAVE_SECONDS));
          boat.current = { from: offer.from, top, p: at.p, heading: at.heading, hold };
          animating = true;
        } else if (offer) {
          const top = fromTop(content, offer.from);
          const since = s.time - (offer.expiresAt - offers.expireSeconds);
          const where = boatArriving(path, plaza, top, reducedMotion ? Infinity : since);
          const b0 = boat.current?.from === offer.from && !boat.current.leftAt ? boat.current : null;
          if (b0?.hold && !reducedMotion) {
            // Coming back from waiting offshore.
            b0.hold.backAt ??= now;
            b0.hold.backFrom ??= b0.p ?? where.p;
            const back = [...riverLine(path, b0.hold.backFrom, nearestIndex(path, where.p)), where.p];
            const f = (now - b0.hold.backAt) / BOAT_RETURN_MS;
            const at = along(back, Math.min(1, f));
            boat.current = { ...b0, p: at.p, heading: at.heading, hold: f < 1 ? b0.hold : undefined };
            animating = true;
          } else {
            const prev = b0?.p;
            // Ease toward the target: the game moves ten times a second, the canvas thirty.
            const p = prev && !reducedMotion ? { x: prev.x + (where.p.x - prev.x) * Math.min(1, dt * 8), y: prev.y + (where.p.y - prev.y) * Math.min(1, dt * 8) } : where.p;
            boat.current = { from: offer.from, top, p, heading: where.heading };
            if (!where.docked) animating = true;
          }
        } else if (boat.current && !reducedMotion) {
          boat.current.leftAt ??= now;
          const away = boatLeaving(path, plaza, boat.current.top, (now - boat.current.leftAt) / 1000);
          if (away) {
            boat.current.p = away.p;
            boat.current.heading = away.heading;
            animating = true;
          } else boat.current = null;
        } else boat.current = null;
        const b = boat.current;
        const bp = b?.p && visible(b.p);
        if (b && bp) drawn.push({ x: bp.x, y: bp.y, r: T * 0.7, layer: 0, f: () => drawBoat(g, bp.x, bp.y, T, b.heading ?? Math.PI / 2, "bangka", t) });

        const incoming = s.region?.incomingRaid ?? null;
        const warning = content.rules.diplomacy.aiRaid.warningSeconds;
        let scene: { karakoa: { p: Point; heading: number } | null; raiders: Point[]; look: Look; sparks: Point | null } | null = null;
        const landingNow = incoming ? raidLanding(s, content) : null;
        if (incoming && landingNow) {
          // The warning: the karakoa sails in and beaches beside the landing, and the raiders
          // wait there. The warriors walk out to meet them (see planVillagers' rally).
          const top = fromTop(content, incoming.from);
          const warriors = s.region?.neighbors.find((n) => n.id === incoming.from)?.state.warriors ?? 3;
          raid.current = { from: incoming.from, top, landing: landingNow, count: raiderCount(warriors), sail: sailToLanding(path, landingNow, top), loot: null };
          const progress = reducedMotion ? 1 : Math.min(1, Math.max(0, 1 - (incoming.strikeAt - s.time) / warning));
          const ashore = progress >= LANDING_SHARE;
          scene = { karakoa: along(raid.current.sail, progress / LANDING_SHARE), raiders: ashore ? bandAt(landingNow, raid.current.count) : [], look: "raider", sparks: null };
          animating = !reducedMotion;
        } else if (raid.current && !reducedMotion) {
          const r = raid.current;
          r.struckAt ??= now;
          const beached = along(r.sail, 1);
          const band = bandAt(r.landing, r.count);
          if (fight && now < fight.until) {
            // The clash, at the landing: both sides lunge back and forth.
            r.win = fight.win;
            scene = {
              karakoa: beached,
              raiders: band.map((p, i) => ({ x: p.x + Math.sin(t * 11 + i * 2) * 0.12, y: p.y + Math.cos(t * 9 + i) * 0.06 })),
              look: "raider",
              sparks: { x: r.landing.x + 0.5, y: r.landing.y + 0.3 },
            };
          } else if (!fight && r.retreatAt === undefined && now - r.struckAt < 600) {
            // The report is on its way; hold the line for a moment.
            scene = { karakoa: beached, raiders: band, look: "raider", sparks: null };
          } else {
            r.retreatAt ??= now;
            const since = (now - r.retreatAt) / 1000;
            if (r.win === false) {
              // They won: a short walk in to the fields (or a Kamalig, once there is one), then back to the boat with the loot.
              r.loot ??= lootWalk(s.map, r.landing, lootTarget(s, content, r.landing)) ?? [];
              const walkSeconds = Math.max(1, r.loot.length / LOOT_WALK_SPEED);
              const out = since / walkSeconds;
              const back = (since - walkSeconds - LOOT_PAUSE) / walkSeconds;
              if (r.loot.length > 1 && out < 1) {
                scene = { karakoa: beached, raiders: spread(along(r.loot, out).p, r.count), look: "raider", sparks: null };
              } else if (r.loot.length > 1 && back < 0) {
                scene = { karakoa: beached, raiders: spread(r.loot[r.loot.length - 1], r.count), look: "looter", sparks: null };
              } else if (r.loot.length > 1 && back < 1) {
                scene = { karakoa: beached, raiders: spread(along([...r.loot].reverse(), back).p, r.count), look: "looter", sparks: null };
              } else {
                const leave = (since - (r.loot.length > 1 ? 2 * walkSeconds + LOOT_PAUSE : 0)) / LEAVE_SECONDS;
                if (leave < 1) scene = { karakoa: along([...r.sail].reverse(), leave), raiders: [], look: "raider", sparks: null };
                else raid.current = null;
              }
            } else {
              // Beaten: they run back to the landing and climb into the boat (drawn inside it), then row away.
              const run = since / FLEE_SECONDS;
              if (run < 1) {
                const to = { x: r.landing.x + 0.5, y: r.landing.y + 0.5 };
                scene = { karakoa: beached, raiders: band.map((p) => ({ x: p.x + (to.x - p.x) * run, y: p.y + (to.y - p.y) * run })), look: "raider", sparks: null };
              } else if (run < 1 + LEAVE_SECONDS / FLEE_SECONDS) {
                scene = { karakoa: along([...r.sail].reverse(), (since - FLEE_SECONDS) / LEAVE_SECONDS), raiders: [], look: "raider", sparks: null };
              } else raid.current = null;
            }
          }
          animating = true;
        } else raid.current = null;
        if (scene) {
          const k = scene.karakoa && visible(scene.karakoa.p);
          if (k && scene.karakoa) {
            const heading = scene.karakoa.heading;
            drawn.push({ x: k.x, y: k.y, r: T * 1.1, layer: 0, f: () => drawBoat(g, k.x, k.y, T, heading, "karakoa", t) });
          }
          scene.raiders.forEach((p, i) => {
            const at = person(p);
            const look = scene!.look;
            const sprite: Sprite = { p, moving: !reducedMotion && !scene!.sparks, stride: t * 9 + i };
            if (at) drawn.push({ x: at.x, y: at.y, f: () => drawPerson(g, at.x, at.y, T, 2000 + i, look, sprite, t) });
          });
          const sp = scene.sparks && visible(scene.sparks);
          if (sp) drawn.push({ x: sp.x, y: sp.y + T, r: T * 0.8, f: () => drawSparks(g, sp.x, sp.y, T, t) });
        }
      }

      // ---- Allies coming to the landing during a raid warning: on foot from the map's edge,
      // or by boat from the sea. Only those who will make it in time are shown. ----
      const raidNow = s.region?.incomingRaid ?? null;
      const landAt = raidNow ? raidLanding(s, content) : null;
      if (raidNow && landAt) {
        const warning = content.rules.diplomacy.aiRaid.warningSeconds;
        const elapsed = Math.max(0, warning - (raidNow.strikeAt - s.time));
        const target = { x: landAt.x + 0.5, y: landAt.y + 0.5 };
        alliedDefenders(s, content)
          .filter((a) => a.arrives && a.eta !== null)
          .forEach((a, k) => {
            const f = reducedMotion ? 1 : Math.min(1, elapsed / Math.max(1, a.eta!));
            if (f < 1) animating = true;
            if (a.by === "sea") {
              // Rowed in from the sea edge below the map.
              const from = { x: target.x + (k % 2 ? 2 : -2), y: s.map.height + 1.5 };
              const at = { x: from.x + (target.x - from.x) * f, y: from.y + (target.y + 0.6 - from.y) * f };
              const v = visible(at);
              if (v && f < 1) drawn.push({ x: v.x, y: v.y, r: T * 0.7, layer: 0, f: () => drawBoat(g, v.x, v.y, T, -Math.PI / 2, "bangka", t) });
              if (f < 1) return;
            }
            const key = `${a.id}:${landAt.x},${landAt.y}`;
            let route = allyRoutes.current.get(key);
            if (!route) {
              const edge = edgeTile(s.map, target);
              route = routeTo(s.map, { x: edge.x + 0.5, y: edge.y + 0.5 }, target) ?? [target];
              allyRoutes.current.set(key, route);
            }
            const shown = Math.min(3, a.warriors);
            for (let i = 0; i < shown; i++) {
              const p = a.by === "sea" ? { x: target.x + (i - 1) * 0.22, y: target.y + 0.15 } : along([{ x: route[0].x, y: route[0].y }, ...route], f).p;
              const pos = { x: p.x + (i - 1) * 0.18, y: p.y + (i % 2) * 0.12 };
              const v = person(pos);
              const sprite = { p: pos, moving: f < 1, stride: t * 9 + i + k };
              if (v) drawn.push({ x: v.x, y: v.y, f: () => drawPerson(g, v.x, v.y, T, 9500 + k * 3 + i, "warrior", sprite, t) });
            }
          });
      } else if (allyRoutes.current.size) allyRoutes.current.clear();

      const seen = new Set<number>();
      for (const plan of plans) {
        seen.add(plan.id);
        const target = goal(plan, t, nightFor(plan.id), s.map.plaza, hungry, eveningFor(plan.id));
        const to = target.p;
        let sp = sprites.current.get(plan.id);
        if (!sp) {
          // On first draw everyone is already in place; later arrivals walk in from the map's edge.
          const edge = edgeTile(s.map, to);
          const start = started.current && !reducedMotion ? { x: edge.x + 0.5, y: edge.y + 0.5 } : to;
          sp = { p: start, moving: false, stride: plan.id, walker: newWalker(start) };
          sprites.current.set(plan.id, sp);
        }
        if (reducedMotion) {
          sp.p = to;
          sp.moving = false;
        } else {
          // Along the A* route: on land and bridges only, faster on Daan.
          sp.walker = stepWalker({ ...sp.walker, p: sp.p }, to, s.map, speedOf(plan), dt, roadSpeed, blocked);
          sp.p = sp.walker.p;
          sp.moving = sp.walker.moving;
          if (sp.moving) sp.stride += dt * 9 * (speedOf(plan) / SPEED.work);
        }
        // Going in: they fade into the doorway once there; coming out, they fade back in.
        const goingIn = target.inside && !sp.moving;
        const fade = reducedMotion ? 1 : dt / 0.45;
        sp.alpha = Math.min(1, Math.max(0, (sp.alpha ?? (goingIn ? 0 : 1)) + (goingIn ? -fade : fade)));
        if (sp.alpha <= 0) continue;
        if (sp.alpha < 1) animating = true;
        // A few carry torches when out in the dark.
        if (night && carriesTorch(plan) && !goingIn) lit.push({ x: sp.p.x, y: sp.p.y - 0.25 });
        const at = person(sp.p);
        if (!at) continue;
        const sprite = sp;
        const alpha = sp.alpha;
        const torch = night && carriesTorch(plan) && !goingIn;
        // Walking legs, or a worker bobbing at their post.
        if (!reducedMotion && (sp.moving || plan.role === "work")) animating = true;
        const who = named.get(plan.id);
        // A named villager always looks like themselves: their own gender, never a child.
        const look: Appearance | undefined = who && plan.look ? { ...plan.look, gender: namedGender(content, who, s.map.seed), age: plan.look.age === "child" ? "adult" : plan.look.age } : plan.look;
        drawn.push({
          x: at.x,
          y: at.y,
          f: () => {
            drawPerson(g, at.x, at.y, T, plan.id, plan.role, sprite, t, alpha, look);
            if (torch) drawTorch(g, at.x, at.y, T, t, reducedMotion);
            if (who) drawStar(g, at.x, at.y, T);
          },
        });
        spots.push({
          x: at.x,
          y: at.y,
          v: { named: who ?? null, look: look ?? { gender: "man", age: "adult", malong: false }, role: plan.role, place: plan.place && plan.role === "work" ? (typeAt.get(`${plan.place.x},${plan.place.y}`) ?? null) : null },
        });
      }
      for (const id of sprites.current.keys()) if (!seen.has(id)) sprites.current.delete(id);
      if (torches) torches.current = lit;
      if (hitRef) {
        const r = Math.max(10, T * 0.4);
        hitRef.current = (x, y) => {
          let best: { d: number; v: Tapped } | null = null;
          // The datu's household (where they stood last frame).
          const hh = householdSpots.current;
          const homeOf = householdOf(s, content);
          const malong = content.traditions.find((q) => q.id === s.tradition)?.dress === "malong";
          const extra: { x: number; y: number; v: Tapped }[] = [];
          const add = (p: Point | undefined, v: Tapped) => p && extra.push({ x: o.x + p.x * T, y: o.y + p.y * T, v });
          if (hh) {
            add(hh.datu, { named: null, look: { gender: homeOf.datuGender, age: "adult", cls: "nobility", malong }, role: "datu", place: null });
            add(hh.spouse, { named: null, look: { gender: homeOf.spouse.gender, age: "adult", cls: "nobility", malong }, role: "spouse", place: null });
            hh.attendants.forEach((p, k) => add(p, { named: null, look: { gender: k ? "woman" : "man", age: "adult", cls: "dependent", malong }, role: "attendant", place: null }));
          }
          // Named villagers win a close call (they have a story to tell).
          for (const sp of [...extra, ...spots]) {
            // The body is above the feet (the sprite's position).
            const d = Math.hypot(sp.x - x, sp.y - Math.max(7, T * 0.32) * 0.5 - y) - (sp.v.named ? r * 0.3 : 0);
            if (d <= r && (!best || d < best.d)) best = { d, v: sp.v };
          }
          return best?.v ?? null;
        };
      }

      leavers.current = leavers.current.filter((l) => {
        // Walk to the edge tile over land, then step off the map.
        const edge = edgeTile(s.map, l.to);
        const atEdge = Math.floor(l.p.x) === edge.x && Math.floor(l.p.y) === edge.y;
        l.walker = stepWalker({ ...l.walker, p: l.p }, atEdge ? l.to : { x: edge.x + 0.5, y: edge.y + 0.5 }, s.map, SPEED.leaving, dt, roadSpeed, blocked);
        if (atEdge && !l.walker.route.length && Math.hypot(l.p.x - l.to.x, l.p.y - l.to.y) > 0.01) {
          // Off the map: plain steps (the route planner only knows tiles on the map).
          const d = Math.hypot(l.to.x - l.p.x, l.to.y - l.p.y);
          const m = Math.min(d, SPEED.leaving * dt);
          l.walker = { ...l.walker, p: { x: l.p.x + ((l.to.x - l.p.x) / d) * m, y: l.p.y + ((l.to.y - l.p.y) / d) * m }, moving: d > m };
        }
        const step = { p: l.walker.p, moving: l.walker.moving || Math.hypot(l.walker.p.x - l.to.x, l.walker.p.y - l.to.y) > 0.01 };
        l.p = step.p;
        l.moving = step.moving;
        l.stride += dt * 9;
        const at = person(l.p);
        if (at) drawn.push({ x: at.x, y: at.y, f: () => drawPerson(g, at.x, at.y, T, l.id, "leaving", l, t) });
        return step.moving;
      });

      // ---- The datu: from the plaza to the fields, the Dambana and back; at the plaza by night ----
      {
        const fields = s.buildings.filter((b) => (content.buildings.find((d) => d.id === b.type)?.produces?.rice ?? 0) > 0);
        const shrine = s.buildings.find((b) => content.buildings.find((d) => d.id === b.type)?.shrine);
        const stops: Point[] = [plaza, ...(fields.length ? [fields[0]] : []), ...(shrine ? [shrine] : []), plaza];
        const leg = Math.floor(t / 25) % stops.length;
        const stop = night ? plaza : stops[leg];
        // At the house: in front of its doorway, never on it (plaza.ts).
        const to = stop === plaza ? front : { x: stop.x + 0.5, y: stop.y + 0.7 };
        const d0 = datu.current ?? { p: to, moving: false, stride: 0, walker: newWalker(to) };
        if (reducedMotion) {
          d0.p = to;
          d0.moving = false;
        } else {
          d0.walker = stepWalker({ ...d0.walker, p: d0.p }, to, s.map, SPEED.idle, dt, roadSpeed, blocked);
          d0.p = d0.walker.p;
          d0.moving = d0.walker.moving;
          if (d0.moving) {
            d0.stride += dt * 9;
            animating = true;
          }
        }
        datu.current = d0;
        const home = householdOf(s, content);
        const malong = content.traditions.find((x) => x.id === s.tradition)?.dress === "malong";
        const datuLook: Appearance = { gender: home.datuGender, age: "adult", cls: "nobility", malong };
        const at = person(d0.p);
        if (at) drawn.push({ x: at.x, y: at.y, f: () => drawPerson(g, at.x, at.y, T, 9000, "datu", d0, t, 1, datuLook) });
        // Two attendants a step behind the datu, and the spouse: in front of the house, now and
        // then at the gathering spots, by the fire at night.
        const gathering = gatheringSpots(s, content);
        const spouseTo = night || Math.floor(t / 40) % 3 !== 2 ? { x: front.x + 0.55, y: front.y + 0.05 } : (gathering.spots[1] ?? gathering.spots[0] ?? front);
        // Never onto a building or the house: then they stand by the datu.
        const free = (q: Point) => (blocked[Math.floor(q.y) * s.map.width + Math.floor(q.x)] || !onLand(s.map, q) ? { x: d0.p.x, y: d0.p.y + 0.15 } : q);
        const targets = [free({ x: d0.p.x - 0.32, y: d0.p.y + 0.12 }), free({ x: d0.p.x + 0.32, y: d0.p.y + 0.14 }), spouseTo];
        const looks: [Look, Appearance][] = [
          ["attendant", { gender: "man", age: "adult", cls: "dependent", malong }],
          ["attendant", { gender: "woman", age: "adult", cls: "dependent", malong }],
          ["spouse", { gender: home.spouse.gender, age: "adult", cls: "nobility", malong }],
        ];
        targets.forEach((to2, k) => {
          const h = household.current[k] ?? { p: { ...to2 }, moving: false, stride: k, walker: newWalker(to2) };
          if (reducedMotion) h.p = to2;
          else {
            h.walker = stepWalker({ ...h.walker, p: h.p }, to2, s.map, k < 2 ? SPEED.idle * 1.1 : SPEED.idle, dt, roadSpeed, blocked);
            h.p = h.walker.p;
            h.moving = h.walker.moving;
            if (h.moving) {
              h.stride += dt * 9;
              animating = true;
            }
          }
          household.current[k] = h;
          const v = person(h.p);
          const [role, lk] = looks[k];
          if (v) drawn.push({ x: v.x, y: v.y, f: () => drawPerson(g, v.x, v.y, T, 9010 + k, role, h, t, 1, lk) });
        });
        householdSpots.current = { datu: d0.p, attendants: [household.current[0]?.p, household.current[1]?.p], spouse: household.current[2]?.p };
      }
      // ---- Envoys (Bahay ng Datu level 2+): from the docked bangka to the house, visual only ----
      const offerNow = s.region?.offer ?? null;
      const docked = offerNow && boat.current && !boat.current.leftAt && !boat.current.hold && hasDatuUnlock(s, content, "envoys");
      if (docked && path.length > 2) {
        const key = `${offerNow.from}@${offerNow.expiresAt}`;
        // They step off the bangka onto the bank (the nearest land to where it docks).
        const start = keepOnLand(s.map, dockPoint(path, plaza));
        if (envoys.current?.key !== key) envoys.current = { key, walkers: [0, 1].map((i) => ({ p: { x: start.x + i * 0.2, y: start.y }, moving: true, stride: i, walker: newWalker({ x: start.x + i * 0.2, y: start.y }) })) };
        envoys.current.walkers.forEach((w, i) => {
          const to = { x: front.x - 0.25 + i * 0.5, y: front.y };
          if (reducedMotion) w.p = to;
          else {
            w.walker = stepWalker({ ...w.walker, p: w.p }, to, s.map, SPEED.work, dt, roadSpeed, blocked);
            w.p = w.walker.p;
            w.moving = w.walker.moving;
            if (w.moving) {
              w.stride += dt * 9;
              animating = true;
            }
          }
          const at = person(w.p);
          if (at) drawn.push({ x: at.x, y: at.y, f: () => drawPerson(g, at.x, at.y, T, 9100 + i, "envoy", w, t) });
        });
      } else envoys.current = null;
      // ---- Mourning markers where someone died ----
      markers.current = markers.current.filter((m) => m.until > now);
      for (const m of markers.current) {
        const at = visible(m.p);
        if (at) drawn.push({ x: at.x, y: at.y, f: () => drawMarker(g, at.x, at.y, T) });
      }
      if (markers.current.length) animating = true;

      started.current = true;
      const scene = `${o.x},${o.y},${T},${v.w},${v.h},${night},${drawn.length}`;
      if (!animating && scene === shown) return;
      shown = animating ? "" : scene;
      const pad = Math.max(7, T * 0.32) * 1.2;
      const box = drawn.reduce(
        (b, d) => {
          const r = d.r ?? pad;
          return { x0: Math.min(b.x0, d.x - r), y0: Math.min(b.y0, d.y - r * 1.4), x1: Math.max(b.x1, d.x + r), y1: Math.max(b.y1, d.y + r) };
        },
        { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
      );
      const inside = box.x0 >= area.x0 && box.y0 >= area.y0 && box.x1 <= area.x1 && box.y1 <= area.y1;
      const tooBig = (area.x1 - area.x0) * (area.y1 - area.y0) > 4 * Math.max(GRID * GRID, (box.x1 - box.x0) * (box.y1 - box.y0));
      if (drawn.length && (!inside || tooBig)) {
        const snap = (n: number, up: boolean) => (up ? Math.ceil(n / GRID) : Math.floor(n / GRID)) * GRID;
        area = {
          x0: Math.max(0, snap(box.x0 - GRID / 2, false)),
          y0: Math.max(0, snap(box.y0 - GRID / 2, false)),
          x1: Math.min(snap(v.w, true), snap(box.x1 + GRID / 2, true)),
          y1: Math.min(snap(v.h, true), snap(box.y1 + GRID / 2, true)),
        };
        el.width = Math.max(1, Math.round((area.x1 - area.x0) * dpr));
        el.height = Math.max(1, Math.round((area.y1 - area.y0) * dpr));
        el.style.transform = `translate(${area.x0}px, ${area.y0}px)`;
        el.style.width = `${area.x1 - area.x0}px`;
        el.style.height = `${area.y1 - area.y0}px`;
      }
      g.setTransform(dpr, 0, 0, dpr, -area.x0 * dpr, -area.y0 * dpr);
      g.clearRect(area.x0, area.y0, area.x1 - area.x0, area.y1 - area.y0);
      // Back to front, so nearer villagers overlap farther ones.
      // A boat passing under a Tulay goes beneath the deck: repaint the deck tiles it overlaps.
      const decks = new Set<string>();
      for (const d of drawn) {
        if (d.layer !== 0) continue;
        const cx = (d.x - o.x) / T;
        const cy = (d.y - o.y) / T;
        for (let y = Math.floor(cy - 1.2); y <= Math.floor(cy + 1.2); y++) {
          for (let x = Math.floor(cx - 1.2); x <= Math.floor(cx + 1.2); x++) if (tileAt(s.map, x, y) === "bridge") decks.add(`${x},${y}`);
        }
      }
      const deckDirs = new Map<string, BridgeTile>();
      if (decks.size > 0) for (const b of s.buildings) if (b.span?.length) layOutSpan(s.map, b.span, deckDirs);
      for (const key of decks) {
        const [x, y] = key.split(",").map(Number);
        drawn.push({ x: o.x + (x + 0.5) * T, y: o.y + (y + 0.5) * T, r: T, layer: 1, f: () => drawDeck(g, o.x + x * T, o.y + y * T, T, deckDirs.get(key)?.dir ?? "h") });
      }
      // The Bahay ng Datu stands in front of whoever is behind it: at its ground line, cut its
      // shape out of everything drawn so far, so the house on the map shows through.
      const house = datuHouseBox(s, content);
      const houseImg = datuHouseImage(house.level, houseStyleFor(s, content));
      if (houseImg) {
        const hx = o.x + house.cx * T;
        const hy = o.y + house.bottom * T;
        drawn.push({ x: hx, y: o.y + house.ground * T, r: 0, f: () => eraseImage(g, houseImg, hx, hy, house.size * T) });
      }
      drawn.sort((a, b) => (a.layer ?? 2) - (b.layer ?? 2) || a.y - b.y);
      for (const d of drawn) d.f();
    };

    if (reducedMotion) {
      draw(0, 0);
      return;
    }
    // About 30 frames a second is plenty for small walkers and halves the work on phones.
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < FRAME_MS) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      draw(dt, now / 1000);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // With reduced motion, redraw whenever the game, camera or view changes.
  }, [content, reducedMotion, reducedMotion ? state : null, reducedMotion ? cam : null, reducedMotion ? view : null, reducedMotion ? clash : null]);

  return <canvas ref={canvas} aria-hidden width={1} height={1} className="pointer-events-none absolute top-0 left-0" />;
}
