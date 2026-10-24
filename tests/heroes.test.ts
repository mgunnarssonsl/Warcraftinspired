import { describe, expect, it } from 'vitest';
import { ComputerPlayer } from '../src/ai/computer';
import { damageAfterArmor, kill, targetable } from '../src/sim/combat';
import { CONFIG, secondsToTicks, type HeroType, type ItemId } from '../src/sim/config';
import { Game } from '../src/sim/game';
import { gainXp, rank } from '../src/sim/hero';
import { giveItem } from '../src/sim/items';
import { moveSpeed } from '../src/sim/movement';
import { armorValue, attackDamage } from '../src/sim/tech';
import type { GameEvent, Unit } from '../src/sim/types';
import { emptyGame, run, runUntil } from './helpers';

const H = CONFIG.hero;
const A = H.abilities;

function base() {
  const g = emptyGame(60, 40);
  g.player(0).gold = g.player(0).wood = 5000;
  g.addBuilding('hq', 0, 4, 4);
  const altar = g.addBuilding('altar', 0, 10, 4);
  return { g, altar };
}

function train(g: Game, altar: { id: number }, type: HeroType): Unit {
  g.issue({ type: 'train', player: 0, buildingId: altar.id, unit: type });
  // Long enough for a revival at level 5 too.
  runUntil(g, () => g.units().some((u) => u.type === type && u.owner === 0), secondsToTicks(60));
  return g.units().find((u) => u.type === type && u.owner === 0)!;
}

function at(u: Unit, x: number, y: number): Unit {
  u.x = u.px = x;
  u.y = u.py = y;
  u.order = null;
  u.move = null;
  return u;
}

function level(g: Game, h: Unit, lv: number): void {
  gainXp(g, h, H.xpForLevel[lv - 1] - h.hero!.xp);
}

function events(g: Game): GameEvent[] {
  return g.drainEvents();
}

describe('hero choice and limits', () => {
  it('three heroes to choose from; one before the Castle, two after, never two of a type', () => {
    const { g, altar } = base();
    train(g, altar, 'ranger');
    g.issue({ type: 'train', player: 0, buildingId: altar.id, unit: 'sage' });
    g.step();
    expect(events(g).find((e) => e.type === 'cantTrain')).toMatchObject({ reason: expect.stringContaining('One hero until') });
    g.player(0).research.castle = true;
    g.issue({ type: 'train', player: 0, buildingId: altar.id, unit: 'ranger' });
    g.step();
    expect(events(g).find((e) => e.type === 'cantTrain')).toMatchObject({ reason: expect.stringContaining('already have') });
    train(g, altar, 'sage');
    expect(g.player(0).heroes.map((h) => h.type)).toEqual(['ranger', 'sage']);
    g.issue({ type: 'train', player: 0, buildingId: altar.id, unit: 'hero' });
    g.step();
    expect(events(g).find((e) => e.type === 'cantTrain')).toMatchObject({ reason: expect.stringContaining('At most 2') });
  });

  it('a fallen hero keeps its level, experience and items, and only that type can be revived', () => {
    const { g, altar } = base();
    const h = train(g, altar, 'sage');
    level(g, h, 3);
    giveItem(h, 'blade');
    const xp = h.hero!.xp;
    kill(g, h, 1);
    expect(g.player(0).heroes[0]).toMatchObject({ type: 'sage', alive: false, level: 3, xp, items: ['blade', null, null] });
    const gold = g.player(0).gold;
    const back = train(g, altar, 'sage');
    expect(g.player(0).gold).toBe(gold - (H.revive.goldBase + H.revive.goldPerLevel * 3));
    expect(back.hero).toMatchObject({ level: 3, xp, items: ['blade', null, null] });
    expect(back.hp).toBe(back.maxHp);
  });
});

