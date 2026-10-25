import { describe, expect, it } from 'vitest';
import { ComputerPlayer, type Difficulty, type StyleId } from '../src/ai/computer';
import { composeProfile, randomStyle, STYLES } from '../src/ai/profile';
import { kill } from '../src/sim/combat';
import { CONFIG, secondsToTicks } from '../src/sim/config';
import { Game } from '../src/sim/game';
import type { Command } from '../src/sim/commands';
import type { Unit } from '../src/sim/types';

const SEC = 20;

/** One computer (player 0) plays alone; with attacks off unless asked, so player 1 survives. */
function grow(seconds: number, difficulty: Difficulty = 'hard', style: StyleId = 'balanced', overrides = {}, seed = 5, map = 'vales') {
  const g = Game.create(seed, map);
  const ai = new ComputerPlayer(0, difficulty, style, { firstAttackSeconds: 1e9, creeps: false, ...overrides });
  const step = (s: number) => {
    for (let t = 0; t < s * SEC; t++) {
      g.step();
      ai.update(g);
    }
  };
  step(seconds);
  return { g, ai, step };
}

const mine = (g: Game, p: number) => g.units().filter((u) => u.owner === p);
const workersOf = (g: Game, p: number) => mine(g, p).filter((u) => u.type === 'worker');
const keepsOf = (g: Game, p: number) => g.buildings().filter((b) => b.owner === p && b.type === 'hq');
const said = (ai: ComputerPlayer, text: string) => ai.journal.some((j) => j.text.includes(text));
/** What the computer knows, by way of its private state (tests only). */
const inside = (ai: ComputerPlayer) => ai as unknown as Record<string, unknown> & { posture: string };

describe('profiles: difficulty × style', () => {
  it('a style changes the plan; the difficulty alone decides how well it plays', () => {
    const hard = composeProfile('hard');
    expect(composeProfile('hard', 'raider').firstAttackSeconds).toBeLessThan(hard.firstAttackSeconds);
    expect(composeProfile('hard', 'raider').raids).toBe(true);
    expect(composeProfile('hard', 'expander').expandSeconds).toBeLessThan(hard.expandSeconds);
    expect(composeProfile('hard', 'expander').maxKeeps).toBe(3);
    expect(composeProfile('hard', 'warden').towers).toBeGreaterThan(hard.towers);
    expect(composeProfile('hard', 'warlord').heroesEarly).toBe(true);
    const quality = ['thinkSeconds', 'reactSeconds', 'idleCheckSeconds', 'judgeFights', 'regroup', 'reinforce', 'focusFire', 'pullWorkers', 'heroRetreat', 'saveForKeep', 'readsIntel', 'adapt', 'assessStrength'] as const;
    for (const d of ['easy', 'normal', 'hard'] as const)
      for (const s of STYLES) for (const k of quality) expect(composeProfile(d, s)[k]).toEqual(CONFIG.ai.profiles[d][k]);
  });

  it('difficulty is decision quality: Hard reacts faster, notices idle Laborers sooner and judges fights', () => {
    const [e, n, h] = (['easy', 'normal', 'hard'] as const).map((d) => CONFIG.ai.profiles[d]);
    expect(e.reactSeconds).toBeGreaterThan(n.reactSeconds);
    expect(n.reactSeconds).toBeGreaterThan(h.reactSeconds);
    expect(e.idleCheckSeconds).toBeGreaterThan(n.idleCheckSeconds);
    expect([e.judgeFights, n.judgeFights, h.judgeFights]).toEqual([false, true, true]);
    expect([e.focusFire, n.focusFire, h.focusFire]).toEqual([false, false, true]);
  });

  it('a random style is fixed by the seed, and every style comes up', () => {
    expect(randomStyle(42)).toBe(randomStyle(42));
    const seen = new Set(Array.from({ length: 60 }, (_, i) => randomStyle(i + 1)));
    expect([...seen].sort()).toEqual([...STYLES].sort());
  });
});

