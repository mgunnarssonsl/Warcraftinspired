import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/sim/config';
import { dealDamage } from '../src/sim/combat';
import { dashEnd, rankOf } from '../src/sim/elite';
import { Game } from '../src/sim/game';
import { stateHash } from '../src/sim/hash';
import { parseSave } from '../src/save/save';
import { attackDamage, armorValue } from '../src/sim/tech';
import { TERRAIN, type GameEvent, type Unit } from '../src/sim/types';
import { emptyGame, rebuild, run, runUntil } from './helpers';

const V = CONFIG.veterancy;

function withSmithy(g: Game, owner = 0, type: 'smithy' | 'barkweaver' = 'smithy') {
  return g.addBuilding(type, owner, 4, 4);
}

function events(g: Game, ticks: number): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    g.step();
    out.push(...g.drainEvents());
  }
  return out;
}

describe('veterancy', () => {
  it('troops earn experience for damage dealt and damage taken in real fights', () => {
    const g = emptyGame();
    const a = g.addUnit('guard', 0, 10, 10);
    const b = g.addUnit('guard', 1, 11, 10);
    dealDamage(g, a.id, 0, b, 20, 'normal');
    const dmg = b.maxHp - b.hp;
    expect(a.xp).toBeCloseTo(dmg * V.perDamage);
    expect(b.xp).toBeCloseTo(dmg * V.perDamageTaken);
  });

  it('workers, scouts, heroes and animals earn none; buildings earn the attacker little', () => {
    const g = emptyGame();
    const w = g.addUnit('worker', 0, 10, 10);
    const bear = g.addUnit('warbear', 0, 12, 10);
    const e = g.addUnit('guard', 1, 11, 10);
    dealDamage(g, w.id, 0, e, 10, 'normal');
    dealDamage(g, bear.id, 0, e, 10, 'normal');
    expect(w.xp + bear.xp).toBe(0);
    const a = g.addUnit('guard', 0, 5, 5);
    const farm = g.addBuilding('farm', 1, 20, 10);
    dealDamage(g, a.id, 0, farm, 40, 'normal');
    expect(a.xp).toBeCloseTo((farm.maxHp - farm.hp) * V.perBuildingDamage);
  });

  it('neutral camps give at most neutralCap in a whole match', () => {
    const g = emptyGame();
    g.state.players.push({ ...g.state.players[1], id: 2, neutral: true });
    const a = g.addUnit('guard', 0, 10, 10);
    for (let i = 0; i < 40; i++) {
      const c = g.addUnit('brute', 2, 11, 10);
      dealDamage(g, a.id, 0, c, 200, 'normal');
      dealDamage(g, c.id, 2, a, 5, 'normal');
      a.hp = a.maxHp;
    }
    expect(a.xp).toBeLessThanOrEqual(V.neutralCap + 1e-9);
    expect(a.nxp).toBeCloseTo(a.xp);
  });

  it('healing counts only for a patient hurt in the last few seconds', () => {
    const g = emptyGame();
    g.player(0).faction = 'crown';
    const cleric = g.addUnit('cleric', 0, 10, 10);
    const patient = g.addUnit('guard', 0, 11, 10);
    patient.hp = 200; // hurt long ago (hurt = -1e9)
    run(g, 40);
    expect(patient.hp).toBeGreaterThan(200);
    expect(cleric.xp).toBe(0);
    const foe = g.addUnit('archer', 1, 18, 10);
    patient.hp = 200;
    dealDamage(g, foe.id, 1, patient, 1, 'normal'); // now in a fight
    cleric.prayerReady = 0;
    run(g, 2);
    expect(cleric.xp).toBeGreaterThan(0);
  });

  it('ranks give a modest bonus and are announced', () => {
    const g = emptyGame();
    const a = g.addUnit('guard', 0, 10, 10);
    const dmg0 = attackDamage(g, a);
    const armor0 = armorValue(g, a);
    const b = g.addUnit('guard', 1, 11, 10);
    b.hp = b.maxHp = 1e6;
    let seen: GameEvent[] = [];
    while (rankOf(a) === 0) {
      dealDamage(g, a.id, 0, b, 100, 'normal');
      seen = seen.concat(g.drainEvents());
    }
    expect(seen.some((e) => e.type === 'rankUp' && e.id === a.id && e.rank === 1)).toBe(true);
    expect(attackDamage(g, a)).toBe(Math.round(dmg0 * (1 + V.damageBonus)));
    expect(armorValue(g, a)).toBe(armor0 + V.armorBonus);
  });
});

