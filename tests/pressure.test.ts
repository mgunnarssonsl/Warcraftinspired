// Upkeep, fragile expansions and raiding: the rules that make an army cost
// income and let pressure punish a greedy expansion.

import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/sim/config';
import { dealDamage } from '../src/sim/combat';
import { nextUpkeepThreshold, upkeepRate, upkeepTierFor } from '../src/sim/upkeep';
import { emptyGame, runUntil } from './helpers';

/** A Keep, a mine beside it, one Laborer, and `armyPop` population of Guards parked out of the way. */
function economy(armyPop: number) {
  const g = emptyGame(48, 24);
  g.addBuilding('hq', 0, 4, 8);
  const mine = g.addResource('goldmine', 14, 9, 5000);
  for (let i = 0; i < armyPop / CONFIG.units.guard.pop; i++) g.addUnit('guard', 0, 30 + (i % 8), 2 + Math.floor(i / 8));
  const u = g.addUnit('worker', 0, 10.5, 10.5);
  g.issue({ type: 'gather', player: 0, units: [u.id], nodeId: mine.id });
  return g;
}

describe('upkeep', () => {
  it('has tiers at the configured thresholds', () => {
    expect(upkeepTierFor(50)).toBeNull();
    expect(upkeepTierFor(51)?.rate).toBe(0.7);
    expect(upkeepTierFor(80)?.rate).toBe(0.7);
    expect(upkeepTierFor(81)?.rate).toBe(0.4);
    expect(nextUpkeepThreshold(10)).toBe(50);
    expect(nextUpkeepThreshold(60)).toBe(80);
    expect(nextUpkeepThreshold(90)).toBeNull();
  });

  it('cuts each delivery by the tier the player is in, and counts what it withheld', () => {
    for (const [army, kept] of [
      // The Laborer counts too: 48 + 1 is below the first threshold, 50 + 1 is over it.
      [0, 10],
      [48, 10],
      [50, 7],
      [80, 4],
    ] as const) {
      const g = economy(army);
      runUntil(g, () => g.player(0).gold > 0, 400);
      expect(g.player(0).gold, `army ${army}`).toBe(kept);
      expect(g.player(0).goldGathered).toBe(kept);
      expect(g.player(0).stats.upkeepPaid).toBe(10 - kept);
    }
  });

  it('carries fractions over, so nothing is lost to rounding', () => {
    const g = economy(52);
    expect(upkeepRate(g, 0)).toBe(0.7);
    // 3 gold carried at 70% is 2.1: 2 now, and the 0.1 stays owed.
    const p = g.player(0);
    p.incomeOwed = 0;
    runUntil(g, () => p.gold >= 70, 20 * 200);
    expect(p.gold + p.incomeOwed).toBeCloseTo((p.gold + p.stats.upkeepPaid) * 0.7, 6);
  });

  it('stacks with a labelled income advantage', () => {
    const g = economy(52);
    g.player(0).incomeBonus = 0.5;
    runUntil(g, () => g.player(0).gold > 0, 400);
    // 10 x 0.7 x 1.5 = 10.5: 10 delivered, 0.5 owed.
    expect(g.player(0).gold).toBe(10);
    expect(g.player(0).incomeOwed).toBeCloseTo(0.5, 9);
  });
});

describe('fragile expansions', () => {
  function building(type: 'hq' | 'farm') {
    const g = emptyGame(48, 24);
    g.addBuilding('hq', 0, 2, 2);
    g.player(0).gold = 2000;
    g.player(0).wood = 2000;
    const u = g.addUnit('worker', 0, 20.5, 12.5);
    g.issue({ type: 'build', player: 0, units: [u.id], buildingType: type, tx: 20, ty: 12 });
    runUntil(g, () => g.buildings().length === 2, 200);
    const site = g.buildings().find((b) => b.id !== g.buildings()[0].id)!;
    return { g, site };
  }

  it('an unfinished Keep has only part of its usual health, and all of it once finished', () => {
    const { g, site } = building('hq');
    runUntil(g, () => site.progress >= 0.5, 20 * 200);
    const start = CONFIG.construction.startHpFraction;
    const usual = site.maxHp * (start + (1 - start) * site.progress);
    const fragile = site.maxHp * (start + (1 - start) * site.progress * CONFIG.expansion.unfinishedHp);
    expect(site.hp).toBeCloseTo(fragile, -1);
    expect(site.hp).toBeLessThan(usual * 0.6);
    runUntil(g, () => site.progress >= 1, 20 * 200);
    expect(site.hp).toBe(site.maxHp);
    expect(Math.abs(site.freshUntil - (g.state.tick + 20 * CONFIG.expansion.freshSeconds))).toBeLessThanOrEqual(1);
  });

  it('damage taken while unfinished stays taken', () => {
    const { g, site } = building('hq');
    runUntil(g, () => site.progress >= 0.5, 20 * 200);
    site.hp -= 100;
    runUntil(g, () => site.progress >= 1, 20 * 200);
    expect(site.hp).toBe(site.maxHp - 100);
  });

  it('other buildings rise as before, and are never fresh', () => {
    const { g, site } = building('farm');
    runUntil(g, () => site.progress >= 1, 20 * 200);
    expect(site.hp).toBe(site.maxHp);
    expect(site.freshUntil).toBe(-1);
  });

  it('a freshly finished hall takes extra damage until it settles; a starting Keep never does', () => {
    const { g, site } = building('hq');
    runUntil(g, () => site.progress >= 1, 20 * 200);
    const home = g.buildings()[0];
    const enemy = g.addUnit('guard', 1, 40, 20);
    const before = { site: site.hp, home: home.hp };
    dealDamage(g, enemy.id, 1, site, 100, 'normal');
    dealDamage(g, enemy.id, 1, home, 100, 'normal');
    const freshLoss = before.site - site.hp;
    const homeLoss = before.home - home.hp;
    expect(freshLoss).toBeGreaterThan(homeLoss);
    expect(freshLoss / homeLoss).toBeCloseTo(CONFIG.expansion.freshTaken, 1);
    g.state.tick = site.freshUntil;
    const settled = site.hp;
    dealDamage(g, enemy.id, 1, site, 100, 'normal');
    expect(settled - site.hp).toBe(homeLoss);
  });
});

describe('raiding', () => {
  it('Lancers and Stag Riders hit workers harder; other units and other targets are unchanged', () => {
    const g = emptyGame(48, 24);
    const lancer = g.addUnit('lancer', 1, 30, 10);
    const stag = g.addUnit('stagrider', 1, 30, 14);
    const guard = g.addUnit('guard', 1, 30, 18);
    const loss = (attacker: number, type: 'worker' | 'tender' | 'guard') => {
      const t = g.addUnit(type, 0, 10, 10);
      const hp = t.hp;
      dealDamage(g, attacker, 1, t, 20, 'normal');
      return hp - t.hp;
    };
    expect(loss(lancer.id, 'worker') / loss(guard.id, 'worker')).toBeCloseTo(CONFIG.raid.vsWorkers, 1);
    expect(loss(stag.id, 'tender') / loss(guard.id, 'tender')).toBeCloseTo(CONFIG.raid.vsWorkers, 1);
    expect(loss(lancer.id, 'guard')).toBe(loss(guard.id, 'guard'));
  });
});
