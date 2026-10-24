import { describe, expect, it } from 'vitest';
import { ComputerPlayer } from '../src/ai/computer';
import { damageAfterArmor } from '../src/sim/combat';
import { CONFIG, secondsToTicks, type UnitType } from '../src/sim/config';
import type { Game } from '../src/sim/game';
import { attackRange } from '../src/sim/tech';
import type { GameEvent } from '../src/sim/types';
import { emptyGame, rebuild, run, runUntil, setRock } from './helpers';

const T = CONFIG.combat.typeTable;
const cost = (t: UnitType) => CONFIG.units[t].cost.gold + CONFIG.units[t].cost.wood;

/**
 * Two armies of equal total cost meet in mirrored formations. Fought twice,
 * swapping sides, so neither side's position decides it; returns the type
 * that won both times, or null.
 */
function battle(a: UnitType, b: UnitType, budget = 1200): { winner: 0 | 1 | null } {
  const once = (left: UnitType, right: UnitType): UnitType | null => {
    const g = emptyGame(40, 24);
    const make = (type: UnitType, owner: number, mirror: boolean) => {
      const n = Math.max(1, Math.round(budget / cost(type)));
      return Array.from({ length: n }, (_, i) => {
        const x = 14.5 + (i % 2) * 0.9;
        const y = 9 + Math.floor(i / 2) * 0.9;
        return g.addUnit(type, owner, mirror ? 40 - x : x, mirror ? 24 - y : y).id;
      });
    };
    const A = make(left, 0, false);
    const B = make(right, 1, true);
    g.issue({ type: 'attackMove', player: 0, units: A, x: 30, y: 12 });
    g.issue({ type: 'attackMove', player: 1, units: B, x: 10, y: 12 });
    const alive = (ids: number[]) => ids.filter((id) => g.unit(id)).length;
    for (let t = 0; t < 20 * 150 && alive(A) && alive(B); t++) g.step();
    const la = alive(A) / A.length;
    const lb = alive(B) / B.length;
    return la > lb ? left : lb > la ? right : null;
  };
  const w1 = once(a, b);
  const w2 = once(b, a);
  return { winner: w1 === w2 ? (w1 === a ? 0 : w1 === b ? 1 : null) : null };
}

function research(g: Game, player: number, ...ids: string[]): void {
  for (const id of ids) (g.player(player).research as Record<string, boolean>)[id] = true;
}

describe('damage types', () => {
  it('Lancers shrug off arrows, Guards hit Lancers hard, siege wrecks buildings', () => {
    expect(T.pierce.medium).toBeLessThan(1);
    expect(T.normal.medium).toBeGreaterThan(1);
    expect(T.siege.fortified).toBeGreaterThan(1);
    expect(T.pierce.fortified).toBeLessThan(T.normal.fortified);
    expect(T.magic.heavy).toBeGreaterThan(1);
  });

  it('an arrow on a Lancer deals the pierce-vs-medium share', () => {
    const g = emptyGame(30, 20);
    const a = g.addUnit('archer', 0, 5.5, 10.5);
    const l = g.addUnit('lancer', 1, 9.5, 10.5);
    g.issue({ type: 'hold', player: 1, units: [l.id] });
    g.issue({ type: 'attack', player: 0, units: [a.id], targetId: l.id });
    runUntil(g, () => l.hp < l.maxHp, 100);
    const expected = damageAfterArmor(CONFIG.units.archer.attack.damage * T.pierce.medium, CONFIG.units.lancer.armor);
    expect(l.maxHp - l.hp).toBe(expected);
  });
});

describe('counters (equal cost, open field)', () => {
  it('Lancers beat Archers', () => expect(battle('lancer', 'archer').winner).toBe(0));
  it('Guards beat Lancers', () => expect(battle('guard', 'lancer').winner).toBe(0));
  it('Archers beat Guards', () => expect(battle('archer', 'guard').winner).toBe(0));
  it('Archers beat Clerics', () => expect(battle('archer', 'cleric').winner).toBe(0));
  it('Guards beat Mangonels', () => expect(battle('guard', 'mangonel').winner).toBe(0));
  it('Lancers beat Mangonels', () => expect(battle('lancer', 'mangonel').winner).toBe(0));
});

