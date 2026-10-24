import { describe, expect, it } from 'vitest';
import { damageAfterArmor } from '../src/sim/combat';
import { CONFIG } from '../src/sim/config';
import { Game } from '../src/sim/game';
import type { GameEvent } from '../src/sim/types';
import { emptyGame, rebuild, run, runUntil, setRock } from './helpers';

const GUARD = CONFIG.units.guard;
const ARCHER = CONFIG.units.archer;

describe('damage and death', () => {
  it('armor reduces damage, never below 1', () => {
    expect(damageAfterArmor(14, 0)).toBe(14);
    expect(damageAfterArmor(14, 2)).toBe(Math.round(14 / 1.12));
    expect(damageAfterArmor(1, 50)).toBe(1);
  });

  it('an ordered melee attack chases, hits on the wind-up, and kills', () => {
    const g = emptyGame(30, 20);
    const a = g.addUnit('guard', 0, 4.5, 10.5);
    const b = g.addUnit('worker', 1, 11.5, 10.5); // within sight: fog hides anything further
    g.issue({ type: 'attack', player: 0, units: [a.id], targetId: b.id });
    const events: GameEvent[] = [];
    runUntil(g, () => (events.push(...g.drainEvents()), !g.unit(b.id)), 20 * 60);
    const hits = events.filter((e) => e.type === 'hit');
    // Normal attacks deal 1.5x against a Laborer's medium armor.
    const per = damageAfterArmor(GUARD.attack.damage * CONFIG.combat.typeTable.normal.medium, 0);
    expect(hits[0]).toMatchObject({ damage: per });
    expect(hits.length).toBe(Math.ceil(CONFIG.units.worker.hp / per));
    expect(events.some((e) => e.type === 'death' && e.id === b.id)).toBe(true);
    run(g, 2);
    expect(a.order).toBeNull();
  });

  it('attack rate follows the cooldown', () => {
    const g = emptyGame(30, 20);
    const a = g.addUnit('guard', 0, 10, 10.5);
    const b = g.addUnit('guard', 1, 11, 10.5);
    b.hp = 1e6;
    b.maxHp = 1e6;
    g.issue({ type: 'attack', player: 0, units: [a.id], targetId: b.id });
    g.issue({ type: 'hold', player: 1, units: [b.id] }); // b fights back from where it stands
    const events: GameEvent[] = [];
    for (let t = 0; t < 20 * 13; t++) {
      g.step();
      events.push(...g.drainEvents());
    }
    const swings = events.filter((e) => e.type === 'hit' && e.attacker === a.id).length;
    expect(swings).toBeGreaterThanOrEqual(9);
    expect(swings).toBeLessThanOrEqual(10); // 13 s / 1.3 s cooldown
  });

  it('archers fire projectiles that deal damage on arrival', () => {
    const g = emptyGame(30, 20);
    const a = g.addUnit('archer', 0, 5.5, 10.5);
    const b = g.addUnit('worker', 1, 10.5, 10.5);
    g.issue({ type: 'attack', player: 0, units: [a.id], targetId: b.id });
    runUntil(g, () => g.state.projectiles.length > 0, 60);
    expect(b.hp).toBe(b.maxHp); // in flight, not yet landed
    expect(Math.hypot(a.x - 5.5, a.y - 10.5)).toBeLessThan(0.01); // in range: did not walk
    runUntil(g, () => b.hp < b.maxHp, 40);
    expect(b.hp).toBe(b.maxHp - damageAfterArmor(ARCHER.attack.damage * CONFIG.combat.typeTable.pierce.medium, 0));
  });

  it('a shot whose target dies first fizzles', () => {
    const g = emptyGame(30, 20);
    const a = g.addUnit('archer', 0, 5.5, 10.5);
    const b = g.addUnit('worker', 1, 10.5, 10.5);
    g.issue({ type: 'attack', player: 0, units: [a.id], targetId: b.id });
    runUntil(g, () => g.state.projectiles.length > 0, 60);
    g.removeEntity(b.id);
    run(g, 30);
    expect(g.state.projectiles).toHaveLength(0);
  });

  it('units inside a mine cannot be targeted', () => {
    const g = emptyGame(40, 24);
    g.addBuilding('hq', 1, 4, 8);
    const mine = g.addResource('goldmine', 14, 9, 1000);
    const w = g.addUnit('worker', 1, 12.5, 10.5);
    g.issue({ type: 'gather', player: 1, units: [w.id], nodeId: mine.id });
    runUntil(g, () => w.hidden, 200);
    const a = g.addUnit('guard', 0, 20.5, 10.5);
    g.issue({ type: 'attack', player: 0, units: [a.id], targetId: w.id });
    g.step();
    expect(a.order).toBeNull();
  });

  it('destroying a building frees its tiles and refunds its queue', () => {
    const g = emptyGame(30, 20);
    g.player(1).gold = 1000;
    const rax = g.addBuilding('barracks', 1, 11, 8);
    g.issue({ type: 'train', player: 1, buildingId: rax.id, unit: 'guard' });
    g.step();
    expect(g.player(1).gold).toBe(1000 - GUARD.cost.gold);
    const ids = [0, 1, 2, 3, 4, 5].map((i) => g.addUnit('guard', 0, 5.5, 5.5 + i).id);
    g.issue({ type: 'attack', player: 0, units: ids, targetId: rax.id });
    const events: GameEvent[] = [];
    runUntil(g, () => (events.push(...g.drainEvents()), !g.building(rax.id)), 20 * 120);
    expect(events.some((e) => e.type === 'buildingDestroyed')).toBe(true);
    expect(g.player(1).gold).toBe(1000);
    expect(g.nav.passable(12, 9)).toBe(true);
  });
});

