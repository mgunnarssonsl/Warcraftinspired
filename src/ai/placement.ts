// Building placement for computer players. Sites keep a one-tile gap from
// other obstacles and stay out of the lanes between Keeps and their mines,
// so the computer never walls off its own economy.

import { CONFIG, type BuildingType } from '../sim/config';
import { checkPlacement } from '../sim/construction';
import type { Game } from '../sim/game';
import { distToRect } from '../sim/movement';
import type { Footprint } from '../sim/types';
import { isHall } from '../sim/factions';

const overlaps = (a: Footprint, b: Footprint) =>
  a.tx < b.tx + b.w && b.tx < a.tx + a.w && a.ty < b.ty + b.h && b.ty < a.ty + a.h;

function rectGap(a: Footprint, b: Footprint): number {
  const dx = Math.max(0, b.tx - (a.tx + a.w), a.tx - (b.tx + b.w));
  const dy = Math.max(0, b.ty - (a.ty + a.h), a.ty - (b.ty + b.h));
  return Math.max(dx, dy);
}

/** Bounding boxes between each of the player's Keeps and its nearby mines. */
export function miningLanes(game: Game, player: number): Footprint[] {
  const lanes: Footprint[] = [];
  for (const k of game.buildings()) {
    if (k.owner !== player || !isHall(k.type)) continue;
    for (const m of game.resources()) {
      if (m.type !== 'goldmine' || distToRect(m.x, m.y, k) > 12) continue;
      const tx = Math.min(k.tx, m.tx) - 1;
      const ty = Math.min(k.ty, m.ty) - 1;
      lanes.push({ tx, ty, w: Math.max(k.tx + k.w, m.tx + m.w) + 1 - tx, h: Math.max(k.ty + k.h, m.ty + m.h) + 1 - ty });
    }
  }
  return lanes;
}

function padFree(game: Game, f: Footprint): boolean {
  for (let y = f.ty - 1; y <= f.ty + f.h; y++)
    for (let x = f.tx - 1; x <= f.tx + f.w; x++) if (!game.nav.passable(x, y)) return false;
  return true;
}

/** Nearest acceptable site for `type` around (x, y), or null. */
export function findSite(game: Game, player: number, type: BuildingType, x: number, y: number, maxRing = 16): Footprint | null {
  const s = CONFIG.buildings[type].size;
  const lanes = miningLanes(game, player);
  const mines = game.resources().filter((r) => r.type === 'goldmine');
  // Keeps sit a little back from their mine; everything else keeps clear of mines.
  const mineGap = isHall(type) ? 3 : 2;
  // Maps are point-symmetric. A player starting in the rotated half scans in
  // the rotated order, so both sides build mirror-image bases: the order of a
  // search must never favour one seat.
  const { width: W, height: H } = game.state.map;
  const start = game.state.starts[player];
  const flip = !!start && start.x + start.y > (W + H) / 2;
  const cx = flip ? W - s - Math.round(W - x - s / 2) : Math.round(x - s / 2);
  const cy = flip ? H - s - Math.round(H - y - s / 2) : Math.round(y - s / 2);
  const sign = flip ? -1 : 1;
  for (let r = 0; r <= maxRing; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const f = { tx: cx + sign * dx, ty: cy + sign * dy, w: s, h: s };
        if (!checkPlacement(game, type, f.tx, f.ty).ok || !padFree(game, f)) continue;
        if (lanes.some((l) => overlaps(l, f))) continue;
        if (mines.some((m) => rectGap(m, f) < mineGap)) continue;
        return f;
      }
  return null;
}
