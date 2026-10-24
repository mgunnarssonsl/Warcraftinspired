import { describe, expect, it } from 'vitest';
import { damageAfterArmor, kill } from '../src/sim/combat';
import { CONFIG } from '../src/sim/config';
import { Game } from '../src/sim/game';
import { gainXp, maxHpFor, rank } from '../src/sim/hero';
import { armorValue, attackDamage } from '../src/sim/tech';
import type { GameEvent } from '../src/sim/types';
import { emptyGame, run, runUntil } from './helpers';

const H = CONFIG.hero;
const ticks = (s: number) => Math.round(s * 20);

function base(gold = 5000, wood = 5000) {
  const g = emptyGame(60, 40);
  g.player(0).gold = gold;
  g.player(0).wood = wood;
  const keep = g.addBuilding('hq', 0, 4, 4);
  return { g, keep };
}

function heroAt(g: Game, x: number, y: number, level = 1) {
  const altar = g.buildings().find((b) => b.type === 'altar' && b.owner === 0) ?? g.addBuilding('altar', 0, 10, 4);
  g.issue({ type: 'train', player: 0, buildingId: altar.id, unit: 'hero' });
  runUntil(g, () => g.units().some((u) => u.hero && u.owner === 0), ticks(CONFIG.units.hero.trainSeconds) + 5);
  const h = g.units().find((u) => u.hero && u.owner === 0)!;
  h.x = h.px = x;
  h.y = h.py = y;
  h.order = null;
  if (level > 1) {
    const xp = H.xpForLevel[level - 1];
    h.hero!.xp = xp - 1;
    gainXp(g, h, 1); // handles the level-ups
  }
  return h;
}

describe('research', () => {
  it('pays when queued, takes its time, and applies to every eligible unit', () => {
    const { g } = base();
    const smithy = g.addBuilding('smithy', 0, 20, 4);
    const guard = g.addUnit('guard', 0, 30.5, 20.5);
    const worker = g.addUnit('worker', 0, 31.5, 20.5);
    expect(attackDamage(g, guard)).toBe(CONFIG.units.guard.attack.damage);
    g.issue({ type: 'research', player: 0, buildingId: smithy.id, research: 'weapons1' });
    g.step();
    expect(g.player(0).gold).toBe(5000 - CONFIG.research.weapons1.cost.gold);
    expect(g.player(0).research.weapons1).toBeUndefined();
    runUntil(g, () => !!g.player(0).research.weapons1, ticks(CONFIG.research.weapons1.seconds) + 5);
    expect(attackDamage(g, guard)).toBe(CONFIG.units.guard.attack.damage + CONFIG.tech.weaponBonus);
    expect(attackDamage(g, worker)).toBe(CONFIG.units.worker.attack.damage); // Laborers are not soldiers
    // Units trained later benefit too.
    const late = g.addUnit('archer', 0, 33.5, 20.5);
    expect(attackDamage(g, late)).toBe(CONFIG.units.archer.attack.damage + CONFIG.tech.weaponBonus);
  });

  it('tier II needs tier I and a Castle; the Castle toughens its Keep', () => {
    const { g, keep } = base();
    const smithy = g.addBuilding('smithy', 0, 20, 4);
    const events: GameEvent[] = [];
    g.issue({ type: 'research', player: 0, buildingId: smithy.id, research: 'armor2' });
    g.step();
    events.push(...g.drainEvents());
    expect(events.find((e) => e.type === 'cantTrain')).toMatchObject({ reason: expect.stringContaining('Studded Armor') });
    g.player(0).research.armor1 = true;
    g.issue({ type: 'research', player: 0, buildingId: smithy.id, research: 'armor2' });
    g.step();
    expect(g.drainEvents().find((e) => e.type === 'cantTrain')).toMatchObject({ reason: expect.stringContaining('Castle') });
    const hp = keep.maxHp;
    g.issue({ type: 'research', player: 0, buildingId: keep.id, research: 'castle' });
    runUntil(g, () => !!g.player(0).research.castle, ticks(CONFIG.research.castle.seconds) + 5);
    expect(keep.tier).toBe(2);
    expect(keep.maxHp).toBe(hp + CONFIG.tech.castleHp);
    g.issue({ type: 'research', player: 0, buildingId: smithy.id, research: 'armor2' });
    runUntil(g, () => !!g.player(0).research.armor2, ticks(CONFIG.research.armor2.seconds) + 5);
    const guard = g.addUnit('guard', 0, 30.5, 20.5);
    expect(armorValue(g, guard)).toBe(CONFIG.units.guard.armor + 2 * CONFIG.tech.armorBonus);
  });

  it('research cannot be duplicated, cancelling refunds it, and it survives losing the building', () => {
    const { g } = base();
    const smithy = g.addBuilding('smithy', 0, 20, 4);
    const smithy2 = g.addBuilding('smithy', 0, 30, 4);
    g.issue({ type: 'research', player: 0, buildingId: smithy.id, research: 'weapons1' });
    g.issue({ type: 'research', player: 0, buildingId: smithy2.id, research: 'weapons1' });
    g.step();
    expect(smithy.queue.length + smithy2.queue.length).toBe(1);
    g.issue({ type: 'cancelTrain', player: 0, buildingId: smithy.id, index: 0 });
    g.step();
    expect(g.player(0).gold).toBe(5000);
    g.issue({ type: 'research', player: 0, buildingId: smithy.id, research: 'weapons1' });
    runUntil(g, () => !!g.player(0).research.weapons1, ticks(CONFIG.research.weapons1.seconds) + 5);
    g.removeEntity(smithy.id);
    g.removeEntity(smithy2.id);
    expect(g.player(0).research.weapons1).toBe(true);
  });

  it('Bow Saws let Laborers carry more wood', () => {
    const { g } = base();
    const mill = g.addBuilding('lumbermill', 0, 20, 4);
    g.player(0).research.saws = true;
    const tree = g.addResource('tree', 26, 6, 200);
    const w = g.addUnit('worker', 0, 24.5, 6.5);
    g.issue({ type: 'gather', player: 0, units: [w.id], nodeId: tree.id });
    runUntil(g, () => w.order?.type === 'gather' && w.order.phase === 'toDropoff', 20 * 30);
    expect(w.carry.amount).toBe(CONFIG.units.worker.carryWood + CONFIG.tech.sawsCarry);
    expect(mill).toBeDefined();
  });
});

