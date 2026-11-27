// Elite units: veterancy, specialization, animals and riders, and the unit
// skills of the specialists, riders, Musketeer and Shapeshifter.
//
// Rules (tuning in CONFIG.veterancy, specialize, mounts, mounting, skills):
// - Veterancy: troops earn experience for real fighting - damage dealt to
//   enemies, damage taken from them, and healing allies under attack. No
//   experience comes from friendly damage, from healing out of combat, or
//   (beyond a small cap) from neutral camps. It belongs to the unit, is kept
//   through specialization, mounting and shape-shifting, and dies with it.
// - Specialization: an eligible Guard or Thornguard walks to its faction's
//   building and, on arrival, pays and becomes the chosen specialist for good.
// - Mounting: a Bearwarden (Wolfkeeper) walks to a War Bear (Nature Wolf);
//   both hold still for a moment; then they are one unit. Health and
//   population are the sums; experience and cooldowns stay with the rider.
//   Dismounting splits health in proportion and needs a calm spell first.
//   Neither ever restores health or resets a cooldown.
// - Skills have cooldowns (no mana) kept per unit in `ready`.
//
// Mounting, specializing and shape-shifting change the unit's type in place,
// so the unit keeps its id: selection, control groups and orders aimed at it
// carry on. Everything here is deterministic (dmath, ids in ascending order).

import { CONFIG, secondsToTicks, TICK_SECONDS, type MountedType, type SkillId, type SpecId, type UnitType } from './config';
import { attackDef, dealDamage, isEnemy, targetable } from './combat';
import { unitRole } from './factions';
import type { Game } from './game';
import { atRect, distToRect } from './movement';
import type { Building, Order, Unit } from './types';
import { datan2, dcos, dsin, len } from './dmath';

type SkillOrder = Extract<Order, { type: 'skill' }>;
type MountOrder = Extract<Order, { type: 'mount' }>;
type SpecializeOrder = Extract<Order, { type: 'specialize' }>;

const V = () => CONFIG.veterancy;

// ---- who is who -------------------------------------------------------------------

const SPECIALISTS = new Set<UnitType>(Object.keys(CONFIG.specialize) as SpecId[]);
const MOUNTED = new Set<UnitType>(Object.keys(CONFIG.mounts) as MountedType[]);
const ELITE_TROOPS = new Set<UnitType>(['musketeer', 'shifter', 'panther']);
/** Animals fight on their own but earn no experience (it belongs to riders). */
const ANIMALS = new Set<UnitType>(Object.values(CONFIG.mounts).map((m) => m.animal as UnitType));
/** Fire only standing still: a step during the wind-up spoils the shot. */
const STATIONARY = new Set<UnitType>(['musketeer']);

/** Ordinary combat troops: the units that earn veterancy. */
export function isTroop(t: UnitType): boolean {
  if (SPECIALISTS.has(t) || MOUNTED.has(t) || ELITE_TROOPS.has(t)) return true;
  const r = unitRole(t);
  return r === 'melee' || r === 'ranged' || r === 'cavalry' || r === 'support' || r === 'siege';
}

export const isAnimal = (t: UnitType) => ANIMALS.has(t);
export const isMounted = (t: UnitType): t is MountedType => MOUNTED.has(t);
export const isSpecialist = (t: UnitType): t is SpecId => SPECIALISTS.has(t);
export const firesStationary = (t: UnitType) => STATIONARY.has(t);

/** The mounted unit a rider type becomes with an animal type, or null. */
export function mountFor(rider: UnitType, animal: UnitType): MountedType | null {
  for (const m of Object.keys(CONFIG.mounts) as MountedType[]) if (CONFIG.mounts[m].rider === rider && CONFIG.mounts[m].animal === animal) return m;
  return null;
}

/** The animal a rider type can mount, or null. */
export function animalFor(rider: UnitType): UnitType | null {
  for (const m of Object.values(CONFIG.mounts)) if (m.rider === rider) return m.animal as UnitType;
  return null;
}

/** Specializations open to a unit type (in config order). */
export function specOptions(t: UnitType): SpecId[] {
  return (Object.keys(CONFIG.specialize) as SpecId[]).filter((s) => CONFIG.specialize[s].from === t);
}

