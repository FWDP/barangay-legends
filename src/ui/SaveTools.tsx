// Save safety and bug reports, from Settings. Export: copy a save code or download a save file.
// Import: paste a code or choose a file; it is checked and migrated, and replaces the current
// game only after a confirmation. Report a problem: a short form that makes a report with the
// game version, device and browser, and the save code, to share (phone share sheet), copy, or
// open as a GitHub issue (without the save, which doesn't fit in a link: it is copied instead).
import { useRef, useState, type ReactNode } from "react";
import type { Content } from "../engine/content";
import { dayAt } from "../engine/daynight";
import type { GameState } from "../engine/game";
import { exportCode, exportFile, importSave } from "../engine/save";
import type { Lang } from "./settings";
import { shareFileName } from "./share";
import { useModal } from "./StoryDialogs";
import { fill, type GameText } from "./uiContent";
import { VERSION_TEXT } from "./version";

const ISSUES_URL = "https://github.com/FWDP/barangay-legends/issues/new";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers: a hidden textarea.
    const t = document.createElement("textarea");
    t.value = text;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.append(t);
    t.select();
    const ok = document.execCommand?.("copy") ?? false;
    t.remove();
    return ok;
  }
}

function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Dialog(props: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useModal(props.open);
  return (
    <dialog
      ref={ref}
      aria-label={props.title}
      onClose={props.onClose}
      onClick={(e) => e.target === e.currentTarget && props.onClose()}
      className="m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-md rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/60"
    >
      {props.open && (
        <div className="mat-card space-y-3 p-4 text-sm">
          <h2 className="font-display text-xl text-amber-900">{props.title}</h2>
          {props.children}
        </div>
      )}
    </dialog>
  );
}

const btn = "game-btn border-2 border-amber-950/60 bg-amber-200 px-3 py-1.5 text-sm font-semibold text-amber-950 disabled:opacity-50";

