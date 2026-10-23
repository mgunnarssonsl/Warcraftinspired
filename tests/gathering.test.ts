import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/sim/config';
import type { GameEvent } from '../src/sim/types';
import { emptyGame, run, runUntil } from './helpers';

const W = CONFIG.units.worker;

function goldSetup(mineAmount = 1000) {
  const g = emptyGame(40, 24);
  const hq = g.addBuilding('hq', 0, 4, 8);
  const mine = g.addResource('goldmine', 14, 9, mineAmount);
  return { g, hq, mine };
}

describe('gold gathering', () => {
  it('only adds gold to the stockpile on delivery, carrying it explicitly', () => {
    const { g, mine } = goldSetup();
    const u = g.addUnit('worker', 0, 9.5, 10.5);
    g.issue({ type: 'gather', player: 0, units: [u.id], nodeId: mine.id });
    runUntil(g, () => u.carry.amount > 0, 400);
    expect(u.carry).toEqual({ res: 'gold', amount: W.carryGold });
    expect(g.player(0).gold).toBe(0);
    expect(mine.amount).toBe(1000 - W.carryGold);
    runUntil(g, () => u.carry.amount === 0, 400);
    expect(g.player(0).gold).toBe(W.carryGold);
    // And it loops back automatically.
    runUntil(g, () => g.player(0).gold === 3 * W.carryGold, 1200);
    expect(u.order?.type).toBe('gather');
  });

  it('conserves gold: mine + cargo + stockpile is constant', () => {
    const { g, mine } = goldSetup(500);
    const ids = [0, 1, 2, 3].map((i) => g.addUnit('worker', 0, 9.5, 8.5 + i).id);
    g.issue({ type: 'gather', player: 0, units: ids, nodeId: mine.id });
    for (let t = 0; t < 2000; t++) {
      g.step();
      const m = g.resource(mine.id)?.amount ?? 0;
      const carried = ids.reduce((s, id) => s + (g.unit(id)!.carry.res === 'gold' ? g.unit(id)!.carry.amount : 0), 0);
      expect(m + carried + g.player(0).gold).toBe(500);
    }
  });

  it('limits concurrent miners so income saturates', () => {
    const { g, mine } = goldSetup(100000);
    const ids = Array.from({ length: 8 }, (_, i) => g.addUnit('worker', 0, 9.5 + (i % 2), 7.5 + i * 0.5).id);
    g.issue({ type: 'gather', player: 0, units: ids, nodeId: mine.id });
    let maxInside = 0;
    for (let t = 0; t < 1500; t++) {
      g.step();
      const inside = ids.filter((id) => g.unit(id)!.hidden).length;
      maxInside = Math.max(maxInside, inside);
    }
    expect(maxInside).toBe(CONFIG.resources.goldmine.maxMiners);
    // Throughput can never exceed the mine's slot capacity.
    const seconds = 1500 / 20;
    const cap = (CONFIG.resources.goldmine.maxMiners * W.carryGold) / W.mineSeconds;
    expect(g.player(0).goldGathered / seconds).toBeLessThanOrEqual(cap + 0.01);
  });

  it('depletes the mine, removes it, notifies the owner and idles its workers', () => {
    const { g, mine } = goldSetup(30);
    const ids = [0, 1].map((i) => g.addUnit('worker', 0, 9.5, 9.5 + i).id);
    g.issue({ type: 'gather', player: 0, units: ids, nodeId: mine.id });
    const events: GameEvent[] = [];
    runUntil(
      g,
      () => {
        events.push(...g.drainEvents());
        return ids.every((id) => g.unit(id)!.order === null);
      },
      3000,
    );
    expect(g.resource(mine.id)).toBeUndefined();
    expect(g.player(0).gold).toBe(30);
    expect(events.filter((e) => e.type === 'mineDepleted' && e.player === 0)).toHaveLength(1);
    for (const id of ids) expect(g.unit(id)!.carry.amount).toBe(0);
    expect(g.idleWorkers(0)).toHaveLength(2);
    // Mine tiles are walkable again.
    expect(g.nav.passable(15, 10)).toBe(true);
  });

  it('returns cargo first when ordered to a different resource', () => {
    const { g, mine } = goldSetup();
    const tree = g.addResource('tree', 4, 16, 50);
    const u = g.addUnit('worker', 0, 9.5, 10.5);
    g.issue({ type: 'gather', player: 0, units: [u.id], nodeId: mine.id });
    runUntil(g, () => u.carry.amount > 0, 400);
    g.issue({ type: 'gather', player: 0, units: [u.id], nodeId: tree.id });
    runUntil(g, () => u.carry.res === 'wood', 800);
    expect(g.player(0).gold).toBe(W.carryGold);
  });

  it('stop while inside a mine releases the worker without gold', () => {
    const { g, mine } = goldSetup();
    const u = g.addUnit('worker', 0, 9.5, 10.5);
    g.issue({ type: 'gather', player: 0, units: [u.id], nodeId: mine.id });
    runUntil(g, () => u.hidden, 400);
    g.issue({ type: 'stop', player: 0, units: [u.id] });
    g.step();
    expect(u.hidden).toBe(false);
    expect(u.order).toBeNull();
    expect(u.carry.amount).toBe(0);
    expect(g.nav.canStand(u.x, u.y, u.radius)).toBe(true);
    expect(mine.amount).toBe(1000);
  });

  it('ignores commands for units owned by another player', () => {
    const { g, mine } = goldSetup();
    const u = g.addUnit('worker', 1, 9.5, 10.5);
    g.issue({ type: 'gather', player: 0, units: [u.id], nodeId: mine.id });
    run(g, 5);
    expect(u.order).toBeNull();
  });
});

