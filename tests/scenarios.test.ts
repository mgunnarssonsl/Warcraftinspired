import { describe, expect, it } from 'vitest';
import { ComputerPlayer } from '../src/ai/computer';
import { kill } from '../src/sim/combat';
import { createMatch, Recorder, ReplayPlayer, type MatchSpec } from '../src/replay/replay';
import { dist } from '../src/sim/dmath';
import { stateHash } from '../src/sim/hash';
import { HOLD_WAVES, SCENARIOS, scenarioMedal, waveUnits, type ScenarioId } from '../src/sim/scenarios';

const spec = (id: ScenarioId, faction: 'crown' | 'wild' = 'crown'): MatchSpec => ({
  seed: SCENARIOS[id].seed,
  mapId: SCENARIOS[id].mapId,
  factions: [faction, 'crown'],
  names: ['You', SCENARIOS[id].name],
  incomeBonus: [],
  scenario: id,
});

describe('challenges', () => {
  it('Hold the Line: a base to defend and nobody on the other side; waves grow; doing nothing loses', () => {
    const g = createMatch(spec('holdTheLine'));
    expect(g.units().filter((u) => u.owner === 1)).toHaveLength(0);
    expect(g.buildings().filter((b) => b.owner === 1)).toHaveLength(0);
    expect(g.buildings().some((b) => b.owner === 0 && b.type === 'barracks')).toBe(true);
    expect(g.player(0).gold).toBe(1000);
    expect(waveUnits(HOLD_WAVES).length).toBeGreaterThan(waveUnits(1).length * 3);
    const events: string[] = [];
    for (let t = 0; t < 20 * 60 * 20 && !g.state.outcome; t++) {
      g.step();
      for (const e of g.drainEvents()) if (e.type === 'waveIncoming') events.push(`${e.wave}`);
    }
    expect(events.slice(0, 3)).toEqual(['1', '2', '3']);
    expect(g.state.outcome?.winner).toBe(1); // nobody defended the Keep
    expect(scenarioMedal(g)).toBeNull();
  }, 60_000);

  it('Hold the Line can be won: a Normal computer playing the defence survives all ten waves', () => {
    const g = createMatch(spec('holdTheLine'));
    const ai = new ComputerPlayer(0, 'normal', 'balanced', { firstAttackSeconds: 1e9, raids: false });
    for (let t = 0; t < 20 * 60 * 25 && !g.state.outcome; t++) {
      g.step();
      ai.update(g);
    }
    expect(g.state.outcome?.winner).toBe(0);
    expect(g.state.scenario!.wave).toBe(HOLD_WAVES);
    expect(scenarioMedal(g)).not.toBeNull();
  }, 120_000);

  it('Gold Rush: no enemies; reaching the goal wins, and sooner earns more; the clock running out loses', () => {
    const g = createMatch(spec('goldRush', 'wild'));
    const neutral = g.state.players.find((p) => p.neutral)!.id;
    expect(g.units().filter((u) => u.owner === neutral || u.owner === 1)).toHaveLength(0);
    for (let t = 0; t < 20 * 60 * 5; t++) g.step();
    g.player(0).goldGathered = 5000;
    g.step();
    expect(g.state.outcome?.winner).toBe(0);
    expect(scenarioMedal(g)).toBe('gold');
    const late = createMatch(spec('goldRush'));
    for (let t = 0; t < SCENARIOS.goldRush.limitTicks! + 5 && !late.state.outcome; t++) late.step();
    expect(late.state.outcome?.winner).toBe(1);
  }, 60_000);

  it('Hero Trial: a hero and a warband, no economy; clearing every camp wins, losing the hero loses', () => {
    const g = createMatch(spec('heroTrial', 'wild'));
    const mine = g.units().filter((u) => u.owner === 0);
    expect(mine.filter((u) => u.hero)).toHaveLength(1);
    expect(mine.some((u) => u.type === 'tender')).toBe(false);
    // A plain plan: the weakest camp first, back to the fountain to heal when hurt.
    const fountain = g.buildings().find((b) => b.type === 'fountain')!;
    let healing = false;
    for (let t = 0; t < 20 * 60 * 20 && !g.state.outcome; t++) {
      g.step();
      if (t % 40) continue;
      const us = g.units().filter((u) => u.owner === 0);
      const hero = us.find((u) => u.hero);
      if (!hero) continue;
      const ids = us.map((u) => u.id);
      if (!healing && (hero.hp < hero.maxHp * 0.4 || us.filter((u) => u.hp < u.maxHp * 0.6).length >= us.length / 2)) {
        healing = true;
        g.issue({ type: 'move', player: 0, units: ids, x: fountain.x, y: fountain.y + 2 });
      } else if (healing) {
        if (us.every((u) => u.hp > u.maxHp * 0.95)) healing = false;
      } else {
        const c = g.state.camps.filter((x) => !x.cleared).sort((a, b) => a.level - b.level || dist(a, hero) - dist(b, hero))[0];
        if (c) g.issue({ type: 'attackMove', player: 0, units: ids, x: c.x, y: c.y });
      }
    }
    expect(g.state.outcome?.winner).toBe(0);
    expect(g.state.camps.every((c) => c.cleared)).toBe(true);
    // And without the hero it is over.
    const h = createMatch(spec('heroTrial'));
    const hero = h.units().find((u) => u.owner === 0 && u.hero)!;
    kill(h, hero, 1);
    for (let t = 0; t < 40 && !h.state.outcome; t++) h.step();
    expect(h.state.outcome?.winner).toBe(1);
  }, 120_000);

  it('a challenge replays exactly: the scripted waves come from the scenario, not twice from the log', () => {
    const s = spec('holdTheLine', 'wild');
    const g = createMatch(s);
    const rec = new Recorder(g, s);
    const ai = new ComputerPlayer(0, 'hard', 'balanced', { firstAttackSeconds: 1e9 });
    for (let t = 0; t < 20 * 60 * 6; t++) {
      g.step();
      rec.afterStep();
      ai.update(g);
    }
    const p = new ReplayPlayer(JSON.parse(JSON.stringify(rec.file(0, 'challenge', '1'))));
    p.run(g.state.tick);
    expect(p.diverged).toBeNull();
    expect(stateHash(p.game)).toBe(stateHash(g));
  }, 60_000);
});