describe('experience pacing', () => {
  it('neutral kills give less experience to higher-level heroes; enemy kills do not', () => {
    const { g, altar } = base();
    const n = g.state.players.length;
    g.state.players.push({ ...g.player(1), id: n, neutral: true, heroes: [] });
    const h = at(train(g, altar, 'hero'), 30.5, 20.5);
    level(g, h, 3);
    let xp = h.hero!.xp;
    kill(g, g.addUnit('brigand', n, 31.5, 20.5), 0);
    expect(h.hero!.xp - xp).toBe(Math.floor(CONFIG.units.brigand.xp * H.creepXpFactor[2]));
    xp = h.hero!.xp;
    kill(g, g.addUnit('guard', 1, 31.5, 21.5), 0);
    expect(h.hero!.xp - xp).toBe(CONFIG.units.guard.xp);
  });
});

describe('abilities', () => {
  it('Volley hits every enemy unit in the area and nothing outside it', () => {
    const { g, altar } = base();
    const h = at(train(g, altar, 'ranger'), 20.5, 20.5);
    const near = [g.addUnit('guard', 1, 26.5, 20.5), g.addUnit('guard', 1, 27.5, 21.5)];
    const far = g.addUnit('guard', 1, 26.5, 25.5);
    for (const u of [...near, far]) u.order = { type: 'hold', targetId: -1 };
    g.issue({ type: 'cast', player: 0, units: [h.id], ability: 'volley', targetId: -1, x: 27, y: 21 });
    runUntil(g, () => near[0].hp < near[0].maxHp, 20 * 4);
    const dmg = damageAfterArmor(A.volley.damage[0], CONFIG.units.guard.armor);
    for (const u of near) expect(u.maxHp - u.hp).toBe(dmg);
    expect(far.hp).toBe(far.maxHp);
    expect(h.hero!.mana).toBeCloseTo(h.hero!.maxMana - A.volley.mana, 0);
  });

  it("Hunter's Mark makes the target take more damage from every source", () => {
    const { g, altar } = base();
    const h = at(train(g, altar, 'ranger'), 20.5, 20.5);
    level(g, h, 2);
    const e = g.addUnit('guard', 1, 24.5, 20.5);
    e.hp = e.maxHp = 5000;
    g.issue({ type: 'cast', player: 0, units: [h.id], ability: 'mark', targetId: e.id });
    runUntil(g, () => e.buffs.some((b) => b.kind === 'mark'), 20 * 3);
    g.drainEvents();
    const t = g.addUnit('guard', 0, 25.5, 20.5);
    g.issue({ type: 'attack', player: 0, units: [t.id], targetId: e.id });
    const hits: GameEvent[] = [];
    runUntil(g, () => (hits.push(...g.drainEvents()), hits.some((x) => x.type === 'hit' && x.id === e.id && x.attacker === t.id)), 20 * 3);
    const first = hits.find((x) => x.type === 'hit' && x.id === e.id && x.attacker === t.id)!;
    const plain = damageAfterArmor(CONFIG.units.guard.attack.damage * CONFIG.combat.typeTable.normal.heavy, CONFIG.units.guard.armor);
    const marked = damageAfterArmor(CONFIG.units.guard.attack.damage * CONFIG.combat.typeTable.normal.heavy * (1 + A.mark.bonus[0]), CONFIG.units.guard.armor);
    expect(marked).toBeGreaterThan(plain);
    expect(first).toMatchObject({ damage: marked });
  });

  it('Slow cuts movement and attack speed; Arcane Ward adds armor; both wear off', () => {
    const { g, altar } = base();
    g.player(0).research.castle = true;
    const s = at(train(g, altar, 'sage'), 20.5, 20.5);
    level(g, s, 3);
    const e = g.addUnit('guard', 1, 24.5, 20.5);
    const ally = g.addUnit('guard', 0, 21.5, 22.5);
    const speed = moveSpeed(e);
    g.issue({ type: 'cast', player: 0, units: [s.id], ability: 'slow', targetId: e.id });
    runUntil(g, () => e.buffs.some((b) => b.kind === 'slow'), 20 * 3);
    expect(moveSpeed(e)).toBeCloseTo(speed * (1 - A.slow.bonus[rank(3)]));
    const armor = armorValue(g, ally);
    run(g, secondsToTicks(A.slow.cooldown));
    s.hero!.ready = {};
    g.issue({ type: 'cast', player: 0, units: [s.id], ability: 'ward', targetId: ally.id });
    runUntil(g, () => ally.buffs.some((b) => b.kind === 'ward'), 20 * 3);
    expect(armorValue(g, ally)).toBe(armor + A.ward.bonus[rank(3)]);
    run(g, secondsToTicks(A.ward.duration[rank(3)]) + 2);
    expect(armorValue(g, ally)).toBe(armor);
    expect(moveSpeed(e)).toBe(speed);
  });

  it('Flame Burst also burns buildings; abilities belong to their own hero', () => {
    const { g, altar } = base();
    const s = at(train(g, altar, 'sage'), 30.5, 20.5);
    const farm = g.addBuilding('farm', 1, 35, 20);
    g.issue({ type: 'cast', player: 0, units: [s.id], ability: 'volley', targetId: -1, x: 36, y: 21 });
    g.step();
    expect(events(g).find((e) => e.type === 'cantCast')).toMatchObject({ reason: expect.stringContaining('does not know') });
    g.issue({ type: 'cast', player: 0, units: [s.id], ability: 'flame', targetId: -1, x: 36, y: 21 });
    runUntil(g, () => farm.hp < farm.maxHp, 20 * 3);
  });

  it('Far Sight reveals a distant spot for its duration', () => {
    const { g, altar } = base();
    const h = at(train(g, altar, 'ranger'), 10.5, 12.5);
    level(g, h, 3);
    expect(g.vision.isVisible(0, 52, 34)).toBe(false);
    g.issue({ type: 'cast', player: 0, units: [h.id], ability: 'farsight', targetId: -1, x: 52.5, y: 34.5 });
    run(g, 2);
    expect(g.vision.isVisible(0, 52, 34)).toBe(true);
    run(g, secondsToTicks(A.farsight.duration[rank(3)]) + 2);
    expect(g.vision.isVisible(0, 52, 34)).toBe(false);
  });
});

