// Worker harvesting state machine:
//   toNode -> (waiting) -> working -> toDropoff -> toNode -> ...
// Resources exist only as node reserves, explicit worker cargo, or player
// stockpiles; they move between them only at well-defined moments.

import { CONFIG, secondsToTicks } from './config';
import type { Game } from './game';
import { goldCarry, woodCarry } from './tech';
import { atRect, closestAround, distToRect } from './movement';
import type { Building, Order, ResourceKind, ResourceNode, Unit } from './types';

type GatherOrder = Extract<Order, { type: 'gather' }>;

export function nodeResource(node: ResourceNode): ResourceKind {
  return node.type === 'goldmine' ? 'gold' : 'wood';
}

/** Worker carry limits; Bow Saws raise the wood load. */
export function carryCapacity(game: Game, u: Unit, res: ResourceKind): number {
  return res === 'wood' ? woodCarry(game, u.owner) : goldCarry(game, u.owner);
}

function rectGoal(f: { tx: number; ty: number; w: number; h: number }) {
  return { kind: 'rect' as const, tx: f.tx, ty: f.ty, w: f.w, h: f.h };
}

/** Workers currently extracting from a node (inside a mine or swinging at a tree). */
export function workingCount(game: Game, nodeId: number): number {
  let n = 0;
  for (const u of game.units()) {
    const o = u.order;
    if (o?.type === 'gather' && o.nodeId === nodeId && o.phase === 'working') n++;
  }
  return n;
}

/** Leave a mine immediately (e.g. on a new order). Extraction in progress is lost. */
export function releaseFromNode(game: Game, u: Unit): void {
  if (!u.hidden) return;
  u.hidden = false;
  const o = u.order;
  const node = o?.type === 'gather' ? game.resource(o.nodeId) : undefined;
  if (node) placeAtExit(game, u, node, nearestDropoff(game, u, 'gold') ?? node);
}

export function startGather(game: Game, u: Unit, node: ResourceNode): void {
  releaseFromNode(game, u);
  const res = nodeResource(node);
  const o: GatherOrder = {
    type: 'gather',
    nodeId: node.id,
    res,
    phase: 'toNode',
    timer: 0,
    lastX: node.x,
    lastY: node.y,
    dropoffId: -1,
  };
  // Deliver incompatible or complete loads first. Gold always comes in whole loads.
  const c = u.carry;
  if (c.amount > 0 && (c.res !== res || res === 'gold' || c.amount >= carryCapacity(game, u, res))) {
    o.phase = 'toDropoff';
    o.res = c.res!;
  }
  u.order = o;
  u.move = null;
}

/** Return carried resources, then resume the current node (if any). */
export function startReturnCargo(game: Game, u: Unit, dropoffId: number): void {
  if (u.carry.amount <= 0 || !u.carry.res) return;
  releaseFromNode(game, u);
  const prev = u.order?.type === 'gather' ? u.order : null;
  u.order = {
    type: 'gather',
    nodeId: prev && prev.res === u.carry.res ? prev.nodeId : -1,
    res: u.carry.res,
    phase: 'toDropoff',
    timer: 0,
    lastX: prev?.lastX ?? u.x,
    lastY: prev?.lastY ?? u.y,
    dropoffId,
  };
  u.move = null;
}

/** Complete buildings only: foundations accept no deliveries. */
export function acceptsResource(b: Building, res: ResourceKind): boolean {
  return b.progress >= 1 && (CONFIG.buildings[b.type].accepts as readonly string[]).includes(res);
}

