// Fog of war. Each player sees circles around their units and buildings.
// - visible: what a player sees right now (derived, recomputed every
//   CONFIG.vision.updateTicks ticks, so it is deterministic).
// - explored: tiles a player has ever seen (saved in GameState).
// - Building.seenBy: bitmask of players who have seen that building; a seen
//   building stays known (and attackable) while it exists.
// Rules that use it: auto-targeting, attack orders, towers and the computer
// opponent only consider what their owner can currently see (or, for
// buildings, has seen).

import { CONFIG } from './config';
import type { Game } from './game';
import type { Building, Entity, Unit } from './types';

export class Vision {
  readonly w: number;
  readonly h: number;
  /** One grid per player: 1 = visible now. */
  private visible: Uint8Array[];

  constructor(private game: Game) {
    const { width, height } = game.state.map;
    this.w = width;
    this.h = height;
    this.visible = game.state.players.map(() => new Uint8Array(width * height));
    this.recompute();
  }

  isVisible(player: number, tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    return this.visible[player]?.[ty * this.w + tx] === 1;
  }

  isExplored(player: number, tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    return this.game.state.explored[player]?.[ty * this.w + tx] === 1;
  }

  /** Raw grid for renderers (read-only). */
  grid(player: number): Uint8Array {
    return this.visible[player];
  }

  recompute(): void {
    const { game, w, h } = this;
    const state = game.state;
    while (this.visible.length < state.players.length) this.visible.push(new Uint8Array(w * h));
    while (state.explored.length < state.players.length) state.explored.push(new Array(w * h).fill(0));
    for (const v of this.visible) v.fill(0);
    const reveal = (p: number, x: number, y: number, r: number) => {
      const vis = this.visible[p];
      const exp = state.explored[p];
      if (!vis) return;
      const r2 = r * r;
      const x0 = Math.max(0, Math.floor(x - r));
      const x1 = Math.min(w - 1, Math.floor(x + r));
      const y0 = Math.max(0, Math.floor(y - r));
      const y1 = Math.min(h - 1, Math.floor(y + r));
      for (let ty = y0; ty <= y1; ty++) {
        const dy = ty + 0.5 - y;
        for (let tx = x0; tx <= x1; tx++) {
          const dx = tx + 0.5 - x;
          if (dx * dx + dy * dy > r2) continue;
          const i = ty * w + tx;
          vis[i] = 1;
          exp[i] = 1;
        }
      }
    };
    for (const u of game.units()) if (u.owner >= 0) reveal(u.owner, u.x, u.y, CONFIG.units[u.type].sight);
    for (const b of game.buildings()) {
      const s = b.progress >= 1 ? CONFIG.buildings[b.type].sight : CONFIG.vision.foundationSight;
      reveal(b.owner, b.x, b.y, s + Math.max(b.w, b.h) / 2);
    }
    for (const r of state.reveals) reveal(r.owner, r.x, r.y, r.radius);
    // Remember which players have laid eyes on each building.
    for (const b of game.buildings())
      for (let p = 0; p < state.players.length; p++) if (!(b.seenBy & (1 << p)) && this.seesBuilding(p, b)) b.seenBy |= 1 << p;
  }

  private seesBuilding(p: number, b: Building): boolean {
    for (let ty = b.ty; ty < b.ty + b.h; ty++) for (let tx = b.tx; tx < b.tx + b.w; tx++) if (this.isVisible(p, tx, ty)) return true;
    return false;
  }

  /** Can `player` see this entity right now? Own entities always. */
  canSee(player: number, e: Entity): boolean {
    if (e.owner === player) return true;
    if (e.kind === 'unit') return !e.hidden && this.isVisible(player, Math.floor(e.x), Math.floor(e.y));
    if (e.kind === 'building') return this.seesBuilding(player, e);
    return this.isExplored(player, Math.floor(e.x), Math.floor(e.y));
  }

  /** Units: currently visible. Buildings: seen at some point and still standing. */
  knows(player: number, e: Unit | Building): boolean {
    if (e.kind === 'unit') return this.canSee(player, e);
    return e.owner === player || (e.seenBy & (1 << player)) !== 0;
  }
}
