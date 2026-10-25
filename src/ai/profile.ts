// A computer player's plan: a difficulty (how well it plays: reaction time,
// judgement, micro) combined with a strategic style (what it plans: timing,
// army, expansions). Kept apart so every style can be played at every
// difficulty, and the two can be described separately to the player.

import { CONFIG, type ArmyMix } from '../sim/config';
import { hash2 } from '../sim/rng';

export type Difficulty = keyof typeof CONFIG.ai.profiles;
export type StyleId = keyof typeof CONFIG.ai.styles;
export type AdvantageId = keyof typeof CONFIG.ai.advantages;

export const STYLES = Object.keys(CONFIG.ai.styles) as StyleId[];

type Widen<T> = T extends number ? number : T extends boolean ? boolean : T;
type DifficultyProfile = { -readonly [K in keyof (typeof CONFIG.ai.profiles)['hard']]: Widen<(typeof CONFIG.ai.profiles)['hard'][K]> };
export type Profile = DifficultyProfile & {
  /** Smallest army (hero included) it takes camp-clearing. */
  creepParty: number;
  raids: boolean;
  heroesEarly: boolean;
};
/** Strategy tweaks on top of a profile (used by tests and balance playtests). */
export type ProfileOverrides = Partial<Profile>;

/** The style a "random" opponent plays: fixed by the match seed, so a replay matches. */
export function randomStyle(seed: number): StyleId {
  return STYLES[Math.floor(hash2(7919, 104729, seed) * STYLES.length)];
}

export function composeProfile(difficulty: Difficulty, style: StyleId = 'balanced', overrides: ProfileOverrides = {}): Profile {
  const base = CONFIG.ai.profiles[difficulty];
  const a = CONFIG.ai.styles[style].adjust;
  const time = (v: number | null, k: number | undefined) => (v === null ? null : Math.round(v * (k ?? 1)));
  const p: Profile = {
    ...base,
    mix: { ...base.mix } as ArmyMix,
    heroes: [...base.heroes],
    creepParty: Math.max(3, CONFIG.ai.creepParty + (a.creepParty ?? 0)),
    raids: !!a.raids,
    heroesEarly: !!a.heroesEarly,
  };
  p.firstAttackSeconds = time(base.firstAttackSeconds, a.attackTiming)!;
  p.expandSeconds = time(base.expandSeconds, a.expandTiming)!;
  p.castleSeconds = time(base.castleSeconds, a.castleTiming);
  p.citadelSeconds = time(base.citadelSeconds, a.castleTiming);
  p.waveSize = Math.max(3, base.waveSize + (a.waveSize ?? 0));
  p.waveGrowth = Math.max(1, base.waveGrowth + (a.waveGrowth ?? 0));
  p.towers = Math.max(0, base.towers + (a.towers ?? 0));
  p.workerTarget = base.workerTarget + (a.workerTarget ?? 0);
  p.maxKeeps = Math.min(3, base.maxKeeps + (a.maxKeeps ?? 0));
  if (a.mix) {
    // An easy computer never fortifies, so tier II units in a style's mix
    // simply never come up; keep its Guards-and-Archers backbone.
    p.mix = { ...a.mix };
  }
  return { ...p, ...overrides };
}