export function skillsOf(t: UnitType): SkillId[] {
  return (Object.keys(CONFIG.skills) as SkillId[]).filter((s) => (CONFIG.skills[s].units as readonly string[]).includes(t));
}

// ---- veterancy ----------------------------------------------------------------------

/** 0 Recruit, 1 Veteran, 2 Veteran ready to specialize (or a specialist). */
export function rankOf(u: Unit): number {
  if (!isTroop(u.type)) return 0;
  if (u.xp >= V().eligibleXp || isSpecialist(u.type) || isMounted(u.type)) return 2;
  return u.xp >= V().veteranXp ? 1 : 0;
}

export function rankName(u: Unit): string {
  const r = rankOf(u);
  if (r === 0) return 'Recruit';
  if (isSpecialist(u.type) || isMounted(u.type)) return 'Veteran specialist';
  return r === 2 && specOptions(u.type).length ? 'Veteran, ready to specialize' : 'Veteran';
}

export function vetDamageFactor(u: Unit): number {
  return rankOf(u) >= 1 ? 1 + V().damageBonus : 1;
}

export function vetArmor(u: Unit): number {
  return rankOf(u) >= 1 ? V().armorBonus : 0;
}

function gainVet(game: Game, u: Unit, amount: number, neutral: boolean): void {
  if (amount <= 0 || !isTroop(u.type) || !game.state.entities[u.id]) return;
  if (neutral) {
    amount = Math.min(amount, Math.max(0, V().neutralCap - u.nxp));
    if (amount <= 0) return;
    u.nxp += amount;
  }
  const before = rankOf(u);
  u.xp += amount;
  const after = rankOf(u);
  if (after > before) game.emit({ type: 'rankUp', player: u.owner, id: u.id, rank: after, x: u.x, y: u.y });
}

const neutralOwner = (game: Game, owner: number) => !!game.state.players[owner]?.neutral;

/** Damage landed (after armor and shields): credit the attacker and the victim. */
export function creditDamage(game: Game, attackerId: number, attackerOwner: number, t: Unit | Building, dmg: number): void {
  if (dmg <= 0 || !isEnemy(game, attackerOwner, t.owner)) return;
  const a = game.unit(attackerId);
  if (a && a.owner === attackerOwner) gainVet(game, a, dmg * (t.kind === 'unit' ? V().perDamage : V().perBuildingDamage), neutralOwner(game, t.owner));
  if (t.kind === 'unit') gainVet(game, t, dmg * V().perDamageTaken, neutralOwner(game, attackerOwner));
}

/** The killing blow: a share of the victim's worth to whoever landed it. */
export function creditKill(game: Game, attackerId: number, attackerOwner: number, t: Unit | Building): void {
  const a = game.unit(attackerId);
  if (!a || a.owner !== attackerOwner || t.kind !== 'unit' || !isEnemy(game, attackerOwner, t.owner)) return;
  gainVet(game, a, CONFIG.units[t.type].xp * V().killShare, neutralOwner(game, t.owner));
}

/** Healing counts only for a patient hurt recently (a real fight), never for the healer itself. */
export function creditHeal(game: Game, healer: Unit, patient: Unit, amount: number): void {
  if (healer.id === patient.id || amount <= 0) return;
  if (game.state.tick - patient.hurt > secondsToTicks(V().combatSeconds)) return;
  gainVet(game, healer, amount * V().perHeal, false);
}

// ---- in-combat effects used by the combat rules ------------------------------------

/** Bark Shield soaks damage first; returns what gets through. */
export function absorb(t: Unit, dmg: number): number {
  for (const b of t.buffs) {
    if (b.kind !== 'shield' || b.amount <= 0) continue;
    const used = Math.min(b.amount, dmg);
    b.amount -= used;
    dmg -= used;
  }
  if (t.buffs.some((b) => b.kind === 'shield' && b.amount <= 0)) t.buffs = t.buffs.filter((b) => b.kind !== 'shield' || b.amount > 0);
  return dmg;
}

export function stanceArmor(u: Unit): number {
  return u.stance ? CONFIG.skills.stance.armor : 0;
}

