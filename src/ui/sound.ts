// Sound, synthesized with the Web Audio API: no audio files (see docs/credits.md).
// Muted by default; the mute choice is remembered per browser, separate from the game save.
// Two buses, each with its own volume from settings: "music" (the ambient loop) and "effects".
import { getSettings, subscribeSettings } from "./settings";

const MUTE_KEY = "barangay-legends/muted";
/** Rapid clicks never stack: at most one gather sound in this window. */
export const GATHER_GAP_MS = 250;
/** Any other effect: at most one of each kind in this window. */
const EFFECT_GAP_MS = 60;
/** The ambient loop sits well under the effects. */
const AMBIENT_LEVEL = 0.35;

let ctx: AudioContext | null = null;
let musicBus: GainNode | null = null;
let effectsBus: GainNode | null = null;

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) !== "false";
  } catch {
    return true;
  }
}

/** Stores the choice and starts or stops all sound to match. */
export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, String(muted));
  } catch {
    // Storage blocked: the setting just won't persist.
  }
  if (muted) {
    stopAmbient();
    void ctx?.suspend();
  } else {
    audio();
    startAmbient();
  }
}

function applyVolumes() {
  if (!ctx || !musicBus || !effectsBus) return;
  const { musicVolume, effectsVolume } = getSettings();
  musicBus.gain.setTargetAtTime(musicVolume * AMBIENT_LEVEL, ctx.currentTime, 0.05);
  effectsBus.gain.setTargetAtTime(effectsVolume, ctx.currentTime, 0.05);
}
subscribeSettings(applyVolumes);

function audio(): AudioContext | null {
  if (isMuted()) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      musicBus = ctx.createGain();
      effectsBus = ctx.createGain();
      musicBus.gain.value = 0;
      effectsBus.gain.value = 0;
      musicBus.connect(ctx.destination);
      effectsBus.connect(ctx.destination);
      applyVolumes();
    }
    if (ctx.state === "suspended" && document.visibilityState === "visible") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One enveloped oscillator note on a bus. */
