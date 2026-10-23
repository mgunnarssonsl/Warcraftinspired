import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/sim/config';
import { destroyBuilding } from '../src/sim/production';
import type { GameEvent } from '../src/sim/types';
import { emptyGame, run, runUntil } from './helpers';

const WORKER = CONFIG.units.worker;
const GUARD = CONFIG.units.guard;
const ARCHER = CONFIG.units.archer;
const ticks = (s: number) => Math.round(s * 20);

function setup(gold = 1000, wood = 500) {
  const g = emptyGame(40, 30);
  g.player(0).gold = gold;
  g.player(0).wood = wood;
  const keep = g.addBuilding('hq', 0, 4, 8);
  return { g, keep };
}

describe('training', () => {
  it('pays on queueing, reserves population when training starts, then spawns', () => {
    const { g, keep } = setup();
    g.issue({ type: 'train', player: 0, buildingId: keep.id, unit: 'worker' });
    g.issue({ type: 'train', player: 0, buildingId: keep.id, unit: 'worker' });
    g.step();
    expect(g.player(0).gold).toBe(1000 - 2 * WORKER.cost.gold);
    expect(keep.queue).toHaveLength(2);
    expect(keep.queue[0].started).toBe(true);
    expect(keep.queue[1].started).toBe(false);
    expect(g.popUsed(0)).toBe(WORKER.pop); // only the head reserves
    runUntil(g, () => g.units().length === 1, ticks(WORKER.trainSeconds) + 5);
    const u = g.units()[0];
    expect(g.nav.canStand(u.x, u.y, u.radius)).toBe(true);
    runUntil(g, () => g.units().length === 2, ticks(WORKER.trainSeconds) + 5);
    expect(keep.queue).toHaveLength(0);
    expect(g.popUsed(0)).toBe(2 * WORKER.pop);
  });

  it('rejects unaffordable, wrong-building, unfinished-building and over-full requests with reasons', () => {
    const { g, keep } = setup(100, 0);
    const events: GameEvent[] = [];
    const train = (buildingId: number, unit: 'worker' | 'guard' | 'archer') => {
      g.issue({ type: 'train', player: 0, buildingId, unit });
      g.step();
      events.push(...g.drainEvents());
    };
    train(keep.id, 'worker');
    train(keep.id, 'worker'); // 25 gold left: too poor
    train(keep.id, 'guard'); // not trained at a Keep
    const site = g.addBuilding('barracks', 0, 20, 8, 0.5);
    train(site.id, 'guard'); // unfinished
    expect(keep.queue).toHaveLength(1);
    const reasons = events.filter((e) => e.type === 'cantTrain').map((e) => (e as { reason: string }).reason);
    expect(reasons).toEqual([
      expect.stringContaining('gold'),
      expect.stringContaining('cannot train'),
      expect.stringContaining('not finished'),
    ]);
    g.player(0).gold = 10000;
    for (let i = 0; i < 7; i++) g.issue({ type: 'train', player: 0, buildingId: keep.id, unit: 'worker' });
    g.step();
    expect(keep.queue).toHaveLength(CONFIG.production.queueSize);
  });

  it('archers require a completed lumber mill', () => {
    const { g } = setup();
    const rax = g.addBuilding('barracks', 0, 20, 8);
    g.issue({ type: 'train', player: 0, buildingId: rax.id, unit: 'archer' });
    g.step();
    expect(rax.queue).toHaveLength(0);
    const mill = g.addBuilding('lumbermill', 0, 20, 16, 0.9);
    g.issue({ type: 'train', player: 0, buildingId: rax.id, unit: 'archer' });
    g.step();
    expect(rax.queue).toHaveLength(0);
    mill.progress = 1;
    g.issue({ type: 'train', player: 0, buildingId: rax.id, unit: 'archer' });
    g.step();
    expect(rax.queue).toHaveLength(1);
    expect(g.player(0).wood).toBe(500 - ARCHER.cost.wood);
  });

  it('cancelling any item refunds it fully and releases reserved population', () => {
    const { g, keep } = setup();
    for (let i = 0; i < 3; i++) g.issue({ type: 'train', player: 0, buildingId: keep.id, unit: 'worker' });
    run(g, 40);
    expect(g.popUsed(0)).toBe(1);
    g.issue({ type: 'cancelTrain', player: 0, buildingId: keep.id, index: 1 });
    g.issue({ type: 'cancelTrain', player: 0, buildingId: keep.id, index: 0 });
    g.step();
    expect(keep.queue).toHaveLength(1);
    expect(g.player(0).gold).toBe(1000 - WORKER.cost.gold);
    // The remaining item moves to the front and starts from zero.
    expect(keep.queue[0].started).toBe(true);
    expect(keep.queue[0].progress).toBeLessThan(0.01);
  });

  it('waits without losing anything when population is capped, then resumes', () => {
    const { g, keep } = setup();
    // Fill the Keep's 10 capacity with idle workers.
    g.spawnUnitsNear('worker', 0, keep, 10);
    const events: GameEvent[] = [];
    g.issue({ type: 'train', player: 0, buildingId: keep.id, unit: 'worker' });
    run(g, 100);
    events.push(...g.drainEvents());
    expect(keep.queue[0].started).toBe(false);
    expect(keep.queue[0].progress).toBe(0);
    expect(events.filter((e) => e.type === 'popBlocked')).toHaveLength(1); // told once
    g.addBuilding('farm', 0, 20, 20);
    runUntil(g, () => g.units().length === 11, ticks(WORKER.trainSeconds) + 5);
  });

  it('losing capacity below usage keeps units but stops new training', () => {
    const { g, keep } = setup();
    const farm = g.addBuilding('farm', 0, 20, 20);
    g.spawnUnitsNear('worker', 0, keep, 14);
    expect(g.popUsed(0)).toBe(14);
    destroyBuilding(g, farm.id);
    expect(g.popCap(0)).toBe(10);
    expect(g.units()).toHaveLength(14);
    g.issue({ type: 'train', player: 0, buildingId: keep.id, unit: 'worker' });
    run(g, ticks(WORKER.trainSeconds) * 2);
    expect(g.units()).toHaveLength(14);
    expect(keep.queue[0].started).toBe(false);
  });

  it('an item already training keeps its reservation if capacity drops', () => {
    const { g, keep } = setup();
    const farm = g.addBuilding('farm', 0, 20, 20);
    g.spawnUnitsNear('worker', 0, keep, 10);
    g.issue({ type: 'train', player: 0, buildingId: keep.id, unit: 'worker' });
    run(g, 20);
    expect(keep.queue[0].started).toBe(true);
    destroyBuilding(g, farm.id);
    runUntil(g, () => g.units().length === 11, ticks(WORKER.trainSeconds) + 5);
  });

  it('destroying a production building refunds its whole queue', () => {
    const { g } = setup();
    const rax = g.addBuilding('barracks', 0, 20, 8);
    g.issue({ type: 'train', player: 0, buildingId: rax.id, unit: 'guard' });
    g.issue({ type: 'train', player: 0, buildingId: rax.id, unit: 'guard' });
    run(g, 60);
    expect(g.player(0).gold).toBe(1000 - 2 * GUARD.cost.gold);
    destroyBuilding(g, rax.id);
    expect(g.player(0).gold).toBe(1000);
    expect(g.popUsed(0)).toBe(0);
    expect(g.drainEvents().some((e) => e.type === 'buildingDestroyed')).toBe(true);
  });

  it('trained workers follow a rally point onto a resource', () => {
    const { g, keep } = setup();
    const mine = g.addResource('goldmine', 20, 9, 1000);
    g.issue({ type: 'setRally', player: 0, buildingId: keep.id, x: mine.x, y: mine.y, targetId: mine.id });
    g.issue({ type: 'train', player: 0, buildingId: keep.id, unit: 'worker' });
    runUntil(g, () => g.player(0).goldGathered > 0, ticks(WORKER.trainSeconds) + 400);
    // Spawned on the side facing the rally point.
    const rax = g.addBuilding('barracks', 0, 4, 20);
    g.issue({ type: 'setRally', player: 0, buildingId: rax.id, x: 15, y: 21.5, targetId: -1 });
    g.issue({ type: 'train', player: 0, buildingId: rax.id, unit: 'guard' });
    runUntil(g, () => g.units().some((u) => u.type === 'guard'), ticks(GUARD.trainSeconds) + 5);
    const guard = g.units().find((u) => u.type === 'guard')!;
    expect(guard.x).toBeGreaterThan(rax.tx + rax.w);
    runUntil(g, () => guard.order === null, 200);
    expect(Math.hypot(guard.x - 15, guard.y - 21.5)).toBeLessThan(0.5);
  });

  it('a player cannot train or cancel at another player\'s building', () => {
    const { g, keep } = setup();
    g.player(1).gold = 1000;
    g.issue({ type: 'train', player: 1, buildingId: keep.id, unit: 'worker' });
    g.issue({ type: 'train', player: 0, buildingId: keep.id, unit: 'worker' });
    g.issue({ type: 'cancelTrain', player: 1, buildingId: keep.id, index: 0 });
    g.step();
    expect(keep.queue).toHaveLength(1);
    expect(g.player(1).gold).toBe(1000);
  });
});
