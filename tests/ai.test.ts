import { describe, expect, it } from 'vitest';
import { ComputerPlayer, type Difficulty } from '../src/ai/computer';
import { Game } from '../src/sim/game';

function play(seed: number, a: Difficulty | null, b: Difficulty | null, minutes: number) {
  const g = Game.create(seed);
  const ais = [a && new ComputerPlayer(0, a), b && new ComputerPlayer(1, b)].filter((x): x is ComputerPlayer => !!x);
  let minGold = Infinity;
  for (let t = 0; t < 20 * 60 * minutes && !g.state.outcome; t++) {
    g.step();
    for (const ai of ais) ai.update(g);
    minGold = Math.min(minGold, g.player(0).gold, g.player(1).gold, g.player(0).wood, g.player(1).wood);
  }
  return { g, minGold };
}

describe('computer opponent', () => {
  it('develops a working base under the normal rules', () => {
    const g = Game.create(21);
    const ai = new ComputerPlayer(1, 'normal');
    for (let t = 0; t < 20 * 60 * 6; t++) {
      g.step();
      ai.update(g);
    }
    const mine = g.units().filter((u) => u.owner === 1);
    const blds = g.buildings().filter((b) => b.owner === 1 && b.progress >= 1);
    const types = new Set(blds.map((b) => b.type));
    expect(mine.filter((u) => u.type === 'worker').length).toBeGreaterThanOrEqual(10);
    expect(mine.filter((u) => u.type !== 'worker').length).toBeGreaterThanOrEqual(5);
    for (const t of ['hq', 'farm', 'barracks', 'lumbermill'] as const) expect(types.has(t)).toBe(true);
    expect(g.idleWorkers(1).length).toBeLessThanOrEqual(2);
    expect(g.popUsed(1)).toBeLessThanOrEqual(g.popCap(1));
    for (const u of g.units()) expect(g.nav.canStand(u.x, u.y, u.radius)).toBe(true);
  });

  it('defeats a passive opponent', () => {
    const { g, minGold } = play(22, null, 'normal', 15);
    expect(g.state.outcome?.winner).toBe(1);
    expect(minGold).toBeGreaterThanOrEqual(0);
  });

  it('defends its base against an attack', () => {
    const g = Game.create(23);
    const ai = new ComputerPlayer(1, 'normal');
    for (let t = 0; t < 20 * 60 * 5; t++) {
      g.step();
      ai.update(g);
    }
    const keep = g.buildings().find((b) => b.owner === 1 && b.type === 'hq')!;
    // Three guards appear beside its base and attack the Keep.
    const spots = g.freeTilesAround(keep, 30).slice(-3);
    const raiders = spots.map((s) => g.addUnit('guard', 0, s.x + 0.5, s.y + 0.5).id);
    g.issue({ type: 'attack', player: 0, units: raiders, targetId: keep.id });
    for (let t = 0; t < 20 * 60 && raiders.some((id) => g.unit(id)); t++) {
      g.step();
      ai.update(g);
    }
    expect(raiders.filter((id) => g.unit(id))).toHaveLength(0);
    expect(g.building(keep.id)).toBeDefined();
  });

  it('a full computer-vs-computer match reaches a decisive outcome', () => {
    const { g, minGold } = play(1, 'hard', 'easy', 30);
    expect(g.state.outcome).not.toBeNull();
    expect(g.state.outcome!.winner).toBe(0);
    expect(minGold).toBeGreaterThanOrEqual(0); // never spends money it does not have
    const loser = g.player(1);
    expect(loser.defeated).toBe(true);
    expect(g.buildings().some((b) => b.owner === 1)).toBe(false);
  });

  it('is deterministic', () => {
    const run = () => play(24, 'normal', 'hard', 5).g.toJSON();
    expect(run()).toBe(run());
  });
});
