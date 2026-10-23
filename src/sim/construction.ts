// Building placement and construction. One model throughout:
//   1. A worker is ordered to build at a footprint and walks there.
//   2. On arrival placement and cost are re-checked; the cost is paid and a
//      foundation (progress 0) is placed. Units on the footprint are pushed out.
//   3. One active builder raises it; others ordered to it stand by. If the
//      builder leaves, construction pauses until a worker resumes it.
//   4. Cancelling an unfinished building refunds CONFIG.construction.cancelRefund.
// Unfinished buildings provide no population and accept no deliveries.

import { CONFIG, secondsToTicks, type BuildingType } from './config';
import type { Game } from './game';
import { releaseFromNode, startGather } from './gathering';
import { atRect, distToRect } from './movement';
import type { Building, Footprint, Order, Unit } from './types';

type BuildOrder = Extract<Order, { type: 'build' }>;

export interface PlacementCheck {
  ok: boolean;
  /** Per-tile validity, row-major over the footprint. */
  tiles: boolean[];
  reason: string | null;
}

export function buildingSize(type: BuildingType): number {
  return CONFIG.buildings[type].size;
}

/** Footprint whose center is nearest the given world point (tile-snapped). */
export function snapFootprint(type: BuildingType, x: number, y: number): Footprint {
  const s = buildingSize(type);
  return { tx: Math.round(x - s / 2), ty: Math.round(y - s / 2), w: s, h: s };
}

/**
 * Terrain and static objects must leave every footprint tile free. Units do
 * not block placement; they are moved aside when the foundation is laid.
 */
export function checkPlacement(game: Game, type: BuildingType, tx: number, ty: number): PlacementCheck {
  const s = buildingSize(type);
  const tiles: boolean[] = [];
  let outside = false;
  let blocked = false;
  for (let y = ty; y < ty + s; y++)
    for (let x = tx; x < tx + s; x++) {
      const inside = game.nav.inBounds(x, y);
      const ok = inside && game.nav.passable(x, y);
      if (!inside) outside = true;
      else if (!ok) blocked = true;
      tiles.push(ok);
    }
  const reason = outside ? 'Outside the map.' : blocked ? 'Something is in the way.' : null;
  return { ok: reason === null, tiles, reason };
}

export function canAfford(game: Game, player: number, type: BuildingType): boolean {
  const p = game.player(player);
  const c = CONFIG.buildings[type].cost;
  return p.gold >= c.gold && p.wood >= c.wood;
}

export function shortfall(game: Game, player: number, type: BuildingType): string | null {
  const p = game.player(player);
  const c = CONFIG.buildings[type].cost;
  if (p.gold < c.gold) return `Not enough gold (${c.gold} needed).`;
  if (p.wood < c.wood) return `Not enough wood (${c.wood} needed).`;
  return null;
}

export function isComplete(b: Building): boolean {
  return b.progress >= 1;
}

/** The gathering job a worker was doing, so it can return to it after building. */
function previousJob(u: Unit): number {
  const o = u.order;
  if (o?.type === 'gather') return o.nodeId;
  if (o?.type === 'build') return o.resumeNodeId;
  return -1;
}

export function startBuild(game: Game, u: Unit, type: BuildingType, tx: number, ty: number): void {
  const resumeNodeId = previousJob(u);
  releaseFromNode(game, u);
  u.order = { type: 'build', buildingType: type, tx, ty, siteId: -1, phase: 'toSite', resumeNodeId };
  u.move = null;
}

export function resumeBuild(game: Game, u: Unit, site: Building): void {
  if (isComplete(site) || site.owner !== u.owner) return;
  const resumeNodeId = previousJob(u);
  releaseFromNode(game, u);
  u.order = { type: 'build', buildingType: site.type, tx: site.tx, ty: site.ty, siteId: site.id, phase: 'toSite', resumeNodeId };
  u.move = null;
}

export function cancelConstruction(game: Game, player: number, id: number): void {
  const b = game.building(id);
  if (!b || b.owner !== player || isComplete(b)) return;
  const c = CONFIG.buildings[b.type].cost;
  const p = game.player(player);
  p.gold += Math.floor(c.gold * CONFIG.construction.cancelRefund);
  p.wood += Math.floor(c.wood * CONFIG.construction.cancelRefund);
  game.removeEntity(id);
  game.emit({ type: 'constructionCancelled', player, x: b.x, y: b.y });
}