describe('tier requirements', () => {
  it('Lancers need the Castle and a Blacksmith; the Chapel and Siege Works need the Castle', () => {
    const g = emptyGame(40, 24);
    const p = g.player(0);
    p.gold = p.wood = 5000;
    const rax = g.addBuilding('barracks', 0, 4, 4);
    const events: GameEvent[] = [];
    g.issue({ type: 'train', player: 0, buildingId: rax.id, unit: 'lancer' });
    g.step();
    events.push(...g.drainEvents());
    expect(events.find((e) => e.type === 'cantTrain')).toMatchObject({ reason: `Requires ${CONFIG.research.castle.name}.` });
    const w = g.addUnit('worker', 0, 12.5, 12.5);
    g.issue({ type: 'build', player: 0, units: [w.id], buildingType: 'chapel', tx: 14, ty: 14 });
    g.step();
    expect(g.drainEvents().find((e) => e.type === 'cantBuild')).toMatchObject({ reason: `Requires ${CONFIG.research.castle.name}.` });
    research(g, 0, 'castle');
    g.issue({ type: 'train', player: 0, buildingId: rax.id, unit: 'lancer' });
    g.step();
    expect(g.drainEvents().find((e) => e.type === 'cantTrain')).toMatchObject({ reason: `Requires a ${CONFIG.buildings.smithy.name}.` });
    g.addBuilding('smithy', 0, 20, 4);
    g.issue({ type: 'train', player: 0, buildingId: rax.id, unit: 'lancer' });
    g.issue({ type: 'build', player: 0, units: [w.id], buildingType: 'chapel', tx: 14, ty: 14 });
    g.step();
    expect(rax.queue.map((q) => q.unit)).toEqual(['lancer']);
    expect(w.order?.type).toBe('build');
  });

  it('the Citadel needs the Castle, raises the Keep to tier III and unlocks tier III research', () => {
    const g = emptyGame(40, 24);
    const p = g.player(0);
    p.gold = p.wood = 5000;
    const keep = g.addBuilding('hq', 0, 4, 4);
    const smithy = g.addBuilding('smithy', 0, 12, 4);
    research(g, 0, 'weapons1', 'weapons2');
    g.issue({ type: 'research', player: 0, buildingId: smithy.id, research: 'weapons3' });
    g.step();
    expect(smithy.queue).toHaveLength(0);
    g.issue({ type: 'research', player: 0, buildingId: keep.id, research: 'castle' });
    runUntil(g, () => keep.tier === 2, secondsToTicks(CONFIG.research.castle.seconds) + 5);
    g.issue({ type: 'research', player: 0, buildingId: keep.id, research: 'citadel' });
    runUntil(g, () => keep.tier === 3, secondsToTicks(CONFIG.research.citadel.seconds) + 5);
    expect(keep.maxHp).toBe(CONFIG.buildings.hq.hp + 2 * CONFIG.tech.castleHp);
    g.issue({ type: 'research', player: 0, buildingId: smithy.id, research: 'weapons3' });
    g.step();
    expect(smithy.queue.map((q) => q.research)).toEqual(['weapons3']);
  });
});

describe('Clerics', () => {
  it('heal the most wounded ally in range, spending mana on a cooldown', () => {
    const g = emptyGame(30, 20);
    const c = g.addUnit('cleric', 0, 10.5, 10.5);
    const a = g.addUnit('guard', 0, 12.5, 10.5);
    const b = g.addUnit('guard', 0, 9.5, 12.5);
    const far = g.addUnit('guard', 0, 25.5, 10.5);
    const foe = g.addUnit('guard', 1, 10.5, 14.5);
    for (const u of [a, b, far, foe]) g.issue({ type: 'hold', player: u.owner, units: [u.id] });
    a.hp = 200; // most wounded
    b.hp = 300;
    far.hp = 50; // out of range
    foe.hp = 50; // an enemy: never healed
    foe.maxHp = 1e6;
    g.step();
    const heal = CONFIG.cleric.heal[0];
    expect(a.hp).toBe(200 + heal);
    expect(b.hp).toBe(300);
    expect(c.mana).toBeCloseTo(CONFIG.cleric.mana - CONFIG.cleric.healMana, 0);
    run(g, secondsToTicks(CONFIG.cleric.healCooldown) - 1);
    expect(a.hp + b.hp).toBe(500 + heal); // still on cooldown
    run(g, 2);
    expect(a.hp + b.hp).toBe(500 + 2 * heal);
    expect(far.hp).toBe(50);
    expect(foe.hp).toBeLessThanOrEqual(50);
    // Out of mana: no more prayers until it regenerates.
    c.mana = 0;
    const before = a.hp + b.hp;
    run(g, secondsToTicks(CONFIG.cleric.healCooldown) + 1);
    expect(a.hp + b.hp).toBe(before);
  });

  it('Greater Healing raises the amount healed', () => {
    const g = emptyGame(30, 20);
    g.addUnit('cleric', 0, 10.5, 10.5);
    const a = g.addUnit('guard', 0, 12.5, 10.5);
    a.hp = 100;
    research(g, 0, 'healing2');
    g.step();
    expect(a.hp).toBe(100 + CONFIG.cleric.heal[1]);
  });
});

