import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';

describe('crowded economy', () => {
  it('20 workers per side keep harvesting without getting stuck', () => {
    const g = Game.create(3);
    for (const p of [0, 1]) {
      const hq = g.buildings().find((b) => b.owner === p)!;
      g.spawnUnitsNear('worker', p, hq, 15);
      const workers = g.units().filter((u) => u.owner === p);
      const byDist = <T extends { x: number; y: number }>(xs: T[]) =>
        xs.sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y));
      const mines = byDist(g.resources().filter((r) => r.type === 'goldmine'));
      const tree = byDist(g.resources().filter((r) => r.type === 'tree'))[0];
      g.issue({ type: 'gather', player: p, units: workers.slice(0, 8).map((u) => u.id), nodeId: mines[0].id });
      g.issue({ type: 'gather', player: p, units: workers.slice(8).map((u) => u.id), nodeId: tree.id });
    }
    const last = new Map<number, { x: number; y: number; tick: number }>();
    let worstStall = 0;
    const t0 = performance.now();
    for (let t = 0; t < 20 * 240; t++) {
      g.step();
      for (const u of g.units()) {
        expect(g.nav.canStand(u.x, u.y, u.radius)).toBe(true);
        const o = u.order;
        const travelling = o?.type === 'gather' && (o.phase === 'toNode' || o.phase === 'toDropoff');
        const prev = last.get(u.id);
        if (!travelling || !prev || Math.hypot(u.x - prev.x, u.y - prev.y) > 0.05) {
          last.set(u.id, { x: u.x, y: u.y, tick: g.state.tick });
        } else {
          worstStall = Math.max(worstStall, g.state.tick - prev.tick);
        }
      }
    }
    const ms = performance.now() - t0;
    // No travelling worker may stand still for more than 3 seconds.
    expect(worstStall).toBeLessThan(60);
    for (const p of g.state.players.filter((pl) => !pl.neutral)) {
      expect(p.goldGathered).toBeGreaterThan(1500);
      expect(p.woodGathered).toBeGreaterThan(800);
    }
    // 4 minutes of game time with 40 workers should simulate far faster than real time.
    expect(ms).toBeLessThan(20000);
    console.log(
      `stress: ${ms.toFixed(0)}ms for 4800 ticks; stall ${worstStall}; gold ${g.state.players.map((p) => p.goldGathered)}; wood ${g.state.players.map((p) => p.woodGathered)}; idle ${g.idleWorkers(0).length}/${g.idleWorkers(1).length}`,
    );
  }, 30_000);
});
