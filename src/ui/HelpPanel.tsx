// The "?" help panel: short illustrated sections, in English or Filipino (content/help/*.json).
import { useEffect, useRef } from "react";
import type { Content } from "../engine/content";
import { LANGS, updateSettings, type Lang } from "./settings";
import { fill, helpVars, type HelpDoc } from "./uiContent";

export function HelpPanel(props: { open: boolean; onClose: () => void; help: Record<Lang, HelpDoc>; lang: Lang; content: Content }) {
  const { open, onClose, help, lang, content } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const doc = help[lang];
  const vars = helpVars(content);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="help-title"
      lang={lang === "fil" ? "fil" : "en"}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/60"
    >
      <div className="mat-card flex max-h-[85dvh] flex-col">
        <header className="wood-panel flex items-center gap-2 px-4 py-2.5">
          <h2 id="help-title" className="text-outline flex-1 font-display text-xl text-amber-50">
            {doc.ui.title}
          </h2>
          <div role="group" aria-label={doc.ui.language} className="flex overflow-hidden rounded-lg border-2 border-amber-950/60">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={l === lang}
                onClick={() => updateSettings({ language: l })}
                className={`px-2 py-0.5 text-xs font-semibold ${l === lang ? "bg-amber-300 text-amber-950" : "bg-amber-100/80 text-amber-900"}`}
              >
                {help[l].label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={doc.ui.close}
            className="game-btn flex size-8 items-center justify-center border-2 border-amber-950/60 bg-amber-200 text-sm text-amber-950"
          >
            ✕
          </button>
        </header>
        <div className="space-y-3 overflow-y-auto p-4">
          {doc.sections.map((s) => (
            <section key={s.id} aria-labelledby={`help-${s.id}`} className="rounded-xl border-2 border-amber-900/25 bg-white/50 p-3">
              <div aria-hidden className="mb-2 flex items-center justify-center gap-2 rounded-lg bg-linear-to-b from-sky-200/70 to-lime-200/70 py-2 text-3xl leading-none">
                {s.art.map((a, i) => (
                  <span key={i}>{a}</span>
                ))}
              </div>
              <h3 id={`help-${s.id}`} className="flex items-center gap-1.5 font-display text-lg text-amber-900">
                <span aria-hidden>{s.icon}</span> {s.title}
              </h3>
              {s.body.map((p, i) => (
                <p key={i} className="mt-1 text-sm leading-snug">
                  {fill(p, vars)}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </dialog>
  );
}
