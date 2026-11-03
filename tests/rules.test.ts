import { describe, expect, it } from 'vitest';
import { ComputerPlayer } from '../src/ai/computer';
import { createMatch, Recorder, ReplayPlayer } from '../src/replay/replay';
import { CONFIG } from '../src/sim/config';
import { Game } from '../src/sim/game';
import { stateHash } from '../src/sim/hash';
import { cleanRules, DEFAULT_RULES, type MatchRules } from '../src/sim/rules';
import { NetWorld } from './net/netsim';

const custom = (r: Partial<MatchRules>): MatchRules => ({ ...DEFAULT_RULES, ...r });

describe('custom match rules', () => {
  it('the standard rules leave the match exactly as before', () => {
    const a = Game.create(4, 'vales');
    const b = Game.create(4, 'vales', [], DEFAULT_RULES);
    expect(a.state.rules).toBeUndefined();
    expect(stateHash(a)).toBe(stateHash(b));
  });

  it('starting resources and workers, and no camps', () => {
    const g = Game.create(4, 'vales', [], custom({ startGold: 2500, startWood: 1000, startWorkers: 10, camps: false }));
    expect([g.player(0).gold, g.player(0).wood]).toEqual([2500, 1000]);
    expect(g.units().filter((u) => u.owner === 1)).toHaveLength(10);
    const neutral = g.state.players.find((p) => p.neutral)!.id;
    expect(g.units().filter((u) => u.owner === neutral)).toHaveLength(0);
    expect(g.state.camps).toHaveLength(0);
  });

  it('the population limit caps capacity, and the computer stops building farms at it', () => {
    const g = Game.create(5, 'vales', [], custom({ maxPop: 60, startGold: 5000, startWood: 2500 }));
    const ai = new ComputerPlayer(0, 'hard', 'balanced', { firstAttackSeconds: 1e9 });
    for (let t = 0; t < 20 * 60 * 10; t++) {
      g.step();
      ai.update(g);
    }
    expect(g.popCap(0)).toBe(60);
    const farms = g.buildings().filter((b) => b.owner === 0 && b.type === 'farm').length;
    // 60 from Keeps (10 each) and Farms (6 each): no pile of useless Farms.
    expect(farms * CONFIG.buildings.farm.popProvided).toBeLessThan(60 + 3 * CONFIG.buildings.farm.popProvided);
  }, 60_000);

  it('map knowledge: explored shows the terrain but not the enemy; no fog shows everything', () => {
    const explored = Game.create(4, 'vales', [], custom({ fog: 'explored' }));
    expect(explored.state.explored[0].every((v) => v === 1)).toBe(true);
    const enemyHq = explored.buildings().find((b) => b.owner === 1)!;
    expect(explored.vision.canSee(0, enemyHq)).toBe(false);
    const open = Game.create(4, 'vales', [], custom({ fog: 'revealed' }));
    const hq = open.buildings().find((b) => b.owner === 1)!;
    expect(open.vision.canSee(0, hq)).toBe(true);
    open.step();
    expect(open.vision.isVisible(0, 90, 10)).toBe(true);
  });

  it('only the values on offer are accepted', () => {
    expect(cleanRules({ startGold: 1e9, startWood: 500, fog: 'xray', camps: 'yes', maxPop: -5 })).toEqual({ ...DEFAULT_RULES, startWood: 500 });
    expect(cleanRules(null)).toEqual(DEFAULT_RULES);
  });

  it('rules travel with saves and replays', () => {
    const rules = custom({ startGold: 1000, maxPop: 150, camps: false });
    const spec = { seed: 3, mapId: 'river', factions: ['crown', 'wild'] as Array<'crown' | 'wild'>, names: ['A', 'B'], incomeBonus: [], rules };
    const g = createMatch(spec);
    const rec = new Recorder(g, spec);
    const ais = [new ComputerPlayer(0, 'normal'), new ComputerPlayer(1, 'normal')];
    for (let t = 0; t < 20 * 120; t++) {
      g.step();
      rec.afterStep();
      for (const a of ais) a.update(g);
    }
    const loaded = Game.restore(JSON.parse(JSON.stringify(g.state)));
    expect(loaded.state.rules).toEqual(rules);
    const p = new ReplayPlayer(JSON.parse(JSON.stringify(rec.file(0, 'single', '1'))));
    p.run(g.state.tick);
    expect(stateHash(p.game)).toBe(stateHash(g));
  });

  it('online, the host sets the rules (the guest cannot) and both games use them', () => {
    const w = new NetWorld(31);
    const a = w.add('Host', { latency: 10, jitter: 0 });
    const b = w.add('Guest', { latency: 10, jitter: 0 });
    a.connect().create('Host');
    w.run(100);
    b.connect().join(a.net.room!.code, 'Guest');
    w.run(100);
    b.net.send({ t: 'setRules', rules: custom({ startGold: 5000 }) });
    a.net.send({ t: 'setRules', rules: { ...custom({ startWorkers: 15, fog: 'revealed' }), startGold: 123456 } });
    w.run(100);
    expect(b.net.room!.rules).toEqual(custom({ startWorkers: 15, fog: 'revealed' }));
    a.net.send({ t: 'ready', ready: true });
    b.net.send({ t: 'ready', ready: true });
    w.run(500);
    for (const p of [a, b]) {
      expect(p.game!.state.rules).toEqual(custom({ startWorkers: 15, fog: 'revealed' }));
      expect(p.game!.units().filter((u) => u.owner === 0)).toHaveLength(15);
    }
  });
});
