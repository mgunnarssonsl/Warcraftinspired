// Heroes: experience, levels, mana, abilities, and the status effects they
// cause (stun, Battle Cry). Rules are in CONFIG.hero.

import { CONFIG, secondsToTicks, TICK_SECONDS, type AbilityId } from './config';
import type { Game } from './game';
import type { Building, HeroState, Order, Unit } from './types';

type CastOrder = Extract<Order, { type: 'cast' }>;

/** Ability rank index (0-2) for a hero level: 1-2 -> 0, 3-4 -> 1, 5 -> 2. */
export function rank(level: number): number {
  return Math.min(2, Math.floor((level - 1) / 2));
}

export function maxManaFor(level: number): number {
  return CONFIG.hero.mana + CONFIG.hero.manaPerLevel * (level - 1);
}

export function maxHpFor(level: number): number {
  return CONFIG.units.hero.hp + CONFIG.hero.hpPerLevel * (level - 1);
}

export function levelForXp(xp: number): number {
  const t = CONFIG.hero.xpForLevel;
  let level = 1;
  for (let i = 1; i < t.length; i++) if (xp >= t[i]) level = i + 1;
  return Math.min(level, CONFIG.hero.maxLevel);
}

/** Turn a freshly spawned hero unit into the player's hero at a level. */
export function initHero(game: Game, u: Unit, level: number, xp: number): void {
  const max = maxManaFor(level);
  u.hero = { level, xp, mana: max, maxMana: max, ready: {} } satisfies HeroState;
  u.maxHp = maxHpFor(level);
  u.hp = u.maxHp;
  game.player(u.owner).hero = { unitId: u.id, alive: true, level, xp };
}

export function reviveCost(level: number): { gold: number; wood: number } {
  const r = CONFIG.hero.revive;
  return { gold: r.goldBase + r.goldPerLevel * level, wood: 0 };
}

export function reviveSeconds(level: number): number {
  const r = CONFIG.hero.revive;
  return r.secondsBase + r.secondsPerLevel * level;
}

function xpValue(victim: Unit): number {
  if (victim.hero) return CONFIG.hero.killXpPerLevel * victim.hero.level;
  return CONFIG.units[victim.type].xp;
}

/**
 * A unit owned by `victimOwner` was killed by `killer`'s side: pay bounty and
 * share experience among the killer's heroes near the kill.
 */
export function onKill(game: Game, killer: number, victim: Unit | Building): void {
  const kp = game.state.players[killer];
  if (!kp || victim.kind !== 'unit') return;
  const bounty = CONFIG.units[victim.type].bounty;
  if (bounty > 0) {
    kp.gold += bounty;
    game.emit({ type: 'bounty', player: killer, amount: bounty, x: victim.x, y: victim.y });
  }
  const heroes = game.units().filter((h) => h.owner === killer && h.hero && Math.hypot(h.x - victim.x, h.y - victim.y) <= CONFIG.hero.xpRadius);
  if (!heroes.length) return;
  const share = Math.floor(xpValue(victim) / heroes.length);
  for (const h of heroes) gainXp(game, h, share);
}

export function gainXp(game: Game, h: Unit, amount: number): void {
  const hs = h.hero!;
  if (hs.level >= CONFIG.hero.maxLevel) return;
  hs.xp += amount;
  const level = levelForXp(hs.xp);
  while (hs.level < level) {
    hs.level++;
    h.maxHp += CONFIG.hero.hpPerLevel;
    h.hp += CONFIG.hero.hpPerLevel;
    hs.maxMana += CONFIG.hero.manaPerLevel;
    hs.mana += CONFIG.hero.manaPerLevel;
    game.emit({ type: 'levelUp', player: h.owner, id: h.id, level: hs.level, x: h.x, y: h.y });
  }
  const rec = game.player(h.owner).hero;
  if (rec) {
    rec.level = hs.level;
    rec.xp = hs.xp;
  }
}

/** Hero death keeps its record (level, experience) for revival. */
export function onHeroDeath(game: Game, h: Unit): void {
  const rec = game.player(h.owner).hero;
  if (rec && rec.unitId === h.id) {
    rec.alive = false;
    rec.level = h.hero!.level;
    rec.xp = h.hero!.xp;
  }
  game.emit({ type: 'heroFallen', player: h.owner, x: h.x, y: h.y });
}

