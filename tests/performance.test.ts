import { describe, expect, it } from 'vitest';
import type { UnitType } from '../src/sim/config';
import { Game } from '../src/sim/game';
import { findPath } from '../src/sim/pathfinding';
import { revealDisc } from '../src/sim/vision';
import { emptyGame, rebuild, setRock } from './helpers';

describe('fog: the fast reveal marks exactly the tiles of the plain rule', () => {
  it('for random centres and radii, including ones on tile edges and at the map border', () => {
    const w = 40;
    const h = 30;
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const wrong: string[] = [];
    for (let n = 0; n < 2000; n++) {
      const x = n % 5 === 0 ? Math.round(rand() * w) : rand() * (w + 4) - 2;
      const y = n % 7 === 0 ? Math.round(rand() * h) + 0.5 : rand() * (h + 4) - 2;
      const r = n % 3 === 0 ? Math.round(rand() * 12) : rand() * 12;
      const vis = new Uint8Array(w * h);
      const exp = new Array(w * h).fill(0);
      revealDisc(vis, exp, w, h, x, y, r);
      for (let ty = 0; ty < h; ty++)
        for (let tx = 0; tx < w; tx++) {
          const dx = tx + 0.5 - x;
          const dy = ty + 0.5 - y;
          const inside = dx * dx + dy * dy <= r * r && tx >= Math.floor(x - r) && tx <= Math.floor(x + r) && ty >= Math.floor(y - r) && ty <= Math.floor(y + r);
          if (vis[ty * w + tx] !== (inside ? 1 : 0) || exp[ty * w + tx] !== (inside ? 1 : 0)) wrong.push(`${x},${y} r${r} tile ${tx},${ty}: ${vis[ty * w + tx]}`);
        }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });
});

describe('pathfinding cost', () => {
  it('a goal nothing can reach costs about as much as a reachable one, and ends at the closest reachable tile', () => {
    let g = emptyGame(60, 40);
    // A walled pocket on the far side: its inside cannot be reached.
    for (let x = 40; x <= 50; x++) {
      setRock(g, x, 10);
      setRock(g, x, 20);
    }
    for (let y = 10; y <= 20; y++) {
      setRock(g, 40, y);
      setRock(g, 50, y);
    }
    g = rebuild(g);
    const open = findPath(g.nav, 2, 15, { x0: 30, y0: 15, x1: 30, y1: 15 });
    const walled = findPath(g.nav, 2, 15, { x0: 45, y0: 15, x1: 45, y1: 15 });
    expect(walled.reached).toBe(false);
    expect(walled.expanded).toBeLessThan(open.expanded * 3);
    const end = walled.tiles[walled.tiles.length - 1];
    expect(end % 60).toBe(39); // right against the pocket's west wall
    expect(Math.floor(end / 60)).toBe(15);
  });
});

describe('simulation speed', () => {
  it('two full armies with their economies stay far inside the 50 ms a tick has', () => {
    const g = Game.create(5, 'vales');
    const mix: UnitType[] = ['guard', 'guard', 'archer', 'archer', 'lancer', 'cleric'];
    const armies: number[][] = [[], []];
    for (const p of [0, 1]) {
      const hq = g.buildings().find((b) => b.owner === p)!;
      g.spawnUnitsNear('worker', p, hq, 15);
      for (let i = 0; i < 36; i++) armies[p].push(...g.spawnUnitsNear(mix[i % mix.length], p, hq, 1).map((u) => u.id));
      g.issue({ type: 'attackMove', player: p, units: armies[p], x: 48, y: 36 });
    }
    const times: number[] = [];
    for (let t = 0; t < 20 * 60; t++) {
      const t0 = performance.now();
      g.step();
      if (t >= 20) times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    // Measured around 0.3 ms mean and 2 ms p99; the limits leave room for slow or busy machines.
    expect(mean).toBeLessThan(5);
    expect(times[Math.floor(times.length * 0.99)]).toBeLessThan(25);
  }, 60_000);

  it('a 60-unit order across the map is spread over a few ticks by the search budget, not done in one', () => {
    const g = Game.create(6, 'river');
    const hq = g.buildings().find((b) => b.owner === 0)!;
    const ids: number[] = [];
    for (let i = 0; i < 60; i++) ids.push(...g.spawnUnitsNear('guard', 0, hq, 1).map((u) => u.id));
    for (let i = 0; i < 20; i++) g.step();
    const foe = g.state.starts[1];
    g.issue({ type: 'move', player: 0, units: ids, x: foe.x, y: foe.y });
    g.step();
    const planned = () => ids.filter((id) => g.unit(id)!.move!.path.length > 0).length;
    const first = planned();
    expect(first).toBeGreaterThan(5);
    expect(first).toBeLessThan(60);
    for (let i = 0; i < 10; i++) g.step();
    expect(planned()).toBe(60);
  });
});
