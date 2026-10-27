import { describe, expect, it } from 'vitest';
import { ComputerPlayer } from '../src/ai/computer';
import { CONFIG, secondsToTicks, type HeroType } from '../src/sim/config';
import { FACTION, buildableFor, unitFaction } from '../src/sim/factions';
import { Game } from '../src/sim/game';
import { attackDamage, attackRange, armorValue } from '../src/sim/tech';
import type { Unit } from '../src/sim/types';
import { emptyGame, run, runUntil } from './helpers';

const W = CONFIG.wild;

/** A Thornwild player 0 (with a Heartwood) and a Crown player 1. */
function setup() {
  const g = emptyGame(48, 32);
  g.player(0).faction = 'wild';
  g.player(0).gold = g.player(0).wood = 5000;
  g.player(1).gold = g.player(1).wood = 5000;
  const hall = g.addBuilding('heartwood', 0, 4, 4);
  const tender = g.addUnit('tender', 0, 12.5, 12.5);
  return { g, hall, tender };
}

function hero(g: Game, type: HeroType): Unit {
  const circle = g.addBuilding('circle', 0, 14, 4);
  g.issue({ type: 'train', player: 0, buildingId: circle.id, unit: type });
  runUntil(g, () => g.units().some((u) => u.type === type), secondsToTicks(60));
  return g.units().find((u) => u.type === type)!;
}

describe('Thornwild buildings grow on their own', () => {
  it('a Tender plants, pays, and is free again at once; the Grove grows over its build time', () => {
    const { g, tender } = setup();
    const cap = g.popCap(0);
    g.issue({ type: 'build', player: 0, units: [tender.id], buildingType: 'grove', tx: 20, ty: 12 });
    runUntil(g, () => g.buildings().some((b) => b.type === 'grove'), 200);
    const grove = g.buildings().find((b) => b.type === 'grove')!;
    expect(grove.grows).toBe(true);
    expect(g.player(0).gold).toBe(5000 - CONFIG.buildings.grove.cost.gold);
    run(g, 2);
    expect(tender.order).toBeNull(); // released: the building needs no one
    const secs = CONFIG.buildings.grove.buildSeconds * W.growFactor;
    run(g, secondsToTicks(secs * 0.9));
    expect(grove.progress).toBeLessThan(1);
    expect(g.popCap(0)).toBe(cap);
    runUntil(g, () => grove.progress >= 1, secondsToTicks(secs * 0.2));
    expect(grove.hp).toBe(grove.maxHp);
    expect(g.popCap(0)).toBe(cap + CONFIG.buildings.grove.popProvided);
  });

  it('a growing building is weak: it has only the health it has grown', () => {
    const { g, tender } = setup();
    g.issue({ type: 'build', player: 0, units: [tender.id], buildingType: 'den', tx: 20, ty: 12 });
    runUntil(g, () => g.buildings().some((b) => b.type === 'den'), 200);
    const den = g.buildings().find((b) => b.type === 'den')!;
    run(g, secondsToTicks(CONFIG.buildings.den.buildSeconds * 0.25));
    expect(den.hp).toBeLessThan(den.maxHp * 0.4);
  });

  it('Swift Growth shortens growing by its share', () => {
    const time = (swift: boolean) => {
      const { g, tender } = setup();
      if (swift) g.player(0).research.swiftgrowth = true;
      g.issue({ type: 'build', player: 0, units: [tender.id], buildingType: 'grove', tx: 20, ty: 12 });
      runUntil(g, () => g.buildings().some((b) => b.type === 'grove'), 200);
      const grove = g.buildings().find((b) => b.type === 'grove')!;
      return runUntil(g, () => grove.progress >= 1, secondsToTicks(200));
    };
    expect(time(true) / time(false)).toBeCloseTo(1 - W.swiftGrowth, 1);
  });

  it('each faction builds only its own buildings', () => {
    const { g, tender } = setup();
    const worker = g.addUnit('worker', 1, 30.5, 20.5);
    g.issue({ type: 'build', player: 0, units: [tender.id], buildingType: 'farm', tx: 20, ty: 12 });
    g.issue({ type: 'build', player: 1, units: [worker.id], buildingType: 'grove', tx: 34, ty: 20 });
    run(g, 200);
    expect(g.buildings().filter((b) => b.type === 'farm' || b.type === 'grove')).toHaveLength(0);
    expect(buildableFor('wild')).not.toContain('farm');
    expect(buildableFor('crown')).not.toContain('grove');
  });
});

describe('Tenders harvest without felling trees', () => {
  it('wood comes in, the tree stays as it was; a Laborer uses its tree up', () => {
    const { g, tender } = setup();
    const tree = g.addResource('tree', 10, 4, 50);
    g.issue({ type: 'gather', player: 0, units: [tender.id], nodeId: tree.id });
    run(g, secondsToTicks(60));
    expect(g.player(0).woodGathered).toBeGreaterThan(20);
    expect(tree.amount).toBe(50);

    g.player(1).faction = 'crown';
    g.addBuilding('hq', 1, 36, 22);
    const tree2 = g.addResource('tree', 34, 20, 50);
    const w = g.addUnit('worker', 1, 33.5, 21.5);
    g.issue({ type: 'gather', player: 1, units: [w.id], nodeId: tree2.id });
    run(g, secondsToTicks(60));
    expect(tree2.amount).toBeLessThan(50);
  });
});