/** Per tick: mana regeneration, buff expiry. */
export function updateStatus(game: Game, units: readonly Unit[]): void {
  const tick = game.state.tick;
  for (const u of units) {
    if (u.hero) u.hero.mana = Math.min(u.hero.maxMana, u.hero.mana + CONFIG.hero.manaRegen * TICK_SECONDS);
    if (u.buffs.length) u.buffs = u.buffs.filter((b) => b.until > tick);
  }
}

/** Why `u` cannot cast `ability` (on `targetId`) now, or null. */
export function castProblem(game: Game, u: Unit, ability: AbilityId, targetId: number): string | null {
  const def = CONFIG.hero.abilities[ability];
  const hs = u.hero;
  if (!hs) return 'Only heroes have abilities.';
  if (hs.level < def.learnLevel) return `${def.name} is learned at level ${def.learnLevel}.`;
  if ((hs.ready[ability] ?? 0) > game.state.tick) return `${def.name} is not ready yet.`;
  if (hs.mana < def.mana) return 'Not enough mana.';
  if (def.target === 'none') return null;
  const t = game.unit(targetId);
  if (!t || t.hidden) return 'Invalid target.';
  if (def.target === 'enemy') {
    if (t.owner === u.owner || !game.vision.canSee(u.owner, t)) return 'Target an enemy unit you can see.';
  } else if (t.owner !== u.owner) return 'Target one of your units.';
  return null;
}

/** Walk into range, then cast. The order ends once cast (or if it becomes invalid). */
export function updateCast(game: Game, u: Unit, o: CastOrder): void {
  const problem = castProblem(game, u, o.ability, o.targetId);
  if (problem) {
    u.order = null;
    u.move = null;
    return;
  }
  const def = CONFIG.hero.abilities[o.ability];
  const t = def.target === 'none' ? null : game.unit(o.targetId)!;
  if (t && 'range' in def && Math.hypot(t.x - u.x, t.y - u.y) - u.radius - t.radius > def.range) {
    const g = u.move?.goal;
    if (!g || g.kind !== 'point' || Math.hypot(g.x - t.x, g.y - t.y) > 0.75 || u.move?.state !== 'moving') {
      u.move = null;
      game.moveTo(u, { kind: 'point', x: t.x, y: t.y });
    }
    return;
  }
  u.move = null;
  cast(game, u, o.ability, t);
  u.order = null;
}

function cast(game: Game, u: Unit, ability: AbilityId, t: Unit | null): void {
  const hs = u.hero!;
  const r = rank(hs.level);
  const tick = game.state.tick;
  const def = CONFIG.hero.abilities[ability];
  hs.mana -= def.mana;
  hs.ready[ability] = tick + secondsToTicks(def.cooldown);
  if (t) u.facing = Math.atan2(t.y - u.y, t.x - u.x);
  if (ability === 'hammer' && t) {
    const h = CONFIG.hero.abilities.hammer;
    game.state.projectiles.push({
      id: game.state.nextId++,
      owner: u.owner,
      sourceId: u.id,
      targetId: t.id,
      x: u.x,
      y: u.y,
      px: u.x,
      py: u.y,
      speed: h.projectileSpeed,
      damage: h.damage[r],
      kind: 'hammer',
      stun: secondsToTicks(h.stun[r]),
    });
  } else if (ability === 'cry') {
    const c = CONFIG.hero.abilities.cry;
    for (const a of game.units()) {
      if (a.owner !== u.owner || a.hidden || Math.hypot(a.x - u.x, a.y - u.y) > c.radius) continue;
      a.buffs = a.buffs.filter((b) => b.kind !== 'cry');
      a.buffs.push({ kind: 'cry', until: tick + secondsToTicks(c.duration), amount: c.bonus[r] });
    }
  } else if (ability === 'mend' && t) {
    t.hp = Math.min(t.maxHp, t.hp + CONFIG.hero.abilities.mend.heal[r]);
  }
  game.emit({ type: 'cast', player: u.owner, id: u.id, ability, targetId: t?.id ?? -1, x: (t ?? u).x, y: (t ?? u).y });
}
