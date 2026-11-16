// Aklat ng Alamat entries for W (warfare, feuds, peace, social life, houses).
import { describe, expect, it } from "vitest";
import review from "../../docs/cultural-review.md?raw";
import { content } from "./testUtils";

const IDS = ["raiding", "captives-ransom", "blood-debts", "blood-price", "peace-rituals", "warrior-honor", "suyak", "music", "dances", "games", "betel", "feasts-social", "cockfighting", "bahay-kubo", "bayanihan"];

describe("Aklat entries for war, peace and social life", () => {
  it("each is sourced, waiting for review and listed for the historian", () => {
    for (const id of IDS) {
      const e = content.aklat.find((x) => x.id === id);
      expect(e, id).toBeDefined();
      expect(e!.reviewed).toBe(false);
      expect(e!.sources.length).toBeGreaterThan(0);
      expect(review).toContain(`content/lore/${id}.json`);
    }
  });

  it("the blood price entry names heirlooms as what was historically paid", () => {
    const e = content.aklat.find((x) => x.id === "blood-price")!;
    expect(e.aklat.lore.en).toMatch(/gongs/);
    expect(e.aklat.lore.en).toMatch(/porcelain/);
    expect(e.aklat.lore.en).toMatch(/textiles/);
  });

  it("uses no terms the prompt rules out, and names games by tradition", () => {
    const text = JSON.stringify(content.aklat).toLowerCase();
    for (const bad of ["patintero", "trumpo", "trompo", "arnis", "eskrima", "balagtasan", "bagbagto", "wergild", "headhunt", "magahat", "larao", "barote", "sumpit"]) expect(text).not.toContain(bad);
    const games = content.aklat.find((x) => x.id === "games")!.aklat.lore.en;
    for (const name of ["tubigan", "harangang-taga", "tadlas", "kunggit", "sungka"]) expect(games).toContain(name);
    expect(content.aklat.find((x) => x.id === "captives-ransom")!.aklat.lore.en).toMatch(/dependents/);
    expect(content.aklat.find((x) => x.id === "cockfighting")!.aklat.inGame.en).toMatch(/no gambling/);
  });
});
