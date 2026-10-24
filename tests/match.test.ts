import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { run } from './helpers';

function assignAll(g: Game): void {
  // Each player: 3 workers on their start mine, 2 on wood near the HQ.
  for (const p of [0, 1]) {
    const hq = g.buildings().find((b) => b.owner === p)!;
    const workers = g.units().filter((u) => u.owner === p);
    const mine = g
      .resources()
      .filter((r) => r.type === 'goldmine')
      .sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0];
    const tree = g
      .resources()
      .filter((r) => r.type === 'tree')
      .sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0];
    g.issue({ type: 'gather', player: p, units: workers.slice(0, 3).map((u) => u.id), nodeId: mine.id });
    g.issue({ type: 'gather', player: p, units: workers.slice(2 + 1).map((u) => u.id), nodeId: tree.id });
  }
}

describe('skirmish map', () => {
  it('is point-symmetric and every mine is reachable from both bases', () => {
    const g = Game.create(1234);
    const { width: W, height: H, terrain } = g.state.map;
    for (let i = 0; i < W * H; i++) expect(terrain[i]).toBe(terrain[W * H - 1 - i]);
    const hqs = g.buildings().filter((b) => b.type === 'hq');
    expect(hqs).toHaveLength(2);
    const comp0 = g.nav.component(hqs[0].tx - 1, hqs[0].ty + 1);
    expect(comp0).toBeGreaterThan(0);
    expect(g.nav.footprintReachableFrom(hqs[1], comp0)).toBe(true);
    const mines = g.resources().filter((r) => r.type === 'goldmine');
    expect(mines).toHaveLength(10);
    for (const m of mines) expect(g.nav.footprintReachableFrom(m, comp0)).toBe(true);
    // Two Trading Posts and two Fountains, mirrored and reachable.
    for (const type of ['shop', 'fountain'] as const) {
      const [a, b] = g.buildings().filter((x) => x.type === type);
      expect(b).toBeDefined();
      expect(b.x).toBeCloseTo(W - a.x);
      expect(b.y).toBeCloseTo(H - a.y);
      expect(g.nav.footprintReachableFrom(a, comp0)).toBe(true);
      expect(g.nav.footprintReachableFrom(b, comp0)).toBe(true);
    }
  });

  it('starting units stand on free tiles', () => {
    const g = Game.create(7);
    for (const u of g.units()) expect(g.nav.canStand(u.x, u.y, u.radius)).toBe(true);
    expect(g.units().filter((u) => u.owner === 0)).toHaveLength(5);
  });

  it('both sides earn similar income from symmetric orders', () => {
    const g = Game.create(99);
    assignAll(g);
    run(g, 20 * 90);
    const [a, b] = g.state.players;
    expect(a.goldGathered).toBeGreaterThan(100);
    expect(a.woodGathered).toBeGreaterThan(20);
    expect(Math.abs(a.goldGathered - b.goldGathered)).toBeLessThanOrEqual(20);
    for (const u of g.units()) expect(g.nav.canStand(u.x, u.y, u.radius)).toBe(true);
  });

  it('is deterministic: same seed and commands give identical state', () => {
    const a = Game.create(42);
    const b = Game.create(42);
    assignAll(a);
    assignAll(b);
    run(a, 1000);
    run(b, 1000);
    expect(a.toJSON()).toBe(b.toJSON());
  });

  it('save/load mid-match continues identically', () => {
    const a = Game.create(5);
    assignAll(a);
    run(a, 700);
    const b = Game.fromJSON(a.toJSON());
    run(a, 800);
    run(b, 800);
    expect(b.toJSON()).toBe(a.toJSON());
  });
});
