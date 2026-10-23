// Combat: targeting, chasing, attack wind-up and cooldown, projectiles,
// armor, death and building destruction.
//
// Behaviour summary (all players, including neutral camps):
// - attack: chase a specific target until it dies. Auto-engagements (idle
//   units reacting to enemies or to being hit) are leashed: past the leash
//   distance from where they started, units give up and walk back.
// - attackMove: walk to a point, engaging any enemy met on the way, then resume.
// - hold: never move; attack anything that comes within weapon range.
// - move: ignore enemies entirely (used to retreat).
// - Idle units with an acquire range engage enemies that come close. Units
//   that are hit while idle strike back if they can fight.
// - Melee damage lands at the end of the wind-up; ranged attacks launch a
//   homing projectile that deals damage on arrival.

import { CONFIG, secondsToTicks, TICK_SECONDS, type UnitType } from './config';
import type { Game } from './game';
import { distToRect } from './movement';
import { destroyBuilding } from './production';
import type { Building, Entity, Order, Unit } from './types';

type Target = Unit | Building;

export function isEnemy(game: Game, a: number, b: number): boolean {
  if (a < 0 || b < 0 || a === b) return false;
  return !!game.state.players[a] && !!game.state.players[b];
}

export function attackDef(u: Unit) {
  return CONFIG.units[u.type].attack;
}

export function canAttack(u: Unit): boolean {
  return attackDef(u).damage > 0;
}

/** Can `e` be targeted at all? (Units inside mines cannot.) */
export function targetable(e: Entity | undefined): e is Target {
  if (!e || e.kind === 'resource') return false;
  return e.kind === 'building' || !e.hidden;
}

/** Edge-to-edge distance from a unit to a target. */
export function gap(u: Unit, t: Target): number {
  if (t.kind === 'unit') return Math.hypot(t.x - u.x, t.y - u.y) - u.radius - t.radius;
  return distToRect(u.x, u.y, t) - u.radius;
}

function armorOf(t: Target): number {
  return t.kind === 'unit' ? CONFIG.units[t.type].armor : CONFIG.combat.buildingArmor;
}

export function damageAfterArmor(raw: number, armor: number): number {
  return Math.max(1, Math.round(raw / (1 + armor * CONFIG.combat.armorFactor)));
}

/**
 * Best enemy near (x, y) within `range` (edge distance from `u`): units that
 * can fight first, then other units, then buildings; nearest wins, ties by id.
 */
export function findTarget(game: Game, u: Unit, range: number): Target | undefined {
  let best: Target | undefined;
  let bestKey = Infinity;
  const scan = (list: readonly Target[]) => {
    for (const e of list) consider(e);
  };
  const consider = (e: Target) => {
    if (!isEnemy(game, u.owner, e.owner) || !targetable(e)) return;
    const d = gap(u, e);
    if (d > range) return;
    const tier = e.kind === 'unit' ? (canAttack(e) ? 0 : 1) : 2;
    const key = tier * 1000 + d;
    if (key < bestKey) {
      bestKey = key;
      best = e;
    }
  };
  // Units before buildings keeps the same id-ordered tie-breaking per tier.
  scan(game.units());
  scan(game.buildings());
  return best;
}

function targetOf(o: Order | null): number {
  if (!o) return -1;
  if (o.type === 'attack' || o.type === 'attackMove' || o.type === 'hold') return o.targetId;
  return -1;
}

/** Order an automatic engagement, remembering where to come back to. */
export function engage(u: Unit, target: Target): void {
  const anchor = u.home ?? { x: u.x, y: u.y };
  u.order = { type: 'attack', targetId: target.id, auto: true, anchorX: anchor.x, anchorY: anchor.y };
  u.move = null;
}

/**
 * Move into range of the target and fight. Returns false when the target is
 * gone (the caller decides what happens next).
 */