describe('specialization', () => {
  it('needs earned experience: money alone cannot buy it', () => {
    const g = emptyGame();
    withSmithy(g);
    g.player(0).gold = 5000;
    g.player(0).wood = 5000;
    const a = g.addUnit('guard', 0, 12, 12);
    const ev = (g.issue({ type: 'specialize', player: 0, units: [a.id], into: 'sentinel' }), events(g, 2));
    expect(ev.some((e) => e.type === 'cantOrder')).toBe(true);
    expect(a.type).toBe('guard');
  });

  it('an eligible veteran walks to the building, pays, and becomes the specialist for good', () => {
    const g = emptyGame();
    withSmithy(g);
    g.player(0).gold = 500;
    g.player(0).wood = 100;
    const a = g.addUnit('guard', 0, 20, 15);
    a.xp = V.eligibleXp;
    a.hp = 210; // half health
    g.issue({ type: 'specialize', player: 0, units: [a.id], into: 'bearwarden' });
    runUntil(g, () => a.type === 'bearwarden', 20 * 20);
    const c = CONFIG.specialize.bearwarden.cost;
    expect(g.player(0).gold).toBe(500 - c.gold);
    expect(g.player(0).wood).toBe(100 - c.wood);
    expect(a.xp).toBe(V.eligibleXp); // experience kept
    expect(a.hp / a.maxHp).toBeCloseTo(0.5, 2); // no healing
    // There is no way back or sideways.
    g.issue({ type: 'specialize', player: 0, units: [a.id], into: 'sentinel' });
    run(g, 5);
    expect(a.type).toBe('bearwarden');
  });

  it('both factions need the same experience', () => {
    const g = emptyGame();
    g.player(0).faction = 'wild';
    g.addBuilding('barkweaver', 0, 4, 4);
    g.player(0).gold = g.player(0).wood = 500;
    const t = g.addUnit('thornguard', 0, 12, 12);
    t.xp = V.eligibleXp - 1;
    g.issue({ type: 'specialize', player: 0, units: [t.id], into: 'wolfkeeper' });
    run(g, 200);
    expect(t.type).toBe('thornguard');
    t.xp = V.eligibleXp;
    g.issue({ type: 'specialize', player: 0, units: [t.id], into: 'wolfkeeper' });
    runUntil(g, () => t.type === 'wolfkeeper', 400);
  });
});

function riderAndBear(g: Game): { rider: Unit; bear: Unit } {
  const rider = g.addUnit('bearwarden', 0, 10, 10);
  rider.xp = 333;
  const bear = g.addUnit('warbear', 0, 14, 10);
  return { rider, bear };
}

