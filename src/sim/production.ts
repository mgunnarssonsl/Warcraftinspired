// Unit training queues. The rules are listed on CONFIG.production and apply
// identically to every player, human or computer.

import { CONFIG, secondsToTicks, type BuildingType, type UnitType } from './config';
import type { Game } from './game';
import { startGather } from './gathering';
import type { Building } from './types';

export function trainableAt(type: BuildingType): UnitType[] {
  return (Object.keys(CONFIG.units) as UnitType[]).filter((u) => CONFIG.units[u].trainedAt === type);
}

export function hasCompleted(game: Game, player: number, type: BuildingType): boolean {
  return game.buildings().some((b) => b.owner === player && b.type === type && b.progress >= 1);
}

/** Unmet prerequisite for a unit type, as a readable reason, or null. */
export function missingRequirement(game: Game, player: number, unit: UnitType): string | null {
  const req = CONFIG.units[unit].requires as BuildingType | null;
  if (req && !hasCompleted(game, player, req)) return `Requires a ${CONFIG.buildings[req].name}.`;
  return null;
}

/** Why `unit` cannot be queued at building `b` right now, or null if it can. */
export function trainProblem(game: Game, player: number, b: Building, unit: UnitType): string | null {
  if (b.owner !== player) return 'Not your building.';
  if (b.progress < 1) return 'The building is not finished.';
  if (CONFIG.units[unit].trainedAt !== b.type) return `${CONFIG.buildings[b.type].name} cannot train that.`;
  const req = missingRequirement(game, player, unit);
  if (req) return req;
  if (b.queue.length >= CONFIG.production.queueSize) return 'The queue is full.';
  const p = game.player(player);
  const c = CONFIG.units[unit].cost;
  if (p.gold < c.gold) return `Not enough gold (${c.gold} needed).`;
  if (p.wood < c.wood) return `Not enough wood (${c.wood} needed).`;
  return null;
}

export function enqueue(game: Game, player: number, buildingId: number, unit: UnitType): void {
  const b = game.building(buildingId);
  if (!b) return;
  const problem = trainProblem(game, player, b, unit);
  if (problem) {
    if (b.owner === player) game.emit({ type: 'cantTrain', player, reason: problem });
    return;
  }
  const p = game.player(player);
  const c = CONFIG.units[unit].cost;
  p.gold -= c.gold;
  p.wood -= c.wood;
  b.queue.push({ unit, progress: 0, started: false, blocked: false });
}

function refund(game: Game, player: number, unit: UnitType, share: number): { gold: number; wood: number } {
  const c = CONFIG.units[unit].cost;
  const gold = Math.floor(c.gold * share);
  const wood = Math.floor(c.wood * share);
  const p = game.player(player);
  p.gold += gold;
  p.wood += wood;
  return { gold, wood };
}

export function cancelTraining(game: Game, player: number, buildingId: number, index: number): void {
  const b = game.building(buildingId);
  if (!b || b.owner !== player || index < 0 || index >= b.queue.length) return;
  const [item] = b.queue.splice(index, 1);
  refund(game, player, item.unit, CONFIG.production.cancelRefund);
}

export function setRally(game: Game, player: number, buildingId: number, x: number, y: number, targetId: number): void {
  const b = game.building(buildingId);
  if (!b || b.owner !== player) return;
  const { width, height } = game.state.map;
  b.rally = { x: Math.min(width, Math.max(0, x)), y: Math.min(height, Math.max(0, y)), targetId };
}

/**
 * Remove a building (destroyed in combat, or by a test). Its training queue
 * is refunded per CONFIG.production.destroyedRefund; an unfinished building's
 * construction cost is lost.
 */
export function destroyBuilding(game: Game, id: number): void {
  const b = game.building(id);
  if (!b) return;
  let gold = 0;
  let wood = 0;
  for (const q of b.queue) {
    const r = refund(game, b.owner, q.unit, CONFIG.production.destroyedRefund);
    gold += r.gold;
    wood += r.wood;
  }
  game.removeEntity(id);
  game.emit({ type: 'buildingDestroyed', player: b.owner, building: b.type, refundGold: gold, refundWood: wood, x: b.x, y: b.y });
}

export function updateProduction(game: Game): void {
  for (const b of game.buildings()) {
    const item = b.queue[0];
    if (!item || b.progress < 1) continue;
    const def = CONFIG.units[item.unit];
    if (!item.started) {
      if (game.popUsed(b.owner) + def.pop > game.popCap(b.owner)) {
        if (!item.blocked) {
          item.blocked = true;
          game.emit({ type: 'popBlocked', player: b.owner, buildingId: b.id });
        }
        continue;
      }
      item.started = true;
      item.blocked = false;
    }
    if (item.progress < 1) {
      item.progress = Math.min(1, item.progress + 1 / secondsToTicks(def.trainSeconds));
      if (item.progress < 1 - 1e-9) continue;
      item.progress = 1;
    }
    if (spawn(game, b, item.unit)) b.queue.shift();
  }
}

/** Place a finished unit beside the building, toward the rally point. */
function spawn(game: Game, b: Building, type: UnitType): boolean {
  const spots = game.freeTilesAround(b, 16);
  if (!spots.length) return false; // completely boxed in: hold at 100% until space frees up
  const r = b.rally;
  const spot = r
    ? spots.reduce((a, c) => (Math.hypot(c.x + 0.5 - r.x, c.y + 0.5 - r.y) < Math.hypot(a.x + 0.5 - r.x, a.y + 0.5 - r.y) ? c : a))
    : spots[0];
  const u = game.addUnit(type, b.owner, spot.x + 0.5, spot.y + 0.5);
  game.emit({ type: 'unitTrained', player: b.owner, id: u.id, x: u.x, y: u.y });
  if (r) {
    const node = r.targetId >= 0 ? game.resource(r.targetId) : undefined;
    if (node && type === 'worker') startGather(game, u, node);
    else u.order = { type: 'move', x: r.x, y: r.y };
  }
  return true;
}