export function nearestDropoff(game: Game, u: Unit, res: ResourceKind): Building | undefined {
  const comp = game.nav.component(Math.floor(u.x), Math.floor(u.y));
  let best: Building | undefined;
  let bestD = Infinity;
  for (const b of game.buildings()) {
    if (b.owner !== u.owner || !acceptsResource(b, res)) continue;
    if (comp && !game.nav.footprintReachableFrom(b, comp)) continue;
    const d = distToRect(u.x, u.y, b);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Nearest reachable tree around (x, y), preferring trees with fewer choppers. */
export function findTree(game: Game, u: Unit, x: number, y: number, excludeId = -1): ResourceNode | undefined {
  const nav = game.nav;
  const R = CONFIG.resources.treeSearchRadius;
  const comp = nav.component(Math.floor(u.x), Math.floor(u.y));
  const busy = new Map<number, number>();
  for (const w of game.units()) {
    const o = w.order;
    if (w !== u && o?.type === 'gather' && o.res === 'wood' && o.phase !== 'toDropoff')
      busy.set(o.nodeId, (busy.get(o.nodeId) ?? 0) + 1);
  }
  let best: ResourceNode | undefined;
  let bestScore = Infinity;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (let ty = cy - R; ty <= cy + R; ty++)
    for (let tx = cx - R; tx <= cx + R; tx++) {
      if (!nav.inBounds(tx, ty)) continue;
      const id = nav.entityAt[ty * nav.w + tx];
      if (!id || id === excludeId) continue;
      const node = game.resource(id);
      if (!node || node.type !== 'tree') continue;
      const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
      if (d > R) continue;
      const score = d + 1.5 * (busy.get(id) ?? 0);
      if (score >= bestScore) continue;
      if (!nav.footprintReachableFrom(node, comp)) continue;
      best = node;
      bestScore = score;
    }
  return best;
}

function goIdle(u: Unit): void {
  u.order = null;
  u.move = null;
}

/**
 * The current node is gone or unusable. Woodcutters look for another tree;
 * otherwise deliver what is carried and stop.
 */
function retarget(game: Game, u: Unit, o: GatherOrder, excludeId = -1): ResourceNode | undefined {
  if (o.res === 'wood') {
    const t = findTree(game, u, o.lastX, o.lastY, excludeId);
    if (t) {
      o.nodeId = t.id;
      o.lastX = t.x;
      o.lastY = t.y;
      o.phase = u.carry.amount >= carryCapacity(game, u, 'wood') ? 'toDropoff' : 'toNode';
      u.move = null;
      return t;
    }
  }
  o.nodeId = -1;
  if (u.carry.amount > 0) {
    o.phase = 'toDropoff';
    u.move = null;
  } else {
    goIdle(u);
  }
  return undefined;
}

function placeAtExit(game: Game, u: Unit, node: ResourceNode, toward: { x: number; y: number }): void {
  const p = closestAround(toward.x, toward.y, node, u.radius + 0.05);
  if (game.nav.canStand(p.x, p.y, u.radius)) {
    u.x = u.px = p.x;
    u.y = u.py = p.y;
    return;
  }
  const spot = game.freeTilesAround(node, 1)[0];
  if (spot) {
    u.x = u.px = spot.x + 0.5;
    u.y = u.py = spot.y + 0.5;
  }
}

function depleteMine(game: Game, node: ResourceNode): void {
  const notified = new Set<number>();
  for (const w of game.units()) {
    const o = w.order;
    if (o?.type === 'gather' && o.nodeId === node.id && !notified.has(w.owner)) {
      notified.add(w.owner);
      game.emit({ type: 'mineDepleted', player: w.owner, x: node.x, y: node.y });
    }
  }
  game.removeEntity(node.id);
}

function tryStartWork(game: Game, u: Unit, o: GatherOrder, node: ResourceNode): void {
  u.move = null;
  if (node.type === 'goldmine') {
    if (workingCount(game, node.id) < node.miners) {
      o.phase = 'working';
      o.timer = secondsToTicks(workerDef(u).mineSeconds);
      u.hidden = true;
    } else {
      o.phase = 'waiting';
    }
    return;
  }
  if (workingCount(game, node.id) < CONFIG.resources.tree.maxChoppers) {
    o.phase = 'working';
    o.timer = secondsToTicks(workerDef(u).chopSeconds);
    u.facing = Math.atan2(node.y - u.y, node.x - u.x);
    return;
  }
  const alt = findTree(game, u, node.x, node.y, node.id);
  if (alt) {
    o.nodeId = alt.id;
    o.lastX = alt.x;
    o.lastY = alt.y;
    o.phase = 'toNode';
  } else {
    o.phase = 'waiting';
  }
}

export function updateGatherer(game: Game, u: Unit, o: GatherOrder): void {
  switch (o.phase) {
    case 'toNode':
    case 'waiting': {
      let node = game.resource(o.nodeId);
      if (!node) {
        node = retarget(game, u, o);
        if (!node || o.phase !== 'toNode') return;
      }
      if (atRect(u, node)) {
        tryStartWork(game, u, o, node);
        return;
      }
      if (o.phase === 'waiting') o.phase = 'toNode';
      if (!game.moveFailed(u, rectGoal(node))) game.moveTo(u, rectGoal(node));
      if (u.move?.state === 'failed') {
        u.move = null;
        retarget(game, u, o, node.id);
      }
      return;
    }

    case 'working': {
      const node = game.resource(o.nodeId);
      if (o.res === 'gold') {
        if (--o.timer > 0) return;
        const take = node ? Math.min(carryCapacity(game, u, 'gold'), node.amount) : 0;
        u.hidden = false;
        if (node) {
          node.amount -= take;
          placeAtExit(game, u, node, nearestDropoff(game, u, 'gold') ?? node);
          if (node.amount <= 0) depleteMine(game, node);
        }
        if (take > 0) {
          u.carry = { res: 'gold', amount: take };
          o.phase = 'toDropoff';
        } else {
          retarget(game, u, o);
        }
        return;
      }
      // Wood: one swing at a time; cargo grows per swing.
      if (!node) {
        retarget(game, u, o);
        return;
      }
      if (--o.timer > 0) return;
      const cap = carryCapacity(game, u, 'wood');
      if (u.carry.res !== 'wood') u.carry = { res: 'wood', amount: 0 };
      const take = Math.min(workerDef(u).woodPerChop, node.amount, cap - u.carry.amount);
      u.carry.amount += take;
      // Thornwild Tenders coax wood from a living tree: it is never used up.
      if (!sustainsTrees(u)) node.amount -= take;
      game.emit({ type: 'chop', x: node.x, y: node.y });
      if (node.amount <= 0) {
        game.emit({ type: 'treeFelled', x: node.x, y: node.y });
        game.removeEntity(node.id);
      }
      if (u.carry.amount >= cap) {
        o.phase = 'toDropoff';
      } else if (node.amount <= 0) {
        retarget(game, u, o);
      } else {
        o.timer = secondsToTicks(workerDef(u).chopSeconds);
      }
      return;
    }

    case 'toDropoff': {
      if (u.carry.amount <= 0 || !u.carry.res) {
        afterDelivery(game, u, o);
        return;
      }
      const res = u.carry.res;
      let drop = o.dropoffId >= 0 ? game.building(o.dropoffId) : undefined;
      if (drop && (drop.owner !== u.owner || !acceptsResource(drop, res))) drop = undefined;
      drop ??= nearestDropoff(game, u, res);
      if (!drop) {
        game.emit({ type: 'noDropoff', player: u.owner, x: u.x, y: u.y });
        goIdle(u);
        return;
      }
      if (atRect(u, drop)) {
        const p = game.player(u.owner);
        // An income advantage (a labelled cheat) adds its share, whole units only.
        const owed = u.carry.amount * p.incomeBonus + p.incomeOwed;
        const bonus = Math.floor(owed + 1e-9);
        p.incomeOwed = owed - bonus;
        const amount = u.carry.amount + bonus;
        if (res === 'gold') {
          p.gold += amount;
          p.goldGathered += amount;
        } else {
          p.wood += amount;
          p.woodGathered += amount;
        }
        game.emit({ type: 'deliver', player: u.owner, res, amount, x: drop.x, y: drop.y - drop.h / 2 });
        u.carry = { res: null, amount: 0 };
        u.move = null;
        o.dropoffId = -1;
        afterDelivery(game, u, o);
        return;
      }
      if (!game.moveFailed(u, rectGoal(drop))) game.moveTo(u, rectGoal(drop));
      if (u.move?.state === 'failed') goIdle(u);
      return;
    }
  }
}

function afterDelivery(game: Game, u: Unit, o: GatherOrder): void {
  const node = game.resource(o.nodeId);
  if (node) {
    // Resume the node (possibly a different resource queued behind this delivery).
    o.res = nodeResource(node);
    o.phase = 'toNode';
    return;
  }
  if (o.res === 'wood' && o.nodeId !== -1) {
    retarget(game, u, o);
    return;
  }
  goIdle(u);
}

/** Gathering numbers of this unit's type (Laborer or Tender). */
function workerDef(u: Unit): { mineSeconds: number; chopSeconds: number; woodPerChop: number } {
  return u.type === 'tender' ? CONFIG.units.tender : CONFIG.units.worker;
}

/** Thornwild harvesting leaves the tree standing. */
function sustainsTrees(u: Unit): boolean {
  return u.type === 'tender';
}
