// Items, camps' drops and the neutral map objectives (Trading Posts and
// Healing Fountains). Rules: CONFIG.items, CONFIG.camps, CONFIG.shop,
// CONFIG.fountain. Everything here applies to every player alike.

import { isHall, isHealer } from './factions';
import { CONFIG, TICK_RATE, type ItemId } from './config';
import type { Game } from './game';
import { refreshHeroStats } from './hero';
import { distToRect } from './movement';
import type { Order, Unit } from './types';
import { len } from './dmath';

type PickupOrder = Extract<Order, { type: 'pickup' }>;
type StatField = 'damage' | 'armor' | 'hp' | 'mana' | 'speed';

/** Sum of a stat over the permanent items a hero carries. */
export function itemBonus(u: Unit, field: StatField): number {
  if (!u.hero) return 0;
  let s = 0;
  for (const it of u.hero.items) if (it && !CONFIG.items[it].consumable) s += CONFIG.items[it][field];
  return s;
}

export function freeSlot(u: Unit): number {
  return u.hero ? u.hero.items.indexOf(null) : -1;
}

/** Put an item in a hero's first free slot. False when the inventory is full. */
export function giveItem(u: Unit, item: ItemId): boolean {
  const slot = freeSlot(u);
  if (slot < 0) return false;
  u.hero!.items[slot] = item;
  refreshHeroStats(u);
  return true;
}

export function placeGroundItem(game: Game, item: ItemId, x: number, y: number): void {
  game.state.items.push({ id: game.state.nextId++, type: item, x, y });
  game.emit({ type: 'itemDropped', id: game.state.items[game.state.items.length - 1].id, item, x, y });
}

/** Walk to a ground item and take it (the order ends either way). */
export function updatePickup(game: Game, u: Unit, o: PickupOrder): void {
  const idx = game.state.items.findIndex((i) => i.id === o.itemId);
  if (idx < 0 || !u.hero) {
    u.order = null;
    u.move = null;
    return;
  }
  const it = game.state.items[idx];
  if (len(it.x - u.x, it.y - u.y) > 0.9) {
    game.moveTo(u, { kind: 'point', x: it.x, y: it.y });
    if (u.move?.state === 'moving') return;
    if (len(it.x - u.x, it.y - u.y) > 1.5) {
      u.order = null;
      u.move = null;
      return;
    }
  }
  u.order = null;
  u.move = null;
  if (!giveItem(u, it.type)) {
    game.emit({ type: 'cantItem', player: u.owner, reason: 'The inventory is full.' });
    return;
  }
  game.state.items.splice(idx, 1);
  game.emit({ type: 'itemPicked', player: u.owner, hero: u.id, item: it.type, x: it.x, y: it.y });
}

export function dropItem(game: Game, u: Unit, slot: number): void {
  const it = u.hero?.items[slot];
  if (!it) return;
  u.hero!.items[slot] = null;
  refreshHeroStats(u);
  placeGroundItem(game, it, u.x, u.y);
}

