// The title screen: the player's barangay (or a sample one) drifting behind the logo, then
// Continue or Start in one tap. Naming is optional and never adds a step.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import credits from "../../docs/credits.md?raw";
import type { Content } from "../engine/content";
import { MAX_NAME_LENGTH, type GameState } from "../engine/game";
import { BarangayMap } from "./BarangayMap";
import { Markdown } from "./markdown";
import { canPlay, type PlayMode } from "./online";
import { sampleBarangay } from "./sample";
import { LANGS, updateSettings, type Lang } from "./settings";
import { Preferences } from "./SettingsMenu";
import { fill, randomNames, type TitleKey, type UiContent } from "./uiContent";

const noop = () => {};

export interface Names {
  name: string;
  datu: string;
}

/** A modal on the title screen (settings, credits, replacing the save). */
function TitleDialog(props: { open: boolean; onClose: () => void; title: string; closeLabel: string; children: ReactNode; wide?: boolean }) {
  const { open, onClose, title, closeLabel, children, wide } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className={`m-auto w-[calc(100%-1.5rem)] ${wide ? "max-w-lg" : "max-w-sm"} rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/60`}
    >
      <div className="mat-card flex max-h-[85dvh] flex-col">
        <header className="wood-panel flex items-center gap-2 px-4 py-2.5">
          <h2 className="text-outline flex-1 font-display text-xl text-amber-50">{title}</h2>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="game-btn flex size-8 items-center justify-center border-2 border-amber-950/60 bg-amber-200 text-sm text-amber-950">
            ✕
          </button>
        </header>
        <div className="space-y-3 overflow-y-auto p-4">{children}</div>
      </div>
    </dialog>
  );
}

/** Two optional name fields; empty ones use the random defaults shown as placeholders. */
function NameFields(props: { t: (k: TitleKey) => string; names: Names; defaults: Names; onChange: (n: Names) => void; onReroll: () => void }) {
  const { t, names, defaults, onChange, onReroll } = props;
  const field = (key: keyof Names, label: string) => (
    <label className="block text-left text-xs font-semibold text-stone-700">
      {label}
      <input
        value={names[key]}
        maxLength={MAX_NAME_LENGTH}
        placeholder={defaults[key]}
        autoComplete="off"
        onChange={(e) => onChange({ ...names, [key]: e.target.value })}
        className="mt-0.5 w-full rounded-lg border-2 border-amber-900/40 bg-white px-2 py-1.5 text-base text-stone-800 placeholder:text-stone-400"
      />
    </label>
  );
  return (
    <div className="space-y-2">
      {field("datu", t("datuName"))}
      {field("name", t("barangayName"))}
      <button type="button" onClick={onReroll} className="text-xs font-semibold text-amber-900 underline">
        🎲 {t("reroll")}
      </button>
    </div>
  );
}

