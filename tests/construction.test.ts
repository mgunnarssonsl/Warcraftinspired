import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/sim/config';
import { checkPlacement, snapFootprint } from '../src/sim/construction';
import type { GameEvent } from '../src/sim/types';
import { emptyGame, run, runUntil } from './helpers';

const FARM = CONFIG.buildings.farm;

function setup() {
  const g = emptyGame(40, 24);
  g.player(0).gold = 500;
  g.player(0).wood = 200;
  const hq = g.addBuilding('hq', 0, 4, 8);
  const u = g.addUnit('worker', 0, 10.5, 10.5);
  return { g, hq, u };
}

describe('placement', () => {
  it('rejects footprints over blocked tiles or outside the map, ignoring units', () => {
    const { g } = setup();
    g.addResource('tree', 20, 10, 50);
    expect(checkPlacement(g, 'farm', 15, 10).ok).toBe(true);
    const blocked = checkPlacement(g, 'farm', 19, 9);
    expect(blocked.ok).toBe(false);
    expect(blocked.tiles).toEqual([true, true, true, false]);
    expect(checkPlacement(g, 'farm', 39, 5).ok).toBe(false);
    expect(checkPlacement(g, 'farm', 5, 9).ok).toBe(false); // on the Keep
    g.addUnit('worker', 0, 16, 11);
    expect(checkPlacement(g, 'farm', 15, 10).ok).toBe(true);
  });

  it('snaps a world point to the footprint centered on it', () => {
    expect(snapFootprint('farm', 16.2, 11.1)).toEqual({ tx: 15, ty: 10, w: 2, h: 2 });
    expect(snapFootprint('lumbermill', 16.2, 11.1)).toEqual({ tx: 15, ty: 10, w: 3, h: 3 });
  });
});

