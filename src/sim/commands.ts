// Commands are the only way players (human or AI) affect the simulation.
// They are validated here: a player can only command their own living units.

import { CONFIG, type BuildingType, type UnitType } from './config';
import { cancelConstruction, checkPlacement, resumeBuild, shortfall, startBuild } from './construction';
import type { Game } from './game';
import { cancelTraining, enqueue, setRally } from './production';
import { releaseFromNode, startGather, startReturnCargo } from './gathering';
import type { Unit } from './types';

export type Command =
  | { type: 'move'; player: number; units: number[]; x: number; y: number }
  | { type: 'gather'; player: number; units: number[]; nodeId: number }
  | { type: 'returnCargo'; player: number; units: number[]; dropoffId?: number }
  | { type: 'stop'; player: number; units: number[] }
  | { type: 'build'; player: number; units: number[]; buildingType: BuildingType; tx: number; ty: number }
  | { type: 'resumeBuild'; player: number; units: number[]; buildingId: number }
  | { type: 'cancelBuild'; player: number; buildingId: number }
  | { type: 'train'; player: number; buildingId: number; unit: UnitType }
  | { type: 'cancelTrain'; player: number; buildingId: number; index: number }
  | { type: 'setRally'; player: number; buildingId: number; x: number; y: number; targetId: number };

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
  }
  const units = ownUnits(game, cmd.player, cmd.units);
  if (!units.length) return;
  switch (cmd.type) {
    case 'move': {
      const slots = formationSlots(game, units, cmd.x, cmd.y);
      units.forEach((u, i) => {
        releaseFromNode(game, u);
        u.order = { type: 'move', x: slots[i].x, y: slots[i].y };
        u.move = null;
      });
      return;
    }
    case 'gather': {
      const node = game.resource(cmd.nodeId);
      if (!node) return;
      for (const u of units) if (u.type === 'worker') startGather(game, u, node);
      return;
    }
    case 'returnCargo': {
      for (const u of units) if (u.type === 'worker') startReturnCargo(game, u, cmd.dropoffId ?? -1);
      return;
    }
    case 'build': {
      if (!(cmd.buildingType in CONFIG.buildings)) return;
      const workers = units.filter((u) => u.type === 'worker');
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
      // The nearest selected worker goes; the rest keep their orders.
      const builder = workers.reduce((a, b) => (Math.hypot(a.x - cx, a.y - cy) <= Math.hypot(b.x - cx, b.y - cy) ? a : b));
      startBuild(game, builder, cmd.buildingType, cmd.tx, cmd.ty);
      return;
    }
    case 'resumeBuild': {
      const site = game.building(cmd.buildingId);
      if (!site) return;
      for (const u of units) if (u.type === 'worker') resumeBuild(game, u, site);
      return;
    }
    case 'stop': {
      for (const u of units) {
        releaseFromNode(game, u);
        u.order = null;
        u.move = null;
      }
      return;
    }
  }
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
        const px = x + Math.cos(ang) * ring * 0.5;
        const py = y + Math.sin(ang) * ring * 0.5;
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
        cand.push({ x: px, y: py, d: Math.hypot(i, j) });
      }
  }
  cand.sort((a, b) => a.d - b.d);
  const slots = cand.slice(0, need);
  while (slots.length < need) slots.push({ ...anchor, d: 0 });

  const cx = units.reduce((s, u) => s + u.x, 0) / need;
  const cy = units.reduce((s, u) => s + u.y, 0) / need;
  const spread = Math.max(...units.map((u) => Math.hypot(u.x - cx, u.y - cy)));
  const keepShape = spread < 3;
  const used = new Array<boolean>(slots.length).fill(false);
  const out = new Array<{ x: number; y: number }>(need);
  // Assign units furthest from the target first; they have the least choice.
  const order = units
    .map((u, i) => ({ u, i, d: Math.hypot(u.x - anchor.x, u.y - anchor.y) }))
    .sort((a, b) => b.d - a.d || a.u.id - b.u.id);
  for (const { u, i } of order) {
    const px = keepShape ? anchor.x + (u.x - cx) : anchor.x + (u.x - anchor.x) * 0.05;
    const py = keepShape ? anchor.y + (u.y - cy) : anchor.y + (u.y - anchor.y) * 0.05;
    let best = -1;
    let bestD = Infinity;
    for (let s = 0; s < slots.length; s++) {
      if (used[s]) continue;
      const d = Math.hypot(slots[s].x - px, slots[s].y - py);
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