/** Export and import. `onReplace` swaps in the imported game (and saves it). */
export function SaveDialog(props: { open: boolean; state: GameState; content: Content; game: GameText; lang: Lang; onReplace: (s: GameState) => void; onClose: () => void }) {
  const { open, state, content, game, lang, onReplace, onClose } = props;
  const t = game.save;
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  const [pending, setPending] = useState<GameState | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const day = (s: GameState) => dayAt(content, s.foundedAt, s.time);
  const name = (s: GameState) => s.barangay.name || "Barangay";

  const tryLoad = (raw: string) => {
    const s = importSave(raw, content);
    setBad(!s);
    if (s) setPending(s);
  };
  const close = () => {
    setPending(null);
    setText("");
    setBad(false);
    setCopied(false);
    onClose();
  };

  return (
    <Dialog open={open} title={pending ? t.confirmTitle[lang] : t.title[lang]} onClose={close}>
      {pending ? (
        <>
          <p>{fill(t.confirmText[lang], { current: name(state), currentDay: day(state), imported: name(pending), importedDay: day(pending) })}</p>
          <div className="flex justify-end gap-2">
            <button type="button" autoFocus className={btn} onClick={() => setPending(null)}>
              {t.cancel[lang]}
            </button>
            <button
              type="button"
              className="game-btn border-2 border-red-950 bg-red-700 px-3 py-1.5 text-sm font-semibold text-white"
              onClick={() => {
                onReplace(pending);
                close();
              }}
            >
              {t.replace[lang]}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-stone-600">{t.exportHint[lang]}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => copyText(exportCode(state)).then(setCopied)}>
              📋 {copied ? t.copied[lang] : t.copy[lang]}
            </button>
            <button type="button" className={btn} onClick={() => download(shareFileName(state).replace(/\.png$/, "-save.json"), exportFile(state))}>
              💾 {t.download[lang]}
            </button>
          </div>
          <h3 className="pt-1 font-display text-base text-amber-900">{t.importTitle[lang]}</h3>
          <p className="text-xs text-stone-600">{t.importHint[lang]}</p>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setBad(false);
            }}
            rows={3}
            spellCheck={false}
            placeholder="BLSAVE1:…"
            aria-label={t.importHint[lang]}
            className="w-full rounded-lg border-2 border-amber-900/40 bg-white p-2 font-mono text-xs"
          />
          {bad && <p className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-900">{t.bad[lang]}</p>}
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" className={btn} onClick={() => file.current?.click()}>
              📂 {t.file[lang]}
            </button>
            <input
              ref={file}
              type="file"
              accept=".json,.txt,application/json,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                f?.text().then(tryLoad, () => setBad(true));
              }}
            />
            <button type="button" className={btn} disabled={!text.trim()} onClick={() => tryLoad(text)}>
              {t.load[lang]}
            </button>
          </div>
          <div className="flex justify-end">
            <button type="button" className={btn} onClick={close}>
              {t.close[lang]}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/** Device and browser, as plain facts (no identifiers). */
function deviceInfo(): string {
  const n = typeof navigator !== "undefined" ? navigator : undefined;
  const screenText = typeof screen !== "undefined" ? `${screen.width}×${screen.height} @${window.devicePixelRatio ?? 1}x` : "";
  return [n?.userAgent ?? "", screenText, `language ${n?.language ?? ""}`].filter(Boolean).join(" · ");
}

/** The report's text (exported for tests). */
export function reportText(what: string, expected: string, state: GameState, content: Content, saveCode: string | null): string {
  return [
    "Barangay Legends problem report",
    `Version: ${VERSION_TEXT}`,
    `Device: ${deviceInfo()}`,
    `Game: Araw ${dayAt(content, state.foundedAt, state.time)}, ${state.villagers} villagers${state.devSave ? " (dev save)" : ""}`,
    "",
    "What happened:",
    what.trim() || "-",
    "",
    "What I expected:",
    expected.trim() || "-",
    ...(saveCode ? ["", "Save code:", saveCode] : []),
  ].join("\n");
}

export function ReportDialog(props: { open: boolean; state: GameState; content: Content; game: GameText; lang: Lang; onClose: () => void }) {
  const { open, state, content, game, lang, onClose } = props;
  const t = game.report;
  const [what, setWhat] = useState("");
  const [expected, setExpected] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const full = () => reportText(what, expected, state, content, exportCode(state));
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const close = () => {
    setNote(null);
    onClose();
  };

  const share = async () => {
    const text = full();
    const fileObj = new File([text], "barangay-legends-report.txt", { type: "text/plain" });
    try {
      if (navigator.canShare?.({ files: [fileObj] })) await navigator.share({ title: t.title[lang], text: reportText(what, expected, state, content, null), files: [fileObj] });
      else await navigator.share({ title: t.title[lang], text });
    } catch {
      // Cancelled, or not allowed: nothing to do.
    }
  };
  const github = () => {
    copyText(exportCode(state));
    const body = `${reportText(what, expected, state, content, null)}\n\nSave code:\n${t.pasteSave[lang]}`;
    const title = what.trim().split("\n")[0].slice(0, 80) || t.title[lang];
    window.open(`${ISSUES_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, "_blank", "noopener");
    setNote(t.githubNote[lang]);
  };

  return (
    <Dialog open={open} title={t.title[lang]} onClose={close}>
      <label className="block text-xs font-semibold">
        {t.what[lang]}
        <textarea value={what} onChange={(e) => setWhat(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border-2 border-amber-900/40 bg-white p-2 text-sm font-normal" />
      </label>
      <label className="block text-xs font-semibold">
        {t.expected[lang]}
        <textarea value={expected} onChange={(e) => setExpected(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border-2 border-amber-900/40 bg-white p-2 text-sm font-normal" />
      </label>
      <p className="text-[11px] text-stone-600">{t.note[lang]}</p>
      <div className="flex flex-wrap gap-2">
        {canShare && (
          <button type="button" className="game-btn border-2 border-green-950 bg-green-700 px-3 py-1.5 text-sm font-semibold text-white" onClick={share}>
            📤 {t.share[lang]}
          </button>
        )}
        <button type="button" className={btn} onClick={() => copyText(full()).then((ok) => ok && setNote(t.copied[lang]))}>
          📋 {t.copy[lang]}
        </button>
      </div>
      <button type="button" className="text-xs font-semibold text-amber-900 underline" onClick={github}>
        {t.github[lang]} ↗
      </button>
      {note && <p className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-950">{note}</p>}
      <p className="text-[11px] text-stone-500">{fill(game.version.label[lang], { version: VERSION_TEXT })}</p>
      <div className="flex justify-end">
        <button type="button" className={btn} onClick={close}>
          {t.close[lang]}
        </button>
      </div>
    </Dialog>
  );
}