describe('items', () => {
  it('a hero walks to an item and picks it up; permanent items change its stats', () => {
    const { g, altar } = base();
    const h = at(train(g, altar, 'hero'), 20.5, 20.5);
    const dmg = attackDamage(g, h);
    const hp = h.maxHp;
    const speed = moveSpeed(h);
    g.state.items.push({ id: 9001, type: 'blade', x: 26.5, y: 20.5 }, { id: 9002, type: 'charm', x: 26.5, y: 22.5 });
    g.issue({ type: 'pickup', player: 0, units: [h.id], itemId: 9001 });
    runUntil(g, () => h.hero!.items[0] === 'blade', 20 * 5);
    expect(attackDamage(g, h)).toBe(dmg + CONFIG.items.blade.damage);
    g.issue({ type: 'pickup', player: 0, units: [h.id], itemId: 9002 });
    runUntil(g, () => h.hero!.items[1] === 'charm', 20 * 5);
    expect(h.maxHp).toBe(hp + CONFIG.items.charm.hp);
    giveItem(h, 'boots');
    expect(moveSpeed(h)).toBeCloseTo(speed + CONFIG.items.boots.speed);
    expect(g.state.items).toHaveLength(0);
    // Full: a fourth item stays on the ground.
    g.state.items.push({ id: 9003, type: 'tonic', x: h.x + 0.3, y: h.y });
    g.issue({ type: 'pickup', player: 0, units: [h.id], itemId: 9003 });
    run(g, 3);
    expect(events(g).find((e) => e.type === 'cantItem')).toMatchObject({ reason: 'The inventory is full.' });
    expect(g.state.items).toHaveLength(1);
    // Dropping puts it back on the ground.
    g.issue({ type: 'dropItem', player: 0, units: [h.id], slot: 0 });
    g.step();
    expect(h.hero!.items[0]).toBeNull();
    expect(attackDamage(g, h)).toBe(dmg);
    expect(g.state.items.map((i) => i.type).sort()).toEqual(['blade', 'tonic']);
  });

  it('consumables: Draught heals, Tonic restores mana, Scroll returns to the Keep; each is used up', () => {
    const { g, altar } = base();
    const h = at(train(g, altar, 'hero'), 40.5, 30.5);
    for (const it of ['draught', 'tonic', 'scroll'] as ItemId[]) giveItem(h, it);
    h.hp = 100;
    h.hero!.mana = 0;
    g.issue({ type: 'useItem', player: 0, units: [h.id], slot: 0 });
    g.issue({ type: 'useItem', player: 0, units: [h.id], slot: 1 });
    g.step();
    expect(h.hp).toBe(100 + CONFIG.items.draught.heal);
    expect(h.hero!.mana).toBeGreaterThanOrEqual(CONFIG.items.tonic.restore);
    g.issue({ type: 'useItem', player: 0, units: [h.id], slot: 2 });
    g.step();
    expect(Math.hypot(h.x - 6, h.y - 6)).toBeLessThan(5);
    expect(h.hero!.items).toEqual([null, null, null]);
  });
});

