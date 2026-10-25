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
import type { Building, Entity, RememberedBuilding, Unit } from './types';

export class Vision {
  readonly w: number;
  readonly h: number;
  /** One grid per player: 1 = visible now. */
  private visible: Uint8Array[];

  /**
   * `saved` restores the visibility a saved game had (see snapshot()):
   * recomputing on load would see units where they are now rather than
   * where they were at the last update, and a loaded match would drift.
   */
  constructor(
    private game: Game,
    saved?: string[],
  ) {
    const { width, height } = game.state.map;
    this.w = width;
    this.h = height;
    if (saved && saved.length === game.state.players.length && saved.every((s) => s.length === width * height)) {
      this.visible = saved.map((s) => Uint8Array.from(s, (c) => (c === '1' ? 1 : 0)));
    } else {
      this.visible = game.state.players.map(() => new Uint8Array(width * height));
      this.recompute();
    }
  }

  /** Current visibility, one string of 0s and 1s per player (part of a save). */
  snapshot(): string[] {
    return this.visible.map((v) => v.join(''));
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
    this.updateMemory();
  }

  /**
   * Last-seen snapshots of enemy buildings: refreshed while in view, kept
   * while out of view, dropped once the spot is in view and the building is
   * no longer there.
   */
  private updateMemory(): void {
    const { game } = this;
    const state = game.state;
    while (state.memory.length < state.players.length) state.memory.push([]);
    for (let p = 0; p < state.players.length; p++) {
      if (state.players[p].neutral) continue;
      for (const c of state.camps) if (c.cleared && !(c.seenClear & (1 << p)) && this.isVisible(p, Math.floor(c.x), Math.floor(c.y))) c.seenClear |= 1 << p;
      const mem = state.memory[p];
      for (const b of game.buildings()) {
        if (b.owner === p || state.players[b.owner]?.neutral || !this.seesBuilding(p, b)) continue;
        const snap = { id: b.id, type: b.type, owner: b.owner, tx: b.tx, ty: b.ty, w: b.w, h: b.h, x: b.x, y: b.y, tier: b.tier, done: b.progress >= 1, tick: state.tick };
        const i = mem.findIndex((m) => m.id === b.id);
        if (i >= 0) mem[i] = snap;
        else mem.push(snap);
      }
      state.memory[p] = mem.filter((m) => {
        const live = game.building(m.id);
        if (live && live.tx === m.tx && live.ty === m.ty) return true;
        // Gone (or replaced): forget it only once its footprint is in view.
        for (let ty = m.ty; ty < m.ty + m.h; ty++) for (let tx = m.tx; tx < m.tx + m.w; tx++) if (this.isVisible(p, tx, ty)) return false;
        return true;
      });
    }
  }

  /** Enemy buildings this player remembers (as last seen). */
  remembered(player: number): readonly RememberedBuilding[] {
    return this.game.state.memory[player] ?? [];
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