describe('regrowth', () => {
  it('a hurt Thornwild unit regrows after a few quiet seconds; a Crown unit does not', () => {
    const { g } = setup();
    const t = g.addUnit('thornguard', 0, 20.5, 20.5);
    const c = g.addUnit('guard', 1, 40.5, 26.5);
    for (const u of [t, c]) {
      u.hp = u.maxHp / 2;
      u.hurt = g.state.tick;
    }
    const half = t.hp;
    run(g, secondsToTicks(W.regenDelay - 1));
    expect(t.hp).toBe(half);
    run(g, secondsToTicks(11));
    expect(t.hp).toBeGreaterThanOrEqual(half + W.unitRegen * 9);
    expect(t.hp).toBeLessThanOrEqual(half + W.unitRegen * 12);
    expect(c.hp).toBe(c.maxHp / 2);
  });

  it('being hit again restarts the wait; Deep Roots doubles the rate', () => {
    const rate = (deep: boolean) => {
      const { g } = setup();
      if (deep) g.player(0).research.deeproots = true;
      const t = g.addUnit('thornguard', 0, 20.5, 20.5);
      t.hp = 100;
      t.hurt = g.state.tick;
      run(g, secondsToTicks(W.regenDelay + 10));
      return t.hp - 100;
    };
    expect(rate(true)).toBeCloseTo(rate(false) * W.deepRootsFactor, 0);

    const { g } = setup();
    const t = g.addUnit('thornguard', 0, 20.5, 20.5);
    t.hp = 100;
    t.hurt = g.state.tick;
    run(g, secondsToTicks(W.regenDelay - 1));
    t.hurt = g.state.tick; // hit again
    run(g, secondsToTicks(W.regenDelay - 1));
    expect(t.hp).toBe(100);
  });

  it('damaged Thornwild buildings mend themselves too', () => {
    const { g, hall } = setup();
    hall.hp = 600;
    hall.hurt = g.state.tick;
    run(g, secondsToTicks(W.regenDelay + 10));
    expect(hall.hp).toBeGreaterThan(600 + W.buildingRegen * 8);
  });
});

describe('Thornwild technology', () => {
  it('Thorn upgrades sharpen Thornwild soldiers only; Bark hardens them', () => {
    const { g } = setup();
    const t = g.addUnit('thornguard', 0, 20.5, 20.5);
    const c = g.addUnit('guard', 1, 30.5, 20.5);
    const [td, cd, ta] = [attackDamage(g, t), attackDamage(g, c), armorValue(g, t)];
    g.player(0).research.thorns1 = true;
    g.player(0).research.bark1 = true;
    g.player(1).research.thorns1 = true; // not theirs: no effect
    expect(attackDamage(g, t)).toBeGreaterThan(td);
    expect(attackDamage(g, c)).toBe(cd);
    expect(armorValue(g, t)).toBeGreaterThan(ta);
  });

  it('Long Thorns reach for Slingers; the Moonwell and Rootpit wait for Deepwood', () => {
    const { g, hall } = setup();
    const s = g.addUnit('slinger', 0, 20.5, 20.5);
    const r0 = attackRange(g, s);
    g.player(0).research.longthorn = true;
    expect(attackRange(g, s)).toBeGreaterThan(r0);
    expect(CONFIG.buildings.moonwell.requires).toBe('deepwood');
    expect(CONFIG.buildings.rootpit.requires).toBe('deepwood');
    g.issue({ type: 'research', player: 0, buildingId: hall.id, research: 'deepwood' });
    runUntil(g, () => !!g.player(0).research.deepwood, secondsToTicks(CONFIG.research.deepwood.seconds + 5));
    expect(hall.tier).toBe(2);
  });

  it('Elder Circle heroes: Entangle hits and roots at once', () => {
    const { g } = setup();
    const w = hero(g, 'warden');
    const foe = g.addUnit('guard', 1, w.x + 3, w.y);
    const hp = foe.hp;
    w.hero!.mana = 500;
    g.issue({ type: 'cast', player: 0, units: [w.id], ability: 'entangle', targetId: foe.id, x: 0, y: 0 });
    runUntil(g, () => foe.hp < hp, 60);
    expect(foe.stun).toBeGreaterThan(0);
    expect(hp - foe.hp).toBeGreaterThan(CONFIG.hero.abilities.entangle.damage[0] * 0.5);
  });
});

describe('the faction tables', () => {
  it('both factions fill every role, with distinct types, all known to the config', () => {
    for (const f of ['crown', 'wild'] as const) {
      const d = FACTION[f];
      for (const t of Object.values(d.units)) expect(CONFIG.units[t], t).toBeDefined();
      for (const t of Object.values(d.buildings)) expect(CONFIG.buildings[t], t).toBeDefined();
      for (const h of d.heroes) expect(unitFaction(h)).toBe(f);
    }
    const crown = new Set<string>([...Object.values(FACTION.crown.units), ...Object.values(FACTION.crown.buildings)]);
    for (const t of [...Object.values(FACTION.wild.units), ...Object.values(FACTION.wild.buildings)]) expect(crown.has(t), t).toBe(false);
  });
});

describe('the computer plays Thornwild', () => {
  it('a Normal Thornwild computer builds up its whole tech tree and beats Easy', () => {
    const g = Game.create(4, 'vales', ['wild', 'crown']);
    const ais = [new ComputerPlayer(0, 'normal'), new ComputerPlayer(1, 'easy')];
    const types = new Set<string>();
    for (let t = 0; t < 20 * 60 * 30 && !g.state.outcome; t++) {
      g.step();
      for (const a of ais) a.update(g);
      if (t % 200 === 0) for (const e of [...g.units(), ...g.buildings()]) if (e.owner === 0) types.add(e.type);
    }
    expect(g.state.outcome?.winner).toBe(0);
    for (const t of ['tender', 'thornguard', 'slinger', 'grove', 'den', 'saplodge', 'circle']) expect(types.has(t), t).toBe(true);
  }, 60_000);
});