describe('hero', () => {
  it('only one hero per player; a fallen hero is revived at its level for a scaled cost', () => {
    const { g } = base();
    const h = heroAt(g, 30.5, 20.5, 3);
    expect(h.hero!.level).toBe(3);
    expect(h.maxHp).toBe(maxHpFor(3));
    const altar = g.buildings().find((b) => b.type === 'altar')!;
    g.issue({ type: 'train', player: 0, buildingId: altar.id, unit: 'hero' });
    g.step();
    expect(altar.queue).toHaveLength(0); // already have one
    const xp = h.hero!.xp;
    kill(g, h, 1);
    expect(g.player(0).hero).toMatchObject({ alive: false, level: 3, xp });
    const gold = g.player(0).gold;
    g.issue({ type: 'train', player: 0, buildingId: altar.id, unit: 'hero' });
    g.step();
    expect(altar.queue[0]).toMatchObject({ revive: true });
    expect(g.player(0).gold).toBe(gold - (H.revive.goldBase + H.revive.goldPerLevel * 3));
    runUntil(g, () => g.units().some((u) => u.hero), ticks(H.revive.secondsBase + H.revive.secondsPerLevel * 3) + 5);
    const back = g.units().find((u) => u.hero)!;
    expect(back.hero!.level).toBe(3);
    expect(back.hero!.xp).toBe(xp);
    expect(back.hp).toBe(back.maxHp);
    expect(g.player(0).stats.unitsTrained).toBe(1); // a revival is not a new unit
  });

  it('gains experience from nearby kills, levels up, and grows stronger', () => {
    const { g } = base();
    const h = heroAt(g, 30.5, 20.5);
    const dmg1 = attackDamage(g, h);
    const events: GameEvent[] = [];
    // Kill five brigands near the hero (owner 1 stands in for a camp).
    for (let i = 0; i < 5; i++) kill(g, g.addUnit('brigand', 1, 33.5, 20.5 + i), 0);
    events.push(...g.drainEvents());
    expect(h.hero!.xp).toBe(5 * CONFIG.units.brigand.xp);
    expect(h.hero!.level).toBe(2);
    expect(events.filter((e) => e.type === 'levelUp')).toHaveLength(1);
    expect(attackDamage(g, h)).toBe(dmg1 + H.damagePerLevel);
    expect(g.player(0).gold).toBe(5000 - CONFIG.units.hero.cost.gold + 5 * CONFIG.units.brigand.bounty);
    // Kills far away grant no experience.
    kill(g, g.addUnit('brigand', 1, 55.5, 38.5), 0);
    expect(h.hero!.xp).toBe(5 * CONFIG.units.brigand.xp);
  });

  it('Stormhammer walks into range, spends mana, damages and stuns', () => {
    const { g } = base();
    const h = heroAt(g, 20.5, 20.5);
    const e = g.addUnit('guard', 1, 28.5, 20.5);
    e.order = { type: 'hold', targetId: -1 };
    run(g, 2);
    g.issue({ type: 'cast', player: 0, units: [h.id], ability: 'hammer', targetId: e.id });
    runUntil(g, () => e.stun > 0, 20 * 5);
    const hp = e.hp;
    expect(e.maxHp - hp).toBe(damageAfterArmor(H.abilities.hammer.damage[0], CONFIG.units.guard.armor));
    expect(h.hero!.mana).toBeLessThan(h.hero!.maxMana);
    // While stunned it neither moves nor attacks.
    const x = e.x;
    g.issue({ type: 'move', player: 1, units: [e.id], x: 50, y: 20 });
    run(g, ticks(H.abilities.hammer.stun[0]) - 4);
    expect(e.x).toBe(x);
    // Cooldown blocks an immediate recast.
    const events: GameEvent[] = [];
    g.issue({ type: 'cast', player: 0, units: [h.id], ability: 'hammer', targetId: e.id });
    g.step();
    events.push(...g.drainEvents());
    expect(events.find((ev) => ev.type === 'cantCast')).toMatchObject({ reason: expect.stringContaining('not ready') });
  });

  it('Battle Cry needs level 2 and raises nearby allies’ damage for its duration', () => {
    const { g } = base();
    const h = heroAt(g, 30.5, 20.5);
    const ally = g.addUnit('guard', 0, 32.5, 20.5);
    const far = g.addUnit('guard', 0, 55.5, 35.5);
    g.issue({ type: 'cast', player: 0, units: [h.id], ability: 'cry', targetId: -1 });
    g.step();
    expect(ally.buffs).toHaveLength(0); // not learned at level 1
    h.hero!.xp = H.xpForLevel[1] - 1;
    gainXp(g, h, 1);
    const before = attackDamage(g, ally);
    g.issue({ type: 'cast', player: 0, units: [h.id], ability: 'cry', targetId: -1 });
    g.step();
    expect(attackDamage(g, ally)).toBe(Math.round(before * (1 + H.abilities.cry.bonus[rank(2)])));
    expect(far.buffs).toHaveLength(0);
    run(g, ticks(H.abilities.cry.duration) + 2);
    expect(attackDamage(g, ally)).toBe(before);
  });

  it('Mend heals one of your units and cannot target enemies', () => {
    const { g } = base();
    const h = heroAt(g, 30.5, 20.5, 3);
    const ally = g.addUnit('guard', 0, 32.5, 20.5);
    ally.hp = 100;
    const enemy = g.addUnit('guard', 1, 34.5, 20.5);
    enemy.hp = 100;
    g.issue({ type: 'cast', player: 0, units: [h.id], ability: 'mend', targetId: enemy.id });
    g.step();
    expect(enemy.hp).toBe(100);
    g.issue({ type: 'cast', player: 0, units: [h.id], ability: 'mend', targetId: ally.id });
    run(g, 3);
    expect(ally.hp).toBe(Math.min(ally.maxHp, 100 + H.abilities.mend.heal[rank(3)]));
  });
});

describe('neutral camps', () => {
  it('the contested camps include a Brigand Chief; clearing them pays bounty', () => {
    const g = Game.create(2);
    const n = g.state.players.find((p) => p.neutral)!.id;
    const chiefs = g.units().filter((u) => u.owner === n && u.type === 'chief');
    expect(chiefs).toHaveLength(2);
    const total = g.units().filter((u) => u.owner === n).reduce((s, u) => s + CONFIG.units[u.type].bounty, 0);
    expect(total).toBeGreaterThan(200);
  });
});
