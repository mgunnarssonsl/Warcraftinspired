// Commands are the only way players (human or AI) affect the simulation.
// They are validated here: a player can only command their own living units.

import { buildableFor, isHall, isWorker } from './factions';
import { CONFIG, secondsToTicks, type AbilityId, type BuildingType, type ItemId, type ResearchId, type SkillId, type SpecId, type UnitType } from './config';
import { dismount, orderMount, orderSkill, orderSpecialize } from './elite';
import { buyItem, dropItem, useItem } from './items';
import { cancelConstruction, checkPlacement, repairProblem, resumeBuild, shortfall, startBuild, startRepair } from './construction';
import type { Game } from './game';
import { cancelTraining, enqueue, enqueueResearch, setRally } from './production';
import { castProblem } from './hero';
import { canAttack, isEnemy, targetable } from './combat';
import { defeat } from './outcome';
import { releaseFromNode, startGather, startReturnCargo } from './gathering';
import type { QueuedOrder, Unit } from './types';
import { dcos, dsin, len } from './dmath';

export type Command =
  | { type: 'move'; player: number; units: number[]; x: number; y: number; queued?: boolean }
  | { type: 'gather'; player: number; units: number[]; nodeId: number; queued?: boolean }
  | { type: 'returnCargo'; player: number; units: number[]; dropoffId?: number }
  | { type: 'stop'; player: number; units: number[] }
  | { type: 'attack'; player: number; units: number[]; targetId: number; queued?: boolean }
  | { type: 'attackMove'; player: number; units: number[]; x: number; y: number; queued?: boolean }
  | { type: 'hold'; player: number; units: number[]; queued?: boolean }
  | { type: 'surrender'; player: number }
  | { type: 'research'; player: number; buildingId: number; research: ResearchId }
  /** targetId for unit-targeted abilities; x, y for ground-targeted ones. */
  | { type: 'cast'; player: number; units: number[]; ability: AbilityId; targetId: number; x?: number; y?: number }
  | { type: 'pickup'; player: number; units: number[]; itemId: number }
  | { type: 'useItem'; player: number; units: number[]; slot: number }
  | { type: 'dropItem'; player: number; units: number[]; slot: number }
  | { type: 'buyItem'; player: number; shopId: number; heroId: number; item: ItemId }
  | { type: 'flare'; player: number; buildingId: number; x: number; y: number }
  | { type: 'build'; player: number; units: number[]; buildingType: BuildingType; tx: number; ty: number; queued?: boolean }
  | { type: 'resumeBuild'; player: number; units: number[]; buildingId: number }
  | { type: 'repair'; player: number; units: number[]; buildingId: number; queued?: boolean }
  | { type: 'cancelBuild'; player: number; buildingId: number }
  | { type: 'train'; player: number; buildingId: number; unit: UnitType }
  | { type: 'cancelTrain'; player: number; buildingId: number; index: number }
  | { type: 'setRally'; player: number; buildingId: number; x: number; y: number; targetId: number }
  /** A unit skill (sim/elite.ts): every selected unit that has it uses it. */
  | { type: 'skill'; player: number; units: number[]; skill: SkillId; targetId: number; x?: number; y?: number }
  /** Riders mount the animal targetId (the nearest rider goes if several are selected). */
  | { type: 'mount'; player: number; units: number[]; targetId: number }
  | { type: 'dismount'; player: number; units: number[] }
  | { type: 'specialize'; player: number; units: number[]; into: SpecId };

function ownUnits(game: Game, player: number, ids: number[]): Unit[] {
  const out: Unit[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    const u = game.unit(id);
    if (u && u.owner === player && !seen.has(id)) {
      seen.add(id);
      out.push(u);
    }
  }
  return out;
}

