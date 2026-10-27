// Support casters. Clerics pray on their own: whenever a prayer is ready and
// they have the mana, they heal the most wounded friendly unit in range.
// The rule is the same for every player, so there is nothing to micro-manage
// and the computer gets no edge from faster clicking. Rules: CONFIG.cleric.

import { isHealer } from './factions';
import { CONFIG, secondsToTicks, TICK_SECONDS } from './config';
import type { Game } from './game';
import { healAmount } from './tech';
import type { Unit } from './types';

export function updatePrayers(game: Game, units: readonly Unit[]): void {
  const c = CONFIG.cleric;
  const tick = game.state.tick;
  for (const u of units) {
    if (!isHealer(u.type)) continue;
    u.mana = Math.min(c.mana, u.mana + c.manaRegen * TICK_SECONDS);
    if (u.stun > 0 || u.hidden || u.prayerReady > tick || u.mana < c.healMana) continue;
    const t = mostWounded(units, u);
    if (!t) continue;
    const amount = Math.min(healAmount(game, u.owner), t.maxHp - t.hp);
    t.hp += amount;
    u.mana -= c.healMana;
    u.prayerReady = tick + secondsToTicks(c.healCooldown);
    game.emit({ type: 'heal', player: u.owner, id: t.id, source: u.id, amount, x: t.x, y: t.y });
  }
}

/** Lowest health share among own units in range that are missing enough health. */
function mostWounded(units: readonly Unit[], cleric: Unit): Unit | undefined {
  const c = CONFIG.cleric;
  let best: Unit | undefined;
  let bestShare = Infinity;
  for (const a of units) {
    if (a.owner !== cleric.owner || a.hidden || a.maxHp - a.hp < c.minMissing) continue;
    if (Math.hypot(a.x - cleric.x, a.y - cleric.y) - a.radius > c.healRange) continue;
    const share = a.hp / a.maxHp;
    if (share < bestShare) {
      bestShare = share;
      best = a;
    }
  }
  return best;
}
