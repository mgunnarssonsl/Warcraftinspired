// Thornwild regrowth: its units and buildings heal on their own once they
// have gone a few seconds without being hurt. Counterplay: keep the pressure
// on, or finish what you start. Applied once a second.

import { CONFIG, TICK_RATE } from './config';
import { regenRate } from './factions';
import type { Game } from './game';
import { researched } from './tech';

export function updateRegrowth(game: Game): void {
  const tick = game.state.tick;
  if (tick % TICK_RATE !== 0) return;
  const quiet = tick - CONFIG.wild.regenDelay * TICK_RATE;
  const boost = (owner: number) => {
    const p = game.state.players[owner];
    return p && p.faction === 'wild' && researched(game, owner, 'deeproots') ? CONFIG.wild.deepRootsFactor : 1;
  };
  for (const u of game.units()) {
    if (u.hp >= u.maxHp || u.hurt > quiet || u.hidden) continue;
    const r = regenRate('unit', u.type);
    if (r > 0) u.hp = Math.min(u.maxHp, u.hp + r * boost(u.owner));
  }
  for (const b of game.buildings()) {
    if (b.hp >= b.maxHp || b.hurt > quiet) continue;
    const r = regenRate('building', b.type);
    // A growing building's health is its growth; regrowth only mends damage beyond that.
    if (r > 0 && b.progress >= 1) b.hp = Math.min(b.maxHp, b.hp + r * boost(b.owner));
  }
}