export function applyCommand(game: Game, cmd: Command): void {
  // Building-targeted commands (no units involved).
  switch (cmd.type) {
    case 'cancelBuild':
      return cancelConstruction(game, cmd.player, cmd.buildingId);
    case 'train':
      if (!(cmd.unit in CONFIG.units)) return;
      return enqueue(game, cmd.player, cmd.buildingId, cmd.unit);
    case 'cancelTrain':
      return cancelTraining(game, cmd.player, cmd.buildingId, cmd.index);
    case 'setRally':
      return setRally(game, cmd.player, cmd.buildingId, cmd.x, cmd.y, cmd.targetId);
    case 'surrender':
      return defeat(game, cmd.player, 'surrendered');
    case 'research':
      if (!(cmd.research in CONFIG.research) || game.state.players[cmd.player]?.defeated) return;
      return enqueueResearch(game, cmd.player, cmd.buildingId, cmd.research);
    case 'flare':
      if (game.state.players[cmd.player]?.defeated) return;
      return fireFlare(game, cmd.player, cmd.buildingId, cmd.x, cmd.y);
    case 'buyItem':
      if (!(cmd.item in CONFIG.items) || game.state.players[cmd.player]?.defeated) return;
      return buyItem(game, cmd.player, cmd.shopId, cmd.heroId, cmd.item);
  }
  // A decided match accepts no further orders from defeated players.
  if (game.state.players[cmd.player]?.defeated) return;
  const units = ownUnits(game, cmd.player, cmd.units);
  if (!units.length) return;
  switch (cmd.type) {
    case 'move': {
      const slots = formationSlots(game, units, cmd.x, cmd.y);
      const pace = groupPace(units);
      units.forEach((u, i) => give(game, u, { type: 'move', x: slots[i].x, y: slots[i].y, pace }, cmd.queued));
      return;
    }
    case 'gather': {
      if (!game.resource(cmd.nodeId)) return;
      for (const u of units) if (isWorker(u.type)) give(game, u, { type: 'gather', nodeId: cmd.nodeId }, cmd.queued);
      return;
    }
    case 'returnCargo': {
      for (const u of units) {
        if (!isWorker(u.type)) continue;
        u.orderQueue = [];
        startReturnCargo(game, u, cmd.dropoffId ?? -1);
      }
      return;
    }
    case 'build': {
      if (!(cmd.buildingType in CONFIG.buildings) || !CONFIG.buildings[cmd.buildingType].buildable) return;
      // Each faction builds its own buildings only.
      if (!buildableFor(game.player(cmd.player).faction).includes(cmd.buildingType)) return;
      const workers = units.filter((u) => isWorker(u.type));
      if (!workers.length) return;
      const size = CONFIG.buildings[cmd.buildingType].size;
      const cx = cmd.tx + size / 2;
      const cy = cmd.ty + size / 2;
      // Reject obviously invalid orders immediately, for clear feedback.
      const problem = checkPlacement(game, cmd.buildingType, cmd.tx, cmd.ty).reason ?? shortfall(game, cmd.player, cmd.buildingType);
      if (problem) {
        game.emit({ type: 'cantBuild', player: cmd.player, reason: problem, x: cx, y: cy });
        return;
      }
      // The nearest selected worker goes; the rest keep their orders. A
      // queued build goes to a worker already building, so Shift-placed
      // buildings line up for one builder.
      const busy = cmd.queued ? workers.filter((u) => u.order?.type === 'build' || u.orderQueue.some((q) => q.type === 'build')) : [];
      const pool = busy.length ? busy : workers;
      const builder = pool.reduce((a, b) => (len(a.x - cx, a.y - cy) <= len(b.x - cx, b.y - cy) ? a : b));
      give(game, builder, { type: 'build', buildingType: cmd.buildingType, tx: cmd.tx, ty: cmd.ty }, cmd.queued);
      return;
    }
    case 'repair': {
      const b = game.building(cmd.buildingId);
      const problem = repairProblem(cmd.player, b);
      if (problem) {
        if (b) game.emit({ type: 'cantBuild', player: cmd.player, reason: problem, x: b.x, y: b.y });
        return;
      }
      for (const u of units) if (isWorker(u.type)) give(game, u, { type: 'repair', targetId: b!.id }, cmd.queued);
      return;
    }
    case 'resumeBuild': {
      const site = game.building(cmd.buildingId);
      if (!site) return;
      for (const u of units) {
        if (!isWorker(u.type)) continue;
        u.orderQueue = [];
        resumeBuild(game, u, site);
      }
      return;
    }
    case 'attack': {
      const t = game.get(cmd.targetId);
      if (!targetable(t) || !isEnemy(game, cmd.player, t.owner) || !game.vision.knows(cmd.player, t)) return;
      for (const u of units) if (canAttack(u)) give(game, u, { type: 'attack', targetId: t.id }, cmd.queued);
      return;
    }
    case 'attackMove': {
      const fighters = units.filter(canAttack);
      const slots = formationSlots(game, fighters, cmd.x, cmd.y);
      const pace = groupPace(fighters);
      fighters.forEach((u, i) => give(game, u, { type: 'attackMove', x: slots[i].x, y: slots[i].y, pace }, cmd.queued));
      return;
    }
    case 'cast': {
      if (!(cmd.ability in CONFIG.hero.abilities)) return;
      // Only the selected hero who knows the ability casts it.
      const def = CONFIG.hero.abilities[cmd.ability];
      const caster = units.find((u) => u.hero && u.type === def.hero) ?? units.find((u) => u.hero);
      if (!caster) return;
      const x = cmd.x ?? 0;
      const y = cmd.y ?? 0;
      const problem = castProblem(game, caster, cmd.ability, cmd.targetId, x, y);
      if (problem) {
        game.emit({ type: 'cantCast', player: cmd.player, reason: problem });
        return;
      }
      releaseFromNode(game, caster);
      caster.order = { type: 'cast', ability: cmd.ability, targetId: cmd.targetId, x, y };
      caster.move = null;
      return;
    }
    case 'pickup': {
      const hero = units.find((u) => u.hero);
      if (!hero || !game.state.items.some((i) => i.id === cmd.itemId)) return;
      hero.orderQueue = [];
      hero.order = { type: 'pickup', itemId: cmd.itemId };
      hero.move = null;
      return;
    }
    case 'useItem': {
      const hero = units.find((u) => u.hero);
      if (hero) useItem(game, hero, cmd.slot);
      return;
    }
    case 'dropItem': {
      const hero = units.find((u) => u.hero);
      if (hero) dropItem(game, hero, cmd.slot);
      return;
    }
    case 'hold': {
      for (const u of units) give(game, u, { type: 'hold' }, cmd.queued);
      return;
    }
    case 'skill': {
      if (!(cmd.skill in CONFIG.skills)) return;
      const users = units.filter((u) => (CONFIG.skills[cmd.skill].units as readonly string[]).includes(u.type));
      for (const u of users) {
        releaseFromNode(game, u);
        orderSkill(game, u, cmd.skill, cmd.targetId, cmd.x ?? 0, cmd.y ?? 0);
      }
      return;
    }
    case 'mount': {
      const animal = game.unit(cmd.targetId);
      if (!animal) return;
      const riders = units.filter((u) => u.id !== animal.id);
      if (!riders.length) return;
      // One animal carries one rider: the nearest selected rider that can ride it.
      const able = riders.filter((u) => CONFIG.mounts && Object.values(CONFIG.mounts).some((m) => m.rider === u.type && m.animal === animal.type));
      const rider = (able.length ? able : riders).reduce((a, b) => (len(a.x - animal.x, a.y - animal.y) <= len(b.x - animal.x, b.y - animal.y) ? a : b));
      orderMount(game, rider, animal.id);
      return;
    }
    case 'dismount': {
      for (const u of units) if (u.type in CONFIG.mounts) dismount(game, u);
      return;
    }
    case 'specialize': {
      if (!(cmd.into in CONFIG.specialize)) return;
      for (const u of units) if (u.type === CONFIG.specialize[cmd.into].from) orderSpecialize(game, u, cmd.into);
      return;
    }
    case 'stop': {
      for (const u of units) {
        u.orderQueue = [];
        releaseFromNode(game, u);
        u.order = null;
        u.move = null;
      }
      return;
    }
  }
}