describe('orders and automatic behaviour', () => {
  it('idle soldiers engage enemies that come within acquire range', () => {
    const g = emptyGame(40, 20);
    const a = g.addUnit('guard', 0, 5.5, 10.5);
    const b = g.addUnit('worker', 1, 5.5 + GUARD.attack.acquire + 3, 10.5);
    run(g, 20);
    expect(a.order).toBeNull();
    b.x -= 3;
    b.px = b.x;
    run(g, 10);
    expect(a.order).toMatchObject({ type: 'attack', targetId: b.id, auto: true });
  });

  it('auto-engaged units give up past the leash and walk back', () => {
    const g = emptyGame(60, 20);
    const a = g.addUnit('guard', 0, 5.5, 10.5);
    const b = g.addUnit('worker', 1, 9.5, 10.5);
    b.hp = 1e6;
    run(g, 6);
    expect(a.order?.type).toBe('attack');
    // The worker flees far away; the guard chases to the leash then returns.
    g.issue({ type: 'move', player: 1, units: [b.id], x: 55, y: 10.5 });
    runUntil(g, () => a.order?.type === 'move', 20 * 20);
    runUntil(g, () => a.order === null, 20 * 20);
    expect(Math.hypot(a.x - 5.5, a.y - 10.5)).toBeLessThan(1);
  });

  it('idle units that are shot from outside acquire range strike back', () => {
    const g = emptyGame(40, 20);
    const a = g.addUnit('guard', 0, 5.5, 10.5);
    const archer = g.addUnit('archer', 1, 5.5 + 0.65 + ARCHER.attack.range, 10.5);
    g.issue({ type: 'attack', player: 1, units: [archer.id], targetId: a.id });
    runUntil(g, () => a.hp < a.maxHp, 100);
    run(g, 2);
    expect(a.order).toMatchObject({ type: 'attack', targetId: archer.id });
  });

  it('move orders ignore enemies (retreat)', () => {
    const g = emptyGame(40, 20);
    const a = g.addUnit('guard', 0, 5.5, 10.5);
    g.addUnit('guard', 1, 8.5, 10.5);
    g.issue({ type: 'move', player: 0, units: [a.id], x: 5.5, y: 18.5 });
    run(g, 5);
    expect(a.order?.type).toBe('move');
  });

  it('attack-move engages enemies on the way, then continues to the destination', () => {
    const g = emptyGame(40, 20);
    const a = g.addUnit('guard', 0, 3.5, 10.5);
    const b = g.addUnit('worker', 1, 15.5, 11.5);
    g.issue({ type: 'attackMove', player: 0, units: [a.id], x: 35.5, y: 10.5 });
    runUntil(g, () => !g.unit(b.id), 20 * 40);
    expect(a.x).toBeLessThan(25);
    runUntil(g, () => a.order === null, 20 * 20);
    expect(Math.hypot(a.x - 35.5, a.y - 10.5)).toBeLessThan(0.5);
  });

  it('hold position never moves but attacks enemies in weapon range', () => {
    const g = emptyGame(40, 20);
    const archer = g.addUnit('archer', 0, 10.5, 10.5);
    g.issue({ type: 'hold', player: 0, units: [archer.id] });
    const far = g.addUnit('worker', 1, 10.5 + ARCHER.attack.range + 2, 10.5);
    run(g, 40);
    expect(far.hp).toBe(far.maxHp);
    const near = g.addUnit('worker', 1, 13.5, 10.5);
    // A pushing enemy cannot shove a held unit either.
    const pusher = g.addUnit('guard', 1, 10.6, 10.5);
    g.issue({ type: 'move', player: 1, units: [pusher.id], x: 9, y: 10.5 });
    run(g, 60);
    expect(near.hp + pusher.hp).toBeLessThan(near.maxHp + pusher.maxHp);
    expect(archer.x).toBeCloseTo(10.5, 5);
    expect(archer.y).toBeCloseTo(10.5, 5);
    expect(archer.order?.type).toBe('hold');
  });

  it('workers do not auto-acquire but fight when ordered', () => {
    const g = emptyGame(40, 20);
    const w = g.addUnit('worker', 0, 5.5, 10.5);
    const e = g.addUnit('worker', 1, 6.5, 10.5);
    run(g, 20);
    expect(w.order).toBeNull();
    g.issue({ type: 'attack', player: 0, units: [w.id], targetId: e.id });
    runUntil(g, () => e.hp < e.maxHp, 60);
  });

  it('cannot attack allies or resources', () => {
    const g = emptyGame(40, 20);
    const a = g.addUnit('guard', 0, 5.5, 10.5);
    const ally = g.addUnit('worker', 0, 7.5, 10.5);
    const tree = g.addResource('tree', 10, 10, 50);
    g.issue({ type: 'attack', player: 0, units: [a.id], targetId: ally.id });
    g.issue({ type: 'attack', player: 0, units: [a.id], targetId: tree.id });
    g.step();
    expect(a.order).toBeNull();
  });

  it('a watch tower shoots enemies in range once finished', () => {
    const g = emptyGame(40, 20);
    const tower = g.addBuilding('tower', 0, 10, 10, 0.5);
    const e = g.addUnit('worker', 1, 14.5, 11);
    run(g, 40);
    expect(e.hp).toBe(e.maxHp);
    tower.progress = 1;
    runUntil(g, () => e.hp < e.maxHp, 60);
  });

  it('melee fighters route around walls to reach a target', () => {
    let g = emptyGame(30, 20);
    for (let y = 0; y < 16; y++) setRock(g, 15, y);
    g = rebuild(g);
    const a = g.addUnit('guard', 0, 10.5, 5.5);
    const b = g.addUnit('worker', 1, 17.5, 5.5);
    g.issue({ type: 'attack', player: 0, units: [a.id], targetId: b.id });
    runUntil(g, () => !g.unit(b.id), 20 * 60);
  });
});