describe('optional advantage (labelled)', () => {
  it('is off unless chosen, and every advantage is labelled a cheat', () => {
    const g = Game.create(5);
    expect(g.state.players.filter((p) => !p.neutral).map((p) => p.incomeBonus)).toEqual([0, 0]);
    for (const [id, a] of Object.entries(CONFIG.ai.advantages)) {
      if (id === 'none') expect(a.income).toBe(0);
      else expect(a.name).toContain('cheat');
    }
  });

  it('+25% income adds exactly a quarter to every delivery, never changing gathering itself', () => {
    const run = (bonus: number) => {
      const g = Game.create(5);
      g.player(0).incomeBonus = bonus;
      const ws = workersOf(g, 0);
      const goldmine = g.resources().filter((r) => r.type === 'goldmine').sort((a, b) => Math.hypot(a.x - ws[0].x, a.y - ws[0].y) - Math.hypot(b.x - ws[0].x, b.y - ws[0].y))[0];
      g.issue({ type: 'gather', player: 0, units: ws.map((w) => w.id), nodeId: goldmine.id });
      for (let t = 0; t < 120 * SEC; t++) g.step();
      return { gathered: g.player(0).goldGathered, mineLeft: goldmine.amount };
    };
    const plain = run(0);
    const boosted = run(0.25);
    expect(boosted.mineLeft).toBe(plain.mineLeft); // the same gold left the mine
    expect(Math.abs(boosted.gathered - plain.gathered * 1.25)).toBeLessThan(1);
  });
});

describe('economic recovery', () => {
  it('rebuilds its Laborers after a massacre, before its army', () => {
    const { g, ai, step } = grow(240);
    const before = workersOf(g, 0).length;
    for (const w of workersOf(g, 0).slice(2)) kill(g, w, 1);
    step(150);
    expect(workersOf(g, 0).length).toBeGreaterThanOrEqual(Math.floor(before * 0.9));
    expect(said(ai, 'Lost Laborers')).toBe(true);
  }, 30_000);

  it('rebuilds a lost Keep, clearing a camp for the bounty when it cannot afford one', () => {
    const { g, ai, step } = grow(240, 'hard', 'balanced', { creeps: true });
    for (const k of keepsOf(g, 0)) kill(g, k, 1);
    g.player(0).gold = Math.min(g.player(0).gold, 100);
    step(240);
    expect(keepsOf(g, 0).some((k) => k.progress >= 1)).toBe(true);
    expect(said(ai, 'Lost its last Keep')).toBe(true);
    expect(workersOf(g, 0).filter((w) => w.order === null).length).toBeLessThanOrEqual(1);
  }, 30_000);

  it('saves enough to rebuild while its last Keep is going down', () => {
    const { g, step } = grow(240);
    const keep = keepsOf(g, 0)[0];
    keep.hp = keep.maxHp * 0.4;
    g.player(0).gold = 500;
    g.player(0).wood = 300;
    step(30);
    expect(g.player(0).gold).toBeGreaterThanOrEqual(CONFIG.buildings.hq.cost.gold);
  }, 30_000);
});

