import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/sim/config';
import { Game } from '../src/sim/game';
import { emptyGame, run, runUntil } from './helpers';

describe('fog of war', () => {
  it('units reveal a circle of their sight radius; explored tiles persist', () => {
    const g = emptyGame(60, 30);
    const u = g.addUnit('guard', 0, 10.5, 10.5);
    run(g, 2);
    const r = CONFIG.units.guard.sight;
    expect(g.vision.isVisible(0, 10 + r - 1, 10)).toBe(true);
    expect(g.vision.isVisible(0, 10 + r + 1, 10)).toBe(false);
    expect(g.vision.isVisible(1, 10, 10)).toBe(false);
    g.issue({ type: 'move', player: 0, units: [u.id], x: 50.5, y: 10.5 });
    runUntil(g, () => u.order === null, 20 * 30);
    run(g, 2);
    expect(g.vision.isVisible(0, 10, 10)).toBe(false);
    expect(g.vision.isExplored(0, 10, 10)).toBe(true);
    expect(g.vision.isExplored(0, 30, 28)).toBe(false);
  });

  it('cannot order attacks on unseen units; seen buildings stay known', () => {
    const g = emptyGame(60, 30);
    const a = g.addUnit('guard', 0, 5.5, 10.5);
    const far = g.addUnit('worker', 1, 40.5, 10.5);
    const keep = g.addBuilding('hq', 1, 40, 20);
    run(g, 2);
    g.issue({ type: 'attack', player: 0, units: [a.id], targetId: far.id });
    g.issue({ type: 'attack', player: 0, units: [a.id], targetId: keep.id });
    g.step();
    expect(a.order).toBeNull(); // neither is known
    // Scout the Keep, then walk away: it is remembered and can be attacked.
    const scout = g.addUnit('worker', 0, 36.5, 22.5);
    run(g, 3);
    expect(g.vision.knows(0, keep)).toBe(true);
    g.removeEntity(scout.id);
    run(g, 3);
    expect(g.vision.canSee(0, keep)).toBe(false);
    g.issue({ type: 'attack', player: 0, units: [a.id], targetId: keep.id });
    g.step();
    expect(a.order).toMatchObject({ type: 'attack', targetId: keep.id });
  });

  it('every unit and tower can see as far as it can acquire and shoot', () => {
    for (const d of Object.values(CONFIG.units)) {
      expect(d.attack.acquire).toBeLessThanOrEqual(d.sight);
      expect(d.attack.range).toBeLessThanOrEqual(d.sight);
    }
    expect(CONFIG.buildings.tower.attack.range).toBeLessThanOrEqual(CONFIG.buildings.tower.sight);
  });

  it('a pursued unit is chased to where it was last seen', () => {
    const g = emptyGame(60, 30);
    const a = g.addUnit('guard', 0, 5.5, 10.5);
    const b = g.addUnit('worker', 1, 11.5, 10.5);
    b.hp = 1e6;
    run(g, 2);
    g.issue({ type: 'attack', player: 0, units: [a.id], targetId: b.id });
    g.issue({ type: 'move', player: 1, units: [b.id], x: 55.5, y: 25.5 });
    run(g, 20 * 6);
    // Still pursuing (not given up), heading east after the worker.
    expect(a.order?.type).toBe('attack');
    expect(a.x).toBeGreaterThan(15);
  });

  it('the skirmish starts with each side seeing only its own base', () => {
    const g = Game.create(5);
    g.step();
    const enemyKeep = g.buildings().find((b) => b.owner === 1)!;
    expect(g.vision.canSee(0, enemyKeep)).toBe(false);
    expect(g.vision.knows(0, enemyKeep)).toBe(false);
    const own = g.buildings().find((b) => b.owner === 0)!;
    expect(g.vision.isVisible(0, Math.floor(own.x), Math.floor(own.y))).toBe(true);
  });

  it('explored state survives save/load and play continues identically', () => {
    const g = Game.create(6);
    const ws = g.units().filter((u) => u.owner === 0).map((u) => u.id);
    g.issue({ type: 'move', player: 0, units: ws, x: 40, y: 40 });
    run(g, 300);
    const copy = Game.fromJSON(g.toJSON());
    expect(copy.vision.isExplored(0, 30, 45)).toBe(g.vision.isExplored(0, 30, 45));
    run(g, 200);
    run(copy, 200);
    expect(copy.toJSON()).toBe(g.toJSON());
  });
});