describe('battles', () => {
  it('a 10 v 10 brawl resolves with no stuck fighters', () => {
    const g = emptyGame(50, 30);
    for (let i = 0; i < 10; i++) {
      g.addUnit(i % 3 === 2 ? 'archer' : 'guard', 0, 5.5 + (i % 3), 10.5 + i);
      g.addUnit(i % 3 === 2 ? 'poacher' : 'brigand', 1, 42.5 - (i % 3), 10.5 + i);
    }
    const mine = g.units().filter((u) => u.owner === 0).map((u) => u.id);
    const theirs = g.units().filter((u) => u.owner === 1).map((u) => u.id);
    g.issue({ type: 'attackMove', player: 0, units: mine, x: 42, y: 15 });
    g.issue({ type: 'attackMove', player: 1, units: theirs, x: 6, y: 15 });
    runUntil(g, () => !g.units().some((u) => u.owner === 0) || !g.units().some((u) => u.owner === 1), 20 * 90);
    for (const u of g.units()) expect(g.nav.canStand(u.x, u.y, u.radius)).toBe(true);
    // Survivors carry on to their attack-move destination.
    runUntil(g, () => g.units().every((u) => u.order === null), 20 * 30);
  });

  it('camps guard the contested mines and are symmetric', () => {
    const g = Game.create(4);
    const neutral = g.state.players.find((p) => p.neutral)!;
    const camp = g.units().filter((u) => u.owner === neutral.id);
    expect(camp.length).toBe(14);
    const W = g.state.map.width;
    const H = g.state.map.height;
    for (const u of camp) {
      expect(camp.some((v) => Math.abs(v.x - (W - u.x)) < 1e-9 && Math.abs(v.y - (H - u.y)) < 1e-9 && v.type === u.type)).toBe(true);
      expect(g.nav.canStand(u.x, u.y, u.radius)).toBe(true);
    }
    // Idle camps stay put and leave the starting bases alone.
    run(g, 20 * 60);
    for (const u of camp) expect(Math.hypot(u.x - u.home!.x, u.y - u.home!.y)).toBeLessThan(1);
    expect(g.units().filter((u) => u.owner === 0)).toHaveLength(5);
  });

  it('a camp chases intruders only to its leash and returns home', () => {
    const g = Game.create(4);
    const neutral = g.state.players.find((p) => p.neutral)!.id;
    const guard = g.units().find((u) => u.owner === neutral && u.type === 'brigand')!;
    const bait = g.addUnit('guard', 0, guard.x + 4, guard.y);
    bait.hp = 1e6;
    run(g, 20);
    expect(guard.order?.type).toBe('attack');
    g.issue({ type: 'move', player: 0, units: [bait.id], x: 48, y: 60 });
    runUntil(g, () => guard.order === null && Math.hypot(guard.x - guard.home!.x, guard.y - guard.home!.y) < 0.6, 20 * 40);
  });

  it('combat stays deterministic and survives save/load', () => {
    const setup = () => {
      const g = emptyGame(50, 30);
      for (let i = 0; i < 6; i++) {
        g.addUnit('archer', 0, 5.5, 8.5 + i * 1.5);
        g.addUnit('brigand', 1, 40.5, 8.5 + i * 1.5);
      }
      g.issue({ type: 'attackMove', player: 0, units: g.units().filter((u) => u.owner === 0).map((u) => u.id), x: 40, y: 12 });
      g.issue({ type: 'attackMove', player: 1, units: g.units().filter((u) => u.owner === 1).map((u) => u.id), x: 5, y: 12 });
      return g;
    };
    const a = setup();
    const b = setup();
    run(a, 300);
    run(b, 300);
    expect(a.toJSON()).toBe(b.toJSON());
    const c = Game.fromJSON(a.toJSON());
    run(a, 400);
    run(c, 400);
    expect(c.toJSON()).toBe(a.toJSON());
  });
});