function fight(game: Game, u: Unit, targetId: number, mayMove: boolean): boolean {
  const t = game.get(targetId);
  if (!targetable(t) || !isEnemy(game, u.owner, t.owner)) return false;
  const def = attackDef(u);
  const d = gap(u, t);
  if (d <= def.range) {
    u.move = null;
    u.facing = Math.atan2(t.y - u.y, t.x - u.x);
    if (u.swing === 0 && u.cooldown <= 0) {
      u.swing = secondsToTicks(def.windup);
      u.swingTarget = t.id;
      game.emit({ type: 'attack', id: u.id });
    }
    return true;
  }
  if (!mayMove) return true;
  if (t.kind === 'building') {
    game.moveTo(u, { kind: 'rect', tx: t.tx, ty: t.ty, w: t.w, h: t.h });
  } else {
    // Re-plan only when the target has drifted from the planned goal.
    const g = u.move?.goal;
    if (!g || g.kind !== 'point' || Math.hypot(g.x - t.x, g.y - t.y) > 0.75 || u.move?.state !== 'moving') {
      u.move = null;
      game.moveTo(u, { kind: 'point', x: t.x, y: t.y });
    }
  }
  return true;
}

function returnTo(u: Unit, x: number, y: number): void {
  u.order = Math.hypot(u.x - x, u.y - y) > 0.5 ? { type: 'move', x, y } : null;
  u.move = null;
}

/** Per-tick logic for units with combat orders, and idle auto-acquisition. */
export function updateCombatOrder(game: Game, u: Unit): void {
  const o = u.order;
  const def = attackDef(u);
  const scan = (game.state.tick + u.id) % CONFIG.combat.scanTicks === 0;

  if (o === null) {
    if (def.acquire > 0 && scan && !u.hidden) {
      const t = findTarget(game, u, def.acquire);
      if (t) engage(u, t);
    }
    return;
  }

  if (o.type === 'attack') {
    if (o.auto) {
      const leash = u.home ? CONFIG.combat.campLeash : CONFIG.combat.leash;
      if (Math.hypot(u.x - o.anchorX, u.y - o.anchorY) > leash) return returnTo(u, o.anchorX, o.anchorY);
    }
    if (fight(game, u, o.targetId, true)) return;
    // Target gone: auto-engaged units look for the next one nearby, then go home.
    if (o.auto) {
      const t = def.acquire > 0 ? findTarget(game, u, def.acquire) : undefined;
      if (t) o.targetId = t.id;
      else returnTo(u, o.anchorX, o.anchorY);
    } else {
      u.order = null;
      u.move = null;
    }
    return;
  }

  if (o.type === 'attackMove') {
    if (o.targetId >= 0) {
      const t = game.get(o.targetId);
      // Drop targets that died or ran far away, then carry on.
      if (targetable(t) && gap(u, t) <= Math.max(def.acquire, def.range) * 1.5 && fight(game, u, o.targetId, true)) return;
      o.targetId = -1;
      u.move = null;
    }
    if (scan) {
      const t = findTarget(game, u, Math.max(def.acquire, def.range));
      if (t) {
        o.targetId = t.id;
        u.move = null;
        fight(game, u, t.id, true);
        return;
      }
    }
    if (!u.move) game.moveTo(u, { kind: 'point', x: o.x, y: o.y });
    else if (u.move.state !== 'moving') {
      u.order = null;
      u.move = null;
    }
    return;
  }

  if (o.type === 'hold') {
    u.move = null;
    if (o.targetId >= 0) {
      const t = game.get(o.targetId);
      if (targetable(t) && gap(u, t) <= def.range && fight(game, u, o.targetId, false)) return;
      o.targetId = -1;
    }
    const t = findTarget(game, u, def.range);
    if (t) {
      o.targetId = t.id;
      fight(game, u, t.id, false);
    }
  }
}

/** Apply damage, emit feedback, trigger retaliation, and kill at 0 HP. */
export function dealDamage(game: Game, attackerId: number, attackerOwner: number, t: Target, raw: number): void {
  const dmg = damageAfterArmor(raw, armorOf(t));
  t.hp -= dmg;
  game.emit({ type: 'hit', id: t.id, attacker: attackerId, attackerOwner, owner: t.owner, damage: dmg, x: t.x, y: t.y });
  if (t.hp <= 0) {
    kill(game, t, attackerOwner);
    return;
  }
  // Idle fighters strike back at whoever hit them.
  if (t.kind === 'unit' && t.order === null && canAttack(t) && attackDef(t).acquire > 0) {
    const a = game.get(attackerId);
    if (targetable(a) && isEnemy(game, t.owner, attackerOwner)) engage(t, a);
  }
}

