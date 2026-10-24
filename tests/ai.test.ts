import { describe, expect, it } from 'vitest';
import { ComputerPlayer, type Difficulty } from '../src/ai/computer';
import { CONFIG } from '../src/sim/config';
import { Game } from '../src/sim/game';
import { emptyGame } from './helpers';
import { findSite } from '../src/ai/placement';
import { symTile } from '../src/sim/movement';

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
  }, 30_000);

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
  }, 30_000); // a whole simulated match

  it('is deterministic', () => {
    const run = () => play(24, 'normal', 'hard', 5).g.toJSON();
    expect(run()).toBe(run());
  });
});

describe('computer routing and memory', () => {
  it('routes a march around a camp it knows, but not around one it is heading for', () => {
    const g = emptyGame(60, 40);
    const ai = new ComputerPlayer(0, 'hard') as unknown as {
      campsSeen: Array<{ x: number; y: number }>;
      detours(g: Game, a: { x: number; y: number }, b: { x: number; y: number }): Array<{ x: number; y: number }>;
    };
    ai.campsSeen = [{ x: 30, y: 20 }];
    const way = ai.detours(g, { x: 5, y: 20 }, { x: 55, y: 20 });
    expect(way).toHaveLength(1);
    expect(Math.abs(way[0].y - 20)).toBeGreaterThanOrEqual(CONFIG.ai.campClearance);
    expect(ai.detours(g, { x: 5, y: 20 }, { x: 31, y: 21 })).toHaveLength(0);
    expect(ai.detours(g, { x: 5, y: 5 }, { x: 55, y: 5 })).toHaveLength(0); // the line passes well clear
  });

  it('remembers an enemy army it saw and does not attack into it blind', () => {
    const g = emptyGame(60, 40);
    g.addBuilding('hq', 0, 3, 3);
    g.addBuilding('hq', 1, 50, 30);
    const ai = new ComputerPlayer(0, 'hard');
    const mine = [0, 1, 2, 3, 4, 5, 6].map((i) => g.addUnit('guard', 0, 8.5 + i, 12.5));
    const theirs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => g.addUnit('guard', 1, 8.5 + (i % 6), 16.5 + Math.floor(i / 6)));
    g.issue({ type: 'hold', player: 1, units: theirs.map((u) => u.id) });
    g.step();
    const priv = ai as unknown as { visible(g: Game): unknown; favourable(g: Game, h: unknown[], e: unknown[]): boolean };
    priv.visible(g); // sees them once
    // They walk off into the fog: still remembered.
    for (const u of theirs) {
      u.x += 30;
      u.y += 10;
      u.px = u.x;
      u.py = u.y;
    }
    g.step();
    const enemies = priv.visible(g) as unknown[];
    expect(enemies.filter((e) => (e as { kind: string }).kind === 'unit')).toHaveLength(0);
    expect(priv.favourable(g, mine, enemies)).toBe(false);
    // Seen dying: forgotten.
    for (const u of theirs) g.removeEntity(u.id);
    for (const u of mine) g.addUnit('guard', 0, u.x + 30, u.y + 12); // look where they were
    g.step();
    expect(priv.favourable(g, mine, priv.visible(g) as unknown[])).toBe(true);
  });
});

describe('fair seats', () => {
  it('building placement is mirror-symmetric between the two starts', () => {
    const g = Game.create(5);
    const { width: W, height: H } = g.state.map;
    for (const type of ['farm', 'barracks', 'tower'] as const) {
      const s = CONFIG.buildings[type].size;
      const p0 = g.buildings().find((b) => b.owner === 0 && b.type === 'hq')!;
      // Aim at the Keep itself, so the search must walk outward and order matters.
      const a = findSite(g, 0, type, p0.x, p0.y)!;
      const b = findSite(g, 1, type, W - p0.x, H - p0.y)!;
      expect(b).toEqual({ tx: W - a.tx - s, ty: H - a.ty - s, w: s, h: s });
    }
  });
});

describe('fair seats: mirror symmetry', () => {
  const mirrored = (g: Game) => {
    const { width: W, height: H } = g.state.map;
    const own = (p: number) => [...g.units(), ...g.buildings()].filter((e) => e.owner === p);
    const b = own(1);
    return own(0).every((a) =>
      b.some((e) => e.type === a.type && Math.abs(W - e.x - a.x) < 1e-6 && Math.abs(H - e.y - a.y) < 1e-6 && (e.kind !== 'unit' || a.kind !== 'unit' || e.carry.amount === a.carry.amount)),
    );
  };

  it('starting units are exact mirror images', () => {
    for (const seed of [1, 5, 9]) expect(mirrored(Game.create(seed))).toBe(true);
  });

  it('tile lookup is the same seen from either end of the map', () => {
    for (const v of [0.5, 14, 14.0001, 47.5, 58, 81.999]) expect(96 - 1 - symTile(96 - v, 96)).toBe(symTile(v, 96));
  });

  it('two identical computers stay exactly mirrored through the first minute', () => {
    const g = Game.create(5);
    const ais = [new ComputerPlayer(0, 'hard'), new ComputerPlayer(1, 'hard')];
    for (let t = 0; t < 20 * 60; t++) {
      g.step();
      for (const ai of ais) ai.update(g);
    }
    expect(g.player(0).gold).toBe(g.player(1).gold);
    expect(mirrored(g)).toBe(true);
  });
});
