import { useSyncExternalStore } from "react";

/** Floating "+N" numbers. A tiny store so any component can spawn one at a screen position. */
export interface Float {
  id: number;
  x: number;
  y: number;
  text: string;
  tone: "rice" | "wood" | "gold" | "info";
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

const TONE = { rice: "text-amber-50", wood: "text-orange-200", gold: "text-yellow-200", info: "text-sky-100" } as const;

export function FloatLayer() {
  const list = useSyncExternalStore(subscribe, () => floats);
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {list.map((f) => (
        <span
          key={f.id}
          className={`text-outline absolute font-display text-lg whitespace-nowrap motion-safe:animate-float-up motion-reduce:animate-fade-out ${TONE[f.tone]}`}
          style={{ left: f.x, top: f.y }}
        >
          {f.text}
        </span>
      ))}
    </div>
  );
}