describe('camps, Trading Posts and Fountains', () => {
  it('wiping out a camp drops its item where the last guard fell; mirrored camps drop the same item', () => {
    const g = Game.create(4);
    const n = g.state.players.find((p) => p.neutral)!.id;
    for (let i = 0; i < g.state.camps.length; i += 2) expect(g.state.camps[i].drop).toBe(g.state.camps[i + 1].drop);
    const guards = g.units().filter((u) => u.owner === n && u.camp === 0);
    for (const u of guards.slice(0, -1)) kill(g, u, 0);
    expect(g.state.items).toHaveLength(0);
    const last = guards[guards.length - 1];
    kill(g, last, 0);
    expect(g.state.items).toEqual([expect.objectContaining({ type: g.state.camps[0].drop, x: last.x, y: last.y })]);
    expect(g.state.camps[0].cleared).toBe(true);
  });

  it('a Trading Post sells to a hero standing next to it, and cannot be attacked', () => {
    const g = Game.create(4);
    const shop = g.buildings().find((b) => b.type === 'shop')!;
    expect(targetable(shop)).toBe(false);
    g.player(0).gold = 1000;
    const altar = g.addBuilding('altar', 0, 20, 52);
    const h = train(g, altar, 'hero');
    g.issue({ type: 'buyItem', player: 0, shopId: shop.id, heroId: h.id, item: 'blade' });
    g.step();
    expect(g.drainEvents().find((e) => e.type === 'cantItem')).toMatchObject({ reason: expect.stringContaining('within') });
    const spot = g.freeTilesAround(shop, 1)[0];
    at(h, spot.x + 0.5, spot.y + 0.5);
    const gold = g.player(0).gold;
    g.issue({ type: 'buyItem', player: 0, shopId: shop.id, heroId: h.id, item: 'blade' });
    g.step();
    expect(h.hero!.items[0]).toBe('blade');
    expect(g.player(0).gold).toBe(gold - CONFIG.items.blade.price);
  });

  it('a Healing Fountain heals any unit near it', () => {
    const g = Game.create(4);
    const f = g.buildings().find((b) => b.type === 'fountain')!;
    const spot = g.freeTilesAround(f, 1)[0];
    const u = g.addUnit('guard', 1, spot.x + 0.5, spot.y + 0.5);
    u.hp = 100;
    u.order = { type: 'hold', targetId: -1 };
    run(g, 20 * 3);
    expect(u.hp).toBeGreaterThanOrEqual(100 + 2 * CONFIG.fountain.hpPerSecond);
  });
});

describe('computer heroes', () => {
  it('a computer hero picks up an item lying near it', () => {
    const { g, altar } = base();
    const h = at(train(g, altar, 'hero'), 20.5, 20.5);
    g.state.items.push({ id: 9100, type: 'charm', x: 24.5, y: 21.5 });
    const ai = new ComputerPlayer(0, 'hard');
    for (let t = 0; t < 20 * 10 && h.hero!.items[0] !== 'charm'; t++) {
      g.step();
      ai.update(g);
    }
    expect(h.hero!.items).toContain('charm');
  });
});
