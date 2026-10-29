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
//   homing projectile that deals damage on arrival. Siege boulders instead
//   fly to where the target stood and splash everything there.
// - Damage = raw x type multiplier (attack type vs armor type, see
//   CONFIG.combat.typeTable), then reduced by armor.

import { CONFIG, secondsToTicks, TICK_SECONDS, type AttackType, type UnitType } from './config';
import type { Game } from './game';
import { distToRect } from './movement';
import { buffAmount, onHeroDeath, onKill } from './hero';
import { onCampGuardDeath } from './items';
import { destroyBuilding } from './production';
import { armorTypeOf, armorValue, attackDamage, attackRange, typeMultiplier } from './tech';
import type { Building, Entity, Order, Unit } from './types';
import { datan2, dcos, dsin, len } from './dmath';

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
  // Neutral map objectives (Trading Posts, Fountains) cannot be attacked.
  if (e.kind === 'building') return CONFIG.buildings[e.type].buildable;
  return !e.hidden;
}

/** Edge-to-edge distance from a unit to a target. */
export function gap(u: Unit, t: Target): number {
  if (t.kind === 'unit') return len(t.x - u.x, t.y - u.y) - u.radius - t.radius;
  return distToRect(u.x, u.y, t) - u.radius;
}


export function damageAfterArmor(raw: number, armor: number): number {
  return Math.max(1, Math.round(raw / (1 + armor * CONFIG.combat.armorFactor)));
}

/**
 * Best enemy near (x, y) within `range` (edge distance from `u`): units that
 * can fight first, then other units, then buildings (siege: buildings first);
 * nearest wins, ties by id.
 */
export function findTarget(game: Game, u: Unit, range: number): Target | undefined {
  let best: Target | undefined;
  let bestKey = Infinity;
  const minRange = attackDef(u).minRange;
  const siege = attackDef(u).type === 'siege';
  const scan = (list: readonly Target[]) => {
    for (const e of list) consider(e);
  };
  const consider = (e: Target) => {
    if (!isEnemy(game, u.owner, e.owner) || !targetable(e) || !game.vision.canSee(u.owner, e)) return;
    const d = gap(u, e);
    if (d > range || d < minRange) return;
    // Siege engines go for buildings first; everyone else for fighters first.
    const tier = siege ? (e.kind === 'building' ? 0 : canAttack(e) ? 1 : 2) : e.kind === 'unit' ? (canAttack(e) ? 0 : 1) : 2;
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
  u.order = { type: 'attack', targetId: target.id, auto: true, anchorX: anchor.x, anchorY: anchor.y, lastX: target.x, lastY: target.y };
  u.move = null;
}

/**
 * Move into range of the target and fight. Returns false when the target is
 * gone (the caller decides what happens next).
 */
function fight(game: Game, u: Unit, targetId: number, mayMove: boolean): boolean {
  const t = game.get(targetId);
  // Units out of sight are lost; buildings, once seen, stay known.
  if (!targetable(t) || !isEnemy(game, u.owner, t.owner) || !game.vision.knows(u.owner, t)) return false;
  const def = attackDef(u);
  const d = gap(u, t);
  if (d < def.minRange) {
    // Too close for a siege engine: back off (or give up when holding).
    if (!mayMove) return false;
    const away = datan2(u.y - t.y, u.x - t.x);
    const back = def.minRange + 1.5;
    game.moveTo(u, { kind: 'point', x: t.x + dcos(away) * (back + (t.kind === 'unit' ? t.radius : t.w / 2)), y: t.y + dsin(away) * (back + (t.kind === 'unit' ? t.radius : t.w / 2)) });
    return true;
  }
  if (d <= attackRange(game, u)) {
    u.move = null;
    u.facing = datan2(t.y - u.y, t.x - u.x);
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
    if (!g || g.kind !== 'point' || len(g.x - t.x, g.y - t.y) > 0.75 || u.move?.state !== 'moving') {
      u.move = null;
      game.moveTo(u, { kind: 'point', x: t.x, y: t.y });
    }
  }
  return true;
}

function returnTo(u: Unit, x: number, y: number): void {
  u.order = len(u.x - x, u.y - y) > 0.5 ? { type: 'move', x, y } : null;
  u.move = null;
}

/** Per-tick logic for units with combat orders, and idle auto-acquisition. */
export function updateCombatOrder(game: Game, u: Unit): void {
  const o = u.order;
  const def = attackDef(u);
  // Everyone scans on the same ticks: staggering by id would let one seat's
  // units (which have different ids from their mirror twins) react first.
  const scan = game.state.tick % CONFIG.combat.scanTicks === 0;

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
      if (len(u.x - o.anchorX, u.y - o.anchorY) > leash) return returnTo(u, o.anchorX, o.anchorY);
    }
    const t = game.get(o.targetId);
    if (t?.kind === 'unit' && targetable(t) && isEnemy(game, u.owner, t.owner)) {
      if (game.vision.canSee(u.owner, t)) {
        o.lastX = t.x;
        o.lastY = t.y;
      } else if (!o.auto && len(u.x - o.lastX, u.y - o.lastY) > 1) {
        // Ordered pursuit: head for where the target was last seen.
        if (!u.move || u.move.state !== 'moving') game.moveTo(u, { kind: 'point', x: o.lastX, y: o.lastY });
        return;
      }
    }
    if (fight(game, u, o.targetId, true)) return;
    // Target gone: soldiers fight on against the nearest enemy they can see
    // (within their sight, not just their short acquire range), leashed to
    // where this fight is. Camp guards keep their short reach; Laborers and
    // units with Shift-queued orders stop and carry on with their queue.
    const reach = u.home ? def.acquire : Math.max(def.acquire, CONFIG.units[u.type].sight);
    const next = def.acquire > 0 && u.orderQueue.length === 0 ? findTarget(game, u, reach) : undefined;
    if (o.auto) {
      if (next) o.targetId = next.id;
      else returnTo(u, o.anchorX, o.anchorY);
    } else if (next) {
      engage(u, next);
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
      if (targetable(t) && gap(u, t) <= Math.max(def.acquire, attackRange(game, u)) * 1.5 && fight(game, u, o.targetId, true)) return;
      o.targetId = -1;
      u.move = null;
    }
    if (scan) {
      const t = findTarget(game, u, Math.max(def.acquire, attackRange(game, u)));
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
      if (targetable(t) && gap(u, t) <= attackRange(game, u) && fight(game, u, o.targetId, false)) return;
      o.targetId = -1;
    }
    const t = findTarget(game, u, attackRange(game, u));
    if (t) {
      o.targetId = t.id;
      fight(game, u, t.id, false);
    }
  }
}

