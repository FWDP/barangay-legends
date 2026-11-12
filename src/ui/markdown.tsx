// A tiny Markdown reader for docs/credits.md: headings, paragraphs, lists, tables, **bold**,
// `code` and [links](https://...). Builds React elements (never raw HTML), so a contributor's
// text can't inject markup. Anything else shows as plain text.
import type { ReactNode } from "react";

export type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] };

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ type: "heading", level: h[1].length, text: h[2].trim() });
    } else if (line.trim().startsWith("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? "")) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      i--;
      blocks.push({ type: "table", head, rows });
    } else if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      i--;
      blocks.push({ type: "list", items });
    } else {
      const text: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#|\s*[-*]\s|\s*\|)/.test(lines[i])) text.push(lines[i++].trim());
      i--;
      blocks.push({ type: "paragraph", text: text.join(" ") });
    }
  }
  return blocks;
}

/** Inline marks: **bold**, *italic*, `code` and [text](https://link). */
export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((https:\/\/[^\s)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = out.length;
    if (m[1]) out.push(<strong key={key}>{m[1]}</strong>);
    else if (m[2]) out.push(<em key={key}>{m[2]}</em>);
    else if (m[3]) out.push(<code key={key} className="rounded bg-amber-900/10 px-1 text-[0.9em]">{m[3]}</code>);
    else out.push(<a key={key} href={m[5]} target="_blank" rel="noreferrer" className="font-semibold text-amber-800 underline">{m[4]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="space-y-2 text-sm leading-snug">
      {parseMarkdown(source).map((b, i) => {
        switch (b.type) {
          case "heading":
            return b.level === 1 ? null : (
              <h3 key={i} className="pt-2 font-display text-lg text-amber-900">
                {inline(b.text)}
              </h3>
            );
          case "paragraph":
            return <p key={i}>{inline(b.text)}</p>;
          case "list":
            return (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
              </ul>
            );
          case "table":
            return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>{b.head.map((c, j) => <th key={j} className="border-b-2 border-amber-900/30 px-1.5 py-1 text-left">{inline(c)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="align-top">{r.map((c, k) => <td key={k} className="border-b border-amber-900/15 px-1.5 py-1">{inline(c)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
