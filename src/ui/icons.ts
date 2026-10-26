// Role icons for the interface: one simple, original glyph per unit type,
// drawn in the current text colour on a 24x24 grid. They tell units apart in
// the selection panel without relying on colour.

import type { UnitType } from '../sim/config';

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const SHIELD = '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>';
const BOW = '<path d="M7 3c7 3 7 15 0 18"/><path d="M7 3v18"/><path d="M5 12h14M16 9l3 3-3 3"/>';

export const UNIT_ICONS: Record<UnitType, string> = {
  worker: svg('<path d="M5 19l9-9"/><path d="M9 5c4-2 8 0 10 4-3-1-6-1-8 1"/>'),
  guard: svg(SHIELD + '<path d="M12 8v8M9 11h6"/>'),
  archer: svg(BOW),
  lancer: svg('<path d="M4 20L20 4"/><path d="M20 4l-6 1 5 5z" fill="currentColor"/><path d="M8 14l-3 6 6-3"/>'),
  cleric: svg('<circle cx="12" cy="12" r="8"/><path d="M12 7v10M7 12h10"/>'),
  mangonel: svg('<path d="M3 19h18"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/><path d="M8 17L17 6"/><circle cx="18.5" cy="4.5" r="2" fill="currentColor"/>'),
  outrider: svg('<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>'),
  hero: svg('<path d="M4 18h16l1-10-5 4-4-7-4 7-5-4z"/>'),
  ranger: svg(BOW + '<path d="M18 4l1 2 2 .3-1.5 1.4.4 2-1.9-1-1.9 1 .4-2L15 6.3l2-.3z" fill="currentColor" stroke-width="1"/>'),
  sage: svg('<path d="M12 21c-4 0-6-3-6-6 0-4 4-6 3-11 3 2 4 4 4 7 1-1 2-2 2-4 2 2 3 5 3 8 0 3-2 6-6 6z"/>'),
  brigand: svg('<path d="M6 18L17 7"/><path d="M14 4l6 6"/><path d="M5 15l4 4"/>'),
  poacher: svg(BOW),
  chief: svg('<path d="M5 14a7 7 0 0114 0v4H5z"/><path d="M5 12L2 6M19 12l3-6"/>'),
  brute: svg('<path d="M6 20l9-9"/><path d="M13 9c1-4 6-6 8-4s0 7-4 8z" fill="currentColor"/>'),
  wolf: svg('<circle cx="12" cy="15" r="3.5" fill="currentColor"/><circle cx="6.5" cy="10" r="1.8"/><circle cx="10" cy="6.5" r="1.8"/><circle cx="14" cy="6.5" r="1.8"/><circle cx="17.5" cy="10" r="1.8"/>'),
};