function activeBuilder(game: Game, siteId: number, except: Unit): Unit | undefined {
  for (const w of game.units()) {
    const o = w.order;
    if (w !== except && o?.type === 'build' && o.siteId === siteId && o.phase === 'building') return w;
  }
  return undefined;
}

/** Push units off a footprint to the nearest spot where they can stand. */
export function ejectUnits(game: Game, f: Footprint): void {
  for (const u of game.units()) {
    if (u.hidden || distToRect(u.x, u.y, f) >= u.radius) continue;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let ring = 1; ring <= 16 && !best; ring++) {
      const n = ring * 8;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = u.x + Math.cos(a) * ring * 0.5;
        const y = u.y + Math.sin(a) * ring * 0.5;
        if (!game.nav.canStand(x, y, u.radius)) continue;
        const d = Math.hypot(x - u.x, y - u.y);
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    if (best) {
      u.x = best.x;
      u.y = best.y;
    }
  }
}

function fail(game: Game, u: Unit, reason: string, x: number, y: number): void {
  game.emit({ type: 'cantBuild', player: u.owner, reason, x, y });
  u.order = null;
  u.move = null;
}

export function updateBuilder(game: Game, u: Unit, o: BuildOrder): void {
  const def = CONFIG.buildings[o.buildingType];
  let site = o.siteId >= 0 ? game.building(o.siteId) : undefined;
  if (o.siteId >= 0 && (!site || isComplete(site))) {
    finish(game, u, o);
    return;
  }
  const f: Footprint = site ?? { tx: o.tx, ty: o.ty, w: def.size, h: def.size };

  if (o.phase === 'toSite') {
    if (!atRect(u, f)) {
      game.moveTo(u, { kind: 'rect', tx: f.tx, ty: f.ty, w: f.w, h: f.h });
      if (u.move?.state === 'failed') fail(game, u, 'The site cannot be reached.', f.tx + f.w / 2, f.ty + f.h / 2);
      return;
    }
    u.move = null;
    if (!site) {
      const check = checkPlacement(game, o.buildingType, o.tx, o.ty);
      if (!check.ok) return fail(game, u, check.reason!, o.tx + def.size / 2, o.ty + def.size / 2);
      const short = shortfall(game, u.owner, o.buildingType);
      if (short) return fail(game, u, short, o.tx + def.size / 2, o.ty + def.size / 2);
      const p = game.player(u.owner);
      p.gold -= def.cost.gold;
      p.wood -= def.cost.wood;
      site = game.addBuilding(o.buildingType, u.owner, o.tx, o.ty, 0);
      ejectUnits(game, site);
      o.siteId = site.id;
    }
    o.phase = activeBuilder(game, site.id, u) ? 'standby' : 'building';
    return;
  }

  if (!site) return;
  if (!atRect(u, site)) {
    o.phase = 'toSite';
    return;
  }
  u.facing = Math.atan2(site.y - u.y, site.x - u.x);
  if (o.phase === 'standby') {
    if (!activeBuilder(game, site.id, u)) o.phase = 'building';
    return;
  }
  const ticks = secondsToTicks(def.buildSeconds);
  site.progress = Math.min(1, site.progress + 1 / ticks);
  site.hp = Math.min(site.maxHp, site.hp + (site.maxHp * (1 - CONFIG.construction.startHpFraction)) / ticks);
  if (site.progress >= 1 - 1e-9) {
    site.progress = 1;
    site.hp = Math.min(site.maxHp, Math.round(site.hp));
    game.emit({ type: 'buildingComplete', player: site.owner, id: site.id, x: site.x, y: site.y });
    finish(game, u, o);
  }
}

/** Done (or the site is gone): go back to the previous gathering job, if any. */
function finish(game: Game, u: Unit, o: BuildOrder): void {
  u.order = null;
  u.move = null;
  const node = o.resumeNodeId >= 0 ? game.resource(o.resumeNodeId) : undefined;
  if (node) startGather(game, u, node);
}
