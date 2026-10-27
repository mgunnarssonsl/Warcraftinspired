// Heroes: types, experience, levels, mana, abilities, and the status effects
// they cause (stun, Battle Cry, Hunter's Mark, Slow, Arcane Ward, Far Sight).
// Shared rules are in CONFIG.hero, per-type numbers in CONFIG.heroTypes.
// Inventory and items are in items.ts.

import { tierResearch } from './factions';
import { CONFIG, isHeroType, secondsToTicks, TICK_SECONDS, type AbilityId, type HeroType, type ItemId } from './config';
import { dealDamage, isEnemy, targetable } from './combat';
import type { Game } from './game';
import { itemBonus } from './items';
import { distToRect } from './movement';
import type { Building, HeroRecord, HeroState, Order, Unit } from './types';

type CastOrder = Extract<Order, { type: 'cast' }>;

/** Ability rank index (0-2) for a hero level: 1-2 -> 0, 3-4 -> 1, 5 -> 2. */
export function rank(level: number): number {
  return Math.min(2, Math.floor((level - 1) / 2));
}

export function abilitiesOf(type: HeroType): AbilityId[] {
  return (Object.keys(CONFIG.hero.abilities) as AbilityId[]).filter((a) => CONFIG.hero.abilities[a].hero === type);
}

export function maxManaFor(type: HeroType, level: number): number {
  const t = CONFIG.heroTypes[type];
  return t.mana + t.manaPerLevel * (level - 1);
}

export function maxHpFor(type: HeroType, level: number): number {
  return CONFIG.units[type].hp + CONFIG.heroTypes[type].hpPerLevel * (level - 1);
}

export function levelForXp(xp: number): number {
  const t = CONFIG.hero.xpForLevel;
  let level = 1;
  for (let i = 1; i < t.length; i++) if (xp >= t[i]) level = i + 1;
  return Math.min(level, CONFIG.hero.maxLevel);
}

export function heroRecord(game: Game, player: number, type: HeroType): HeroRecord | undefined {
  return game.state.players[player]?.heroes.find((h) => h.type === type);
}

/** Heroes allowed now: one, two once fortified to a Castle. */
export function heroLimit(game: Game, player: number): number {
  const p = game.player(player);
  return p.research[tierResearch(p.faction, 2)] ? CONFIG.hero.maxHeroesCastle : CONFIG.hero.maxHeroes;
}

/** Health and mana maxima from type, level and carried items; keeps the current share. */
export function refreshHeroStats(u: Unit): void {
  const hs = u.hero;
  if (!hs || !isHeroType(u.type)) return;
  const maxHp = maxHpFor(u.type, hs.level) + itemBonus(u, 'hp');
  const maxMana = maxManaFor(u.type, hs.level) + itemBonus(u, 'mana');
  if (maxHp !== u.maxHp) {
    u.hp = Math.max(1, u.hp + (maxHp - u.maxHp));
    u.maxHp = maxHp;
  }
  if (maxMana !== hs.maxMana) {
    hs.mana = Math.max(0, Math.min(maxMana, hs.mana + (maxMana - hs.maxMana)));
    hs.maxMana = maxMana;
  }
}