/**
 * Give a unit an instruction: now (replacing its order and clearing its
 * queue), or, when Shift-queued and it is busy, after everything already queued.
 */
function give(game: Game, u: Unit, q: QueuedOrder, queued = false): void {
  if (queued && (u.order !== null || u.orderQueue.length > 0)) {
    u.orderQueue.push(q);
    return;
  }
  u.orderQueue = [];
  applyQueued(game, u, q);
}

/** Turn an instruction into the unit's current order. */
export function applyQueued(game: Game, u: Unit, q: QueuedOrder): void {
  switch (q.type) {
    case 'move':
      releaseFromNode(game, u);
      u.order = { type: 'move', x: q.x, y: q.y, pace: q.pace };
      u.move = null;
      return;
    case 'attackMove':
      releaseFromNode(game, u);
      u.order = { type: 'attackMove', x: q.x, y: q.y, targetId: -1, pace: q.pace };
      u.move = null;
      return;
    case 'attack': {
      const t = game.get(q.targetId);
      if (!targetable(t) || !isEnemy(game, u.owner, t.owner) || !game.vision.knows(u.owner, t)) return; // gone by now
      releaseFromNode(game, u);
      u.order = { type: 'attack', targetId: t.id, auto: false, anchorX: u.x, anchorY: u.y, lastX: t.x, lastY: t.y };
      u.move = null;
      return;
    }
    case 'gather': {
      const node = game.resource(q.nodeId);
      if (node) startGather(game, u, node);
      return;
    }
    case 'build':
      startBuild(game, u, q.buildingType, q.tx, q.ty);
      return;
    case 'repair': {
      const b = game.building(q.targetId);
      if (b) startRepair(game, u, b);
      return;
    }
    case 'hold':
      releaseFromNode(game, u);
      u.order = { type: 'hold', targetId: -1 };
      u.move = null;
      return;
  }
}

/**
 * A compact group ordered together marches at its slowest member's speed so
 * it arrives together; a scattered selection (or a lone unit) is not slowed.
 */
export function groupPace(units: Unit[]): number | undefined {
  if (units.length < 2) return undefined;
  const cx = units.reduce((s, u) => s + u.x, 0) / units.length;
  const cy = units.reduce((s, u) => s + u.y, 0) / units.length;
  if (units.some((u) => len(u.x - cx, u.y - cy) > CONFIG.movement.groupRadius)) return undefined;
  return Math.min(...units.map((u) => CONFIG.units[u.type].speed));
}