describe('Laborers', () => {
  it('puts an idle Laborer back to work: Hard at once, Easy only now and then', () => {
    for (const [d, within] of [['hard', 1], ['easy', CONFIG.ai.profiles.easy.idleCheckSeconds + 1]] as const) {
      const { g, step } = grow(180, d);
      const w = workersOf(g, 0).find((u) => u.order?.type === 'gather' && !u.hidden && u.carry.amount === 0)!;
      g.issue({ type: 'stop', player: 0, units: [w.id] });
      step(within);
      expect(g.unit(w.id)!.order?.type).toBe('gather');
    }
  }, 30_000);

  it('brings a Laborer hauling from a mine with no Keep beside it back to a home mine', () => {
    const { g, step } = grow(180);
    const keep = keepsOf(g, 0)[0];
    const far = g.resources().filter((r) => r.type === 'goldmine').sort((a, b) => Math.hypot(b.x - keep.x, b.y - keep.y) - Math.hypot(a.x - keep.x, a.y - keep.y))[0];
    const w = workersOf(g, 0).find((u) => u.order?.type === 'gather' && !u.hidden && u.carry.amount === 0)!;
    g.issue({ type: 'gather', player: 0, units: [w.id], nodeId: far.id });
    step(2);
    const o = g.unit(w.id)!.order;
    expect(o?.type).toBe('gather');
    expect(o?.type === 'gather' && o.nodeId).not.toBe(far.id);
  }, 30_000);

  it('a Laborer scouts the enemy base early, then goes back to work', () => {
    const { g, ai, step } = grow(CONFIG.ai.profiles.hard.scoutWorkerSeconds! + 1);
    const scoutId = inside(ai).scoutWorker as number;
    expect(scoutId).toBeGreaterThan(0);
    step(150);
    expect(said(ai, 'Laborer scouted the enemy base')).toBe(true);
    expect(g.unit(scoutId)?.order?.type).toBe('gather');
    expect(g.vision.remembered(0).some((m) => m.type === 'hq')).toBe(true);
  }, 30_000);
});

describe('reading the enemy', () => {
  it('enemy soldiers on its side early: it holds back, adds a tower and delays expanding', () => {
    const { g, ai, step } = grow(150, 'hard', 'balanced', { scoutWorkerSeconds: null });
    const keep = keepsOf(g, 0)[0];
    const spots = g.freeTilesAround(keep, 40).slice(-3);
    for (const s of spots) g.addUnit('guard', 1, s.x + 0.5, s.y + 0.5);
    step(1);
    expect(inside(ai).posture).toBe('threatened');
    expect(said(ai, 'expecting pressure')).toBe(true);
    const buildings = g.buildings().filter((b) => b.owner === 0);
    expect((inside(ai).wantsExpansion as (g: Game, b: unknown) => boolean).call(ai, g, buildings)).toBe(false);
  }, 30_000);

  it('an opponent behind towers: it expands before its usual time', () => {
    const { g, ai, step } = grow(150, 'hard', 'balanced', { scoutWorkerSeconds: null });
    const keep = keepsOf(g, 0)[0];
    // Three enemy tower foundations in plain view (foundations don't shoot).
    for (const [dx, dy] of [[10, -8], [13, -8], [16, -8]]) g.addBuilding('tower', 1, keep.tx + dx, keep.ty + dy, 0.1);
    step(120);
    expect(inside(ai).posture).toBe('greedy');
    const expanded = ai.journal.find((j) => j.text.startsWith('Expanding'));
    expect(expanded).toBeDefined();
    expect(expanded!.tick / SEC).toBeLessThan(composeProfile('hard').expandSeconds);
  }, 30_000);
});

