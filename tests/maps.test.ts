import { describe, expect, it } from 'vitest';
import { ComputerPlayer } from '../src/ai/computer';
import { kill } from '../src/sim/combat';
import { CONFIG, secondsToTicks } from '../src/sim/config';
import { Game } from '../src/sim/game';
import { generateMap } from '../src/sim/mapgen';
import { MAPS } from '../src/sim/maps';
import { findPath } from '../src/sim/pathfinding';
import { TERRAIN, type Footprint } from '../src/sim/types';
import { emptyGame, run, runUntil } from './helpers';

const SIZE = CONFIG.resources.goldmine.size;

/** Shortest walking distance (tiles, diagonals √2) from a tile to a footprint's border. */
function walk(g: Game, sx: number, sy: number, f: Footprint): number {
  const res = findPath(g.nav, sx, sy, { x0: f.tx - 1, y0: f.ty - 1, x1: f.tx + f.w, y1: f.ty + f.h }, 200000);
  expect(res.reached).toBe(true);
  let d = 0;
  let prev = sy * g.nav.w + sx;
  for (const t of res.tiles) {
    d += (t % g.nav.w !== prev % g.nav.w) && (Math.floor(t / g.nav.w) !== Math.floor(prev / g.nav.w)) ? Math.SQRT2 : 1;
    prev = t;
  }
  return d;
}

/** A free tile just outside each Keep, mirror images of each other. */
function doors(g: Game): Array<{ x: number; y: number }> {
  const keeps = g.state.starts.map((s) => g.buildings().find((b) => b.type === 'hq' && Math.hypot(b.x - s.x, b.y - s.y) < 1)!);
  const a = g.freeTilesAround(keeps[0], 1)[0];
  return [a, { x: g.state.map.width - 1 - a.x, y: g.state.map.height - 1 - a.y }];
}

for (const def of MAPS) {
  describe(`map: ${def.name}`, () => {
    const g = Game.create(7, def.id);
    const { width: W, height: H, terrain } = g.state.map;

    it('is exactly point-symmetric: terrain, trees, mines, camps, lairs and objectives', () => {
      for (let i = 0; i < W * H; i++) expect(terrain[i]).toBe(terrain[W * H - 1 - i]);
      const layout = generateMap(7, def.id);
      const trees = new Set(layout.trees);
      for (const t of layout.trees) expect(trees.has(W * H - 1 - t)).toBe(true);
      const mirrored = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - (W - b.x)) < 1e-9 && Math.abs(a.y - (H - b.y)) < 1e-9;
      const mines = g.resources().filter((r) => r.type === 'goldmine');
      for (const m of mines) expect(mines.some((o) => mirrored(m, o) && o.miners === m.miners && o.amount === m.amount)).toBe(true);
      for (let i = 0; i < g.state.camps.length; i += 2) {
        const [a, b] = [g.state.camps[i], g.state.camps[i + 1]];
        expect(mirrored(a, b)).toBe(true);
        expect(b).toMatchObject({ level: a.level, drop: a.drop });
      }
      const objectives = g.buildings().filter((b) => b.type === 'shop' || b.type === 'fountain');
      for (const o of objectives) expect(objectives.some((p) => p.type === o.type && mirrored(o, p))).toBe(true);
    });

    it('both starts reach every mine, camp and objective, at mirrored walking distances', () => {
      const [d0, d1] = doors(g);
      const sites: Footprint[] = [
        ...g.resources().filter((r) => r.type === 'goldmine'),
        ...g.buildings().filter((b) => b.type === 'shop' || b.type === 'fountain'),
      ];
      for (const f of sites) {
        const mirror = { tx: W - f.tx - f.w, ty: H - f.ty - f.h, w: f.w, h: f.h };
        expect(walk(g, d0.x, d0.y, f)).toBeCloseTo(walk(g, d1.x, d1.y, mirror), 6);
      }
      for (const c of g.state.camps) expect(walk(g, d0.x, d0.y, { tx: Math.floor(c.x) - 1, ty: Math.floor(c.y) - 1, w: 2, h: 2 })).toBeGreaterThan(0);
    });

    it('rewards risk: rich mines are guarded hardest and lie further out; a safe mine is near home', () => {
      const [d0] = doors(g);
      const mines = def.mines;
      const rich = mines.filter((m) => m.kind === 'rich');
      const natural = mines.find((m) => m.label === 'natural')!;
      expect(rich.length).toBeGreaterThan(0);
      for (const r of rich) {
        expect(r.camp).toBe(3);
        expect(walk(g, d0.x, d0.y, { tx: r.tx, ty: r.ty, w: SIZE, h: SIZE })).toBeGreaterThan(walk(g, d0.x, d0.y, { tx: natural.tx, ty: natural.ty, w: SIZE, h: SIZE }));
      }
      expect(mines.some((m) => m.kind !== 'start' && m.camp === 0)).toBe(true);
      expect([...new Set(g.state.camps.map((c) => c.level))].sort()).toEqual([1, 2, 3]);
    });
  });
}