/** Apply damage, emit feedback, trigger retaliation, and kill at 0 HP. */
export function dealDamage(game: Game, attackerId: number, attackerOwner: number, t: Target, raw: number, type: AttackType): void {
  const marked = t.kind === 'unit' ? 1 + buffAmount(t, 'mark') : 1;
  const dmg = damageAfterArmor(raw * typeMultiplier(type, armorTypeOf(t)) * marked, armorValue(game, t));
  t.hp -= dmg;
  t.hurt = game.state.tick;
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
  if (victim && t.kind === 'unit') victim.stats.lost[t.type] = (victim.stats.lost[t.type] ?? 0) + 1;
  onKill(game, attackerOwner, t);
  if (t.kind === 'building') {
    destroyBuilding(game, t.id);
    return;
  }
  if (t.hero) onHeroDeath(game, t);
  if (t.camp >= 0) onCampGuardDeath(game, t, attackerOwner);
  game.emit({ type: 'death', id: t.id, owner: t.owner, unit: t.type as UnitType, x: t.x, y: t.y });
  game.removeEntity(t.id);
}

/** A blow that lands this tick; all of them are applied together. */
interface Blow {
  sourceId: number;
  owner: number;
  targetId: number;
  damage: number;
  type: AttackType;
}

/**
 * Cooldowns, swings landing, towers and projectiles. Runs once per tick.
 * Everything that lands in a tick is collected first and applied together,
 * so update order (entity ids, and therefore player seats) never decides
 * who strikes first: two units that kill each other both land their blow.
 */