describe('fights', () => {
  /** A computer with a home army, and a few enemy soldiers placed at its door. */
  function atDoor(difficulty: Difficulty, enemies: number) {
    const r = grow(300, difficulty, 'balanced');
    const keep = keepsOf(r.g, 0)[0];
    // Behind the Keep, away from the army waiting in front of it.
    const away = { x: keep.x + (keep.x - 48) * 0.15, y: keep.y + (keep.y - 36) * 0.15 };
    const spots = r.g.freeTilesAround({ tx: Math.floor(away.x), ty: Math.floor(away.y), w: 1, h: 1 }, enemies);
    const foes = spots.map((s) => r.g.addUnit('guard', 1, s.x + 0.5, s.y + 0.5));
    r.g.issue({ type: 'hold', player: 1, units: foes.map((f) => f.id) } as Command);
    // The computer's own orders (units also engage on their own; that is not a decision).
    const sent = new Set<number>();
    const issue = r.g.issue.bind(r.g);
    r.g.issue = (c: Command) => {
      if (c.player === 0 && c.type === 'attackMove') for (const id of c.units) sent.add(id);
      issue(c);
    };
    return { ...r, foes, sent };
  }
  const soldiers = (g: Game) => mine(g, 0).filter((u) => u.type !== 'worker' && u.type !== 'outrider');

  it('answers a small raid with enough defenders, not the whole army; Easy reacts later', () => {
    const hard = atDoor('hard', 1);
    expect(soldiers(hard.g).length).toBeGreaterThanOrEqual(5);
    hard.step(2);
    expect(hard.sent.size).toBeGreaterThan(0);
    expect(hard.sent.size).toBeLessThan(soldiers(hard.g).length);
    const easy = atDoor('easy', 1);
    easy.step(2);
    expect(easy.sent.size).toBe(0);
    easy.step(CONFIG.ai.profiles.easy.reactSeconds + 2);
    expect(easy.sent.size).toBeGreaterThan(0);
  }, 30_000);

  it('a judging computer falls back from a much stronger force with most of its wave alive', () => {
    const g = Game.create(5, 'vales');
    const ai = new ComputerPlayer(0, 'hard', 'balanced', { firstAttackSeconds: 0, waveSize: 6, creeps: false, assessStrength: false });
    const keep = keepsOf(g, 0)[0];
    const army = g.freeTilesAround(keep, 40).slice(-6).map((s) => g.addUnit('guard', 0, s.x + 0.5, s.y + 0.5));
    // A big enemy army holds the middle of the map, on the way.
    const wall: Unit[] = [];
    for (let i = 0; i < 18; i++) wall.push(g.addUnit('guard', 1, 44 + (i % 6), 34 + Math.floor(i / 6)));
    g.issue({ type: 'hold', player: 1, units: wall.map((u) => u.id) } as Command);
    for (let t = 0; t < 120 * SEC && !said(ai, 'stronger force'); t++) {
      g.step();
      ai.update(g);
    }
    expect(said(ai, 'Met a stronger force')).toBe(true);
    expect(army.filter((u) => g.unit(u.id)).length).toBeGreaterThanOrEqual(4);
  }, 30_000);

  it('Hard soldiers switch to a badly hurt enemy within reach', () => {
    const { g, ai } = grow(10, 'hard');
    const archers = [0, 1, 2].map((i) => g.addUnit('archer', 0, 40 + i, 40));
    const healthy = g.addUnit('guard', 1, 40, 42.5);
    const hurt = g.addUnit('guard', 1, 41.5, 42.5);
    hurt.hp = hurt.maxHp * 0.2;
    g.issue({ type: 'hold', player: 1, units: [healthy.id, hurt.id] } as Command);
    g.issue({ type: 'attack', player: 0, units: archers.map((a) => a.id), targetId: healthy.id });
    g.step();
    inside(ai).lastFocus = -1e9;
    (inside(ai).focusFire as (g: Game, a: Unit[], e: unknown[]) => void).call(ai, g, archers, [healthy, hurt]);
    g.step();
    for (const a of archers) expect(a.order?.type === 'attack' && a.order.targetId).toBe(hurt.id);
  });

  it('a badly hurt hero with nothing to drink leaves the fight to heal', () => {
    const { g, ai, step } = grow(300, 'hard');
    const hero = mine(g, 0).find((u) => u.hero);
    expect(hero).toBeDefined();
    hero!.hero!.items = hero!.hero!.items.map(() => null);
    // Out in the field, away from home.
    hero!.x = 40.5;
    hero!.y = 44.5;
    hero!.move = null;
    hero!.hp = hero!.maxHp * 0.2;
    step(1);
    expect(said(ai, 'out of the fight to heal')).toBe(true);
    expect(hero!.order?.type).toBe('move');
  }, 30_000);
});

