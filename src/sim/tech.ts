// Research and effective unit statistics. Every damage, armor and carry
// number used by the rules goes through here, so upgrades, hero levels and
// buffs apply consistently to every player.

import { CONFIG, type BuildingType, type ResearchId } from './config';
import type { Game } from './game';
import type { Building, Unit } from './types';

/** Unit types that benefit from Blacksmith upgrades. */
const MILITARY = new Set(['guard', 'archer', 'hero']);

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
  if (id === 'castle') {
    b.tier = 2;
    b.maxHp += CONFIG.tech.castleHp;
    b.hp += CONFIG.tech.castleHp;
  }
  game.emit({ type: 'researchComplete', player: b.owner, research: id });
}

function levels(game: Game, owner: number, first: ResearchId, second: ResearchId): number {
  return (researched(game, owner, first) ? 1 : 0) + (researched(game, owner, second) ? 1 : 0);
}

/** Damage of one attack, after upgrades, hero level and Battle Cry. */
export function attackDamage(game: Game, u: Unit): number {
  let dmg = CONFIG.units[u.type].attack.damage;
  if (MILITARY.has(u.type)) dmg += CONFIG.tech.weaponBonus * levels(game, u.owner, 'weapons1', 'weapons2');
  if (u.hero) dmg += CONFIG.hero.damagePerLevel * (u.hero.level - 1);
  const bonus = u.buffs.reduce((s, b) => s + b.amount, 0);
  return Math.round(dmg * (1 + bonus));
}

export function armorValue(game: Game, t: Unit | Building): number {
  if (t.kind === 'building') return CONFIG.combat.buildingArmor;
  let a: number = CONFIG.units[t.type].armor;
  if (MILITARY.has(t.type)) a += CONFIG.tech.armorBonus * levels(game, t.owner, 'armor1', 'armor2');
  if (t.hero) a += CONFIG.hero.armorPerLevel * (t.hero.level - 1);
  return a;
}

export function woodCarry(game: Game, owner: number): number {
  return CONFIG.units.worker.carryWood + (researched(game, owner, 'saws') ? CONFIG.tech.sawsCarry : 0);
}
