// Icons for the barangay's goods, drawn in the game's flat style (no emoji for things in the
// game world): Pagkain, Palay, Asin and rice wine have their own art; wood and gold keep their
// symbols for now. Used in the HUD, the build toolbar's costs and the share card.
import type { Resource } from "../engine/content";

/** Pagkain: a woven bilao (winnowing tray) with gabi, a banana and a fish. */
const FOOD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <ellipse cx="16" cy="21" rx="14" ry="7" fill="#c9a36a" stroke="#7a5230" stroke-width="1.2"/>
  <ellipse cx="16" cy="20" rx="11" ry="5" fill="none" stroke="#a07a45" stroke-width="0.8"/>
  <ellipse cx="11" cy="17" rx="4.2" ry="3.4" fill="#8b6a8f" stroke="#4a3550" stroke-width="0.8"/>
  <path d="M15 19 Q19 11 26 12 Q22 15 17 20 Z" fill="#e8c547" stroke="#8a6d1a" stroke-width="0.8"/>
  <path d="M12 21 Q17 18 22 21 Q17 24 12 21 Z M22 21 L25 19 L25 23 Z" fill="#7aa0b8" stroke="#35556a" stroke-width="0.8"/>
</svg>`;

/** Palay: a sheaf of rice stalks with heavy, drooping grain heads, tied at the middle. */
const PALAY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <g stroke="#9a7a2a" stroke-width="1.2" fill="none" stroke-linecap="round">
    <path d="M16 30 L16 12"/><path d="M14 30 L12 11"/><path d="M18 30 L20 11"/><path d="M12.5 30 L8 13"/><path d="M19.5 30 L24 13"/>
  </g>
  <g fill="#e2b13c" stroke="#a67c1a" stroke-width="0.6">
    <ellipse cx="16" cy="8" rx="2" ry="4"/><ellipse cx="11" cy="8" rx="1.8" ry="3.6" transform="rotate(-18 11 8)"/><ellipse cx="21" cy="8" rx="1.8" ry="3.6" transform="rotate(18 21 8)"/>
    <ellipse cx="7" cy="11" rx="1.6" ry="3.2" transform="rotate(-35 7 11)"/><ellipse cx="25" cy="11" rx="1.6" ry="3.2" transform="rotate(35 25 11)"/>
  </g>
  <rect x="12" y="20" width="8" height="2.6" rx="1" fill="#7a4f2a"/>
</svg>`;

/** Asin: a cake of sea salt on a leaf. */
const ASIN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <path d="M3 24 Q16 31 29 24 Q16 20 3 24 Z" fill="#4d7c0f" stroke="#365314" stroke-width="0.9"/>
  <path d="M7 22 L9 12 Q16 8 23 12 L25 22 Q16 26 7 22 Z" fill="#f4f1ea" stroke="#9ca3af" stroke-width="1"/>
  <path d="M9 12 Q16 15 23 12" fill="none" stroke="#d1d5db" stroke-width="1"/>
  <g fill="#e5e7eb"><circle cx="13" cy="17" r="1"/><circle cx="18" cy="19" r="1"/><circle cx="16" cy="15" r="0.8"/></g>
</svg>`;

/** Rice wine (tapay): a clay jar (tapayan) with a leaf over its mouth, tied with a cord. */
const WINE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <path d="M11 6 L21 6 L21 9 Q28 12 27 20 Q26 29 16 29 Q6 29 5 20 Q4 12 11 9 Z" fill="#9a5b34" stroke="#5b3a1e" stroke-width="1.2"/>
  <path d="M9 4 Q16 1 23 4 L22 8 Q16 6 10 8 Z" fill="#4d7c0f" stroke="#365314" stroke-width="0.8"/>
  <path d="M10 8 L22 8" stroke="#e7d3a8" stroke-width="1.2"/>
  <path d="M7 17 Q16 21 25 17" fill="none" stroke="#c98b5a" stroke-width="1"/>
</svg>`;

const url = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, " "))}`;

/** Art for the goods that have it, as image URLs. */
export const RESOURCE_ART: Partial<Record<Resource, string>> = { food: url(FOOD), rice: url(PALAY), salt: url(ASIN), wine: url(WINE) };

/** A good's icon: its art if it has some, else its symbol. */
export function ResourceIcon({ resource, symbol, className = "inline-block size-[1.1em] align-[-0.2em]" }: { resource: Resource; symbol: string; className?: string }) {
  const art = RESOURCE_ART[resource];
  return art ? <img src={art} alt="" aria-hidden draggable={false} className={className} /> : <>{symbol}</>;
}