describe('map structure', () => {
  /** Turn the dirt tiles matching `pick` into rock and see whether two points still connect. */
  function connectedWithout(mapId: string, pick: (x: number, y: number) => boolean, a: { x: number; y: number }, b: { x: number; y: number }) {
    const g = Game.create(7, mapId);
    const { width: W, height: H, terrain } = g.state.map;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (terrain[y * W + x] === TERRAIN.dirt && pick(x + 0.5, y + 0.5)) terrain[y * W + x] = TERRAIN.rock;
    const g2 = new Game(g.state);
    return g2.nav.component(Math.floor(a.x), Math.floor(a.y)) === g2.nav.component(Math.floor(b.x), Math.floor(b.y));
  }

  it('Rivercross: the fords are the only crossings', () => {
    const def = MAPS.find((m) => m.id === 'river')!;
    const rv = def.rivers[0];
    const g = Game.create(7, 'river');
    const [d0, d1] = doors(g);
    const nearRiver = (x: number, y: number) => {
      const dx = rv.x1 - rv.x0;
      const dy = rv.y1 - rv.y0;
      const t = ((x - rv.x0) * dx + (y - rv.y0) * dy) / (dx * dx + dy * dy);
      return Math.hypot(x - (rv.x0 + dx * t), y - (rv.y0 + dy * t)) < rv.width + 0.5;
    };
    expect(connectedWithout('river', () => false, d0, d1)).toBe(true);
    expect(connectedWithout('river', nearRiver, d0, d1)).toBe(false);
  });

  it('Highland Crown: the crown is entered only by its ramps', () => {
    const def = MAPS.find((m) => m.id === 'highland')!;
    const ring = def.rings[0];
    const g = Game.create(7, 'highland');
    const [d0] = doors(g);
    const crown = { x: ring.cx, y: ring.cy };
    const onRing = (x: number, y: number) => Math.abs(Math.hypot(x - ring.cx, y - ring.cy) - ring.r) <= ring.width + 0.5;
    expect(connectedWithout('highland', () => false, d0, crown)).toBe(true);
    expect(connectedWithout('highland', onRing, d0, crown)).toBe(false);
  });

  it('a rich mine holds three miners at once', () => {
    const g = emptyGame(40, 24);
    g.addBuilding('hq', 0, 3, 3);
    const mine = g.addResource('goldmine', 14, 9, 5000, CONFIG.mineKinds.rich.miners);
    const ws = [0, 1, 2, 3, 4].map((i) => g.addUnit('worker', 0, 12.5, 8.5 + i * 0.6));
    g.issue({ type: 'gather', player: 0, units: ws.map((w) => w.id), nodeId: mine.id });
    let most = 0;
    for (let t = 0; t < 20 * 30; t++) {
      g.step();
      most = Math.max(most, ws.filter((w) => w.hidden).length);
    }
    expect(most).toBe(3);
  });
});