describe('Mangonels', () => {
  it('crush a stationary target and splash its neighbours; nothing is hit inside the minimum range', () => {
    const g = emptyGame(40, 24);
    const m = g.addUnit('mangonel', 0, 6.5, 11.5);
    const t = g.addUnit('guard', 1, 13.5, 11.5);
    const n = g.addUnit('guard', 1, 13.5, 12.4);
    t.maxHp = n.maxHp = t.hp = n.hp = 5000;
    g.issue({ type: 'hold', player: 1, units: [t.id, n.id] });
    g.issue({ type: 'attack', player: 0, units: [m.id], targetId: t.id });
    runUntil(g, () => t.hp < 5000, 20 * 8);
    expect(n.hp).toBeLessThan(5000); // splash
    expect(5000 - n.hp).toBeLessThan(5000 - t.hp); // less at the edge
    // Too close: it backs off before firing.
    const g2 = emptyGame(40, 24);
    const m2 = g2.addUnit('mangonel', 0, 10.5, 11.5);
    const near = g2.addUnit('guard', 1, 11.8, 11.5);
    near.maxHp = near.hp = 5000;
    g2.issue({ type: 'hold', player: 1, units: [near.id] });
    g2.issue({ type: 'attack', player: 0, units: [m2.id], targetId: near.id });
    run(g2, 10);
    expect(g2.state.projectiles).toHaveLength(0);
    runUntil(g2, () => near.hp < 5000, 20 * 12);
    expect(Math.hypot(m2.x - near.x, m2.y - near.y)).toBeGreaterThan(CONFIG.units.mangonel.attack.minRange);
    void m;
  });

  it('a moving unit dodges the boulder', () => {
    const g = emptyGame(40, 24);
    const m = g.addUnit('mangonel', 0, 6.5, 11.5);
    const t = g.addUnit('guard', 1, 14.5, 11.5);
    t.hp = t.maxHp = 5000;
    g.issue({ type: 'attack', player: 0, units: [m.id], targetId: t.id });
    runUntil(g, () => g.state.projectiles.length > 0, 20 * 6);
    g.issue({ type: 'move', player: 1, units: [t.id], x: 14.5, y: 20 });
    runUntil(g, () => g.state.projectiles.length === 0, 20 * 4);
    expect(t.hp).toBe(5000);
  });

  it('bring buildings down far faster than Archers of equal cost', () => {
    const time = (type: UnitType) => {
      const g = emptyGame(40, 24);
      const farm = g.addBuilding('tower', 1, 20, 10);
      farm.hp = farm.maxHp = 3000;
      (CONFIG.buildings.tower as { attack: unknown }).attack; // the tower shoots back below; disable it
      farm.progress = 0.999; // unfinished: does not fire
      const n = Math.max(1, Math.round(700 / cost(type)));
      const ids = Array.from({ length: n }, (_, i) => g.addUnit(type, 0, 12.5, 9 + i).id);
      g.issue({ type: 'attack', player: 0, units: ids, targetId: farm.id });
      return runUntil(g, () => !g.building(farm.id), 20 * 600);
    };
    expect(time('mangonel') * 2).toBeLessThan(time('archer'));
  });
});

describe('economic and military upgrades', () => {
  it('Mule Carts: 12 gold per trip; Longbows: longer Archer range', () => {
    const g = emptyGame(30, 20);
    g.addBuilding('hq', 0, 3, 3);
    const mine = g.addResource('goldmine', 12, 4, 5000);
    const w = g.addUnit('worker', 0, 9.5, 9.5);
    research(g, 0, 'carts');
    const events: GameEvent[] = [];
    g.issue({ type: 'gather', player: 0, units: [w.id], nodeId: mine.id });
    runUntil(g, () => (events.push(...g.drainEvents()), events.some((e) => e.type === 'deliver')), 20 * 60);
    expect(events.find((e) => e.type === 'deliver')).toMatchObject({ amount: CONFIG.units.worker.carryGold + CONFIG.tech.cartsCarry });
    const a = g.addUnit('archer', 0, 5.5, 15.5);
    const base = attackRange(g, a);
    research(g, 0, 'longbows');
    expect(attackRange(g, a)).toBe(base + CONFIG.tech.longbowRange);
  });
});

describe('computer composition', () => {
  it('shifts its army toward Lancers after seeing Archers, and toward Guards after seeing Lancers', () => {
    const g = emptyGame(60, 40);
    const ai = new ComputerPlayer(0, 'hard');
    const base = ai.wantedMix(g);
    const look = (type: UnitType) => {
      const fresh = new ComputerPlayer(0, 'hard');
      const mem = (fresh as unknown as { armySeen: Map<number, unknown> }).armySeen;
      for (let i = 0; i < 8; i++) mem.set(1000 + i, { type, hp: 100, x: 0, y: 0, tick: 0 });
      return fresh.wantedMix(g);
    };
    expect(look('archer').lancer).toBeGreaterThan(base.lancer);
    expect(look('lancer').guard).toBeGreaterThan(base.guard);
    expect(look('guard').cleric).toBeGreaterThan(base.cleric);
  });
});

describe('every unit fits the grid', () => {
  it('all radii are under half a tile, so any free tile fits and one-tile gaps are passable', () => {
    for (const [type, def] of Object.entries(CONFIG.units)) expect(def.radius, type).toBeLessThan(0.5);
  });

  it('a Mangonel drives through a one-tile gap in a wall', () => {
    const g = emptyGame(30, 20);
    for (let y = 0; y < 20; y++) if (y !== 10) setRock(g, 15, y);
    const g2 = rebuild(g);
    const m = g2.addUnit('mangonel', 0, 8.5, 4.5);
    g2.issue({ type: 'move', player: 0, units: [m.id], x: 24.5, y: 15.5 });
    runUntil(g2, () => Math.hypot(m.x - 24.5, m.y - 15.5) < 0.6, 20 * 30);
  });
});
