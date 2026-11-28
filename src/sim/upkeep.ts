// Upkeep: a large army costs income. Above set population thresholds every
// delivery of gold or wood is cut (CONFIG.upkeep). It needs no saved state:
// the rate follows from the population used at the moment of delivery.

import { CONFIG } from './config';
import type { Game } from './game';

export interface UpkeepTier {
  above: number;
  rate: number;
  name: string;
}

/** The upkeep tier for a population used, or null below the first threshold. */
export function upkeepTierFor(popUsed: number): UpkeepTier | null {
  let tier: UpkeepTier | null = null;
  for (const t of CONFIG.upkeep.tiers) if (popUsed > t.above) tier = t;
  return tier;
}

/** Share of each delivery a player keeps right now (1 = no upkeep). */
export function upkeepRate(game: Game, player: number): number {
  return upkeepTierFor(game.popUsed(player))?.rate ?? 1;
}

/** Population at which the next tier starts, or null when at the highest. */
export function nextUpkeepThreshold(popUsed: number): number | null {
  for (const t of CONFIG.upkeep.tiers) if (popUsed <= t.above) return t.above;
  return null;
}
