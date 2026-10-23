// Placeholder opponent for the economic sandbox: it only keeps its workers
// harvesting, using the same Command interface as the player. The real
// computer opponent (building, training, attacking) arrives in Milestone 4.

import { secondsToTicks } from '../sim/config';
import type { Game } from '../sim/game';
import type { ResourceNode } from '../sim/types';

const THINK_TICKS = secondsToTicks(3);

export class RivalEconomy {
  constructor(private player: number) {}

  update(game: Game): void {
    if (game.state.tick % THINK_TICKS !== 1) return;
    const idle = game.idleWorkers(this.player);
    if (!idle.length) return;
    const hq = game.buildings().find((b) => b.owner === this.player);
    if (!hq) return;
    const near = (type: ResourceNode['type']) =>
      game
        .resources()
        .filter((r) => r.type === type)
        .sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0];
    const mine = near('goldmine');
    const tree = near('tree');
    // Keep roughly three on gold, the rest on wood.
    let onGold = game
      .units()
      .filter((u) => u.owner === this.player && u.order?.type === 'gather' && u.order.res === 'gold').length;
    for (const u of idle) {
      const target = onGold < 3 && mine ? mine : tree;
      if (!target) continue;
      if (target === mine) onGold++;
      game.issue({ type: 'gather', player: this.player, units: [u.id], nodeId: target.id });
    }
  }
}
