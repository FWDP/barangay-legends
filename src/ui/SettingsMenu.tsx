import { useEffect, useRef, useState } from "react";
import { updateSettings, useLang, useSettings } from "./settings";

function Volume(props: { label: string; value: number; muted: boolean; onChange: (v: number) => void }) {
  return (
    <label className={`block text-xs font-semibold ${props.muted ? "opacity-60" : ""}`}>
      <span className="flex justify-between">
        {props.label}
        <span className="tabular-nums">{Math.round(props.value * 100)}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(props.value * 100)}
        onChange={(e) => props.onChange(Number(e.target.value) / 100)}
        className="mt-1 w-full accent-amber-300"
      />
    </label>
  );
}

/** Sound on/off and volumes, adviser tips and language. Shared by the gear menu and the title screen. */
export function Preferences(props: { muted: boolean; onToggleSound: () => void }) {
  const { muted, onToggleSound } = props;
  const settings = useSettings();
  const lang = useLang();
  return (
    <>
      <button
        type="button"
        aria-pressed={!muted}
        className="game-btn w-full border-2 border-amber-950/60 bg-amber-100 px-3 py-2 text-left text-sm font-semibold text-amber-950"
        onClick={onToggleSound}
      >
        {muted ? "🔇 Sound: off" : "🔊 Sound: on"}
      </button>
      <Volume label="🎶 Music" value={settings.musicVolume} muted={muted} onChange={(v) => updateSettings({ musicVolume: v })} />
      <Volume label="🥁 Effects" value={settings.effectsVolume} muted={muted} onChange={(v) => updateSettings({ effectsVolume: v })} />
      <button
        type="button"
        aria-pressed={settings.tips}
        className="game-btn w-full border-2 border-amber-950/60 bg-amber-100 px-3 py-2 text-left text-sm font-semibold text-amber-950"
        onClick={() => updateSettings({ tips: !settings.tips })}
      >
        {settings.tips ? "💬 Adviser tips: on" : "💬 Adviser tips: off"}
      </button>
      <label className="block text-xs font-semibold">
        🌐 Language
        <select
          value={lang}
          onChange={(e) => updateSettings({ language: e.target.value as "en" | "fil" })}
          className="mt-1 w-full rounded-lg border-2 border-amber-950/60 bg-amber-100 px-2 py-1 text-sm text-amber-950"
        >
          <option value="en">English</option>
          <option value="fil">Filipino</option>
        </select>
      </label>
    </>
  );
}

/** Small gear menu holding the rarely used things: sound, tips, language, start over and the source link. */
export function SettingsMenu(props: { onReset: () => void; muted: boolean; onToggleSound: () => void }) {
  const { onReset, muted, onToggleSound } = props;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const closeDialog = () => dialog.current?.close();

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={open}
        aria-controls="settings-menu"
        onClick={() => setOpen((o) => !o)}
        className="game-btn flex size-8 items-center justify-center border-2 border-amber-950/60 bg-amber-200 text-lg sm:size-9"
      >
        ⚙️
      </button>
      {open && (
        <div
          id="settings-menu"
          className="wood-panel absolute top-full right-0 z-50 mt-2 max-h-[80dvh] w-60 space-y-2 overflow-y-auto rounded-xl border-2 border-amber-950/60 p-3 text-amber-50 shadow-xl"
        >
          <div className="text-outline font-display text-lg">Barangay Legends</div>
          <Preferences muted={muted} onToggleSound={onToggleSound} />
          <button
            type="button"
            className="game-btn w-full border-2 border-red-950 bg-red-700 px-3 py-2 text-left text-sm font-semibold text-white"
            onClick={() => {
              setOpen(false);
              dialog.current?.showModal();
            }}
          >
            ↺ Start over…
          </button>
          <a
            className="game-btn block w-full border-2 border-amber-950/60 bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-950"
            href="https://github.com/FWDP/barangay-legends"
            target="_blank"
            rel="noreferrer"
          >
            Source on GitHub ↗
          </a>
          <p className="text-xs text-amber-200/90">Free and open source. Nothing is for sale.</p>
        </div>
      )}

      <dialog
        ref={dialog}
        aria-labelledby="reset-title"
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/60"
        onClick={(e) => {
          // Clicking the backdrop (outside the panel) cancels.
          if (e.target === dialog.current) closeDialog();
        }}
      >
        <div className="mat-card space-y-3 p-5">
          <h2 id="reset-title" className="font-display text-2xl text-amber-900">
            Start over?
          </h2>
          <p className="text-sm text-stone-600">
            This erases your barangay, its villagers and all your resources. It can't be undone.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              autoFocus
              className="game-btn border-2 border-stone-400 bg-white px-4 py-2 text-sm font-semibold"
              onClick={closeDialog}
            >
              Cancel
            </button>
            <button
              type="button"
              className="game-btn border-2 border-red-950 bg-red-700 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => {
                onReset();
                closeDialog();
              }}
            >
              Yes, start over
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
