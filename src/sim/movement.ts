// Unit locomotion: path planning against the nav grid, waypoint following,
// unit-unit separation and stuck recovery. Order logic decides *where* to go;
// this module decides *how* to get there.

import { isWorker } from './factions';
import { buffAmount } from './hero';
import { itemBonus } from './items';
import { CONFIG, TICK_SECONDS } from './config';
import type { Game } from './game';
import { findPath, smoothPath, type GoalRect } from './pathfinding';
import { TERRAIN, type Footprint, type MoveGoal, type Unit } from './types';

export function distToRect(x: number, y: number, f: Footprint): number {
  const dx = x < f.tx ? f.tx - x : x > f.tx + f.w ? x - (f.tx + f.w) : 0;
  const dy = y < f.ty ? f.ty - y : y > f.ty + f.h ? y - (f.ty + f.h) : 0;
  return Math.hypot(dx, dy);
}

export function atRect(u: Unit, f: Footprint): boolean {
  return distToRect(u.x, u.y, f) <= CONFIG.movement.reach;
}

/** Closest point to (x, y) on the footprint grown by `pad`. */
export function closestAround(x: number, y: number, f: Footprint, pad: number): { x: number; y: number } {
  const x0 = f.tx - pad;
  const x1 = f.tx + f.w + pad;
  const y0 = f.ty - pad;
  const y1 = f.ty + f.h + pad;
  let cx = Math.min(x1, Math.max(x0, x));
  let cy = Math.min(y1, Math.max(y0, y));
  if (cx > x0 && cx < x1 && cy > y0 && cy < y1) {
    // Inside: snap to the nearest edge.
    const d = [cx - x0, x1 - cx, cy - y0, y1 - cy];
    const m = Math.min(...d);
    if (m === d[0]) cx = x0;
    else if (m === d[1]) cx = x1;
    else if (m === d[2]) cy = y0;
    else cy = y1;
  }
  return { x: cx, y: cy };
}

/**
 * The tile containing coordinate `v` on an axis of length `size`. Like
 * Math.floor, except that a point exactly on a tile edge in the far half of
 * the map belongs to the tile before it: the rule is then the same seen from
 * either end, so mirrored positions on the point-symmetric map get mirrored
 * tiles. (Positions on exact edges are common: even-sized buildings have
 * whole-number centres.)
 */
/**
 * Why a move to (x, y) cannot get all the way there, for the player: the
 * spot is water or cliff, or it lies on ground none of these units can walk
 * to (an island, a walled-off pocket). Units still go as close as they can.
 * Trees and buildings at the spot are not a problem: moving next to them is
 * normal.
 */
export function reachProblem(game: Game, units: readonly Unit[], x: number, y: number): string | null {
  const { width, height, terrain } = game.state.map;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= width || ty >= height || !units.length) return null;
  const t = terrain[ty * width + tx];
  if (t === TERRAIN.water || t === TERRAIN.rock) return `Units can't walk on ${t === TERRAIN.water ? 'water' : 'cliffs'}: they go as close as they can.`;
  const there = game.nav.component(tx, ty);
  if (there === 0) return null; // a tree or building stands there
  if (units.some((u) => game.nav.component(Math.floor(u.x), Math.floor(u.y)) === there)) return null;
  return 'No path leads there: your units go as close as they can.';
}

export function symTile(v: number, size: number): number {
  const f = Math.floor(v);
  return f === v && v > size / 2 ? f - 1 : f;
}

/** Plan the unit's route; returns the search's cost (tiles expanded). */
export function planPath(game: Game, u: Unit): number {
  const mv = u.move;
  if (!mv) return 0;
  const nav = game.nav;
  const goal = mv.goal;
  const { width: W, height: H } = game.state.map;
  const sx = symTile(u.x, W);
  const sy = symTile(u.y, H);
  let rect: GoalRect;
  if (goal.kind === 'point') {
    const gx = symTile(goal.x, W);
    const gy = symTile(goal.y, H);
    rect = { x0: gx, y0: gy, x1: gx, y1: gy };
  } else {
    rect = { x0: goal.tx - 1, y0: goal.ty - 1, x1: goal.tx + goal.w, y1: goal.ty + goal.h };
  }
  const res = findPath(nav, sx, sy, rect);
  const path = smoothPath(nav, u, res.tiles, u.radius);
  const last = path.length ? path[path.length - 1] : { x: u.x, y: u.y };
  if (res.reached) {
    // Finish at the precise spot: the clicked point, or touching the footprint.
    const exact =
      goal.kind === 'point' ? { x: goal.x, y: goal.y } : closestAround(last.x, last.y, goal, u.radius + 0.05);
    const prev = path.length >= 2 ? path[path.length - 2] : { x: u.x, y: u.y };
    if (nav.canStand(exact.x, exact.y, u.radius)) {
      if (goal.kind === 'point' && path.length && nav.lineClear(prev.x, prev.y, exact.x, exact.y, u.radius)) {
        path[path.length - 1] = exact;
      } else if (nav.lineClear(last.x, last.y, exact.x, exact.y, u.radius)) {
        path.push(exact);
      }
    }
  }
  mv.path = path;
  mv.navVersion = nav.version;
  return res.expanded;
}

function goalReached(u: Unit, goal: MoveGoal): boolean {
  if (goal.kind === 'point') return true; // closest reachable point counts
  return atRect(u, goal);
}

function isGhost(u: Unit): boolean {
  // Harvesting workers pass through other units so mining traffic never jams.
  return isWorker(u.type) && u.order?.type === 'gather';
}

function tryShift(game: Game, u: Unit, dx: number, dy: number): void {
  const nav = game.nav;
  if (nav.canStand(u.x + dx, u.y, u.radius)) u.x += dx;
  if (nav.canStand(u.x, u.y + dy, u.radius)) u.y += dy;
}

