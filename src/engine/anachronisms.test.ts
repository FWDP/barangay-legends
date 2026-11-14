// No anachronisms (prompt S, section 6): the colonial "kapre" becomes the Anito ng Balete, the
// tigbalang keeps its early name and no horse head, and old saves follow the renamed ids.
import { describe, expect, it } from "vitest";
import { parseSave } from "./save";
import { content, withState } from "./testUtils";

describe("the Anito ng Balete (was the kapre)", () => {
  it("is the grove's name, and no player-facing content says kapre except the Aklat entry explaining the word", () => {
    const grove = content.groves.find((b) => b.id === "anito-ng-balete");
    expect(grove?.name).toBe("Anito ng Balete");
    const text = JSON.stringify({ ...content, lore: { ...content.lore, "anito-ng-balete": null }, aklat: content.aklat.filter((e) => e.id !== "anito-ng-balete") });
    expect(text.toLowerCase()).not.toContain("kapre");
    const entry = content.lore["anito-ng-balete"] as unknown as { reviewed?: boolean; aklat?: { lore: { en: string } } };
    expect(entry.reviewed).toBe(false);
    expect(entry.aklat?.lore.en).toMatch(/cafre/);
  });

  it("old saves (v28) carry their Aklat entry, flag, history line and villager story over", () => {
    const s = withState({ aklat: ["balete", "kapre"], flags: ["kapre", "anito-ng-balete"] });
    const named = s.named.length ? s.named : [{ id: 1, name: "Bayani", story: "kapre-friend", role: "woodcutter", since: 0, gender: "man" }];
    const raw = { ...s, version: 28, named: named.map((v) => ({ ...v, story: "kapre-friend" })), history: [{ at: 1, kind: "aklat", entry: "kapre" }] };
    const loaded = parseSave(JSON.stringify(raw), content)!;
    expect(loaded.aklat).toEqual(["balete", "anito-ng-balete"]);
    expect(loaded.flags).toEqual(["anito-ng-balete"]);
    expect(loaded.history).toContainEqual({ at: 1, kind: "aklat", entry: "anito-ng-balete" });
    for (const v of loaded.named) expect(v.story).toBe("balete-friend");
  });
});

describe("the tigbalang", () => {
  it("uses the name recorded by Plasencia (1589) and no horse", () => {
    const lore = content.lore.tikbalang as unknown as { name: string; sources: string[]; aklat: { icon: string; name: { en: string } } };
    expect(lore.name).toBe("Tigbalang");
    expect(lore.aklat.name.en).toBe("Tigbalang");
    expect(lore.aklat.icon).not.toBe("🐴");
    expect(lore.sources.some((s) => s.includes("Plasencia"))).toBe(true);
  });
});