function tone(
  freq: number,
  endFreq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  bus: "effects" | "music" = "effects",
) {
  const a = audio();
  const out = bus === "music" ? musicBus : effectsBus;
  if (!a || !out) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/**
 * A bossed gong (kulintang-style): a low fundamental with a few slightly inharmonic
 * partials and a long, soft decay.
 */
function gong(freq: number, start: number, vol: number, bus: "effects" | "music" = "effects", dur = 2.2) {
  tone(freq, freq * 0.995, start, dur, "sine", vol, bus);
  tone(freq * 2.02, freq * 2.0, start, dur * 0.55, "sine", vol * 0.35, bus);
  tone(freq * 2.92, freq * 2.9, start, dur * 0.3, "sine", vol * 0.15, bus);
}

/** A short burst of filtered noise: drums, rustles, water. */
function noise(start: number, dur: number, freq: number, q: number, vol: number, bus: "effects" | "music" = "effects") {
  const a = audio();
  const out = bus === "music" ? musicBus : effectsBus;
  if (!a || !out) return;
  const t = a.currentTime + start;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a);
  const filter = a.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
/** Two seconds of soft (brown-ish) noise, made once and reused. */
function noiseBuffer(a: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = a.sampleRate * 2;
  noiseBuf = a.createBuffer(1, len, a.sampleRate);
  const data = noiseBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return noiseBuf;
}

// ---------- Effects ----------

/** Returns a function that plays an effect unless the same one played within `gap` ms. */
export function limiter(now: () => number) {
  const last = new Map<string, number>();
  return (name: string, gap: number, play: () => void): boolean => {
    const t = now();
    if (t - (last.get(name) ?? -Infinity) < gap) return false;
    last.set(name, t);
    play();
    return true;
  };
}
const once = limiter(() => performance.now());

/** Pentatonic steps for the gong phrases, close to a kulintang's (not a tuned replica). */
const GONGS = [392, 440, 523, 587, 659];

export const sfx = {
  /** Soft rustle for rice, hollow knock for wood. One per 250 ms, however fast the taps. */
  gather(resource: "rice" | "wood") {
    once("gather", GATHER_GAP_MS, () => {
      if (resource === "wood") tone(420, 180, 0, 0.09, "triangle", 0.25);
      else tone(900, 600, 0, 0.07, "sine", 0.15);
    });
  },
  /** Picking a building up to place it: a light bamboo tock. */
  pick() {
    once("pick", EFFECT_GAP_MS, () => {
      tone(880, 700, 0, 0.05, "triangle", 0.12);
      tone(1320, 1100, 0.04, 0.05, "triangle", 0.08);
    });
  },
  /** Setting a building down: thunk, then a little two-note chime. */
  build() {
    once("build", EFFECT_GAP_MS, () => {
      tone(160, 70, 0, 0.14, "triangle", 0.35);
      tone(660, 660, 0.08, 0.16, "sine", 0.12);
      tone(990, 990, 0.16, 0.22, "sine", 0.1);
    });
  },
  /** Falling whoosh of water on a fire. */
  extinguish() {
    once("extinguish", EFFECT_GAP_MS, () => {
      tone(1400, 300, 0, 0.25, "sawtooth", 0.06);
      tone(500, 200, 0.05, 0.2, "sine", 0.12);
    });
  },
  click() {
    once("click", EFFECT_GAP_MS, () => tone(600, 500, 0, 0.04, "sine", 0.08));
  },
  /** Something is coming (typhoon, fire, raid): two low gong strokes. */
  warning() {
    once("warning", 2000, () => {
      gong(196, 0, 0.3, "effects", 1.4);
      gong(196, 0.45, 0.3, "effects", 1.4);
    });
  },
  /** Battle drums, then a gong. */
  battleStart() {
    once("battle", 1000, () => {
      for (let i = 0; i < 4; i++) noise(i * 0.16, 0.18, 120, 1.2, 0.9);
      gong(147, 0.7, 0.3, "effects", 1.6);
    });
  },
  /** Rising gongs. */
  battleWon() {
    once("result", 1000, () => [GONGS[0], GONGS[2], GONGS[4]].forEach((f, i) => gong(f, i * 0.22, 0.22, "effects", 1.6)));
  },
  /** Falling, darker gongs. */
  battleLost() {
    once("result", 1000, () => [GONGS[3], GONGS[1], 330].forEach((f, i) => gong(f / 2, i * 0.3, 0.26, "effects", 1.8)));
  },
};

// ---------- Ambient loop: river, birds and distant gongs ----------

let ambient: { river: AudioBufferSourceNode; lfo: OscillatorNode; timer: number } | null = null;
let nextBird = 0;
let nextGong = 0;

/** Starts the gentle ambient loop (if sound is on). Safe to call more than once. */
export function startAmbient(): void {
  const a = audio();
  if (!a || !musicBus || ambient) return;
  // The river: looping soft noise through a low-pass filter, swelling slowly.
  const river = a.createBufferSource();
  river.buffer = noiseBuffer(a);
  river.loop = true;
  const low = a.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 700;
  const swell = a.createGain();
  swell.gain.value = 0.25;
  const lfo = a.createOscillator();
  const depth = a.createGain();
  lfo.frequency.value = 0.07;
  depth.gain.value = 0.08;
  lfo.connect(depth).connect(swell.gain);
  river.connect(low).connect(swell).connect(musicBus);
  river.start();
  lfo.start();
  nextBird = a.currentTime + 2;
  nextGong = a.currentTime + 8;
  // Birds and gongs are scheduled a little ahead, at random moments.
  const timer = window.setInterval(() => {
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    if (now >= nextBird) {
      const base = 2400 + Math.random() * 1800;
      const notes = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < notes; i++) tone(base, base * (1.15 + Math.random() * 0.2), i * 0.11, 0.08, "sine", 0.05, "music");
      nextBird = now + 3 + Math.random() * 7;
    }
    if (now >= nextGong) {
      const phrase = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < phrase; i++) gong(GONGS[Math.floor(Math.random() * GONGS.length)] / 2, i * 0.5, 0.09, "music", 3);
      nextGong = now + 14 + Math.random() * 16;
    }
  }, 500);
  ambient = { river, lfo, timer };
}

export function stopAmbient(): void {
  if (!ambient) return;
  window.clearInterval(ambient.timer);
  try {
    ambient.river.stop();
    ambient.lfo.stop();
  } catch {
    // Already stopped.
  }
  ambient = null;
}

/**
 * Browsers only allow sound after the player interacts. Call once at startup: the first tap
 * (if sound is on) starts the ambient loop. Sound pauses while the tab is hidden.
 */
export function initSound(): () => void {
  const onFirst = () => {
    if (!isMuted()) startAmbient();
  };
  const onVisibility = () => {
    if (!ctx) return;
    if (document.visibilityState === "hidden") void ctx.suspend();
    else if (!isMuted()) void ctx.resume();
  };
  window.addEventListener("pointerdown", onFirst, { once: true });
  window.addEventListener("keydown", onFirst, { once: true });
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.removeEventListener("pointerdown", onFirst);
    window.removeEventListener("keydown", onFirst);
    document.removeEventListener("visibilitychange", onVisibility);
    stopAmbient();
  };
}