describe('mounting', () => {
  it('rider and animal meet, hold still, and become one unit: health, population and experience add up', () => {
    const g = emptyGame();
    const { rider, bear } = riderAndBear(g);
    rider.hp = 300;
    bear.hp = 500;
    const pop = g.popUsed(0);
    g.issue({ type: 'mount', player: 0, units: [rider.id], targetId: bear.id });
    const ev: GameEvent[] = [];
    runUntil(g, () => (ev.push(...g.drainEvents()), rider.type === 'bearrider'), 20 * 10);
    expect(g.unit(bear.id)).toBeUndefined();
    expect(rider.hp).toBe(800);
    expect(rider.maxHp).toBe(CONFIG.units.bearwarden.hp + CONFIG.units.warbear.hp);
    expect(rider.xp).toBe(333);
    expect(g.popUsed(0)).toBe(pop);
    expect(CONFIG.units.bearrider.pop).toBe(CONFIG.units.bearwarden.pop + CONFIG.units.warbear.pop);
    expect(CONFIG.units.wolfrider.pop).toBe(CONFIG.units.wolfkeeper.pop + CONFIG.units.naturewolf.pop);
    const start = ev.find((e) => e.type === 'skill' && e.skill === 'mount' && e.phase === 'start') as GameEvent & { type: 'skill' };
    expect(start).toBeTruthy();
  });

  it('only the matching veteran specialist can mount', () => {
    const g = emptyGame();
    const guard = g.addUnit('guard', 0, 10, 10);
    const keeper = g.addUnit('wolfkeeper', 0, 10, 12);
    const bear = g.addUnit('warbear', 0, 12, 10);
    g.issue({ type: 'mount', player: 0, units: [guard.id], targetId: bear.id });
    g.issue({ type: 'mount', player: 0, units: [keeper.id], targetId: bear.id });
    run(g, 20 * 6);
    expect(g.unit(bear.id)).toBeTruthy();
    expect(guard.type).toBe('guard');
    expect(keeper.type).toBe('wolfkeeper');
  });

  it('damage while mounting interrupts it', () => {
    const g = emptyGame();
    const { rider, bear } = riderAndBear(g);
    const foe = g.addUnit('archer', 1, 25, 25);
    g.issue({ type: 'mount', player: 0, units: [rider.id], targetId: bear.id });
    runUntil(g, () => rider.order?.type === 'mount' && rider.order.phase === 'mounting', 200);
    dealDamage(g, foe.id, 1, bear, 10, 'pierce');
    run(g, 20 * 3);
    expect(rider.type).toBe('bearwarden');
    expect(g.unit(bear.id)).toBeTruthy();
  });

  it('dismounting needs a calm spell, splits health in proportion and never heals', () => {
    const g = emptyGame();
    const { rider, bear } = riderAndBear(g);
    g.issue({ type: 'mount', player: 0, units: [rider.id], targetId: bear.id });
    runUntil(g, () => rider.type === 'bearrider', 400);
    const foe = g.addUnit('archer', 1, 25, 22);
    dealDamage(g, foe.id, 1, rider, 300, 'normal');
    const hpBefore = rider.hp;
    const xpBefore = rider.xp;
    expect(xpBefore).toBeGreaterThan(333); // it took the hit in a real fight
    g.issue({ type: 'dismount', player: 0, units: [rider.id] });
    run(g, 2);
    expect(rider.type).toBe('bearrider'); // hurt just now
    run(g, 20 * CONFIG.mounting.calmSeconds);
    g.issue({ type: 'dismount', player: 0, units: [rider.id] });
    const ev = events(g, 2);
    const d = ev.find((e) => e.type === 'dismounted') as Extract<GameEvent, { type: 'dismounted' }>;
    expect(d).toBeTruthy();
    const animal = g.unit(d.animalId)!;
    expect(rider.type).toBe('bearwarden');
    expect(animal.type).toBe('warbear');
    expect(rider.hp + animal.hp).toBe(hpBefore);
    expect(rider.hp / rider.maxHp).toBeCloseTo(animal.hp / animal.maxHp, 1);
    expect(rider.xp).toBe(xpBefore);
  });

  it('cooldowns survive dismounting and mounting again', () => {
    const g = emptyGame();
    const { rider, bear } = riderAndBear(g);
    g.issue({ type: 'mount', player: 0, units: [rider.id], targetId: bear.id });
    runUntil(g, () => rider.type === 'bearrider', 400);
    g.issue({ type: 'skill', player: 0, units: [rider.id], skill: 'charge', targetId: -1, x: rider.x + 5, y: rider.y });
    runUntil(g, () => (rider.ready.charge ?? 0) > 0, 40);
    const ready = rider.ready.charge!;
    run(g, 20 * CONFIG.mounting.calmSeconds);
    g.issue({ type: 'dismount', player: 0, units: [rider.id] });
    const ev = events(g, 2);
    const d = ev.find((e) => e.type === 'dismounted') as Extract<GameEvent, { type: 'dismounted' }>;
    g.issue({ type: 'mount', player: 0, units: [rider.id], targetId: d.animalId });
    runUntil(g, () => rider.type === 'bearrider', 400);
    expect(rider.ready.charge).toBe(ready);
    if (g.state.tick < ready) {
      g.issue({ type: 'skill', player: 0, units: [rider.id], skill: 'charge', targetId: -1, x: rider.x - 5, y: rider.y });
      expect(events(g, 2).some((e) => e.type === 'cantOrder')).toBe(true);
    }
  });

  it('if the mount dies, rider and animal both die', () => {
    const g = emptyGame();
    const { rider, bear } = riderAndBear(g);
    g.issue({ type: 'mount', player: 0, units: [rider.id], targetId: bear.id });
    runUntil(g, () => rider.type === 'bearrider', 400);
    const foe = g.addUnit('guard', 1, 20, 20);
    const lost = g.player(0).stats.unitsLost;
    const pop = g.popUsed(0);
    dealDamage(g, foe.id, 1, rider, 1e6, 'normal');
    expect(g.unit(rider.id)).toBeUndefined();
    expect(g.units().filter((u) => u.owner === 0)).toHaveLength(0);
    expect(g.player(0).stats.unitsLost).toBe(lost + 2);
    expect(g.popUsed(0)).toBe(pop - CONFIG.units.bearrider.pop);
  });
});

