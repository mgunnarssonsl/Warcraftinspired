// Derived navigation data: which tiles are blocked by terrain or static
// footprints (buildings, mines, trees), plus connected-component labels used
// for fast reachability checks. Rebuilt from GameState on load.

import type { Footprint, GameState } from './types';
import { terrainBlocks } from './types';

export class NavGrid {
  readonly w: number;
  readonly h: number;
  /** Count of static blockers per tile (terrain counts as one). */
  readonly occ: Uint8Array;
  /** Static entity id occupying each tile, 0 if none. */
  readonly entityAt: Int32Array;
  private comp: Int32Array;
  private compDirty = true;
  /** Bumped whenever passability changes; paths can compare against it. */
  version = 0;

  constructor(state: GameState) {
    const { width, height, terrain } = state.map;
    this.w = width;
    this.h = height;
    this.occ = new Uint8Array(width * height);
    this.entityAt = new Int32Array(width * height);
    this.comp = new Int32Array(width * height);
    for (let i = 0; i < terrain.length; i++) if (terrainBlocks(terrain[i])) this.occ[i] = 1;
    for (const e of Object.values(state.entities)) {
      if (e.kind !== 'unit') this.addFootprint(e.id, e);
    }
    this.version = state.navVersion;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  passable(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.occ[y * this.w + x] === 0;
  }

  /** Can a circle of radius r stand at (x, y) without overlapping blocked tiles? */
  canStand(x: number, y: number, r: number): boolean {
    return (
      this.passable(Math.floor(x - r), Math.floor(y - r)) &&
      this.passable(Math.floor(x + r), Math.floor(y - r)) &&
      this.passable(Math.floor(x - r), Math.floor(y + r)) &&
      this.passable(Math.floor(x + r), Math.floor(y + r))
    );
  }

  /**
   * Straight-line walkability with clearance r. Samples every STEP tiles; the
   * padding covers the corner a diagonal sweep can poke out between samples.
   */
  lineClear(x0: number, y0: number, x1: number, y1: number, r: number): boolean {
    const STEP = 0.1;
    const rr = r + STEP * 0.6;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len / STEP));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Endpoints only need plain clearance; they are where units actually stop.
      if (!this.canStand(x0 + dx * t, y0 + dy * t, i === 0 || i === steps ? r : rr)) return false;
    }
    return true;
  }

  addFootprint(id: number, f: Footprint): void {
    for (let y = f.ty; y < f.ty + f.h; y++)
      for (let x = f.tx; x < f.tx + f.w; x++) {
        const i = y * this.w + x;
        this.occ[i]++;
        this.entityAt[i] = id;
      }
    this.changed();
  }

  removeFootprint(f: Footprint): void {
    for (let y = f.ty; y < f.ty + f.h; y++)
      for (let x = f.tx; x < f.tx + f.w; x++) {
        const i = y * this.w + x;
        this.occ[i] = Math.max(0, this.occ[i] - 1);
        this.entityAt[i] = 0;
      }
    this.changed();
  }

  private changed(): void {
    this.compDirty = true;
    this.version++;
  }

  /** Connected-component id of a passable tile (0 = blocked/out of bounds). */
  component(x: number, y: number): number {
    if (!this.passable(x, y)) return 0;
    if (this.compDirty) this.rebuildComponents();
    return this.comp[y * this.w + x];
  }

  private rebuildComponents(): void {
    const { w, h, occ, comp } = this;
    comp.fill(0);
    let label = 0;
    const stack: number[] = [];
    for (let start = 0; start < w * h; start++) {
      if (occ[start] !== 0 || comp[start] !== 0) continue;
      label++;
      comp[start] = label;
      stack.push(start);
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % w;
        const y = (i - x) / w;
        // 4-connectivity matches the pathfinder (diagonals need both sides open).
        if (x > 0 && occ[i - 1] === 0 && comp[i - 1] === 0) (comp[i - 1] = label), stack.push(i - 1);
        if (x < w - 1 && occ[i + 1] === 0 && comp[i + 1] === 0) (comp[i + 1] = label), stack.push(i + 1);
        if (y > 0 && occ[i - w] === 0 && comp[i - w] === 0) (comp[i - w] = label), stack.push(i - w);
        if (y < h - 1 && occ[i + w] === 0 && comp[i + w] === 0) (comp[i + w] = label), stack.push(i + w);
      }
    }
    this.compDirty = false;
  }

  /** Is any passable tile adjacent to the footprint in the given component? */
  footprintReachableFrom(f: Footprint, comp: number): boolean {
    if (comp === 0) return false;
    for (let y = f.ty - 1; y <= f.ty + f.h; y++)
      for (let x = f.tx - 1; x <= f.tx + f.w; x++) {
        if (x >= f.tx && x < f.tx + f.w && y >= f.ty && y < f.ty + f.h) continue;
        if (this.component(x, y) === comp) return true;
      }
    return false;
  }
}
