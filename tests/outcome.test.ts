import { describe, expect, it } from 'vitest';
import { kill } from '../src/sim/combat';
import { Game } from '../src/sim/game';
import type { GameEvent } from '../src/sim/types';
import { emptyGame, run } from './helpers';

function match() {
  const g = emptyGame(40, 24);
  g.state.victoryRules = true;
  const k0 = g.addBuilding('hq', 0, 2, 2);
  const k1 = g.addBuilding('hq', 1, 30, 16);
  const u0 = g.addUnit('guard', 0, 10.5, 10.5);
  const u1 = g.addUnit('guard', 1, 25.5, 10.5);
  return { g, k0, k1, u0, u1 };
}

describe('victory and defeat', () => {
  it('losing every building defeats a player and removes their forces', () => {
    const { g, k1, u0, u1 } = match();
    g.step();
    expect(g.state.outcome).toBeNull();
    kill(g, k1, 0);
    const events: GameEvent[] = [];
    g.step();
    events.push(...g.drainEvents());
    expect(g.state.outcome).toEqual({ winner: 0, tick: expect.any(Number) });
    expect(g.player(1).defeated).toBe(true);
    expect(g.unit(u1.id)).toBeUndefined();
    expect(g.unit(u0.id)).toBeDefined();
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['playerDefeated', 'matchOver']));
  });

  it('an unfinished building still counts', () => {
    const { g, k1 } = match();
    g.addBuilding('farm', 1, 20, 2, 0.1);
    kill(g, k1, 0);
    run(g, 5);
    expect(g.state.outcome).toBeNull();
    expect(g.player(1).defeated).toBe(false);
  });

  it('both sides falling on the same tick is a draw', () => {
    const { g, k0, k1 } = match();
    kill(g, k0, 1);
    kill(g, k1, 0);
    g.step();
    expect(g.state.outcome).toEqual({ winner: null, tick: expect.any(Number) });
    expect(g.player(0).defeated && g.player(1).defeated).toBe(true);
  });

  it('surrender ends the match and later orders from that player are ignored', () => {
    const { g, u0 } = match();
    g.issue({ type: 'surrender', player: 0 });
    g.step();
    expect(g.state.outcome?.winner).toBe(1);
    expect(g.unit(u0.id)).toBeUndefined();
    const k = g.buildings().find((b) => b.owner === 1)!;
    g.issue({ type: 'train', player: 0, buildingId: k.id, unit: 'worker' });
    g.step();
    expect(k.queue).toHaveLength(0);
  });

  it('the outcome is final; play continues for spectating', () => {
    const { g, k1 } = match();
    kill(g, k1, 0);
    g.step();
    const decided = g.state.outcome;
    run(g, 50);
    expect(g.state.outcome).toEqual(decided);
  });

  it('neutral camps never win or lose', () => {
    const g = Game.create(3);
    run(g, 20);
    const neutral = g.state.players.find((p) => p.neutral)!;
    expect(neutral.defeated).toBe(false);
    expect(g.state.outcome).toBeNull();
  });

  it('records match statistics', () => {
    const { g, u1 } = match();
    u1.hp = 40;
    g.player(0).gold = 1000;
    const k0 = g.buildings().find((b) => b.owner === 0)!;
    g.issue({ type: 'train', player: 0, buildingId: k0.id, unit: 'worker' });
    g.issue({ type: 'attack', player: 0, units: [g.units().find((u) => u.owner === 0)!.id], targetId: u1.id });
    run(g, 20 * 40);
    const s0 = g.player(0).stats;
    expect(s0.unitsTrained).toBe(1);
    expect(s0.kills).toBeGreaterThanOrEqual(1);
    expect(g.player(1).stats.unitsLost).toBeGreaterThanOrEqual(1);
  });
});