export function TitleScreen(props: {
  state: GameState;
  hasSave: boolean;
  content: Content;
  ui: UiContent;
  lang: Lang;
  muted: boolean;
  onToggleSound: () => void;
  onHelp: () => void;
  onContinue: () => void;
  onNewGame: (names: Names, mode: PlayMode) => void;
}) {
  const { state, hasSave, content, ui, lang, muted, onToggleSound, onHelp, onContinue, onNewGame } = props;
  const t = (k: TitleKey, vars: Record<string, string> = {}) => fill(ui.title.text[k][lang], vars);
  const background = useMemo(() => (hasSave ? state : sampleBarangay(content)), [hasSave, content]);
  const [defaults, setDefaults] = useState<Names>(() => randomNames(ui.names));
  const [names, setNames] = useState<Names>({ name: "", datu: "" });
  const [naming, setNaming] = useState(false);
  const [dialog, setDialog] = useState<"settings" | "credits" | "replace" | null>(null);
  const chosen: Names = { name: names.name.trim() || defaults.name, datu: names.datu.trim() || defaults.datu };
  const start = (mode: PlayMode) => canPlay(mode) && onNewGame(chosen, mode);
  const reroll = () => setDefaults(randomNames(ui.names));
  const { support, contributors } = ui.title.links;
  const close = () => setDialog(null);

  const linkBtn = "game-btn flex items-center justify-center gap-1 border-2 border-amber-950/60 bg-amber-100/95 px-2 py-2 text-sm font-semibold text-amber-950";

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-green-900 text-stone-800" lang={lang === "fil" ? "fil" : "en"}>
      <div className="absolute inset-0 flex flex-col">
        <BarangayMap
          state={background}
          content={content}
          placing={null}
          onPlace={noop}
          onTapTile={noop}
          onBuildingMenu={noop}
          onSpirit={noop}
          scenic
        />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-linear-to-b from-black/55 via-black/30 to-black/70" />

      <div className="relative flex justify-end p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div role="group" aria-label="Language / Wika" className="flex overflow-hidden rounded-lg border-2 border-amber-950/60 shadow-lg">
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={l === lang}
              onClick={() => updateSettings({ language: l })}
              className={`px-2.5 py-1 text-xs font-semibold ${l === lang ? "bg-amber-300 text-amber-950" : "bg-amber-100/90 text-amber-900"}`}
            >
              {ui.help[l].label}
            </button>
          ))}
        </div>
      </div>

      <main className="relative mx-auto flex w-full max-w-sm min-h-0 flex-1 lg:mr-[7vw] lg:ml-auto flex-col items-center justify-center gap-4 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="text-center">
          <div aria-hidden className="text-5xl drop-shadow-lg">
            🛖
          </div>
          <h1 className="text-outline font-display text-5xl leading-none tracking-wide text-amber-100 drop-shadow-xl sm:text-6xl">
            Barangay
            <br />
            Legends
          </h1>
          <p className="text-outline mt-2 text-sm text-amber-100/95">{t("tagline")}</p>
        </div>

        <div className="wood-panel w-full space-y-2.5 rounded-2xl border-2 border-amber-950/70 p-4 text-center text-amber-50 shadow-2xl">
          {hasSave ? (
            <>
              <p className="text-sm">
                {state.barangay.datu && state.barangay.name
                  ? t("welcomeBack", { datu: state.barangay.datu, barangay: state.barangay.name })
                  : t("welcomeBackUnnamed")}
              </p>
              <button
                type="button"
                autoFocus
                onClick={onContinue}
                className="game-btn text-outline w-full border-2 border-green-950 bg-green-600 px-4 py-3 font-display text-2xl text-white shadow-lg"
              >
                ▶ {t("continue")}
              </button>
              <button type="button" onClick={() => setDialog("replace")} className="game-btn w-full border-2 border-amber-950/60 bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-950">
                {t("newGame")}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm">{t("youWillLead", { datu: chosen.datu, barangay: chosen.name })}</p>
              <button
                type="button"
                autoFocus
                onClick={() => start("local")}
                className="game-btn text-outline w-full border-2 border-green-950 bg-green-600 px-4 py-3 font-display text-2xl text-white shadow-lg"
              >
                ▶ {t("start")}
              </button>
              <button
                type="button"
                aria-expanded={naming}
                onClick={() => setNaming((n) => !n)}
                className="text-xs font-semibold text-amber-200 underline"
              >
                ✏️ {t("chooseNames")}
              </button>
              {naming && (
                <div className="mat-card rounded-xl p-3">
                  <NameFields t={t} names={names} defaults={defaults} onChange={setNames} onReroll={reroll} />
                </div>
              )}
            </>
          )}
          <button
            type="button"
            disabled={!canPlay("online")}
            onClick={() => start("online")}
            className="game-btn flex w-full items-center justify-center gap-2 border-2 border-stone-700 bg-stone-500 px-3 py-1.5 text-sm font-semibold text-stone-100 disabled:cursor-not-allowed disabled:opacity-80"
          >
            🌐 {t("online")}
            {!canPlay("online") && <span className="rounded-full bg-stone-800/70 px-2 py-0.5 text-[11px]">{t("comingSoon")}</span>}
          </button>
        </div>

        <nav className="grid w-full grid-cols-2 gap-2">
          <button type="button" onClick={onHelp} className={linkBtn}>
            ❓ {t("help")}
          </button>
          <button type="button" onClick={() => setDialog("settings")} className={linkBtn}>
            ⚙️ {t("settings")}
          </button>
          <button type="button" onClick={() => setDialog("credits")} className={linkBtn}>
            📜 {t("credits")}
          </button>
          {/* Hidden altogether until title.json has a support link. */}
          {support && (
            <a href={support} target="_blank" rel="noreferrer" className={linkBtn}>
              💛 {t("support")}
            </a>
          )}
        </nav>
        <p className="text-outline text-center text-xs text-amber-100/90">{t("free")}</p>
      </main>

      <TitleDialog open={dialog === "settings"} onClose={close} title={t("settings")} closeLabel={t("close")}>
        <div className="wood-panel space-y-2 rounded-xl p-3 text-amber-50">
          <Preferences muted={muted} onToggleSound={onToggleSound} />
        </div>
      </TitleDialog>

      <TitleDialog open={dialog === "credits"} onClose={close} title={t("credits")} closeLabel={t("close")} wide>
        <Markdown source={credits} />
        {contributors && (
          <a href={contributors} target="_blank" rel="noreferrer" className="block text-sm font-semibold text-amber-800 underline">
            GitHub ↗
          </a>
        )}
      </TitleDialog>

      <TitleDialog open={dialog === "replace"} onClose={close} title={t("replaceTitle")} closeLabel={t("cancel")}>
        <p className="rounded-lg bg-red-100 p-2 text-sm font-semibold text-red-900">{t("replaceText")}</p>
        <NameFields t={t} names={names} defaults={defaults} onChange={setNames} onReroll={reroll} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" autoFocus onClick={close} className="game-btn border-2 border-stone-400 bg-white px-4 py-2 text-sm font-semibold">
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              start("local");
            }}
            className="game-btn border-2 border-red-950 bg-red-700 px-4 py-2 text-sm font-semibold text-white"
          >
            {t("replaceConfirm")}
          </button>
        </div>
      </TitleDialog>
    </div>
  );
}
