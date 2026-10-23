import { describe, expect, it } from 'vitest';
import { CONFIG, type BuildingType } from '../src/sim/config';
import { checkPlacement } from '../src/sim/construction';
import { Game } from '../src/sim/game';
import type { Footprint, GameEvent, ResourceNode } from '../src/sim/types';

/** Nearest valid footprint to a point, keeping a 1-tile gap from other objects. */
function findSpot(g: Game, type: BuildingType, x: number, y: number): Footprint | null {
  const s = CONFIG.buildings[type].size;
  for (let r = 0; r < 14; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = Math.round(x - s / 2) + dx;
        const ty = Math.round(y - s / 2) + dy;
        // Padding check: the grown footprint must also be free.
        if (checkPlacement(g, type, tx, ty).ok && padFree(g, tx - 1, ty - 1, s + 2)) return { tx, ty, w: s, h: s };
      }
  return null;
}

function padFree(g: Game, tx: number, ty: number, s: number): boolean {
  for (let y = ty; y < ty + s; y++) for (let x = tx; x < tx + s; x++) if (!g.nav.passable(x, y)) return false;
  return true;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('economic growth through the standard rules', () => {
  it('a scripted player grows from 5 to 15+ workers and expands to a second Keep', () => {
    const g = Game.create(11);
    const P = 0;
    const hq = g.buildings().find((b) => b.owner === P)!;
    const mines = g.resources().filter((r) => r.type === 'goldmine').sort((a, b) => dist(a, hq) - dist(b, hq));
    const startMine = mines[0];
    const natural = mines.find((m) => m.maxAmount === CONFIG.mines.natural && dist(m, hq) < 40)!;
    const nearestTree = (p: { x: number; y: number }) =>
      g.resources().filter((r) => r.type === 'tree').sort((a, b) => dist(a, p) - dist(b, p))[0];
    const ws = g.units().filter((u) => u.owner === P);
    g.issue({ type: 'gather', player: P, units: ws.slice(0, 4).map((u) => u.id), nodeId: startMine.id });
    g.issue({ type: 'gather', player: P, units: [ws[4].id], nodeId: nearestTree(hq).id });
    g.issue({ type: 'setRally', player: P, buildingId: hq.id, x: startMine.x, y: startMine.y, targetId: startMine.id });

    const events: GameEvent[] = [];
    let expansion = -1;
    let trainedToWood = 0;
    for (let t = 0; t < 20 * 60 * 6; t++) {
      g.step();
      events.push(...g.drainEvents());
      if (t % 20 !== 0) continue;
      const p = g.player(P);
      const workers = g.units().filter((u) => u.owner === P && u.type === 'worker');
      // Keep the Keep busy.
      if (hq.queue.length < 2 && p.gold >= 75 && workers.length < 20) g.issue({ type: 'train', player: P, buildingId: hq.id, unit: 'worker' });
      // After 5 on gold, rally new workers to wood instead.
      if (workers.length >= 7 && trainedToWood === 0) {
        const tree = nearestTree(hq);
        g.issue({ type: 'setRally', player: P, buildingId: hq.id, x: tree.x, y: tree.y, targetId: tree.id });
        trainedToWood = 1;
      }
      const building = workers.some((u) => u.order?.type === 'build');
      // Farms when population is nearly capped.
      if (!building && g.popCap(P) - g.popUsed(P) <= 2 && p.gold >= 80 && p.wood >= 20) {
        const spot = findSpot(g, 'farm', hq.x - 2, hq.y - 7);
        const builder = workers.find((u) => u.order?.type === 'gather' && u.order.res === 'wood') ?? workers[0];
        if (spot) g.issue({ type: 'build', player: P, units: [builder.id], buildingType: 'farm', tx: spot.tx, ty: spot.ty });
      }
      // Expand once rich enough.
      if (expansion < 0 && !building && p.gold >= 385 && p.wood >= 205 && workers.length >= 10) {
        const spot = findSpot(g, 'hq', natural.x - 5, natural.y);
        expect(spot).not.toBeNull();
        g.issue({ type: 'build', player: P, units: [workers[workers.length - 1].id], buildingType: 'hq', tx: spot!.tx, ty: spot!.ty });
        expansion = 0;
      }
      const second = g.buildings().find((b) => b.owner === P && b.type === 'hq' && b.id !== hq.id && b.progress >= 1);
      if (second && expansion === 0) {
        // Move three miners over to the natural.
        const miners = workers.filter((u) => u.order?.type === 'gather' && u.order.res === 'gold').slice(0, 3);
        g.issue({ type: 'gather', player: P, units: miners.map((u) => u.id), nodeId: natural.id });
        expansion = second.id;
      }
    }
    const workers = g.units().filter((u) => u.owner === P && u.type === 'worker');
    const farms = g.buildings().filter((b) => b.owner === P && b.type === 'farm' && b.progress >= 1);
    expect(workers.length).toBeGreaterThanOrEqual(15);
    expect(farms.length).toBeGreaterThanOrEqual(1);
    expect(expansion).toBeGreaterThan(0);
    const second = g.building(expansion)!;
    const deliveredThere = events.filter(
      (e) => e.type === 'deliver' && e.player === P && e.res === 'gold' && Math.abs(e.x - second.x) < 0.01,
    );
    expect(deliveredThere.length).toBeGreaterThan(3);
    expect(g.popUsed(P)).toBeLessThanOrEqual(g.popCap(P));
    for (const u of g.units()) expect(g.nav.canStand(u.x, u.y, u.radius)).toBe(true);
    // No resources were created or destroyed along the way.
    const p = g.player(P);
    const spentWorkers = (workers.length - 5) * CONFIG.units.worker.cost.gold;
    const spentBuildings = g
      .buildings()
      .filter((b) => b.owner === P && b.id !== hq.id)
      .reduce((s, b) => s + CONFIG.buildings[b.type].cost.gold, 0);
    const queued = hq.queue.length * CONFIG.units.worker.cost.gold;
    const carried = g.units().reduce((s, u) => s + (u.owner === P && u.carry.res === 'gold' ? u.carry.amount : 0), 0);
    expect(p.gold + spentWorkers + spentBuildings + queued).toBe(CONFIG.match.startGold + p.goldGathered);
    expect(carried).toBeGreaterThanOrEqual(0);
    const minesLeft = (m: ResourceNode) => g.resource(m.id)?.amount ?? 0;
    expect(minesLeft(startMine) + minesLeft(natural)).toBeLessThan(startMine.maxAmount + natural.maxAmount);
    console.log(`growth: ${workers.length} workers, ${farms.length} farms, pop ${g.popUsed(P)}/${g.popCap(P)}, gold gathered ${p.goldGathered}, wood ${p.woodGathered}, deliveries at expansion ${deliveredThere.length}`);
  });
});