/** Turn a freshly spawned hero unit into one of the player's heroes. */
export function initHero(game: Game, u: Unit, level: number, xp: number, items: Array<ItemId | null>): void {
  if (!isHeroType(u.type)) return;
  const slots = Array.from({ length: CONFIG.hero.inventorySize }, (_, i) => items[i] ?? null);
  const max = maxManaFor(u.type, level);
  u.hero = { level, xp, mana: max, maxMana: max, ready: {}, items: slots } satisfies HeroState;
  u.maxHp = maxHpFor(u.type, level);
  u.hp = u.maxHp;
  refreshHeroStats(u);
  u.hp = u.maxHp;
  u.hero.mana = u.hero.maxMana;
  const p = game.player(u.owner);
  const rec = p.heroes.find((h) => h.type === u.type);
  const fresh: HeroRecord = { type: u.type, unitId: u.id, alive: true, level, xp, items: [...slots] };
  if (rec) Object.assign(rec, fresh);
  else p.heroes.push(fresh);
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
 * share experience among the killer's heroes near the kill. Neutral kills are
 * worth less to higher-level heroes (CONFIG.hero.creepXpFactor).
 */
export function onKill(game: Game, killer: number, victim: Unit | Building): void {
  const kp = game.state.players[killer];
  if (!kp || victim.kind !== 'unit') return;
  const bounty = CONFIG.units[victim.type].bounty;
  if (bounty > 0) {
    kp.gold += bounty;
    kp.stats.bounty += bounty;
    game.emit({ type: 'bounty', player: killer, amount: bounty, x: victim.x, y: victim.y });
  }
  const heroes = game.units().filter((h) => h.owner === killer && h.hero && Math.hypot(h.x - victim.x, h.y - victim.y) <= CONFIG.hero.xpRadius);
  if (!heroes.length) return;
  const share = xpValue(victim) / heroes.length;
  const neutral = !!game.state.players[victim.owner]?.neutral;
  for (const h of heroes) {
    const factor = neutral ? CONFIG.hero.creepXpFactor[h.hero!.level - 1] : 1;
    gainXp(game, h, Math.floor(share * factor));
  }
}

export function gainXp(game: Game, h: Unit, amount: number): void {
  const hs = h.hero!;
  if (hs.level >= CONFIG.hero.maxLevel || amount <= 0) return;
  hs.xp += amount;
  const level = levelForXp(hs.xp);
  while (hs.level < level) {
    hs.level++;
    refreshHeroStats(h);
    game.emit({ type: 'levelUp', player: h.owner, id: h.id, level: hs.level, x: h.x, y: h.y });
  }
  const rec = game.player(h.owner).heroes.find((r) => r.unitId === h.id);
  if (rec) {
    rec.level = hs.level;
    rec.xp = hs.xp;
  }
}

/** Hero death keeps its record (level, experience, items) for revival. */
export function onHeroDeath(game: Game, h: Unit): void {
  const rec = game.player(h.owner).heroes.find((r) => r.unitId === h.id);
  if (rec) {
    rec.alive = false;
    rec.level = h.hero!.level;
    rec.xp = h.hero!.xp;
    rec.items = [...h.hero!.items];
  }
  game.emit({ type: 'heroFallen', player: h.owner, x: h.x, y: h.y });
}

/** Per tick: mana regeneration, buff and Far Sight expiry. */
export function updateStatus(game: Game, units: readonly Unit[]): void {
  const tick = game.state.tick;
  for (const u of units) {
    if (u.hero && isHeroType(u.type)) u.hero.mana = Math.min(u.hero.maxMana, u.hero.mana + CONFIG.heroTypes[u.type].manaRegen * TICK_SECONDS);
    if (u.buffs.length) u.buffs = u.buffs.filter((b) => b.until > tick);
  }
  if (game.state.reveals.length) game.state.reveals = game.state.reveals.filter((r) => r.until > tick);
}

/** Sum of a unit's active buffs of one kind. */
export function buffAmount(u: Unit, kind: Unit['buffs'][number]['kind']): number {
  let s = 0;
  for (const b of u.buffs) if (b.kind === kind) s += b.amount;
  return s;
}

function addBuff(u: Unit, kind: Unit['buffs'][number]['kind'], until: number, amount: number): void {
  u.buffs = u.buffs.filter((b) => b.kind !== kind);
  u.buffs.push({ kind, until, amount });
}

/** Why `u` cannot cast `ability` (on a unit or at a point) now, or null. */
export function castProblem(game: Game, u: Unit, ability: AbilityId, targetId: number, x = 0, y = 0): string | null {
  const def = CONFIG.hero.abilities[ability];
  const hs = u.hero;
  if (!hs) return 'Only heroes have abilities.';
  if (def.hero !== u.type) return `${CONFIG.units[u.type].name} does not know ${def.name}.`;
  if (hs.level < def.learnLevel) return `${def.name} is learned at level ${def.learnLevel}.`;
  if ((hs.ready[ability] ?? 0) > game.state.tick) return `${def.name} is not ready yet.`;
  if (hs.mana < def.mana) return 'Not enough mana.';
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

/** Walk into range, then cast. The order ends once cast (or if it becomes invalid). */
export function updateCast(game: Game, u: Unit, o: CastOrder): void {
  const problem = castProblem(game, u, o.ability, o.targetId, o.x, o.y);
  if (problem) {
    u.order = null;
    u.move = null;
    return;
  }
  const def = CONFIG.hero.abilities[o.ability];
  const t = def.target === 'enemy' || def.target === 'ally' ? game.unit(o.targetId)! : null;
  const at = t ?? (def.target === 'point' ? { x: o.x, y: o.y } : null);
  if (at) {
    const d = Math.hypot(at.x - u.x, at.y - u.y) - u.radius - (t ? t.radius : 0);
    if (d > def.range) {
      const g = u.move?.goal;
      if (!g || g.kind !== 'point' || Math.hypot(g.x - at.x, g.y - at.y) > 0.75 || u.move?.state !== 'moving') {
        u.move = null;
        game.moveTo(u, { kind: 'point', x: at.x, y: at.y });
      }
      return;
    }
  }
  u.move = null;
  cast(game, u, o.ability, t, at ?? u);
  u.order = null;
}

function cast(game: Game, u: Unit, ability: AbilityId, t: Unit | null, at: { x: number; y: number }): void {
  const hs = u.hero!;
  const r = rank(hs.level);
  const tick = game.state.tick;
  const def = CONFIG.hero.abilities[ability];
  hs.mana -= def.mana;
  hs.ready[ability] = tick + secondsToTicks(def.cooldown);
  if (at !== u) u.facing = Math.atan2(at.y - u.y, at.x - u.x);
  const until = tick + secondsToTicks(def.duration[r]);
  switch (def.effect) {
    case 'bolt':
      // A hurled weapon (projectile) or, with no projectile speed, roots that strike at once.
      if (t && !def.projectileSpeed) {
        dealDamage(game, u.id, u.owner, t, def.damage[r], 'hero');
        if (game.state.entities[t.id]) t.stun = Math.max(t.stun, secondsToTicks(def.stun[r]));
      } else if (t)
        game.state.projectiles.push({
          id: game.state.nextId++,
          owner: u.owner,
          sourceId: u.id,
          targetId: t.id,
          x: u.x,
          y: u.y,
          px: u.x,
          py: u.y,
          speed: def.projectileSpeed,
          damage: def.damage[r],
          kind: 'hammer',
          attackType: 'hero',
          stun: secondsToTicks(def.stun[r]),
          splash: 0,
          tx: t.x,
          ty: t.y,
        });
      break;
    case 'rally':
      for (const a of game.units()) if (a.owner === u.owner && !a.hidden && Math.hypot(a.x - u.x, a.y - u.y) <= def.radius) addBuff(a, 'cry', until, def.bonus[r]);
      break;
    case 'heal':
      if (t) t.hp = Math.min(t.maxHp, t.hp + def.heal[r]);
      break;
    case 'area':
    case 'burn':
      // Area damage at the spot: enemy units (Flame Burst also burns buildings).
      for (const e of [...game.units(), ...(def.effect === 'burn' ? game.buildings() : [])]) {
        if (!isEnemy(game, u.owner, e.owner) || !targetable(e)) continue;
        const d = e.kind === 'unit' ? Math.hypot(e.x - at.x, e.y - at.y) - e.radius : distToRect(at.x, at.y, e);
        if (d <= def.radius && game.state.entities[e.id]) dealDamage(game, u.id, u.owner, e, def.damage[r], 'hero');
      }
      break;
    case 'mark':
      if (t) addBuff(t, 'mark', until, def.bonus[r]);
      break;
    case 'slow':
      if (t) addBuff(t, 'slow', until, def.bonus[r]);
      break;
    case 'ward':
      if (t) addBuff(t, 'ward', until, def.bonus[r]);
      break;
    case 'reveal':
      game.state.reveals.push({ owner: u.owner, x: at.x, y: at.y, radius: def.radius, until });
      break;
  }
  game.emit({ type: 'cast', player: u.owner, id: u.id, ability, targetId: t?.id ?? -1, x: at.x, y: at.y });
}