describe('construction', () => {
  it('pays on arrival, builds over time, then adds population', () => {
    const { g, u } = setup();
    const cap0 = g.popCap(0);
    g.issue({ type: 'build', player: 0, units: [u.id], buildingType: 'farm', tx: 20, ty: 10 });
    g.step();
    expect(g.player(0).gold).toBe(500); // not yet paid while walking
    runUntil(g, () => g.buildings().length === 2, 200);
    expect(g.player(0).gold).toBe(500 - FARM.cost.gold);
    expect(g.player(0).wood).toBe(200 - FARM.cost.wood);
    const farm = g.buildings().find((b) => b.type === 'farm')!;
    expect(farm.progress).toBeLessThan(0.1);
    expect(g.popCap(0)).toBe(cap0); // unfinished: no population yet
    const events: GameEvent[] = [];
    runUntil(g, () => (events.push(...g.drainEvents()), farm.progress >= 1), 20 * FARM.buildSeconds + 40);
    expect(farm.hp).toBe(farm.maxHp);
    expect(g.popCap(0)).toBe(cap0 + FARM.popProvided);
    expect(u.order).toBeNull();
    expect(events.some((e) => e.type === 'buildingComplete')).toBe(true);
  });

  it('a worker taken off gathering returns to its job after building', () => {
    const { g, u } = setup();
    const tree = g.addResource('tree', 14, 14, 500);
    g.issue({ type: 'gather', player: 0, units: [u.id], nodeId: tree.id });
    runUntil(g, () => u.carry.amount > 0, 400);
    g.issue({ type: 'build', player: 0, units: [u.id], buildingType: 'farm', tx: 20, ty: 10 });
    runUntil(g, () => g.buildings().some((b) => b.type === 'farm' && b.progress >= 1), 20 * FARM.buildSeconds + 300);
    g.step();
    const o = u.order;
    expect(o?.type).toBe('gather');
    if (o?.type === 'gather') expect(o.nodeId).toBe(tree.id);
  });

  it('fails with a reason when the player cannot pay on arrival', () => {
    const { g, u } = setup();
    g.issue({ type: 'build', player: 0, units: [u.id], buildingType: 'farm', tx: 20, ty: 10 });
    g.step();
    g.player(0).gold = 10; // spent elsewhere while walking
    const events: GameEvent[] = [];
    runUntil(g, () => (events.push(...g.drainEvents()), u.order === null), 300);
    expect(g.buildings()).toHaveLength(1);
    expect(events.find((e) => e.type === 'cantBuild')).toMatchObject({ reason: expect.stringContaining('gold') });
    expect(g.player(0).gold).toBe(10);
  });

  it('rejects an invalid site immediately without moving the worker', () => {
    const { g, u } = setup();
    g.issue({ type: 'build', player: 0, units: [u.id], buildingType: 'farm', tx: 5, ty: 9 });
    g.step();
    expect(u.order).toBeNull();
    expect(g.drainEvents().some((e) => e.type === 'cantBuild')).toBe(true);
  });

  it('pushes units standing on the site out to valid ground', () => {
    const { g, u } = setup();
    const bystander = g.addUnit('worker', 0, 21, 11);
    g.issue({ type: 'build', player: 0, units: [u.id], buildingType: 'farm', tx: 20, ty: 10 });
    runUntil(g, () => g.buildings().length === 2, 200);
    expect(g.nav.canStand(bystander.x, bystander.y, bystander.radius)).toBe(true);
    expect(g.nav.canStand(u.x, u.y, u.radius)).toBe(true);
  });

  it('pauses when the builder leaves and resumes with another worker', () => {
    const { g, u } = setup();
    g.issue({ type: 'build', player: 0, units: [u.id], buildingType: 'farm', tx: 20, ty: 10 });
    runUntil(g, () => g.buildings().length === 2, 200);
    run(g, 40);
    g.issue({ type: 'stop', player: 0, units: [u.id] });
    g.step();
    const farm = g.buildings().find((b) => b.type === 'farm')!;
    const paused = farm.progress;
    run(g, 60);
    expect(farm.progress).toBe(paused);
    const helper = g.addUnit('worker', 0, 16.5, 12.5);
    g.issue({ type: 'resumeBuild', player: 0, units: [helper.id, u.id], buildingId: farm.id });
    runUntil(g, () => farm.progress >= 1, 20 * FARM.buildSeconds + 100);
    // Only one active builder at a time: total time is not shortened.
    expect(g.state.tick).toBeGreaterThan(20 * FARM.buildSeconds);
  });

  it('cancelling refunds the configured share and frees the tiles', () => {
    const { g, u } = setup();
    g.issue({ type: 'build', player: 0, units: [u.id], buildingType: 'farm', tx: 20, ty: 10 });
    runUntil(g, () => g.buildings().length === 2, 200);
    const farm = g.buildings().find((b) => b.type === 'farm')!;
    g.issue({ type: 'cancelBuild', player: 0, buildingId: farm.id });
    run(g, 2);
    expect(g.building(farm.id)).toBeUndefined();
    expect(g.player(0).gold).toBe(500 - FARM.cost.gold + Math.floor(FARM.cost.gold * CONFIG.construction.cancelRefund));
    expect(g.player(0).wood).toBe(200 - FARM.cost.wood + Math.floor(FARM.cost.wood * CONFIG.construction.cancelRefund));
    expect(g.nav.passable(20, 10)).toBe(true);
    expect(u.order).toBeNull();
  });

  it('a completed lumber mill shortens wood trips; an unfinished one is ignored', () => {
    const woodPerMinute = (millProgress: number | null) => {
      const { g, u } = setup();
      const tree = g.addResource('tree', 32, 10, 5000);
      if (millProgress !== null) g.addBuilding('lumbermill', 0, 27, 12, millProgress);
      g.issue({ type: 'gather', player: 0, units: [u.id], nodeId: tree.id });
      run(g, 20 * 60);
      return g.player(0).woodGathered;
    };
    const none = woodPerMinute(null);
    expect(woodPerMinute(0.5)).toBe(none);
    expect(woodPerMinute(1)).toBeGreaterThan(none * 1.5);
  });
});
