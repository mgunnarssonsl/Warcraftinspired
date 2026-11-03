// Custom match rules: the few settings a player may change before a match
// (starting resources and workers, the population ceiling, how much of the
// map is known, and whether neutral camps are out there). They live in the
// game state, so saves, replays and online play carry them; a state without
// them (older saves) plays by the defaults.

import { CONFIG } from './config';
import type { GameState } from './types';

export type FogRule = 'normal' | 'explored' | 'revealed';

export interface MatchRules {
  startGold: number;
  startWood: number;
  startWorkers: number;
  maxPop: number;
  /** normal: fog of war; explored: the map is known from the start, units still hidden; revealed: no fog at all. */
  fog: FogRule;
  /** Neutral camps (and their items) guarding mines and lairs. */
  camps: boolean;
}

export const DEFAULT_RULES: MatchRules = {
  startGold: CONFIG.match.startGold,
  startWood: CONFIG.match.startWood,
  startWorkers: CONFIG.match.startWorkers,
  maxPop: CONFIG.match.maxPop,
  fog: 'normal',
  camps: true,
};

/** The choices offered for each rule (also the only values accepted from a lobby or a link). */
export const RULE_CHOICES = {
  startGold: [250, 500, 1000, 2500, 5000],
  startWood: [150, 500, 1000, 2500],
  startWorkers: [3, 5, 10, 15],
  maxPop: [60, 100, 150, 200],
  fog: ['normal', 'explored', 'revealed'] as FogRule[],
  camps: [true, false],
} as const;

/** Any rules (from a URL, a lobby, a file) made safe: unknown values fall back to the defaults. */
export function cleanRules(raw: unknown): MatchRules {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <K extends keyof MatchRules>(k: K): MatchRules[K] =>
    ((RULE_CHOICES[k] as readonly unknown[]).includes(r[k]) ? r[k] : DEFAULT_RULES[k]) as MatchRules[K];
  return { startGold: pick('startGold'), startWood: pick('startWood'), startWorkers: pick('startWorkers'), maxPop: pick('maxPop'), fog: pick('fog'), camps: pick('camps') };
}

export function rulesOf(state: Pick<GameState, 'rules'>): MatchRules {
  return state.rules ?? DEFAULT_RULES;
}

export function isDefaultRules(r: MatchRules): boolean {
  return (Object.keys(DEFAULT_RULES) as Array<keyof MatchRules>).every((k) => r[k] === DEFAULT_RULES[k]);
}

/** "1000 gold · no fog", for match descriptions (empty for the standard rules). */
export function describeRules(r: MatchRules): string {
  const d = DEFAULT_RULES;
  const parts: string[] = [];
  if (r.startGold !== d.startGold || r.startWood !== d.startWood) parts.push(`start ${r.startGold} gold, ${r.startWood} wood`);
  if (r.startWorkers !== d.startWorkers) parts.push(`${r.startWorkers} workers`);
  if (r.maxPop !== d.maxPop) parts.push(`population ${r.maxPop}`);
  if (r.fog === 'explored') parts.push('map explored');
  if (r.fog === 'revealed') parts.push('no fog');
  if (!r.camps) parts.push('no camps');
  return parts.join(' · ');
}
