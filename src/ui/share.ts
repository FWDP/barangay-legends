// "Share my barangay": a picture of the map with the barangay's name, its datu and title, the
// villager count and the game's address. Nothing personal goes in it beyond the names the
// player chose. Phones get the share sheet (Web Share API); elsewhere the picture downloads.
import type { Content } from "../engine/content";
import type { GameState } from "../engine/game";
import { tileAt, type Point } from "../engine/map";
import type { Lang } from "./settings";
import { datuWithTitle } from "./stories";
import { datuHouseUrl, houseStyleFor } from "./datuHouseArt";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = src;
  });
}
import { fill, type GameText } from "./uiContent";

export const SHARE_URL = "barangaylegends.fwdp.org";
export const SHARE_SIZE = 1080;

/** The part of the map worth showing: everything cleared or built on, plus a margin, kept square. */
export function shareBounds(state: GameState, margin = 2): { x0: number; y0: number; size: number } {
  const { map } = state;
  let x0 = map.plaza.x;
  let y0 = map.plaza.y;
  let x1 = x0;
  let y1 = y0;
  const take = (p: Point) => {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  };
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const t = tileAt(map, x, y);
      if (t === "cleared" || t === "daan" || t === "bridge") take({ x, y });
    }
  }
  for (const b of state.buildings) take(b);
  const size = Math.min(Math.max(map.width, map.height), Math.max(x1 - x0, y1 - y0) + 1 + 2 * margin);
  const cx = (x0 + x1 + 1) / 2;
  const cy = (y0 + y1 + 1) / 2;
  const clamp = (v: number, max: number) => Math.round(Math.min(Math.max(0, max - size), Math.max(0, v)));
  return { x0: clamp(cx - size / 2, map.width), y0: clamp(cy - size / 2, map.height), size };
}

/** The words on the card. */
export function shareLines(state: GameState, content: Content, game: GameText, lang: Lang): { name: string; datu: string; villagers: string; url: string } {
  return {
    name: state.barangay.name || "Barangay Legends",
    datu: datuWithTitle(state, content, lang),
    villagers: fill(game.share.villagers[lang], { n: state.villagers }),
    url: SHARE_URL,
  };
}

const TILE_COLOR: Record<string, string> = {
  forest: "#2f5d2a",
  balete: "#1d3b1a",
  cleared: "#c9b27a",
  daan: "#e3cc98",
  river: "#3f86c6",
  sea: "#1e5f8f",
  bridge: "#8b5a2b",
};

/** Draws the card. Pure drawing: no clock, no network. */
export function drawShareCard(state: GameState, content: Content, game: GameText, lang: Lang, size = SHARE_SIZE, house?: CanvasImageSource): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("no canvas");
  const lines = shareLines(state, content, game, lang);
  const pad = size * 0.05;
  const head = size * 0.235;
  const foot = size * 0.08;

  // Background: woven mat colors.
  g.fillStyle = "#3b2414";
  g.fillRect(0, 0, size, size);

  // The map.
  const b = shareBounds(state);
  const area = size - 2 * pad;
  const mapH = size - head - foot - pad;
  const tile = Math.min(area, mapH) / b.size;
  const ox = (size - tile * b.size) / 2;
  const oy = head;
  for (let y = 0; y < b.size; y++) {
    for (let x = 0; x < b.size; x++) {
      const t = tileAt(state.map, b.x0 + x, b.y0 + y);
      g.fillStyle = (t && TILE_COLOR[t]) ?? "#2f5d2a";
      g.fillRect(ox + x * tile, oy + y * tile, Math.ceil(tile), Math.ceil(tile));
    }
  }
  // The plaza.
  const px = ox + (state.map.plaza.x - b.x0 + 0.5) * tile;
  const py = oy + (state.map.plaza.y - b.y0 + 0.5) * tile;
  g.fillStyle = "#e9d8a6";
  g.beginPath();
  g.arc(px, py, tile * 0.9, 0, Math.PI * 2);
  g.fill();
  g.font = `${tile * 0.9}px serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (!house) g.fillText("🔥", px, py);
  // Buildings as their icons.
  const icons = new Map(content.buildings.map((d) => [d.id, d.icon]));
  g.font = `${tile * 0.82}px serif`;
  for (const bl of state.buildings) {
    const x = ox + (bl.x - b.x0 + 0.5) * tile;
    const y = oy + (bl.y - b.y0 + 0.5) * tile;
    if (x < ox || y < oy || x > ox + tile * b.size || y > oy + tile * b.size) continue;
    g.globalAlpha = bl.damaged ? 0.5 : 1;
    g.fillText(icons.get(bl.type) ?? "🏠", x, y + tile * 0.04);
  }
  g.globalAlpha = 1;
  if (house) {
    // The Bahay ng Datu at the plaza (the same drawing as on the map), over its neighbors, the fire beside it.
    const hs = tile * (1.05 + state.datuLevel * 0.11) * 1.4;
    g.drawImage(house, px - hs / 2, py + tile * 0.5 - hs * 0.93, hs, hs);
    g.font = `${tile * 0.6}px serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("🔥", px + hs * 0.45, py + tile * 0.35);
  }
  g.strokeStyle = "#f5deb3";
  g.lineWidth = size * 0.006;
  g.strokeRect(ox, oy, tile * b.size, tile * b.size);

  // Header: the barangay, its datu and title, how many live there.
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillStyle = "#fef3c7";
  g.font = `bold ${size * 0.07}px Georgia, serif`;
  g.fillText(lines.name, pad, pad + size * 0.06, size - 2 * pad);
  g.font = `${size * 0.036}px Georgia, serif`;
  g.fillStyle = "#fde68a";
  g.fillText(lines.datu, pad, pad + size * 0.112, size - 2 * pad);
  g.fillStyle = "#fef3c7";
  g.fillText(`👥 ${lines.villagers}`, pad, pad + size * 0.158, size - 2 * pad);

  // Footer: the game's name and address.
  g.textAlign = "center";
  g.font = `bold ${size * 0.032}px Georgia, serif`;
  g.fillStyle = "#fde68a";
  g.fillText(`Barangay Legends · ${lines.url}`, size / 2, size - pad * 0.8);
  return canvas;
}

/** A file name from the barangay's name, e.g. "sapang-bato.png". */
export function shareFileName(state: GameState): string {
  const slug = (state.barangay.name || "barangay").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "barangay"}.png`;
}

/**
 * Shares the card: the phone's share sheet when it can take a file, otherwise a download.
 * Returns "shared", "saved" or "cancelled".
 */
export async function shareBarangay(state: GameState, content: Content, game: GameText, lang: Lang): Promise<"shared" | "saved" | "cancelled"> {
  const house = await loadImage(datuHouseUrl(state.datuLevel, houseStyleFor(state, content))).catch(() => undefined);
  const canvas = drawShareCard(state, content, game, lang, SHARE_SIZE, house);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
  if (!blob) throw new Error("no image");
  const name = shareFileName(state);
  const file = new File([blob], name, { type: "image/png" });
  const text = `${game.share.text[lang]}: ${state.barangay.name || "Barangay Legends"} · https://${SHARE_URL}`;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches === true;
  if (coarse && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Barangay Legends", text });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // Fall through to a download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "saved";
}