describe('wood gathering', () => {
  it('chops, fells the tree, and moves on to a nearby tree', () => {
    const g = emptyGame(30, 20);
    g.addBuilding('hq', 0, 3, 3);
    const t1 = g.addResource('tree', 12, 5, 15);
    const t2 = g.addResource('tree', 14, 6, 50);
    const u = g.addUnit('worker', 0, 9.5, 5.5);
    g.issue({ type: 'gather', player: 0, units: [u.id], nodeId: t1.id });
    const events: GameEvent[] = [];
    runUntil(
      g,
      () => {
        events.push(...g.drainEvents());
        return !g.resource(t1.id);
      },
      2000,
    );
    expect(events.some((e) => e.type === 'treeFelled')).toBe(true);
    expect(g.nav.passable(12, 5)).toBe(true);
    runUntil(g, () => g.resource(t2.id)!.amount < 50, 2000);
    expect(u.order?.type).toBe('gather');
    // Total conserved: 15 from t1 plus whatever came off t2.
    const carried = u.carry.res === 'wood' ? u.carry.amount : 0;
    expect(g.player(0).wood + carried).toBe(15 + (50 - g.resource(t2.id)!.amount));
  });

  it('a lone woodcutter with no trees left delivers and goes idle', () => {
    const g = emptyGame(30, 20);
    g.addBuilding('hq', 0, 3, 3);
    const t1 = g.addResource('tree', 12, 5, 4);
    const u = g.addUnit('worker', 0, 9.5, 5.5);
    g.issue({ type: 'gather', player: 0, units: [u.id], nodeId: t1.id });
    runUntil(g, () => u.order === null, 2000);
    expect(g.player(0).wood).toBe(4);
    expect(u.carry.amount).toBe(0);
  });

  it('does not pick trees that cannot be reached', () => {
    const g = emptyGame(30, 20);
    g.addBuilding('hq', 0, 3, 3);
    const t1 = g.addResource('tree', 12, 5, 1);
    // A tree fully enclosed by other trees is unreachable; its neighbours are not.
    for (let y = 9; y <= 11; y++) for (let x = 15; x <= 17; x++) g.addResource('tree', x, y, 50);
    const centre = g.nav.entityAt[10 * 30 + 16];
    const u = g.addUnit('worker', 0, 9.5, 5.5);
    g.issue({ type: 'gather', player: 0, units: [u.id], nodeId: t1.id });
    runUntil(g, () => !g.resource(t1.id), 500);
    run(g, 5);
    const o = u.order;
    expect(o?.type).toBe('gather');
    if (o?.type === 'gather') expect(o.nodeId).not.toBe(centre);
  });

  it('caps choppers per tree and spreads extra workers to other trees', () => {
    const g = emptyGame(30, 20);
    g.addBuilding('hq', 0, 3, 3);
    const t1 = g.addResource('tree', 14, 6, 500);
    g.addResource('tree', 16, 9, 500);
    const ids = [0, 1, 2, 3].map((i) => g.addUnit('worker', 0, 10.5, 5.5 + i).id);
    g.issue({ type: 'gather', player: 0, units: ids, nodeId: t1.id });
    let maxOnT1 = 0;
    for (let t = 0; t < 400; t++) {
      g.step();
      const n = ids.filter((id) => {
        const o = g.unit(id)!.order;
        return o?.type === 'gather' && o.nodeId === t1.id && o.phase === 'working';
      }).length;
      maxOnT1 = Math.max(maxOnT1, n);
    }
    expect(maxOnT1).toBeLessThanOrEqual(CONFIG.resources.tree.maxChoppers);
  });

  it('workers with no drop-off building keep their cargo and idle', () => {
    const g = emptyGame(30, 20);
    const t1 = g.addResource('tree', 12, 5, 50);
    const u = g.addUnit('worker', 0, 9.5, 5.5);
    g.issue({ type: 'gather', player: 0, units: [u.id], nodeId: t1.id });
    runUntil(g, () => u.order === null, 1000);
    expect(u.carry).toEqual({ res: 'wood', amount: W.carryWood });
    expect(g.player(0).wood).toBe(0);
  });
});