/** Use a consumable. Stunned heroes cannot. */
export function useItem(game: Game, u: Unit, slot: number): void {
  const it = u.hero?.items[slot];
  if (!it) return;
  const def = CONFIG.items[it];
  if (!def.consumable) return;
  if (u.stun > 0) {
    game.emit({ type: 'cantItem', player: u.owner, reason: 'Stunned.' });
    return;
  }
  if (it === 'scroll') {
    const keeps = game.buildings().filter((b) => b.owner === u.owner && isHall(b.type) && b.progress >= 1);
    if (!keeps.length) {
      game.emit({ type: 'cantItem', player: u.owner, reason: 'You have no main hall (Keep or Heartwood) to return to.' });
      return;
    }
    const k = keeps.reduce((a, b) => (len(b.x - u.x, b.y - u.y) < len(a.x - u.x, a.y - u.y) ? b : a));
    const spot = game.freeTilesAround(k, 1)[0];
    if (!spot) return;
    const from = { x: u.x, y: u.y };
    u.x = u.px = spot.x + 0.5;
    u.y = u.py = spot.y + 0.5;
    u.order = null;
    u.move = null;
    u.orderQueue = [];
    game.emit({ type: 'teleport', player: u.owner, id: u.id, fromX: from.x, fromY: from.y, x: u.x, y: u.y });
  } else if (it === 'draught') {
    u.hp = Math.min(u.maxHp, u.hp + def.heal);
  } else if (it === 'tonic') {
    u.hero!.mana = Math.min(u.hero!.maxMana, u.hero!.mana + def.restore);
  } else if (it === 'salve') {
    for (const a of game.units()) if (a.owner === u.owner && !a.hidden && len(a.x - u.x, a.y - u.y) <= 6) a.hp = Math.min(a.maxHp, a.hp + def.heal);
  }
  u.hero!.items[slot] = null;
  game.emit({ type: 'itemUsed', player: u.owner, hero: u.id, item: it, x: u.x, y: u.y });
}

/** Why `hero` cannot buy `item` at shop `shopId` now, or null. */
export function buyProblem(game: Game, player: number, shopId: number, heroId: number, item: ItemId): string | null {
  const shop = game.building(shopId);
  if (!shop || shop.type !== 'shop') return 'That is not a Trading Post.';
  if (!(CONFIG.shop.stock as readonly string[]).includes(item)) return 'Not sold here.';
  const h = game.unit(heroId);
  if (!h || h.owner !== player || !h.hero) return 'Select a hero to buy for.';
  if (distToRect(h.x, h.y, shop) - h.radius > CONFIG.shop.range) return `Your hero must stand within ${CONFIG.shop.range} tiles of the Trading Post.`;
  if (freeSlot(h) < 0) return 'The inventory is full.';
  if (game.player(player).gold < CONFIG.items[item].price) return `Not enough gold (${CONFIG.items[item].price} needed).`;
  return null;
}

export function buyItem(game: Game, player: number, shopId: number, heroId: number, item: ItemId): void {
  const problem = buyProblem(game, player, shopId, heroId, item);
  if (problem) {
    game.emit({ type: 'cantItem', player, reason: problem });
    return;
  }
  game.player(player).gold -= CONFIG.items[item].price;
  giveItem(game.unit(heroId)!, item);
  game.emit({ type: 'itemBought', player, hero: heroId, item });
}

/** A camp guard died: when it was the last one, the camp drops its item. */
export function onCampGuardDeath(game: Game, victim: Unit, killer = -1): void {
  const camp = game.state.camps[victim.camp];
  if (!camp || camp.cleared) return;
  if (game.units().some((u) => u.id !== victim.id && u.camp === victim.camp)) return;
  camp.cleared = true;
  const k = game.state.players[killer];
  if (k && !k.neutral) k.stats.campsCleared++;
  placeGroundItem(game, camp.drop, victim.x, victim.y);
  game.emit({ type: 'campCleared', level: camp.level, x: camp.x, y: camp.y });
}

/** Healing Fountains: once a second, heal every unit near them. */
export function updateFountains(game: Game): void {
  if (game.state.tick % TICK_RATE !== 0) return;
  const f = CONFIG.fountain;
  for (const b of game.buildings()) {
    if (b.type !== 'fountain') continue;
    for (const u of game.units()) {
      if (u.hidden || game.player(u.owner).neutral || distToRect(u.x, u.y, b) > f.radius) continue;
      u.hp = Math.min(u.maxHp, u.hp + f.hpPerSecond);
      if (u.hero) u.hero.mana = Math.min(u.hero.maxMana, u.hero.mana + f.manaPerSecond);
      if (isHealer(u.type)) u.mana = Math.min(CONFIG.cleric.mana, u.mana + f.manaPerSecond);
    }
  }
}
