// The ritual specialist's hut is named in the barangay's tradition's own word: "Babaylan's Hut"
// for Visayan barangays, the tradition's term elsewhere (Tagalog: Katalonan's Hut), and a
// general "Healer's Hut" before a tradition is chosen (content/traditions *.rituals.healer; the
// general role is explained in the Aklat entry content/lore/babaylan.json). Only display names
// change: the building's id, numbers and rules stay the same. Display only.
import type { Content } from "../engine/content";

const HUT = "babaylan-hut";
const GENERAL = "Healer";
const cache = new WeakMap<Content, Map<string, Content>>();

/** The term for the ritual specialist in a tradition (English), or the general word. */
export function healerTerm(content: Content, tradition: string | null | undefined): string {
  return content.traditions.find((t) => t.id === tradition)?.rituals?.healer?.en ?? GENERAL;
}

/** The content as a barangay of this tradition sees it: the healer's hut (and what names it) in its words. */
export function withTraditionNames(content: Content, tradition: string | null | undefined): Content {
  const key = tradition ?? "";
  let byTradition = cache.get(content);
  if (!byTradition) cache.set(content, (byTradition = new Map()));
  const hit = byTradition.get(key);
  if (hit) return hit;
  const hut = content.buildings.find((b) => b.id === HUT);
  const term = healerTerm(content, tradition);
  let out = content;
  if (hut) {
    const name = `${term}'s Hut`;
    const buildings = content.buildings.map((b) => {
      if (b.id === HUT) return { ...b, name, description: b.description.replace(/the babaylan\b/i, `the ${term.toLowerCase()}`) };
      return b.description.includes(hut.name) ? { ...b, description: b.description.split(hut.name).join(name) } : b;
    });
    out = { ...content, buildings };
  }
  byTradition.set(key, out);
  return out;
}
