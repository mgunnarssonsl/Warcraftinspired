// Commands are the only way players (human or AI) affect the simulation.
// They are validated here: a player can only command their own living units.

import type { Game } from './game';
import { releaseFromNode, startGather, startReturnCargo } from './gathering';
import type { Unit } from './types';

export type Command =
  | { type: 'move'; player: number; units: number[]; x: number; y: number }
  | { type: 'gather'; player: number; units: number[]; nodeId: number }
  | { type: 'returnCargo'; player: number; units: number[]; dropoffId?: number }
  | { type: 'stop'; player: number; units: number[] };

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