/** Multiplier on walking speed: Shield Stance slows; roots and dashes stop normal walking. */
export function speedFactor(u: Unit): number {
  if (u.dash) return 0;
  for (const b of u.buffs) if (b.kind === 'root') return 0;
  return u.stance ? CONFIG.skills.stance.speed : 1;
}

/** Extra share of attack cooldown (Shield Stance). */
export function attackSlow(u: Unit): number {
  return u.stance ? CONFIG.skills.stance.attackSlow : 0;
}

/** A stun or knock-down breaks whatever the unit was preparing. */
export function interrupt(game: Game, u: Unit): void {
  const o = u.order;
  if ((o?.type === 'skill' && o.phase === 'prepare') || (o?.type === 'mount' && o.phase === 'mounting')) {
    game.emit({ type: 'skill', player: u.owner, id: u.id, skill: o.type === 'skill' ? o.skill : 'mount', phase: 'cancel', targetId: o.targetId, x: u.x, y: u.y });
    u.order = null;
    u.move = null;
  }
  u.dash = null;
}

// ---- changing a unit's type ------------------------------------------------------

/** Become another type in place, keeping the share of health (no healing). */
function becomeType(u: Unit, type: UnitType, hp?: number, maxHp?: number): void {
  const share = u.hp / u.maxHp;
  u.type = type;
  u.maxHp = maxHp ?? CONFIG.units[type].hp;
  u.hp = hp ?? Math.max(1, Math.min(u.maxHp, Math.round(share * u.maxHp)));
  u.radius = CONFIG.units[type].radius;
  u.swing = 0;
  u.swingTarget = -1;
  u.stance = false;
  u.move = null;
}

// ---- specialization ----------------------------------------------------------------

/** Why unit `u` cannot specialize into `into` now (ignoring where it stands), or null. */
export function specializeProblem(game: Game, u: Unit, into: SpecId): string | null {
  const def = CONFIG.specialize[into];
  if (u.type !== def.from) return `Only a ${CONFIG.units[def.from as UnitType].name} can become a ${CONFIG.units[into].name}.`;
  if (u.xp < V().eligibleXp) return `Needs ${V().eligibleXp} experience (has ${Math.floor(u.xp)}).`;
  if (!specBuilding(game, u, into)) return `Needs a finished ${CONFIG.buildings[def.at as Building['type']].name}.`;
  const p = game.player(u.owner);
  if (p.gold < def.cost.gold) return `Not enough gold (${def.cost.gold} needed).`;
  if (p.wood < def.cost.wood) return `Not enough wood (${def.cost.wood} needed).`;
  return null;
}

