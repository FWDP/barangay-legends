// Optional sound effects, synthesized with Web Audio (no audio files).
// Muted by default; the choice is remembered per browser, separate from the game save.

const MUTE_KEY = "barangay-legends/muted";
let ctx: AudioContext | null = null;

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, String(muted));
  } catch {
    // Storage blocked: the setting just won't persist.
  }
}

function audio(): AudioContext | null {
  if (isMuted()) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, endFreq: number, start: number, dur: number, type: OscillatorType, vol: number) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  /** Soft rustle for rice, hollow knock for wood. */
  gather(resource: "rice" | "wood") {
    if (resource === "wood") tone(420, 180, 0, 0.09, "triangle", 0.25);
    else tone(900, 600, 0, 0.07, "sine", 0.15);
  },
  /** Thunk, then a little two-note chime. */
  build() {
    tone(160, 70, 0, 0.14, "triangle", 0.35);
    tone(660, 660, 0.08, 0.16, "sine", 0.12);
    tone(990, 990, 0.16, 0.22, "sine", 0.1);
  },
  /** Falling whoosh of water on a fire. */
  extinguish() {
    tone(1400, 300, 0, 0.25, "sawtooth", 0.06);
    tone(500, 200, 0.05, 0.2, "sine", 0.12);
  },
  click() {
    tone(600, 500, 0, 0.04, "sine", 0.08);
  },
};
