import { useSyncExternalStore } from "react";

/** Floating "+N" numbers. A tiny store so any component can spawn one at a screen position. */
export interface Float {
  id: number;
  x: number;
  y: number;
  text: string;
  tone: "food" | "rice" | "wood" | "gold" | "salt" | "wine" | "info";
}

let floats: Float[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function spawnFloat(x: number, y: number, text: string, tone: Float["tone"]): void {
  const id = nextId++;
  floats = [...floats.slice(-24), { id, x, y, text, tone }];
  emit();
  setTimeout(() => {
    floats = floats.filter((f) => f.id !== id);
    emit();
  }, 950);
}

/** Spawns a float at the centre-top of an element. */
export function spawnFloatAt(el: Element, text: string, tone: Float["tone"]): void {
  const r = el.getBoundingClientRect();
  spawnFloat(r.left + r.width / 2, r.top + r.height * 0.25, text, tone);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Crisp chips (index.css map-chip): a solid pill with dark text, no outline on the letters. */
const TONE = { food: "map-chip-good", rice: "map-chip-good", wood: "map-chip-good", gold: "map-chip-good", salt: "map-chip-good", wine: "map-chip-good", info: "" } as const;

/**
 * Production numbers (+3.9 🌾) float over the map but under the banners and the notice list
 * (z-30 and up), never on top of them; info messages (a tap's answer, "Saved") stay on top.
 */
export const FLOAT_LAYER = "z-[25]";
export const INFO_FLOAT_LAYER = "z-[45]";

export function FloatLayer() {
  const list = useSyncExternalStore(subscribe, () => floats);
  const layer = (info: boolean) => (
    <div className={`pointer-events-none fixed inset-0 ${info ? INFO_FLOAT_LAYER : FLOAT_LAYER} overflow-hidden`} aria-hidden>
      {list
        .filter((f) => (f.tone === "info") === info)
        .map((f) => (
          <span
            key={f.id}
            className={`map-chip absolute text-[13px] motion-safe:animate-float-up motion-reduce:animate-fade-out ${TONE[f.tone]}`}
            style={{ left: f.x, top: f.y }}
          >
            {f.text}
          </span>
        ))}
    </div>
  );
  return (
    <>
      {layer(false)}
      {layer(true)}
    </>
  );
}