describe('charge and leap', () => {
  it('a charge hurts, dazes and shoves enemies aside, and stops at a wall', () => {
    const g = emptyGame(30, 20);
    const r = g.addUnit('bearrider', 0, 5, 10);
    const e = g.addUnit('guard', 1, 8, 10.2);
    const hp = e.hp;
    g.issue({ type: 'skill', player: 0, units: [r.id], skill: 'charge', targetId: -1, x: 11, y: 10 });
    run(g, 20);
    expect(e.hp).toBeLessThan(hp);
    expect(Math.abs(e.y - 10.2)).toBeGreaterThan(0.6);
    expect(r.x).toBeGreaterThan(10);
    // A wall of rock stops the next one.
    const g2 = emptyGame(30, 20);
    for (let y = 0; y < 20; y++) g2.state.map.terrain[y * 30 + 15] = TERRAIN.rock;
    const g3 = rebuild(g2);
    const r2 = g3.addUnit('bearrider', 0, 12, 10);
    g3.issue({ type: 'skill', player: 0, units: [r2.id], skill: 'charge', targetId: -1, x: 18, y: 10 });
    run(g3, 30);
    expect(r2.x).toBeLessThan(15);
  });

  it('a leap lands only where the rider can stand, never across water', () => {
    const g0 = emptyGame(30, 20);
    for (let y = 0; y < 20; y++) for (let x = 14; x < 16; x++) g0.state.map.terrain[y * 30 + x] = TERRAIN.water;
    const g = rebuild(g0);
    const w = g.addUnit('wolfrider', 0, 11, 10);
    const end = dashEnd(g, w, 19, 10, CONFIG.skills.leap.range);
    expect(end.x).toBeLessThan(14);
    g.issue({ type: 'skill', player: 0, units: [w.id], skill: 'leap', targetId: -1, x: 19, y: 10 });
    run(g, 30);
    expect(w.x).toBeLessThan(14);
    expect(g.nav.canStand(w.x, w.y, w.radius)).toBe(true);
  });
});

describe('Musketeer', () => {
  it('Take Aim prepares for 2 seconds, then fires a heavy shot', () => {
    const g = emptyGame();
    const m = g.addUnit('musketeer', 0, 8, 10);
    const e = g.addUnit('guard', 1, 14, 10);
    e.hp = e.maxHp = 5000;
    g.issue({ type: 'skill', player: 0, units: [m.id], skill: 'aim', targetId: e.id });
    const ev = events(g, 20 * 4);
    const start = ev.findIndex((x) => x.type === 'skill' && x.skill === 'aim' && x.phase === 'start');
    const fire = ev.findIndex((x) => x.type === 'skill' && x.skill === 'aim' && x.phase === 'fire');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(fire).toBeGreaterThan(start);
    const hits = ev.filter((x) => x.type === 'hit' && x.attacker === m.id).map((x) => (x as { damage: number }).damage);
    expect(Math.max(...hits)).toBeGreaterThan(CONFIG.units.musketeer.attack.damage * 1.5);
  });

  it('moving spoils the aim', () => {
    const g = emptyGame();
    const m = g.addUnit('musketeer', 0, 8, 10);
    const e = g.addUnit('guard', 1, 14, 10);
    g.issue({ type: 'skill', player: 0, units: [m.id], skill: 'aim', targetId: e.id });
    run(g, 10);
    g.issue({ type: 'move', player: 0, units: [m.id], x: 4, y: 4 });
    const ev = events(g, 60);
    expect(ev.some((x) => x.type === 'skill' && x.skill === 'aim' && x.phase === 'fire')).toBe(false);
    expect(m.ready.aim ?? 0).toBe(0);
  });
});