/** The nearest finished building of the owner's where `into` is taught. */
export function specBuilding(game: Game, u: Unit, into: SpecId): Building | undefined {
  const at = CONFIG.specialize[into].at;
  let best: Building | undefined;
  let bestD = Infinity;
  for (const b of game.buildings()) {
    if (b.owner !== u.owner || b.type !== at || b.progress < 1) continue;
    const d = distToRect(u.x, u.y, b);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

export function orderSpecialize(game: Game, u: Unit, into: SpecId): void {
  const problem = specializeProblem(game, u, into);
  if (problem) {
    game.emit({ type: 'cantOrder', player: u.owner, reason: problem });
    return;
  }
  u.orderQueue = [];
  u.order = { type: 'specialize', into, buildingId: specBuilding(game, u, into)!.id };
  u.move = null;
}

export function updateSpecialize(game: Game, u: Unit, o: SpecializeOrder): void {
  let b = game.building(o.buildingId);
  if (!b || b.owner !== u.owner || b.progress < 1) {
    b = specBuilding(game, u, o.into);
    if (!b) {
      u.order = null;
      return;
    }
    o.buildingId = b.id;
  }
  if (!atRect(u, b)) {
    game.moveTo(u, { kind: 'rect', tx: b.tx, ty: b.ty, w: b.w, h: b.h });
    if (game.moveFailed(u, { kind: 'rect', tx: b.tx, ty: b.ty, w: b.w, h: b.h })) u.order = null;
    return;
  }
  const problem = specializeProblem(game, u, o.into);
  u.order = null;
  u.move = null;
  if (problem) {
    game.emit({ type: 'cantOrder', player: u.owner, reason: problem });
    return;
  }
  const cost = CONFIG.specialize[o.into].cost;
  const p = game.player(u.owner);
  p.gold -= cost.gold;
  p.wood -= cost.wood;
  becomeType(u, o.into);
  game.emit({ type: 'specialized', player: u.owner, id: u.id, into: o.into, x: u.x, y: u.y });
}

// ---- mounting --------------------------------------------------------------------

/** Why `rider` cannot mount `animal`, or null. */
export function mountProblem(_game: Game, rider: Unit, animal: Unit | undefined): string | null {
  const want = animalFor(rider.type);
  if (!want) return `A ${CONFIG.units[rider.type].name} cannot ride.`;
  if (!animal || animal.owner !== rider.owner || animal.hidden) return `Choose one of your own ${CONFIG.units[want].name}s.`;
  if (animal.type !== want) return `A ${CONFIG.units[rider.type].name} rides a ${CONFIG.units[want].name}.`;
  if (animal.dash || rider.dash) return 'Not while charging.';
  return null;
}

export function orderMount(game: Game, rider: Unit, animalId: number): void {
  const problem = mountProblem(game, rider, game.unit(animalId));
  if (problem) {
    game.emit({ type: 'cantOrder', player: rider.owner, reason: problem });
    return;
  }
  rider.orderQueue = [];
  rider.order = { type: 'mount', targetId: animalId, phase: 'approach', until: 0, start: 0 };
  rider.move = null;
}

export function updateMount(game: Game, u: Unit, o: MountOrder): void {
  const animal = game.unit(o.targetId);
  if (mountProblem(game, u, animal)) {
    u.order = null;
    u.move = null;
    return;
  }
  const a = animal!;
  const tick = game.state.tick;
  const near = len(a.x - u.x, a.y - u.y) - u.radius - a.radius <= CONFIG.mounting.reach;
  if (o.phase === 'approach') {
    if (!near) {
      const g = u.move?.goal;
      if (!g || g.kind !== 'point' || len(g.x - a.x, g.y - a.y) > 0.5 || u.move?.state !== 'moving') {
        u.move = null;
        game.moveTo(u, { kind: 'point', x: a.x, y: a.y });
      }
      if (u.move?.state === 'failed') u.order = null;
      return;
    }
    // Meet: both hold still.
    o.phase = 'mounting';
    o.start = tick;
    o.until = tick + secondsToTicks(CONFIG.mounting.mountSeconds);
    u.move = null;
    a.order = null;
    a.move = null;
    a.orderQueue = [];
    u.facing = datan2(a.y - u.y, a.x - u.x);
    game.emit({ type: 'skill', player: u.owner, id: u.id, skill: 'mount', phase: 'start', targetId: a.id, x: u.x, y: u.y });
    return;
  }
  // Mounting: any damage to either, the animal being sent off, or drifting apart interrupts it.
  if (u.hurt > o.start || a.hurt > o.start || a.order !== null || !near) {
    game.emit({ type: 'skill', player: u.owner, id: u.id, skill: 'mount', phase: 'cancel', targetId: a.id, x: u.x, y: u.y });
    game.emit({ type: 'cantOrder', player: u.owner, reason: 'Mounting was interrupted.' });
    u.order = null;
    return;
  }
  if (tick < o.until) return;
  const type = mountFor(u.type, a.type)!;
  // One unit: the rider's id, experience, cooldowns and buffs; the animal's place.
  becomeType(u, type, u.hp + a.hp, u.maxHp + a.maxHp);
  u.x = a.x;
  u.y = a.y;
  u.px = a.px;
  u.py = a.py;
  u.facing = a.facing;
  u.order = null;
  game.removeEntity(a.id);
  game.emit({ type: 'mounted', player: u.owner, id: u.id, x: u.x, y: u.y });
}

/** Why mounted unit `u` cannot dismount now, or null. */
export function dismountProblem(game: Game, u: Unit): string | null {
  if (!isMounted(u.type)) return 'Not mounted.';
  if (u.dash) return 'Not while charging.';
  const calm = secondsToTicks(CONFIG.mounting.calmSeconds);
  const wait = u.hurt + calm - game.state.tick;
  if (wait > 0) return `Can dismount ${Math.ceil(wait / 20)}s after last taking damage.`;
  if (u.hp < 2) return 'Too badly hurt to dismount.';
  return null;
}

export function dismount(game: Game, u: Unit): Unit | null {
  const problem = dismountProblem(game, u);
  if (problem) {
    game.emit({ type: 'cantOrder', player: u.owner, reason: problem });
    return null;
  }
  const pair = CONFIG.mounts[u.type as MountedType];
  const riderMax = CONFIG.units[pair.rider as UnitType].hp;
  const animalMax = CONFIG.units[pair.animal as UnitType].hp;
  // Split the health in proportion; the two always add up to what the mount had.
  const total = u.hp;
  const riderHp = Math.min(riderMax, Math.max(1, Math.round((total * riderMax) / (riderMax + animalMax))));
  const animalHp = Math.min(animalMax, Math.max(1, total - riderHp));
  const spot = game.freeTilesAround({ tx: Math.floor(u.x), ty: Math.floor(u.y), w: 1, h: 1 }, 1)[0];
  const ax = spot ? spot.x + 0.5 : u.x;
  const ay = spot ? spot.y + 0.5 : u.y;
  const animal = game.addUnit(pair.animal as UnitType, u.owner, ax, ay);
  animal.hp = animalHp;
  animal.facing = u.facing;
  animal.hurt = u.hurt;
  becomeType(u, pair.rider as UnitType, riderHp, riderMax);
  u.order = null;
  u.orderQueue = [];
  game.emit({ type: 'dismounted', player: u.owner, id: u.id, animalId: animal.id, x: u.x, y: u.y });
  return animal;
}

// ---- skills ------------------------------------------------------------------------

type SkillDef = (typeof CONFIG.skills)[SkillId];

function skillDef(s: SkillId): SkillDef {
  return CONFIG.skills[s];
}

/** Why `u` cannot use `skill` (on targetId / at x, y) now, ignoring range, or null. */
export function skillProblem(game: Game, u: Unit, skill: SkillId, targetId: number, x = 0, y = 0): string | null {
  const def = skillDef(skill);
  if (!(def.units as readonly string[]).includes(u.type)) return `${CONFIG.units[u.type].name} cannot use ${def.name}.`;
  if ((u.ready[skill] ?? 0) > game.state.tick) return `${def.name} is not ready yet.`;
  if (u.dash) return 'Busy.';
  if (def.target === 'none') return null;
  if (def.target === 'point') {
    const { width, height } = game.state.map;
    return x >= 0 && y >= 0 && x <= width && y <= height ? null : 'Target a spot on the map.';
  }
  const t = game.unit(targetId);
  if (!t || t.hidden) return 'Invalid target.';
  if (def.target === 'enemy') {
    if (!isEnemy(game, u.owner, t.owner) || !game.vision.canSee(u.owner, t)) return 'Target an enemy unit you can see.';
  } else if (t.owner !== u.owner) return 'Target one of your units.';
  return null;
}

/** A command to use a skill: toggles happen at once, the rest become orders. */
export function orderSkill(game: Game, u: Unit, skill: SkillId, targetId: number, x: number, y: number): void {
  const problem = skillProblem(game, u, skill, targetId, x, y);
  if (problem) {
    game.emit({ type: 'cantOrder', player: u.owner, reason: problem });
    return;
  }
  const tick = game.state.tick;
  if (skill === 'stance') {
    u.stance = !u.stance;
    u.ready.stance = tick + secondsToTicks(CONFIG.skills.stance.cooldown);
    game.emit({ type: 'skill', player: u.owner, id: u.id, skill, phase: 'fire', targetId: -1, x: u.x, y: u.y });
    return;
  }
  u.orderQueue = [];
  u.move = null;
  if (skill === 'shift') {
    u.order = { type: 'skill', skill, targetId: -1, x: u.x, y: u.y, phase: 'prepare', start: tick, until: tick + secondsToTicks(CONFIG.skills.shift.seconds) };
    game.emit({ type: 'skill', player: u.owner, id: u.id, skill, phase: 'start', targetId: -1, x: u.x, y: u.y });
    return;
  }
  u.order = { type: 'skill', skill, targetId, x, y, phase: 'approach', start: tick, until: 0 };
}

function skillTargetPos(game: Game, o: SkillOrder): { x: number; y: number; r: number } | null {
  const def = skillDef(o.skill);
  if (def.target === 'point') return { x: o.x, y: o.y, r: 0 };
  if (def.target === 'none') return null;
  const t = game.unit(o.targetId);
  return t ? { x: t.x, y: t.y, r: t.radius } : null;
}

export function updateSkill(game: Game, u: Unit, o: SkillOrder): void {
  const tick = game.state.tick;
  const def = skillDef(o.skill);
  if (o.phase === 'prepare') return updatePrepare(game, u, o);
  if (skillProblem(game, u, o.skill, o.targetId, o.x, o.y)) {
    u.order = null;
    u.move = null;
    return;
  }
  const at = skillTargetPos(game, o);
  if (at) {
    // Dashes may be aimed past their reach: they go as far as they can.
    const dashing = o.skill === 'charge' || o.skill === 'leap';
    const d = len(at.x - u.x, at.y - u.y) - u.radius - at.r;
    if (!dashing && d > def.range) {
      const g = u.move?.goal;
      if (!g || g.kind !== 'point' || len(g.x - at.x, g.y - at.y) > 0.75 || u.move?.state !== 'moving') {
        u.move = null;
        game.moveTo(u, { kind: 'point', x: at.x, y: at.y });
      }
      if (u.move?.state === 'failed') u.order = null;
      return;
    }
    u.facing = datan2(at.y - u.y, at.x - u.x);
  }
  u.move = null;
  const t = def.target === 'enemy' || def.target === 'ally' ? game.unit(o.targetId)! : null;
  switch (o.skill) {
    case 'aim':
      // Kneel and aim; the shot fires when `until` comes (see updatePrepare).
      o.phase = 'prepare';
      o.start = tick;
      o.until = tick + secondsToTicks(CONFIG.skills.aim.prepare);
      o.x = u.x;
      o.y = u.y;
      game.emit({ type: 'skill', player: u.owner, id: u.id, skill: 'aim', phase: 'start', targetId: o.targetId, x: u.x, y: u.y });
      return;
    case 'root': {
      const r = CONFIG.skills.root;
      u.ready.root = tick + secondsToTicks(r.cooldown);
      setBuff(t!, 'root', tick + secondsToTicks(r.seconds), 1);
      t!.move = null;
      dealDamage(game, u.id, u.owner, t!, r.damage, 'normal');
      game.emit({ type: 'skill', player: u.owner, id: u.id, skill: 'root', phase: 'fire', targetId: t!.id, x: t!.x, y: t!.y });
      fightOn(game, u, t!.id);
      return;
    }
    case 'barkshield': {
      const b = CONFIG.skills.barkshield;
      u.ready.barkshield = tick + secondsToTicks(b.cooldown);
      setBuff(t!, 'shield', tick + secondsToTicks(b.seconds), b.absorb);
      game.emit({ type: 'skill', player: u.owner, id: u.id, skill: 'barkshield', phase: 'fire', targetId: t!.id, x: t!.x, y: t!.y });
      u.order = null;
      return;
    }
    case 'charge':
    case 'leap':
    case 'pounce':
      startDash(game, u, o.skill, at!.x, at!.y, t ? t.id : -1);
      return;
    default:
      u.order = null;
  }
}

function updatePrepare(game: Game, u: Unit, o: SkillOrder): void {
  const tick = game.state.tick;
  u.move = null;
  if (o.skill === 'aim') {
    const t = game.unit(o.targetId);
    const moved = len(u.x - o.x, u.y - o.y) > 0.3;
    const lost = !t || !targetable(t) || !isEnemy(game, u.owner, t.owner) || !game.vision.canSee(u.owner, t) || len(t.x - u.x, t.y - u.y) - t.radius - u.radius > CONFIG.skills.aim.range + 1;
    if (moved || lost) {
      game.emit({ type: 'skill', player: u.owner, id: u.id, skill: 'aim', phase: 'cancel', targetId: o.targetId, x: u.x, y: u.y });
      u.order = null;
      return;
    }
    u.facing = datan2(t!.y - u.y, t!.x - u.x);
    if (tick < o.until) return;
    const a = CONFIG.skills.aim;
    u.ready.aim = tick + secondsToTicks(a.cooldown);
    game.state.projectiles.push({ id: game.state.nextId++, owner: u.owner, sourceId: u.id, targetId: t!.id, x: u.x, y: u.y, px: u.x, py: u.y, speed: attackDef(u).projectileSpeed * 1.4, damage: a.damage, kind: 'shot', attackType: 'shot', stun: 0, splash: 0, tx: t!.x, ty: t!.y });
    u.cooldown = Math.max(u.cooldown, secondsToTicks(attackDef(u).cooldown));
    game.emit({ type: 'skill', player: u.owner, id: u.id, skill: 'aim', phase: 'fire', targetId: t!.id, x: u.x, y: u.y });
    fightOn(game, u, t!.id);
    return;
  }
  if (o.skill === 'shift') {
    if (tick < o.until) return;
    u.ready.shift = tick + secondsToTicks(CONFIG.skills.shift.cooldown);
    // Both forms have the same health pool: health is carried over exactly.
    becomeType(u, u.type === 'shifter' ? 'panther' : 'shifter', u.hp, u.maxHp);
    u.order = null;
    game.emit({ type: 'skill', player: u.owner, id: u.id, skill: 'shift', phase: 'fire', targetId: -1, x: u.x, y: u.y });
    return;
  }
  u.order = null;
}

/** After a targeted skill, keep fighting that enemy. */
function fightOn(game: Game, u: Unit, targetId: number): void {
  const t = game.unit(targetId);
  u.order = t && isEnemy(game, u.owner, t.owner) ? { type: 'attack', targetId, auto: false, anchorX: u.x, anchorY: u.y, lastX: t.x, lastY: t.y } : null;
}

function setBuff(u: Unit, kind: 'root' | 'shield', until: number, amount: number): void {
  u.buffs = u.buffs.filter((b) => b.kind !== kind);
  u.buffs.push({ kind, until, amount });
}

// ---- dashes: charge, leap, pounce ------------------------------------------------

/** The farthest point toward (x, y), within `range`, reachable in a straight line over open ground. */
export function dashEnd(game: Game, u: Unit, x: number, y: number, range: number): { x: number; y: number } {
  const d = len(x - u.x, y - u.y);
  const reach = Math.min(range, d);
  if (reach < 1e-6) return { x: u.x, y: u.y };
  const dx = (x - u.x) / d;
  const dy = (y - u.y) / d;
  let last = { x: u.x, y: u.y };
  const steps = Math.ceil(reach / 0.2);
  for (let i = 1; i <= steps; i++) {
    const s = Math.min(reach, i * 0.2);
    const px = u.x + dx * s;
    const py = u.y + dy * s;
    if (!game.nav.canStand(px, py, u.radius)) break;
    last = { x: px, y: py };
  }
  return last;
}

function startDash(game: Game, u: Unit, skill: SkillId, x: number, y: number, targetId: number): void {
  const def = skillDef(skill) as { cooldown: number; range: number; speed: number };
  const tick = game.state.tick;
  const end = skill === 'pounce' ? { x, y } : dashEnd(game, u, x, y, def.range);
  if (skill !== 'pounce' && len(end.x - u.x, end.y - u.y) < 0.75) {
    game.emit({ type: 'cantOrder', player: u.owner, reason: 'No open ground that way.' });
    u.order = null;
    return;
  }
  u.ready[skill] = tick + secondsToTicks(def.cooldown);
  u.dash = { skill, x: end.x, y: end.y, targetId, speed: def.speed, hit: [] };
  u.order = null;
  u.move = null;
  u.swing = 0;
  u.stance = false;
  game.emit({ type: 'skill', player: u.owner, id: u.id, skill, phase: 'start', targetId, x: end.x, y: end.y });
}

/** Advance dashes (before normal movement). Straight lines; walls, water and buildings stop them. */
export function updateDashes(game: Game, units: readonly Unit[]): void {
  for (const u of units) {
    const d = u.dash;
    if (!d || !game.state.entities[u.id]) continue;
    if (u.stun > 0) {
      u.dash = null;
      continue;
    }
    let tx = d.x;
    let ty = d.y;
    let target: Unit | undefined;
    if (d.skill === 'pounce') {
      target = game.unit(d.targetId);
      if (!target || !targetable(target)) {
        u.dash = null;
        continue;
      }
      tx = target.x;
      ty = target.y;
      if (len(tx - u.x, ty - u.y) - target.radius - u.radius <= 0.15) {
        landPounce(game, u, target);
        continue;
      }
    }
    const dist = len(tx - u.x, ty - u.y);
    const step = d.speed * TICK_SECONDS;
    const k = dist <= step ? 1 : step / dist;
    const nx = u.x + (tx - u.x) * k;
    const ny = u.y + (ty - u.y) * k;
    if (dist > 1e-6) u.facing = datan2(ty - u.y, tx - u.x);
    if (!game.nav.canStand(nx, ny, u.radius)) {
      // Blocked: stop here (a pounce gives up, a leap lands where it is).
      endDash(game, u);
      continue;
    }
    u.x = nx;
    u.y = ny;
    if (d.skill === 'charge') chargeHits(game, u, tx, ty);
    if (d.skill === 'pounce' && target && len(target.x - u.x, target.y - u.y) - target.radius - u.radius <= 0.15) {
      landPounce(game, u, target);
      continue;
    }
    if (d.skill === 'pounce' && len(u.x - d.x, u.y - d.y) > CONFIG.skills.pounce.range + 2) {
      u.dash = null; // the prey got away
      continue;
    }
    if (k >= 1 && d.skill !== 'pounce') endDash(game, u);
  }
}

function endDash(game: Game, u: Unit): void {
  const d = u.dash!;
  u.dash = null;
  if (d.skill === 'leap') {
    const l = CONFIG.skills.leap;
    for (const e of game.units()) {
      if (!isEnemy(game, u.owner, e.owner) || !targetable(e)) continue;
      if (len(e.x - u.x, e.y - u.y) - e.radius <= l.radius && game.state.entities[e.id]) dealDamage(game, u.id, u.owner, e, l.damage, 'normal');
    }
  }
  game.emit({ type: 'skill', player: u.owner, id: u.id, skill: d.skill, phase: 'fire', targetId: d.targetId, x: u.x, y: u.y });
}

function landPounce(game: Game, u: Unit, t: Unit): void {
  u.dash = null;
  dealDamage(game, u.id, u.owner, t, CONFIG.skills.pounce.damage, 'normal');
  game.emit({ type: 'skill', player: u.owner, id: u.id, skill: 'pounce', phase: 'fire', targetId: t.id, x: u.x, y: u.y });
  fightOn(game, u, t.id);
}

/** Enemies in the charge's way: hurt, dazed and shoved aside (only onto open ground). */
function chargeHits(game: Game, u: Unit, tx: number, ty: number): void {
  const c = CONFIG.skills.charge;
  const d = u.dash!;
  const dir = datan2(ty - u.y, tx - u.x);
  for (const e of game.units()) {
    if (!isEnemy(game, u.owner, e.owner) || !targetable(e) || d.hit.includes(e.id)) continue;
    if (len(e.x - u.x, e.y - u.y) > u.radius + e.radius + 0.25) continue;
    d.hit.push(e.id);
    // Shove to whichever side of the charge line it stands on.
    const side = (dcos(dir) * (e.y - u.y) - dsin(dir) * (e.x - u.x)) >= 0 ? 1 : -1;
    const px = -dsin(dir) * side;
    const py = dcos(dir) * side;
    for (const f of [1, 0.5]) {
      const nx = e.x + px * c.push * f + dcos(dir) * 0.3;
      const ny = e.y + py * c.push * f + dsin(dir) * 0.3;
      if (game.nav.canStand(nx, ny, e.radius)) {
        e.x = nx;
        e.y = ny;
        e.move = null;
        break;
      }
    }
    interrupt(game, e);
    e.stun = Math.max(e.stun, secondsToTicks(c.stun));
    e.swing = 0;
    dealDamage(game, u.id, u.owner, e, c.damage, 'normal');
  }
}
