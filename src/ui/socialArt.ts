// Flat SVG art for evening and feast life (W.6): instruments and games, in the game's style. Shown
// in the Pista panel and the Aklat; on the map they are drawn small on the canvas (VillagerLayer).
// Kulintang only for Maranao and other Mindanao traditions. No gambling items.

/** The agong: a large bossed gong hung from a wooden frame by a cord. */
export const AGONG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <g stroke="#5b3a1e" stroke-width="2.4" stroke-linecap="round"><line x1="10" y1="60" x2="12" y2="8"/><line x1="54" y1="60" x2="52" y2="8"/><line x1="9" y1="9" x2="55" y2="9"/></g>
  <line x1="32" y1="9" x2="32" y2="16" stroke="#a16207" stroke-width="1.4"/>
  <circle cx="32" cy="36" r="19" fill="#b45309" stroke="#78350f" stroke-width="1.6"/>
  <circle cx="32" cy="36" r="14" fill="none" stroke="#d97706" stroke-width="1.2"/>
  <circle cx="32" cy="36" r="6" fill="#facc15" stroke="#a16207" stroke-width="1"/>
  <path d="M44 56 L52 46" stroke="#6b4423" stroke-width="2.4" stroke-linecap="round"/><circle cx="53" cy="45" r="3" fill="#e7e5e4" stroke="#78716c" stroke-width="0.8"/>
</svg>`;

/** The kulintang: a row of small bossed gongs laid on a carved wooden frame (Maranao). */
export const KULINTANG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M3 40 L61 40 L57 52 L7 52 Z" fill="#7c2d12" stroke="#4a1d0b" stroke-width="1"/>
  <path d="M7 46 Q32 42 57 46" stroke="#facc15" stroke-width="1" fill="none"/>
  <g fill="#ca8a04" stroke="#854d0e" stroke-width="0.8">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<ellipse cx="${8 + i * 6.9}" cy="36" rx="3.2" ry="2.4"/>`).join("")}</g>
  <g fill="#fde68a">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<circle cx="${8 + i * 6.9}" cy="34.8" r="1.1"/>`).join("")}</g>
  <g stroke="#6b4423" stroke-width="2" stroke-linecap="round"><line x1="20" y1="20" x2="26" y2="32"/><line x1="40" y1="20" x2="36" y2="32"/></g>
</svg>`;

/** A bamboo flute (and a nose flute beside it): plain bamboo with finger holes. */
export const FLUTE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="6" y="22" width="52" height="7" rx="3.5" fill="#a3b84a" stroke="#4d5c22" stroke-width="1" transform="rotate(-12 32 25)"/>
  <g fill="#3f3f1f" transform="rotate(-12 32 25)">${[0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${24 + i * 5}" cy="25.5" r="1.1"/>`).join("")}</g>
  <rect x="12" y="40" width="40" height="6" rx="3" fill="#8aa04a" stroke="#4d5c22" stroke-width="1"/>
  <g fill="#3f3f1f"><circle cx="20" cy="43" r="1"/><circle cx="34" cy="43" r="1"/><circle cx="44" cy="43" r="1"/></g>
</svg>`;

/** A sipa ball: woven rattan, kicked and kept in the air. */
export const SIPA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="20" fill="#d6b67a" stroke="#8a6a35" stroke-width="1.6"/>
  <g stroke="#8a6a35" stroke-width="1.2" fill="none"><path d="M14 26 Q32 36 50 26"/><path d="M14 38 Q32 28 50 38"/><path d="M26 13 Q36 32 26 51"/><path d="M38 13 Q28 32 38 51"/></g>
</svg>`;

/** A counting game board: a carved wooden board with two rows of hollows and a store at each end, with shells. */
export const BOARD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M4 22 Q32 14 60 22 L60 42 Q32 50 4 42 Z" fill="#92400e" stroke="#5b2a0a" stroke-width="1.2"/>
  <ellipse cx="9" cy="32" rx="3.5" ry="7" fill="#5b2a0a"/><ellipse cx="55" cy="32" rx="3.5" ry="7" fill="#5b2a0a"/>
  <g fill="#5b2a0a">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<circle cx="${16 + i * 5.3}" cy="27" r="2.1"/><circle cx="${16 + i * 5.3}" cy="37" r="2.1"/>`).join("")}</g>
  <g fill="#f5efe0">${[0, 2, 3, 5].map((i) => `<circle cx="${16 + i * 5.3}" cy="27" r="0.9"/>`).join("")}${[1, 4, 6].map((i) => `<circle cx="${16 + i * 5.3}" cy="37" r="0.9"/>`).join("")}</g>
</svg>`;

const url = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, " "))}`;

export const SOCIAL_ART = { agong: url(AGONG), kulintang: url(KULINTANG), flute: url(FLUTE), sipa: url(SIPA), board: url(BOARD) };
