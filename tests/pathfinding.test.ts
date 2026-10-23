import { describe, expect, it } from 'vitest';
import { findPath } from '../src/sim/pathfinding';
import { emptyGame, rebuild, run, runUntil, setRock } from './helpers';

describe('pathfinding', () => {
  it('routes around a wall through its gap without crossing blocked tiles', () => {
    let g = emptyGame(20, 12);
    for (let y = 0; y < 12; y++) if (y !== 9) setRock(g, 10, y);
    g = rebuild(g);
    const res = findPath(g.nav, 2, 2, { x0: 17, y0: 2, x1: 17, y1: 2 });
    expect(res.reached).toBe(true);
    for (const i of res.tiles) {
      const x = i % 20;
      const y = (i - x) / 20;
      expect(g.nav.passable(x, y)).toBe(true);
    }
    expect(res.tiles.some((i) => i === 9 * 20 + 10)).toBe(true);
  });

  it('falls back to the closest reachable tile when the goal is enclosed', () => {
    let g = emptyGame(20, 12);
    for (let y = 0; y < 12; y++) setRock(g, 10, y);
    g = rebuild(g);
    const res = findPath(g.nav, 2, 5, { x0: 15, y0: 5, x1: 15, y1: 5 });
    expect(res.reached).toBe(false);
    const last = res.tiles[res.tiles.length - 1];
    expect(last % 20).toBe(9);
  });

  it('does not cut diagonally between two blocked corners', () => {
    let g = emptyGame(6, 6);
    setRock(g, 3, 2);
    setRock(g, 2, 3);
    g = rebuild(g);
    const res = findPath(g.nav, 2, 2, { x0: 3, y0: 3, x1: 3, y1: 3 });
    // With both orthogonal neighbours blocked, (2,2)->(3,3) must detour.
    expect(res.tiles.length).toBeGreaterThan(1);
  });

  it('a unit walks around an obstacle and never stands in a blocked tile', () => {
    let g = emptyGame(24, 16);
    for (let y = 2; y < 14; y++) setRock(g, 12, y);
    g = rebuild(g);
    const u = g.addUnit('worker', 0, 4.5, 8.5);
    g.issue({ type: 'move', player: 0, units: [u.id], x: 20.5, y: 8.5 });
    runUntil(
      g,
      () => {
        expect(g.nav.canStand(u.x, u.y, u.radius)).toBe(true);
        return u.order === null;
      },
      400,
    );
    expect(Math.hypot(u.x - 20.5, u.y - 8.5)).toBeLessThan(0.1);
  });

  it('a group move spreads units over distinct destinations', () => {
    const g = emptyGame(30, 20);
    const ids = [];
    for (let i = 0; i < 8; i++) ids.push(g.addUnit('worker', 0, 3 + (i % 4), 3 + Math.floor(i / 4)).id);
    g.issue({ type: 'move', player: 0, units: ids, x: 22, y: 12 });
    run(g, 300);
    const us = ids.map((id) => g.unit(id)!);
    for (const u of us) expect(u.order).toBeNull();
    for (let a = 0; a < us.length; a++)
      for (let b = a + 1; b < us.length; b++) {
        expect(Math.hypot(us[a].x - us[b].x, us[a].y - us[b].y)).toBeGreaterThan(0.45);
      }
    for (const u of us) expect(Math.hypot(u.x - 22, u.y - 12)).toBeLessThan(3);
  });
});
