// Placeholder opponent: it trains a few workers and keeps them harvesting,
// using the same Command interface and rules as the player. The real
// computer opponent (building, army, attacking) arrives in Milestone 4.

import { CONFIG, secondsToTicks } from '../sim/config';
import type { Game } from '../sim/game';
import type { ResourceNode } from '../sim/types';

const THINK_TICKS = secondsToTicks(3);
const WORKER_TARGET = 8;

export class RivalEconomy {
  constructor(private player: number) {}

  update(game: Game): void {
    if (game.state.tick % THINK_TICKS !== 1) return;
    const hq = game.buildings().find((b) => b.owner === this.player && b.type === 'hq' && b.progress >= 1);
    if (!hq) return;
    const workers = game.units().filter((u) => u.owner === this.player && u.type === 'worker').length;
    const p = game.player(this.player);
    if (workers + hq.queue.length < WORKER_TARGET && hq.queue.length < 2 && p.gold >= CONFIG.units.worker.cost.gold) {
      game.issue({ type: 'train', player: this.player, buildingId: hq.id, unit: 'worker' });
    }
    const idle = game.idleWorkers(this.player);
    if (!idle.length) return;
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