describe('Shapeshifter', () => {
  it('takes time to shift, keeps its health and cooldowns, and never heals by it', () => {
    const g = emptyGame();
    const s = g.addUnit('shifter', 0, 10, 10);
    s.hp = 200;
    s.ready.root = 999;
    s.xp = 50;
    g.issue({ type: 'skill', player: 0, units: [s.id], skill: 'shift', targetId: -1 });
    run(g, 10);
    expect(s.type).toBe('shifter'); // still changing
    runUntil(g, () => s.type === 'panther', 40);
    expect([s.hp, s.ready.root, s.xp]).toEqual([200, 999, 50]);
    expect(CONFIG.units.panther.hp).toBe(CONFIG.units.shifter.hp);
    expect(CONFIG.units.panther.pop).toBe(CONFIG.units.shifter.pop);
    // The form change has its own cooldown.
    g.issue({ type: 'skill', player: 0, units: [s.id], skill: 'shift', targetId: -1 });
    expect(events(g, 2).some((e) => e.type === 'cantOrder')).toBe(true);
  });

  it('a pounce is stopped by impassable ground', () => {
    const g0 = emptyGame(30, 20);
    for (let y = 0; y < 20; y++) g0.state.map.terrain[y * 30 + 12] = TERRAIN.rock;
    const g = rebuild(g0);
    const p = g.addUnit('panther', 0, 10, 10);
    const e = g.addUnit('guard', 1, 14, 10);
    g.issue({ type: 'skill', player: 0, units: [p.id], skill: 'pounce', targetId: e.id });
    run(g, 30);
    expect(p.x).toBeLessThan(12);
  });

  it('Rootbind holds an enemy in place but it can still fight', () => {
    const g = emptyGame();
    const s = g.addUnit('shifter', 0, 10, 10);
    const e = g.addUnit('guard', 1, 13, 10);
    g.issue({ type: 'skill', player: 0, units: [s.id], skill: 'root', targetId: e.id });
    run(g, 20);
    expect(e.buffs.some((b) => b.kind === 'root')).toBe(true);
    const x = e.x;
    g.issue({ type: 'move', player: 1, units: [e.id], x: 25, y: 10 });
    run(g, 20);
    expect(e.x).toBeCloseTo(x, 3);
  });
});

describe('determinism and saves', () => {
  function scripted(): Game {
    const g = emptyGame(36, 24);
    g.player(0).gold = g.player(0).wood = g.player(1).gold = g.player(1).wood = 2000;
    g.player(1).faction = 'wild';
    const r = g.addUnit('bearwarden', 0, 6, 10);
    const bear = g.addUnit('warbear', 0, 8, 12);
    const m = g.addUnit('musketeer', 0, 5, 14);
    const k = g.addUnit('wolfkeeper', 1, 28, 10);
    const wolf = g.addUnit('naturewolf', 1, 26, 12);
    const s = g.addUnit('shifter', 1, 27, 14);
    g.issue({ type: 'mount', player: 0, units: [r.id], targetId: bear.id });
    g.issue({ type: 'mount', player: 1, units: [k.id], targetId: wolf.id });
    run(g, 20 * 4);
    g.issue({ type: 'attackMove', player: 0, units: [r.id, m.id], x: 26, y: 12 });
    g.issue({ type: 'attackMove', player: 1, units: [k.id, s.id], x: 6, y: 12 });
    run(g, 20 * 3);
    g.issue({ type: 'skill', player: 0, units: [r.id], skill: 'charge', targetId: -1, x: 20, y: 12 });
    g.issue({ type: 'skill', player: 1, units: [k.id], skill: 'leap', targetId: -1, x: 14, y: 12 });
    g.issue({ type: 'skill', player: 1, units: [s.id], skill: 'shift', targetId: -1 });
    run(g, 20 * 2);
    return g;
  }

  it('the same commands give the same match, and a save mid-fight carries on identically', () => {
    const a = scripted();
    const b = scripted();
    expect(stateHash(a)).toBe(stateHash(b));
    const copy = Game.restore(JSON.parse(a.toJSON()), a.pendingCommands(), a.vision.snapshot());
    run(a, 20 * 10);
    run(copy, 20 * 10);
    expect(stateHash(copy)).toBe(stateHash(a));
  });

  it('a save from before elite units loads with the new fields filled in', () => {
    const g = emptyGame();
    g.addUnit('guard', 0, 5, 5);
    const state = JSON.parse(g.toJSON());
    for (const e of Object.values(state.entities) as Array<Record<string, unknown>>) {
      delete e.xp;
      delete e.nxp;
      delete e.ready;
      delete e.stance;
      delete e.dash;
    }
    state.players.push({ ...state.players[1], id: 2 });
    const old = { format: 'ironvale-save', version: 3, savedAt: '', match: { seed: 1 }, state, pending: [], visible: [], ai: [], view: { player: 0, camera: { x: 0, y: 0, distance: 10 }, groups: {} } };
    state.mapId = 'vales';
    const r = parseSave(JSON.stringify(old));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const u = Object.values(r.save.state.entities).find((e) => e.kind === 'unit') as Unit;
    expect([u.xp, u.nxp, u.ready, u.stance, u.dash]).toEqual([0, 0, {}, false, null]);
  });
});