export function updateMovement(game: Game, units: Unit[]): void {
  const tick = game.state.tick;
  const spent = new Map<number, number>();
  for (const u of units) {
    const mv = u.move;
    if (!mv || mv.state !== 'moving' || u.hidden || u.stun > 0) continue;
    if (mv.navVersion !== game.nav.version) {
      // A new order, or the terrain changed (tree felled, building placed):
      // plan now if this player's search budget for the tick allows.
      const used = spent.get(u.owner) ?? 0;
      if (used >= CONFIG.movement.pathBudget) continue;
      spent.set(u.owner, used + planPath(game, u));
    }
    let budget = moveSpeed(u) * TICK_SECONDS;
    while (budget > 1e-9 && mv.path.length) {
      const wp = mv.path[0];
      const dx = wp.x - u.x;
      const dy = wp.y - u.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-6) u.facing = Math.atan2(dy, dx);
      if (d <= budget) {
        u.x = wp.x;
        u.y = wp.y;
        budget -= d;
        mv.path.shift();
      } else {
        const nx = u.x + (dx / d) * budget;
        const ny = u.y + (dy / d) * budget;
        if (game.nav.canStand(nx, ny, u.radius)) {
          u.x = nx;
          u.y = ny;
        } else {
          // Never step into blocked ground; slide along it and let stuck recovery re-plan.
          tryShift(game, u, nx - u.x, ny - u.y);
        }
        budget = 0;
      }
    }
    if (!mv.path.length) {
      mv.state = goalReached(u, mv.goal) ? 'arrived' : 'failed';
    }
  }

  separate(game, units);

  // Stuck recovery: re-plan when a unit makes too little progress.
  const window = CONFIG.movement.stuckTicks;
  for (const u of units) {
    const mv = u.move;
    if (!mv || mv.state !== 'moving' || u.hidden) continue;
    // Still waiting for its path: not stuck.
    if (mv.navVersion !== game.nav.version) {
      mv.checkTick = tick;
      continue;
    }
    if (tick - mv.checkTick < window) continue;
    const moved = Math.hypot(u.x - mv.checkX, u.y - mv.checkY);
    const expected = moveSpeed(u) * TICK_SECONDS * window;
    mv.checkX = u.x;
    mv.checkY = u.y;
    mv.checkTick = tick;
    if (moved >= expected * 0.25) {
      mv.repaths = 0;
      continue;
    }
    mv.repaths++;
    const goal = mv.goal;
    const near =
      goal.kind === 'point' ? Math.hypot(u.x - goal.x, u.y - goal.y) < 2.0 : atRect(u, goal);
    if (near) {
      mv.state = goalReached(u, goal) || goal.kind === 'point' ? 'arrived' : 'failed';
    } else if (mv.repaths > CONFIG.movement.maxRepaths) {
      mv.state = goal.kind === 'point' ? 'arrived' : 'failed';
    } else {
      planPath(game, u);
    }
  }
}

function separate(game: Game, units: Unit[]): void {
  const solid = units.filter((u) => !u.hidden && !isGhost(u));
  if (solid.length < 2) return;
  const cells = new Map<number, Unit[]>();
  const W = game.nav.w;
  for (const u of solid) {
    const k = Math.floor(u.y) * W + Math.floor(u.x);
    const list = cells.get(k);
    if (list) list.push(u);
    else cells.set(k, [u]);
  }
  // Pushes are summed first and applied together, so the result never
  // depends on which unit happens to be processed first (entity ids, and so
  // player seats, must not matter).
  const shifts = new Map<number, { x: number; y: number }>();
  const push = (u: Unit, x: number, y: number) => {
    const p = shifts.get(u.id);
    if (p) {
      p.x += x;
      p.y += y;
    } else shifts.set(u.id, { x, y });
  };
  for (const a of solid) {
    const ax = Math.floor(a.x);
    const ay = Math.floor(a.y);
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const list = cells.get((ay + oy) * W + ax + ox);
        if (!list) continue;
        for (const b of list) {
          if (b.id <= a.id) continue;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          const min = a.radius + b.radius;
          if (d >= min) continue;
          if (d < 1e-6) {
            // Deterministic split direction for exactly coincident units.
            const ang = ((a.id * 7919 + b.id * 104729) % 628) / 100;
            dx = Math.cos(ang);
            dy = Math.sin(ang);
          } else {
            dx /= d;
            dy /= d;
          }
          const overlap = Math.min(min - d, 0.2);
          const aMoving = a.move?.state === 'moving';
          const bMoving = b.move?.state === 'moving';
          // Movers mostly shove idle units aside rather than being blocked.
          let wa = aMoving === bMoving ? 0.5 : aMoving ? 0.2 : 0.8;
          // Units holding position are never shoved.
          if (a.order?.type === 'hold') wa = b.order?.type === 'hold' ? 0.5 : 0;
          else if (b.order?.type === 'hold') wa = 1;
          push(a, -dx * overlap * wa, -dy * overlap * wa);
          push(b, dx * overlap * (1 - wa), dy * overlap * (1 - wa));
        }
      }
  }
  for (const u of solid) {
    const p = shifts.get(u.id);
    if (p) tryShift(game, u, p.x, p.y);
  }
}

/** Walking speed: the unit's own, or its group's pace while marching together. */
export function moveSpeed(u: Unit): number {
  const speed = (CONFIG.units[u.type].speed + itemBonus(u, 'speed')) * (1 - buffAmount(u, 'slow'));
  const o = u.order;
  if (o?.type === 'move' && o.pace) return Math.min(speed, o.pace);
  if (o?.type === 'attackMove' && o.pace && o.targetId < 0) return Math.min(speed, o.pace);
  return speed;
}
