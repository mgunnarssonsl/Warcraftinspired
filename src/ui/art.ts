// Interface art cut from the style A design sheets by scripts/art_icons.py
// (public/art): portraits for units and buildings, icons for abilities,
// items and research, and small SVG glyphs for plain commands.

import type { AbilityId, BuildingType, ItemId, ResearchId, SkillId, UnitType } from '../sim/config';

const base = 'art';

export function unitArt(t: UnitType): string {
  return `${base}/u/${t}.webp`;
}

/** A building's portrait, by tier: the Keep shows as a Castle or Citadel, the Heartwood as a Deepwood or Ancient. */
export function buildingArt(t: BuildingType | 'goldmine' | 'tree', tier = 1): string {
  if (t === 'hq' && tier > 1) return `${base}/b/${tier > 2 ? 'citadel' : 'castle'}.webp`;
  if (t === 'heartwood' && tier > 1) return `${base}/b/${tier > 2 ? 'ancient' : 'deepwood'}.webp`;
  return `${base}/b/${t}.webp`;
}

export const abilityArt = (a: AbilityId) => `${base}/a/${a}.webp`;
export const itemArt = (i: ItemId) => `${base}/i/${i}.webp`;
export const researchArt = (r: ResearchId) => `${base}/r/${r}.webp`;

/** Unit skills: cut from sheet 16, or borrowing the hero spell that looks the same. */
const SKILL_ART: Record<SkillId, string> = {
  aim: 's/aim',
  charge: 's/charge',
  leap: 's/leap',
  pounce: 's/pounce',
  shift: 's/shift',
  stance: 'r/armor2',
  barkshield: 'a/barkskin',
  root: 'a/entangle',
};
export const skillArt = (s: SkillId) => `${base}/${SKILL_ART[s]}.webp`;
/** Mounting: the rider pair it makes. */
export const mountArt = (wolf: boolean) => `${base}/s/${wolf ? 'mountwolf' : 'mount'}.webp`;

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** Glyphs for orders that have no painted icon, drawn in the interface gold. */
export const COMMAND_GLYPHS: Record<string, string> = {
  move: svg('<path d="M5 19L19 5"/><path d="M11 5h8v8"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>'),
  attack: svg('<path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/>'),
  hold: svg('<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>'),
  gather: svg('<path d="M14 6l4 4"/><path d="M4 20l10-10"/><path d="M12 4c4-1 7 1 8 4-3-1-5 0-7 2"/>'),
  return: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>'),
  repair: svg('<path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>'),
  flare: svg('<path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'),
  cancel: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
};
