// Victory and defeat. A (non-neutral) player is defeated when they own no
// buildings at all, finished or not, or when they surrender. When at most one
// contender remains, the match is decided: that player wins, or, if the last
// contenders were all defeated in the same tick, the match is a draw.
// The simulation keeps running afterwards so players can watch.

import type { Game } from './game';
import { destroyBuilding } from './production';

export function defeat(game: Game, player: number, reason: 'eliminated' | 'surrendered'): void {
  const p = game.state.players[player];
  if (!p || p.neutral || p.defeated || game.state.outcome) return;
  p.defeated = true;
  game.emit({ type: 'playerDefeated', player, reason });
  // A defeated player's remaining forces leave the field.
  for (const u of game.units()) {
    if (u.owner !== player) continue;
    game.emit({ type: 'death', id: u.id, owner: u.owner, unit: u.type, x: u.x, y: u.y });
    game.removeEntity(u.id);
  }
  for (const b of game.buildings()) if (b.owner === player) destroyBuilding(game, b.id);
}

export function checkOutcome(game: Game): void {
  if (game.state.outcome || !game.state.victoryRules) return;
  const contenders = game.state.players.filter((p) => !p.neutral);
  const owned = new Set(game.buildings().map((b) => b.owner));
  for (const p of contenders) if (!p.defeated && !owned.has(p.id)) defeat(game, p.id, 'eliminated');
  const alive = contenders.filter((p) => !p.defeated);
  if (alive.length > 1) return;
  const winner = alive.length === 1 ? alive[0].id : null;
  game.state.outcome = { winner, tick: game.state.tick };
  game.emit({ type: 'matchOver', winner });
}
