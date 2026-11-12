import { describe, expect, it } from "vitest";
import credits from "../../docs/credits.md?raw";
import { inline, parseMarkdown } from "./markdown";

describe("credits markdown", () => {
  it("reads headings, paragraphs, lists and tables", () => {
    const blocks = parseMarkdown("# Title\n\nSome *text*\nmore.\n\n- one\n- two\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n");
    expect(blocks).toEqual([
      { type: "heading", level: 1, text: "Title" },
      { type: "paragraph", text: "Some *text* more." },
      { type: "list", items: ["one", "two"] },
      { type: "table", head: ["A", "B"], rows: [["1", "2"], ["3", "4"]] },
    ]);
  });

  it("only links to https, so text can't run script", () => {
    const parts = inline("[ok](https://fwdp.org) [bad](javascript:alert(1))");
    expect(parts.filter((p) => typeof p !== "string")).toHaveLength(1);
  });

  it("parses docs/credits.md with its sound table, contributors and licenses", () => {
    const blocks = parseMarkdown(credits);
    const headings = blocks.filter((b) => b.type === "heading").map((b) => (b as { text: string }).text);
    expect(headings).toEqual(expect.arrayContaining(["Sound", "Contributors", "Licenses"]));
    expect(blocks.filter((b) => b.type === "table").length).toBeGreaterThanOrEqual(2);
  });
});
