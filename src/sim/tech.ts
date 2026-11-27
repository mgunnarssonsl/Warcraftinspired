// Research and effective unit statistics. Every damage, armor and carry
// number used by the rules goes through here, so upgrades, hero levels and
// buffs apply consistently to every player.

import { FACTION, upgradesArmor, upgradesWeapons } from './factions';
import { CONFIG, isHeroType, type ArmorType, type AttackType, type BuildingType, type ResearchId } from './config';
import { buffAmount } from './hero';
import { itemBonus } from './items';
import type { Game } from './game';
import type { Building, Unit } from './types';
import { stanceArmor, vetArmor, vetDamageFactor } from './elite';


export function researched(game: Game, player: number, id: ResearchId): boolean {
  return !!game.state.players[player]?.research[id];
}

export function researchAt(type: BuildingType): ResearchId[] {
  return (Object.keys(CONFIG.research) as ResearchId[]).filter((r) => CONFIG.research[r].at === type);
}

/** Queued or in progress anywhere for this player. */
export function researchPending(game: Game, player: number, id: ResearchId): boolean {
  return game.buildings().some((b) => b.owner === player && b.queue.some((q) => q.research === id));
}

/** Why research `id` cannot be queued at `b` now, or null if it can. */
export function researchProblem(game: Game, player: number, b: Building, id: ResearchId): string | null {
  const def = CONFIG.research[id];
  if (b.owner !== player) return 'Not your building.';
  if (b.progress < 1) return 'The building is not finished.';
  if (def.at !== b.type) return `${CONFIG.buildings[b.type].name} cannot research that.`;
  if (researched(game, player, id)) return 'Already researched.';
  if (researchPending(game, player, id)) return 'Already being researched.';
  for (const r of def.requires as ResearchId[]) if (!researched(game, player, r)) return `Requires ${CONFIG.research[r].name}.`;
  if (b.queue.length >= CONFIG.production.queueSize) return 'The queue is full.';
  const p = game.player(player);
  if (p.gold < def.cost.gold) return `Not enough gold (${def.cost.gold} needed).`;
  if (p.wood < def.cost.wood) return `Not enough wood (${def.cost.wood} needed).`;
  return null;
}

/** Effect of finishing research. */
export function completeResearch(game: Game, b: Building, id: ResearchId): void {
  game.player(b.owner).research[id] = true;
  const tiers = FACTION[game.player(b.owner).faction].tiers;
  if (tiers.includes(id)) {
    b.tier = id === tiers[0] ? 2 : 3;
    b.maxHp += CONFIG.tech.castleHp;
    b.hp += CONFIG.tech.castleHp;
  }
  game.emit({ type: 'researchComplete', player: b.owner, research: id });
}

function levels(game: Game, owner: number, ids: ResearchId[]): number {
  return ids.reduce((n, id) => n + (researched(game, owner, id) ? 1 : 0), 0);
}

/** Damage of one attack, after upgrades, hero level and Battle Cry. */
export function attackDamage(game: Game, u: Unit): number {
  let dmg = CONFIG.units[u.type].attack.damage;
  if (upgradesWeapons(u.type)) dmg += CONFIG.tech.weaponBonus * levels(game, u.owner, upgrades(game, u.owner).weapons);
  if (u.hero && isHeroType(u.type)) dmg += CONFIG.heroTypes[u.type].damagePerLevel * (u.hero.level - 1) + itemBonus(u, 'damage');
  return Math.round(dmg * (1 + buffAmount(u, 'cry')) * vetDamageFactor(u));
}

export function armorValue(game: Game, t: Unit | Building): number {
  if (t.kind === 'building') return CONFIG.combat.buildingArmor;
  let a: number = CONFIG.units[t.type].armor;
  if (upgradesArmor(t.type)) a += CONFIG.tech.armorBonus * levels(game, t.owner, upgrades(game, t.owner).armor);
  if (t.hero && isHeroType(t.type)) a += CONFIG.heroTypes[t.type].armorPerLevel * (t.hero.level - 1) + itemBonus(t, 'armor');
  return a + buffAmount(t, 'ward') + vetArmor(t) + stanceArmor(t);
}

/** A player's research, by what it does (their faction's names). */
function upgrades(game: Game, owner: number) {
  return FACTION[game.state.players[owner]?.faction ?? 'crown'].upgrades;
}

export function woodCarry(game: Game, owner: number): number {
  return CONFIG.units.worker.carryWood + (researched(game, owner, upgrades(game, owner).carryWood) ? CONFIG.tech.sawsCarry : 0);
}

export function goldCarry(game: Game, owner: number): number {
  const carts = upgrades(game, owner).carryGold;
  return CONFIG.units.worker.carryGold + (carts && researched(game, owner, carts) ? CONFIG.tech.cartsCarry : 0);
}

export function armorTypeOf(t: Unit | Building): ArmorType {
  return t.kind === 'building' ? CONFIG.buildings[t.type].armorType : CONFIG.units[t.type].armorType;
}

/** Damage multiplier of an attack type against what the target wears. */
export function typeMultiplier(attack: AttackType, armor: ArmorType): number {
  return CONFIG.combat.typeTable[attack][armor];
}

/** Weapon range after upgrades (Longbows for Archers). */
export function attackRange(game: Game, u: Unit): number {
  const r = CONFIG.units[u.type].attack.range;
  const f = FACTION[game.state.players[u.owner]?.faction ?? 'crown'];
  return u.type === f.rangeUnit && researched(game, u.owner, f.upgrades.range) ? r + CONFIG.tech.longbowRange : r;
}

/** Health a Cleric's prayer restores. */
export function healAmount(game: Game, owner: number): number {
  return CONFIG.cleric.heal[researched(game, owner, upgrades(game, owner).heal) ? 1 : 0];
}