describe('fog memory', () => {
  it('an enemy building destroyed out of sight stays remembered until you look again', () => {
    const g = emptyGame(60, 24);
    g.addBuilding('hq', 0, 2, 2);
    const scout = g.addUnit('guard', 0, 40.5, 12.5);
    const farm = g.addBuilding('farm', 1, 44, 12);
    g.step();
    expect(g.vision.remembered(0).map((m) => m.id)).toEqual([farm.id]);
    scout.x = scout.px = 5.5; // walk away (teleport for the test)
    g.step();
    g.removeEntity(farm.id); // destroyed while nobody of ours looks
    run(g, 5);
    expect(g.vision.remembered(0)).toHaveLength(1);
    scout.x = scout.px = 40.5;
    g.step();
    expect(g.vision.remembered(0)).toHaveLength(0);
  });

  it('a camp counts as cleared for a player only once that player sees it cleared', () => {
    const g = Game.create(7, 'vales');
    const n = g.state.players.find((p) => p.neutral)!.id;
    const camp = g.state.camps[0];
    for (const u of g.units().filter((u) => u.owner === n && u.camp === 0)) kill(g, u, 1);
    g.step();
    expect(camp.cleared).toBe(true);
    expect(camp.seenClear & 1).toBe(0); // player 1's side saw nothing
    g.addUnit('guard', 0, camp.x + 2.5, camp.y + 0.5);
    g.step();
    expect(camp.seenClear & 1).toBe(1);
  });
});

describe('scouting tools', () => {
  it('a Signal Flare lights up a far spot for a while, costs gold and has a cooldown', () => {
    const g = emptyGame(60, 40);
    const keep = g.addBuilding('hq', 0, 2, 2);
    g.player(0).gold = 100;
    expect(g.vision.isVisible(0, 50, 30)).toBe(false);
    g.issue({ type: 'flare', player: 0, buildingId: keep.id, x: 50.5, y: 30.5 });
    run(g, 2);
    expect(g.vision.isVisible(0, 50, 30)).toBe(true);
    expect(g.player(0).gold).toBe(100 - CONFIG.flare.gold);
    g.issue({ type: 'flare', player: 0, buildingId: keep.id, x: 30.5, y: 30.5 });
    g.step();
    expect(g.drainEvents().find((e) => e.type === 'cantCast')).toMatchObject({ reason: expect.stringContaining('ready in') });
    run(g, secondsToTicks(CONFIG.flare.seconds));
    expect(g.vision.isVisible(0, 50, 30)).toBe(false);
  });

  it('the Outrider is a tier-I scout that sees far and does not pick fights', () => {
    const g = emptyGame(60, 40);
    g.player(0).gold = 500;
    g.addBuilding('hq', 0, 12, 4); // population
    const rax = g.addBuilding('barracks', 0, 4, 4);
    g.issue({ type: 'train', player: 0, buildingId: rax.id, unit: 'outrider' });
    runUntil(g, () => g.units().some((u) => u.type === 'outrider'), secondsToTicks(CONFIG.units.outrider.trainSeconds) + 5);
    const o = g.units().find((u) => u.type === 'outrider')!;
    expect(CONFIG.units.outrider.sight).toBeGreaterThan(CONFIG.units.archer.sight);
    o.x = o.px = 30.5;
    o.y = o.py = 20.5;
    o.order = null;
    o.move = null;
    const foe = g.addUnit('worker', 1, 32.5, 20.5);
    run(g, 20);
    expect(o.order).toBeNull();
    expect(foe.hp).toBe(foe.maxHp);
  });
});

describe('computer scouting', () => {
  for (const def of MAPS)
    it(`on ${def.name}, a Hard computer finds the enemy base within 6 minutes`, () => {
      const g = Game.create(4, def.id);
      const ai = new ComputerPlayer(0, 'hard');
      const foe = g.buildings().find((b) => b.owner === 1 && b.type === 'hq')!;
      for (let t = 0; t < 20 * 60 * 6 && !g.vision.remembered(0).some((m) => m.id === foe.id); t++) {
        g.step();
        ai.update(g);
      }
      expect(g.vision.remembered(0).some((m) => m.id === foe.id)).toBe(true);
    }, 30_000);
});