const SLOT_SPACING = 0.75;

/**
 * Distinct destination points for a group so units spread around the target
 * instead of fighting over one spot. Relative positions are kept when the
 * group is already compact, so formations survive a move.
 */
export function formationSlots(game: Game, units: Unit[], x: number, y: number): Array<{ x: number; y: number }> {
  if (units.length === 1) return [{ x, y }];
  const nav = game.nav;
  const r = Math.max(...units.map((u) => u.radius));
  // Anchor at the nearest standable point to the click.
  let anchor = { x, y };
  if (!nav.canStand(x, y, r)) {
    let best: { x: number; y: number } | null = null;
    for (let ring = 1; ring < 40 && !best; ring++) {
      for (let a = 0; a < ring * 8; a++) {
        const ang = (a / (ring * 8)) * Math.PI * 2;
        const px = x + dcos(ang) * ring * 0.5;
        const py = y + dsin(ang) * ring * 0.5;
        if (nav.canStand(px, py, r)) {
          best = { x: px, y: py };
          break;
        }
      }
    }
    if (best) anchor = best;
  }
  const comp = nav.component(Math.floor(anchor.x), Math.floor(anchor.y));
  const need = units.length;
  const cand: Array<{ x: number; y: number; d: number }> = [];
  for (let k = 0; cand.length < need * 2 && k < 30; k++) {
    // Square ring k of the lattice.
    for (let j = -k; j <= k; j++)
      for (let i = -k; i <= k; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== k) continue;
        const px = anchor.x + i * SLOT_SPACING;
        const py = anchor.y + j * SLOT_SPACING;
        if (!nav.canStand(px, py, r)) continue;
        if (nav.component(Math.floor(px), Math.floor(py)) !== comp) continue;
        cand.push({ x: px, y: py, d: len(i, j) });
      }
  }
  cand.sort((a, b) => a.d - b.d);
  const slots = cand.slice(0, need);
  while (slots.length < need) slots.push({ ...anchor, d: 0 });

  const cx = units.reduce((s, u) => s + u.x, 0) / need;
  const cy = units.reduce((s, u) => s + u.y, 0) / need;
  const spread = Math.max(...units.map((u) => len(u.x - cx, u.y - cy)));
  const keepShape = spread < 3;
  const used = new Array<boolean>(slots.length).fill(false);
  const out = new Array<{ x: number; y: number }>(need);
  // Assign units furthest from the target first; they have the least choice.
  const order = units
    .map((u, i) => ({ u, i, d: len(u.x - anchor.x, u.y - anchor.y) }))
    .sort((a, b) => b.d - a.d || a.u.id - b.u.id);
  for (const { u, i } of order) {
    const px = keepShape ? anchor.x + (u.x - cx) : anchor.x + (u.x - anchor.x) * 0.05;
    const py = keepShape ? anchor.y + (u.y - cy) : anchor.y + (u.y - anchor.y) * 0.05;
    let best = -1;
    let bestD = Infinity;
    for (let s = 0; s < slots.length; s++) {
      if (used[s]) continue;
      const d = len(slots[s].x - px, slots[s].y - py);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    used[best] = true;
    out[i] = { x: slots[best].x, y: slots[best].y };
  }
  return out;
}

/** Why `player` cannot fire a Signal Flare from building `buildingId` now, or null. */
export function flareProblem(game: Game, player: number, buildingId: number): string | null {
  const b = game.building(buildingId);
  if (!b || b.owner !== player || !isHall(b.type)) return 'Signal Flares are fired from your main hall (Keep or Heartwood).';
  if (b.progress < 1) return 'Your main hall is not finished.';
  const p = game.player(player);
  if (p.flareReady > game.state.tick) return `Signal Flare ready in ${Math.ceil((p.flareReady - game.state.tick) / 20)}s.`;
  if (p.gold < CONFIG.flare.gold) return `Not enough gold (${CONFIG.flare.gold} needed).`;
  return null;
}

function fireFlare(game: Game, player: number, buildingId: number, x: number, y: number): void {
  const problem = flareProblem(game, player, buildingId);
  if (problem) {
    game.emit({ type: 'cantCast', player, reason: problem });
    return;
  }
  const { width, height } = game.state.map;
  const f = CONFIG.flare;
  const p = game.player(player);
  p.gold -= f.gold;
  p.flareReady = game.state.tick + secondsToTicks(f.cooldown);
  const fx = Math.max(0, Math.min(width, x));
  const fy = Math.max(0, Math.min(height, y));
  game.state.reveals.push({ owner: player, x: fx, y: fy, radius: f.radius, until: game.state.tick + secondsToTicks(f.seconds) });
  game.emit({ type: 'flare', player, x: fx, y: fy });
}