export function updateCombat(game: Game, units: Unit[]): void {
  const blows: Blow[] = [];
  for (const u of units) {
    if (!game.state.entities[u.id]) continue;
    if (u.cooldown > 0) u.cooldown--;
    if (u.swing === 0) continue;
    if (u.stun > 0) {
      u.swing = 0; // a stun interrupts the attack
      continue;
    }
    // A swing is abandoned if the unit's orders moved on to something else.
    if (targetOf(u.order) !== u.swingTarget) {
      u.swing = 0;
      continue;
    }
    if (--u.swing > 0) continue;
    const def = attackDef(u);
    // Slowed units recover between attacks more slowly.
    u.cooldown = Math.max(1, Math.round(secondsToTicks(def.cooldown) * (1 + buffAmount(u, 'slow'))) - secondsToTicks(def.windup));
    const t = game.get(u.swingTarget);
    if (!targetable(t) || gap(u, t) > attackRange(game, u) + CONFIG.combat.swingSlack) continue;
    const damage = attackDamage(game, u);
    if (def.projectileSpeed > 0) launch(game, u.id, u.owner, u.x, u.y, t, def.projectileSpeed, damage, def.type, def.splash);
    else blows.push({ sourceId: u.id, owner: u.owner, targetId: t.id, damage, type: def.type });
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
    launch(game, b.id, b.owner, b.x, b.y, t, def.projectileSpeed, def.damage, def.type, 0);
    b.cooldown = secondsToTicks(def.cooldown);
  }

  const landings = updateProjectiles(game);
  for (const b of blows) {
    const t = game.get(b.targetId);
    if (targetable(t)) dealDamage(game, b.sourceId, b.owner, t, b.damage, b.type);
  }
  for (const land of landings) land();
}

function towerGap(b: Building, t: Target): number {
  return t.kind === 'unit' ? distToRect(t.x, t.y, b) - t.radius : distToRect(t.x, t.y, b);
}

function towerTarget(game: Game, b: Building, range: number): Target | undefined {
  let best: Target | undefined;
  let bestD = Infinity;
  for (const u of game.units()) {
    if (!isEnemy(game, b.owner, u.owner) || !targetable(u) || !game.vision.canSee(b.owner, u)) continue;
    const d = towerGap(b, u);
    if (d <= range && d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

function launch(
  game: Game,
  sourceId: number,
  owner: number,
  x: number,
  y: number,
  t: Target,
  speed: number,
  damage: number,
  attackType: AttackType,
  splash: number,
): void {
  const kind = attackType === 'siege' ? 'boulder' : attackType === 'magic' ? 'bolt' : 'arrow';
  game.state.projectiles.push({ id: game.state.nextId++, owner, sourceId, targetId: t.id, x, y, px: x, py: y, speed, damage, kind, attackType, stun: 0, splash, tx: t.x, ty: t.y });
}

/** Area damage around (x, y): full at the centre, half at the edge. Enemies only. */
function splashDamage(game: Game, p: { sourceId: number; owner: number; damage: number; attackType: AttackType; splash: number }, x: number, y: number): void {
  const victims: Array<{ t: Target; d: number }> = [];
  for (const u of game.units()) {
    if (!isEnemy(game, p.owner, u.owner) || !targetable(u)) continue;
    const d = Math.max(0, len(u.x - x, u.y - y) - u.radius);
    if (d <= p.splash) victims.push({ t: u, d });
  }
  for (const b of game.buildings()) {
    if (!isEnemy(game, p.owner, b.owner)) continue;
    const d = distToRect(x, y, b);
    if (d <= p.splash) victims.push({ t: b, d });
  }
  for (const { t, d } of victims) {
    if (!game.state.entities[t.id]) continue;
    dealDamage(game, p.sourceId, p.owner, t, p.damage * (1 - 0.5 * (d / p.splash)), p.attackType);
  }
  game.emit({ type: 'impact', x, y, radius: p.splash });
}

/** Move projectiles; returns the hits that land this tick, to apply after melee blows. */
function updateProjectiles(game: Game): Array<() => void> {
  const landings: Array<() => void> = [];
  const keep = [];
  for (const p of game.state.projectiles) {
    p.px = p.x;
    p.py = p.y;
    if (p.splash > 0) {
      // Ground-targeted: fly to the spot, then burst.
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = len(dx, dy);
      const step = p.speed * TICK_SECONDS;
      if (d <= step) {
        p.x = p.tx;
        p.y = p.ty;
        landings.push(() => splashDamage(game, p, p.tx, p.ty));
        continue;
      }
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
      keep.push(p);
      continue;
    }
    const t = game.get(p.targetId);
    if (!targetable(t)) continue; // target died or hid: the shot fizzles
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const d = len(dx, dy);
    const step = p.speed * TICK_SECONDS;
    if (d <= step + (t.kind === 'unit' ? t.radius : 0.5)) {
      p.x = t.x;
      p.y = t.y;
      landings.push(() => {
        if (!targetable(game.get(t.id))) return;
        if (p.stun > 0 && t.kind === 'unit') {
          t.stun = Math.max(t.stun, p.stun);
          t.swing = 0;
        }
        dealDamage(game, p.sourceId, p.owner, t, p.damage, p.attackType);
      });
      continue;
    }
    p.x += (dx / d) * step;
    p.y += (dy / d) * step;
    keep.push(p);
  }
  game.state.projectiles = keep;
  return landings;
}
