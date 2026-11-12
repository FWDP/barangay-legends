import { useEffect, useRef, useState } from "react";

/** Small gear menu holding the rarely used things: sound, start over and the source link. */
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
        className="game-btn flex size-9 items-center justify-center border-2 border-amber-950/60 bg-amber-200 text-lg"
      >
        ⚙️
      </button>
      {open && (
        <div
          id="settings-menu"
          className="wood-panel absolute top-full right-0 z-50 mt-2 w-56 space-y-2 rounded-xl border-2 border-amber-950/60 p-3 text-amber-50 shadow-xl"
        >
          <div className="text-outline font-display text-lg">Barangay Legends</div>
          <button
            type="button"
            aria-pressed={!muted}
            className="game-btn w-full border-2 border-amber-950/60 bg-amber-100 px-3 py-2 text-left text-sm font-semibold text-amber-950"
            onClick={onToggleSound}
          >
            {muted ? "🔇 Sound: off" : "🔊 Sound: on"}
          </button>
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