export function kill(game: Game, t: Target, attackerOwner: number): void {
  const victim = game.state.players[t.owner];
  const killer = game.state.players[attackerOwner];
  if (killer) killer.stats.kills++;
  if (victim) victim.stats[t.kind === 'building' ? 'buildingsLost' : 'unitsLost']++;
  if (t.kind === 'building') {
    destroyBuilding(game, t.id);
    return;
  }
  game.emit({ type: 'death', id: t.id, owner: t.owner, unit: t.type as UnitType, x: t.x, y: t.y });
  game.removeEntity(t.id);
}

/** Cooldowns, swings landing, towers and projectiles. Runs once per tick. */
export function updateCombat(game: Game, units: Unit[]): void {
  for (const u of units) {
    if (!game.state.entities[u.id]) continue;
    if (u.cooldown > 0) u.cooldown--;
    if (u.swing === 0) continue;
    // A swing is abandoned if the unit's orders moved on to something else.
    if (targetOf(u.order) !== u.swingTarget) {
      u.swing = 0;
      continue;
    }
    if (--u.swing > 0) continue;
    const def = attackDef(u);
    u.cooldown = Math.max(1, secondsToTicks(def.cooldown) - secondsToTicks(def.windup));
    const t = game.get(u.swingTarget);
    if (!targetable(t) || gap(u, t) > def.range + CONFIG.combat.swingSlack) continue;
    if (def.projectileSpeed > 0) launch(game, u.id, u.owner, u.x, u.y, t.id, def.projectileSpeed, def.damage);
    else dealDamage(game, u.id, u.owner, t, def.damage);
  }

  for (const b of game.buildings()) {
    const def = CONFIG.buildings[b.type].attack;
    if (!def || b.progress < 1) continue;
    if (b.cooldown > 0) {
      b.cooldown--;
      continue;
    }
    let t = game.get(b.targetId);
    if (!targetable(t) || !isEnemy(game, b.owner, t.owner) || towerGap(b, t) > def.range) {
      t = towerTarget(game, b, def.range);
      b.targetId = t ? t.id : -1;
    }
    if (!t || !targetable(t)) continue;
    launch(game, b.id, b.owner, b.x, b.y, t.id, def.projectileSpeed, def.damage);
    b.cooldown = secondsToTicks(def.cooldown);
  }

  updateProjectiles(game);
}

function towerGap(b: Building, t: Target): number {
  return t.kind === 'unit' ? distToRect(t.x, t.y, b) - t.radius : distToRect(t.x, t.y, b);
}

function towerTarget(game: Game, b: Building, range: number): Target | undefined {
  let best: Target | undefined;
  let bestD = Infinity;
  for (const u of game.units()) {
    if (!isEnemy(game, b.owner, u.owner) || !targetable(u)) continue;
    const d = towerGap(b, u);
    if (d <= range && d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

function launch(game: Game, sourceId: number, owner: number, x: number, y: number, targetId: number, speed: number, damage: number): void {
  game.state.projectiles.push({ id: game.state.nextId++, owner, sourceId, targetId, x, y, px: x, py: y, speed, damage });
}

function updateProjectiles(game: Game): void {
  const keep = [];
  for (const p of game.state.projectiles) {
    p.px = p.x;
    p.py = p.y;
    const t = game.get(p.targetId);
    if (!targetable(t)) continue; // target died or hid: the shot fizzles
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * TICK_SECONDS;
    if (d <= step + (t.kind === 'unit' ? t.radius : 0.5)) {
      p.x = t.x;
      p.y = t.y;
      dealDamage(game, p.sourceId, p.owner, t, p.damage);
      continue;
    }
    p.x += (dx / d) * step;
    p.y += (dy / d) * step;
    keep.push(p);
  }
  game.state.projectiles = keep;
}
