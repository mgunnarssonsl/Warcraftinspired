// Production queues: units, research and hero revival share one queue per
// building. The rules are listed on CONFIG.production and apply identically
// to every player, human or computer.

import { isWorker } from './factions';
import { CONFIG, isHeroType, secondsToTicks, type BuildingType, type ResearchId, type UnitType } from './config';
import type { Game } from './game';
import { startGather } from './gathering';
import { heroLimit, heroRecord, initHero, reviveCost, reviveSeconds } from './hero';
import { completeResearch, researched, researchProblem } from './tech';
import type { Building, QueueItem } from './types';

export function trainableAt(type: BuildingType): UnitType[] {
  return (Object.keys(CONFIG.units) as UnitType[]).filter((u) => CONFIG.units[u].trainedAt === type);
}

export function hasCompleted(game: Game, player: number, type: BuildingType): boolean {
  return game.buildings().some((b) => b.owner === player && b.type === type && b.progress >= 1);
}

/** Unmet prerequisite for a unit type, as a readable reason, or null. */
export function missingRequirement(game: Game, player: number, unit: UnitType): string | null {
  const tech = CONFIG.units[unit].tech as ResearchId | null;
  if (tech && !researched(game, player, tech)) return `Requires ${CONFIG.research[tech].name}.`;
  const req = CONFIG.units[unit].requires as BuildingType | null;
  if (req && !hasCompleted(game, player, req)) return `Requires a ${CONFIG.buildings[req].name}.`;
  return null;
}

/** Heroes of a type in training or being revived anywhere. */
function heroQueued(game: Game, player: number, type?: UnitType): boolean {
  return game.buildings().some((b) => b.owner === player && b.queue.some((q) => q.unit && isHeroType(q.unit) && (!type || q.unit === type)));
}

/** New heroes queued (not revivals). */
function newHeroesQueued(game: Game, player: number): number {
  let n = 0;
  for (const b of game.buildings()) if (b.owner === player) for (const q of b.queue) if (q.unit && isHeroType(q.unit) && !q.revive) n++;
  return n;
}

/** What training `unit` costs right now (a fallen hero costs a revival). */
export function trainCost(game: Game, player: number, unit: UnitType): { gold: number; wood: number } {
  const rec = isHeroType(unit) ? game.state.players[player]?.heroes.find((h) => h.type === unit) : undefined;
  if (rec && !rec.alive) return reviveCost(rec.level);
  return CONFIG.units[unit].cost;
}

/**
 * Hero rules: each type at most once; a fallen hero can always be revived;
 * a new hero only while under the limit (1, or 2 with a Castle).
 */
export function heroProblem(game: Game, player: number, unit: UnitType): string | null {
  if (!isHeroType(unit)) return null;
  const name = CONFIG.units[unit].name;
  const rec = heroRecord(game, player, unit);
  if (rec?.alive) return `You already have a ${name}.`;
  if (heroQueued(game, player, unit)) return `${name} is already in training.`;
  if (rec) return null; // revival
  const limit = heroLimit(game, player);
  if (game.player(player).heroes.length + newHeroesQueued(game, player) >= limit)
    return limit < CONFIG.hero.maxHeroesCastle ? `One hero until your main hall reaches tier II.` : `At most ${limit} heroes.`;
  return null;
}

/** Why `unit` cannot be queued at building `b` right now, or null if it can. */
export function trainProblem(game: Game, player: number, b: Building, unit: UnitType): string | null {
  if (b.owner !== player) return 'Not your building.';
  if (b.progress < 1) return 'The building is not finished.';
  if (CONFIG.units[unit].trainedAt !== b.type) return `${CONFIG.buildings[b.type].name} cannot train that.`;
  const req = missingRequirement(game, player, unit);
  if (req) return req;
  const hp = heroProblem(game, player, unit);
  if (hp) return hp;
  if (b.queue.length >= CONFIG.production.queueSize) return 'The queue is full.';
  const p = game.player(player);
  const c = trainCost(game, player, unit);
  if (p.gold < c.gold) return `Not enough gold (${c.gold} needed).`;
  if (p.wood < c.wood) return `Not enough wood (${c.wood} needed).`;
  return null;
}

function pay(game: Game, player: number, cost: { gold: number; wood: number }): void {
  const p = game.player(player);
  p.gold -= cost.gold;
  p.wood -= cost.wood;
}

