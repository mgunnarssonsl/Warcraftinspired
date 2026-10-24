import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/sim/config';
import { emptyGame, run, runUntil } from './helpers';

describe('Shift-queued orders', () => {
  it('waypoints run one after another', () => {
    const g = emptyGame(30, 20);
    const u = g.addUnit('guard', 0, 3.5, 3.5);
    g.issue({ type: 'move', player: 0, units: [u.id], x: 10.5, y: 3.5 });
    g.issue({ type: 'move', player: 0, units: [u.id], x: 10.5, y: 12.5, queued: true });
    g.issue({ type: 'move', player: 0, units: [u.id], x: 3.5, y: 12.5, queued: true });
    runUntil(g, () => Math.hypot(u.x - 10.5, u.y - 3.5) < 0.3, 400);
    expect(u.orderQueue.length).toBe(2);
    runUntil(g, () => Math.hypot(u.x - 10.5, u.y - 12.5) < 0.3, 400);
    runUntil(g, () => u.order === null && u.orderQueue.length === 0, 400);
    expect(Math.hypot(u.x - 3.5, u.y - 12.5)).toBeLessThan(0.5);
  });

  it('a queued order on an idle unit starts at once', () => {
    const g = emptyGame(30, 20);
    const u = g.addUnit('guard', 0, 3.5, 3.5);
    g.issue({ type: 'move', player: 0, units: [u.id], x: 9.5, y: 3.5, queued: true });
    g.step();
    expect(u.order?.type).toBe('move');
    expect(u.orderQueue.length).toBe(0);
  });

  it('a plain order replaces the queue, and stop clears it', () => {
    const g = emptyGame(30, 20);
    const u = g.addUnit('guard', 0, 3.5, 3.5);
    g.issue({ type: 'move', player: 0, units: [u.id], x: 20.5, y: 3.5 });
    g.issue({ type: 'move', player: 0, units: [u.id], x: 20.5, y: 12.5, queued: true });
    g.step();
    expect(u.orderQueue.length).toBe(1);
    g.issue({ type: 'move', player: 0, units: [u.id], x: 5.5, y: 8.5 });
    g.step();
    expect(u.orderQueue.length).toBe(0);
    g.issue({ type: 'move', player: 0, units: [u.id], x: 20.5, y: 12.5, queued: true });
    g.issue({ type: 'stop', player: 0, units: [u.id] });
    g.step();
    expect(u.order).toBeNull();
    expect(u.orderQueue.length).toBe(0);
  });

  it('one Laborer builds Shift-placed buildings in turn, then returns to gathering', () => {
    const g = emptyGame(32, 24);
    g.addBuilding('hq', 0, 3, 3);
    const mine = g.addResource('goldmine', 3, 14, 5000);
    const w = g.addUnit('worker', 0, 8.5, 9.5);
    const other = g.addUnit('worker', 0, 8.5, 10.5);
    const p = g.player(0);
    p.gold = 1000;
    p.wood = 1000;
    g.issue({ type: 'gather', player: 0, units: [w.id], nodeId: mine.id });
    g.step();
    g.issue({ type: 'build', player: 0, units: [w.id], buildingType: 'farm', tx: 14, ty: 4 });
    g.issue({ type: 'build', player: 0, units: [w.id, other.id], buildingType: 'farm', tx: 18, ty: 4, queued: true });
    g.step();
    expect(w.orderQueue).toHaveLength(1);
    expect(other.order).toBeNull(); // the queued build went to the worker already building
    const farms = () => g.buildings().filter((b) => b.type === 'farm' && b.progress >= 1).length;
    runUntil(g, () => farms() === 2, 20 * (CONFIG.buildings.farm.buildSeconds * 2 + 60));
    runUntil(g, () => w.order?.type === 'gather', 200);
    expect(w.order?.type === 'gather' && w.order.nodeId).toBe(mine.id);
  });
});

describe('group pace', () => {
  it('a compact mixed group marches at its slowest member speed; a lone unit does not', () => {
    const g = emptyGame(40, 20);
    const w = g.addUnit('worker', 0, 3.5, 9.5);
    const s = g.addUnit('guard', 0, 3.5, 10.5);
    g.issue({ type: 'move', player: 0, units: [w.id, s.id], x: 30.5, y: 10 });
    g.step();
    expect(w.order?.type === 'move' && w.order.pace).toBe(CONFIG.units.guard.speed);
    run(g, 100);
    expect(Math.abs(w.x - s.x)).toBeLessThan(0.6);
    const lone = g.addUnit('worker', 0, 3.5, 15.5);
    g.issue({ type: 'move', player: 0, units: [lone.id], x: 30.5, y: 15.5 });
    g.step();
    expect(lone.order?.type === 'move' && lone.order.pace).toBeFalsy();
  });

  it('a scattered selection is not slowed', () => {
    const g = emptyGame(40, 20);
    const a = g.addUnit('worker', 0, 3.5, 3.5);
    const b = g.addUnit('guard', 0, 30.5, 16.5);
    g.issue({ type: 'move', player: 0, units: [a.id, b.id], x: 15.5, y: 10 });
    g.step();
    expect(a.order?.type === 'move' && a.order.pace).toBeFalsy();
  });
});