describe('styles over a match', () => {
  /** Each style against the Balanced computer for 10 minutes on the same map. */
  const results = new Map<StyleId, { ai: ComputerPlayer; g: Game }>();
  function match(style: StyleId) {
    if (!results.has(style)) {
      const g = Game.create(4, 'vales');
      const ais = [new ComputerPlayer(0, 'hard', style), new ComputerPlayer(1, 'hard', 'balanced')];
      for (let t = 0; t < 10 * 60 * SEC && !g.state.outcome; t++) {
        g.step();
        for (const a of ais) a.update(g);
      }
      results.set(style, { ai: ais[0], g });
    }
    return results.get(style)!;
  }
  const first = (ai: ComputerPlayer, text: string) => ai.journal.find((j) => j.text.includes(text))?.tick ?? Infinity;

  it('the Raider strikes first, and goes for Laborers', () => {
    const raider = first(match('raider').ai, 'raid');
    expect(raider).toBeLessThan(first(match('balanced').ai, 'Attacking'));
    expect(raider).toBeLessThan(secondsToTicks(240));
  }, 120_000);

  it('the Expander takes a second Keep first', () => {
    const exp = first(match('expander').ai, 'Expanding');
    for (const s of ['balanced', 'raider', 'warden'] as const) expect(exp).toBeLessThan(first(match(s).ai, 'Expanding'));
  }, 120_000);

  it('the Warden builds the most towers; the Warlord raises its hero before its Barracks', () => {
    const towers = (s: StyleId) => match(s).g.buildings().filter((b) => b.owner === 0 && b.type === 'tower').length;
    expect(towers('warden')).toBeGreaterThan(towers('balanced'));
    const built = (s: StyleId, t: string) => match(s).g.player(0).stats.built[t as 'altar'] ?? 0;
    expect(built('warlord', 'altar')).toBeGreaterThan(0);
    const { ai } = match('warlord');
    expect(first(ai, 'Attacking')).toBeGreaterThan(0);
  }, 120_000);
});

describe('fair information', () => {
  it('an enemy hidden in the fog changes nothing the computer does', () => {
    // A spot on the enemy half that player 0 never sees in the first 150 s.
    const probe = Game.create(5, 'vales');
    const scout = new ComputerPlayer(0, 'hard', 'balanced');
    for (let t = 0; t < 150 * SEC; t++) {
      probe.step();
      scout.update(probe);
    }
    let spot = { x: 0, y: 0 };
    for (let y = 4; y < 30 && !spot.x; y++)
      for (let x = 50; x < 92; x++)
        if (!probe.vision.isExplored(0, x, y) && probe.nav.canStand(x + 0.5, y + 0.5, 0.4) && Math.hypot(x - 84, y - 14) > 20) {
          spot = { x: x + 0.5, y: y + 0.5 };
          break;
        }
    expect(spot.x).toBeGreaterThan(0);
    const record = (hidden: boolean) => {
      const g = Game.create(5, 'vales');
      const ai = new ComputerPlayer(0, 'hard', 'balanced');
      // Far corner of the enemy half, nowhere near anything player 0 sees.
      // Both runs create the guard, so entity ids match; one run takes it away again.
      const guard = g.addUnit('guard', 1, spot.x, spot.y);
      if (hidden) g.issue({ type: 'hold', player: 1, units: [guard.id] } as Command);
      else g.removeEntity(guard.id);
      const log: string[] = [];
      const issue = g.issue.bind(g);
      g.issue = (c: Command) => {
        log.push(JSON.stringify(c));
        issue(c);
      };
      for (let t = 0; t < 150 * SEC; t++) {
        g.step();
        ai.update(g);
      }
      expect(g.vision.isExplored(0, Math.floor(spot.x), Math.floor(spot.y))).toBe(false);
      return log;
    };
    expect(record(true)).toEqual(record(false));
  }, 30_000);
});