export function enqueue(game: Game, player: number, buildingId: number, unit: UnitType): void {
  const b = game.building(buildingId);
  if (!b) return;
  const problem = trainProblem(game, player, b, unit);
  if (problem) {
    if (b.owner === player) game.emit({ type: 'cantTrain', player, reason: problem });
    return;
  }
  const rec = isHeroType(unit) ? heroRecord(game, player, unit) : undefined;
  const revive = !!rec && !rec.alive;
  const cost = trainCost(game, player, unit);
  const seconds = revive ? reviveSeconds(rec!.level) : CONFIG.units[unit].trainSeconds;
  pay(game, player, cost);
  b.queue.push({ unit, research: null, revive, cost, ticks: secondsToTicks(seconds), progress: 0, started: false, blocked: false });
}

export function enqueueResearch(game: Game, player: number, buildingId: number, id: ResearchId): void {
  const b = game.building(buildingId);
  if (!b) return;
  const problem = researchProblem(game, player, b, id);
  if (problem) {
    if (b.owner === player) game.emit({ type: 'cantTrain', player, reason: problem });
    return;
  }
  const def = CONFIG.research[id];
  pay(game, player, def.cost);
  b.queue.push({
    unit: null,
    research: id,
    revive: false,
    cost: { ...def.cost },
    ticks: secondsToTicks(def.seconds),
    progress: 0,
    started: false,
    blocked: false,
  });
}

function refund(game: Game, player: number, item: QueueItem, share: number): { gold: number; wood: number } {
  const gold = Math.floor(item.cost.gold * share);
  const wood = Math.floor(item.cost.wood * share);
  const p = game.player(player);
  p.gold += gold;
  p.wood += wood;
  return { gold, wood };
}

export function cancelTraining(game: Game, player: number, buildingId: number, index: number): void {
  const b = game.building(buildingId);
  if (!b || b.owner !== player || index < 0 || index >= b.queue.length) return;
  const [item] = b.queue.splice(index, 1);
  refund(game, player, item, CONFIG.production.cancelRefund);
}

export function setRally(game: Game, player: number, buildingId: number, x: number, y: number, targetId: number): void {
  const b = game.building(buildingId);
  if (!b || b.owner !== player) return;
  const { width, height } = game.state.map;
  b.rally = { x: Math.min(width, Math.max(0, x)), y: Math.min(height, Math.max(0, y)), targetId };
}

/**
 * Remove a building (destroyed in combat, or by a test). Its queue is
 * refunded per CONFIG.production.destroyedRefund; an unfinished building's
 * construction cost is lost. Completed research is permanent.
 */
export function destroyBuilding(game: Game, id: number): void {
  const b = game.building(id);
  if (!b) return;
  let gold = 0;
  let wood = 0;
  for (const q of b.queue) {
    const r = refund(game, b.owner, q, CONFIG.production.destroyedRefund);
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
    if (!item.started) {
      // Population is reserved when a unit starts training; research needs none.
      const pop = item.unit ? CONFIG.units[item.unit].pop : 0;
      if (pop > 0 && game.popUsed(b.owner) + pop > game.popCap(b.owner)) {
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
      item.progress = Math.min(1, item.progress + 1 / item.ticks);
      if (item.progress < 1 - 1e-9) continue;
      item.progress = 1;
    }
    if (item.research) {
      completeResearch(game, b, item.research);
      b.queue.shift();
    } else if (spawn(game, b, item)) b.queue.shift();
  }
}

/** Place a finished unit beside the building, toward the rally point. */
function spawn(game: Game, b: Building, item: QueueItem): boolean {
  const type = item.unit!;
  const spots = game.freeTilesAround(b, 16);
  if (!spots.length) return false; // completely boxed in: hold at 100% until space frees up
  const r = b.rally;
  const spot = r
    ? spots.reduce((a, c) => (Math.hypot(c.x + 0.5 - r.x, c.y + 0.5 - r.y) < Math.hypot(a.x + 0.5 - r.x, a.y + 0.5 - r.y) ? c : a))
    : spots[0];
  const u = game.addUnit(type, b.owner, spot.x + 0.5, spot.y + 0.5);
  if (isHeroType(type)) {
    // A revived hero comes back with its level, experience and items.
    const rec = item.revive ? heroRecord(game, b.owner, type) : undefined;
    initHero(game, u, rec ? rec.level : 1, rec ? rec.xp : 0, rec ? rec.items : []);
  }
  if (!item.revive) {
    const stats = game.player(b.owner).stats;
    stats.unitsTrained++;
    stats.trained[type] = (stats.trained[type] ?? 0) + 1;
  }
  game.emit({ type: 'unitTrained', player: b.owner, id: u.id, x: u.x, y: u.y });
  if (r) {
    const node = r.targetId >= 0 ? game.resource(r.targetId) : undefined;
    if (node && isWorker(type)) startGather(game, u, node);
    else u.order = { type: 'move', x: r.x, y: r.y };
  }
  return true;
}
