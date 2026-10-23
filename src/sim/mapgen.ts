// The skirmish map "Twin Vales". Features are authored once and the map is
// made point-symmetric (180° rotation) so both starting positions are
// identical. Seeded noise only roughens edges, so every
// seed keeps the same strategic layout.

import { CONFIG } from './config';
import { valueNoise } from './rng';
import { TERRAIN } from './types';

export const MAP_W = 96;
export const MAP_H = 72;

export interface MinePlacement {
  tx: number;
  ty: number;
  amount: number;
  role: keyof typeof CONFIG.mines;
}

export interface StartPlacement {
  hq: { tx: number; ty: number };
}

export interface MapLayout {
  width: number;
  height: number;
  terrain: number[];
  /** Tiles that hold a tree (index list, ascending). */
  trees: number[];
  mines: MinePlacement[];
  starts: StartPlacement[];
}

const HQ = CONFIG.buildings.hq.size;
const MINE = CONFIG.resources.goldmine.size;

// Player 0 starts in the south-west. Mirror: (x, y) -> (W-1-x, H-1-y).
const START = { tx: 10, ty: 56 };
const MINES: MinePlacement[] = [
  { tx: 18, ty: 57, amount: CONFIG.mines.start, role: 'start' },
  { tx: 11, ty: 47, amount: CONFIG.mines.small, role: 'small' },
  { tx: 36, ty: 60, amount: CONFIG.mines.natural, role: 'natural' },
  { tx: 8, ty: 25, amount: CONFIG.mines.far, role: 'far' },
  { tx: 37, ty: 38, amount: CONFIG.mines.center, role: 'center' },
];
const FORESTS: Array<{ x0: number; y0: number; x1: number; y1: number }> = [
  { x0: 3, y0: 64, x1: 33, y1: 71 }, // south of the base
  { x0: 2, y0: 38, x1: 6, y1: 71 }, // west of the base
];
const GROVES: Array<[number, number, number]> = [
  [5, 46, 3.5],
  [24, 44, 3.5],
  [31, 53, 2.8],
  [19, 31, 4.5],
  [47, 57, 3.5],
  [55, 64, 4],
  [14, 15, 4],
  [28, 22, 3],
  [40, 68, 4],
];
const LAKES: Array<[number, number, number]> = [
  [26, 50, 2.6],
  [62, 46, 3],
];
// Rock ridges: [x0, y0, x1, y1, gapStart, gapEnd] with the gap in t-space.
const RIDGES: Array<[number, number, number, number, number, number]> = [
  [13, 36, 32, 43, 0.48, 0.62],
  [41, 47, 46, 62, 0.45, 0.62],
];
const OUTCROPS: Array<[number, number, number]> = [
  [46.5, 35.5, 2.2],
  [70, 60, 1.8],
];

export function mirrorIndex(i: number): number {
  return MAP_W * MAP_H - 1 - i;
}

export function mirrorFootprint(tx: number, ty: number, w: number, h: number): { tx: number; ty: number } {
  return { tx: MAP_W - tx - w, ty: MAP_H - ty - h };
}

export function generateMap(seed: number): MapLayout {
  const W = MAP_W;
  const H = MAP_H;
  const terrain = new Array<number>(W * H).fill(TERRAIN.grass);
  const tree = new Uint8Array(W * H);
  const n = (x: number, y: number, s: number, k: number) => valueNoise(x, y, s, seed + k);

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // Border forest, 2-5 tiles deep.
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (edge < 2 + n(x, y, 4, 1) * 3) tree[i] = 1;
      for (const f of FORESTS) {
        const jitter = (n(x, y, 3, 2) - 0.5) * 2.5;
        if (x >= f.x0 + jitter && x <= f.x1 + jitter && y >= f.y0 + jitter && y <= f.y1 - jitter * 0.5) tree[i] = 1;
      }
      for (const [cx, cy, r] of GROVES) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r + (n(x, y, 2.5, 3) - 0.5) * 2) tree[i] = 1;
      }
      for (const [cx, cy, r] of LAKES) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r + (n(x, y, 2, 4) - 0.5) * 1.5) {
          terrain[i] = TERRAIN.water;
          tree[i] = 0;
        }
      }
      for (const [x0, y0, x1, y1, g0, g1] of RIDGES) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len2 = dx * dx + dy * dy;
        const t = ((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / len2;
        if (t < 0 || t > 1 || (t > g0 && t < g1)) continue;
        const d = Math.hypot(x + 0.5 - (x0 + dx * t), y + 0.5 - (y0 + dy * t));
        if (d < 1.1 + n(x, y, 3, 5) * 0.6) {
          terrain[i] = TERRAIN.rock;
          tree[i] = 0;
        }
      }
      for (const [cx, cy, r] of OUTCROPS) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r + (n(x, y, 2, 6) - 0.5)) {
          terrain[i] = TERRAIN.rock;
          tree[i] = 0;
        }
      }
    }

  // Point symmetry: union features from both halves so either side may author them.
  for (let i = 0; i < W * H; i++) {
    const j = mirrorIndex(i);
    if (i >= j) continue;
    const t = Math.max(terrain[i], terrain[j]);
    terrain[i] = terrain[j] = t;
    tree[i] = tree[j] = tree[i] | tree[j];
  }

  const clearRect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
        tree[y * W + x] = 0;
        terrain[y * W + x] = TERRAIN.grass;
      }
  };
  const clearMirrored = (x0: number, y0: number, x1: number, y1: number) => {
    clearRect(x0, y0, x1, y1);
    clearRect(W - 1 - x1, H - 1 - y1, W - 1 - x0, H - 1 - y0);
  };
  // Keep space around the bases and mines; workers need room to walk.
  clearMirrored(START.tx - 3, START.ty - 3, START.tx + HQ + 2, START.ty + HQ + 3);
  clearMirrored(START.tx + HQ, START.ty, MINES[0].tx, START.ty + HQ - 1);
  for (const m of MINES) clearMirrored(m.tx - 2, m.ty - 2, m.tx + MINE + 1, m.ty + MINE + 1);

  // Cosmetic dirt around each base (noise sampled in mirrored coordinates).
  const cx = START.tx + HQ / 2;
  const cy = START.ty + HQ / 2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (terrain[i] !== TERRAIN.grass || tree[i]) continue;
      const south = y >= H / 2;
      const lx = south ? x : W - 1 - x;
      const ly = south ? y : H - 1 - y;
      if (Math.hypot(lx + 0.5 - cx, ly + 0.5 - cy) < 5.5 + n(lx, ly, 2, 7) * 2.5) terrain[i] = TERRAIN.dirt;
    }

  const mines: MinePlacement[] = [];
  for (const m of MINES) {
    mines.push(m);
    const mm = mirrorFootprint(m.tx, m.ty, MINE, MINE);
    mines.push({ ...m, tx: mm.tx, ty: mm.ty });
  }
  const enemy = mirrorFootprint(START.tx, START.ty, HQ, HQ);
  const trees: number[] = [];
  for (let i = 0; i < W * H; i++) if (tree[i] && terrain[i] !== TERRAIN.water && terrain[i] !== TERRAIN.rock) trees.push(i);

  return {
    width: W,
    height: H,
    terrain,
    trees,
    mines,
    starts: [{ hq: { ...START } }, { hq: enemy }],
  };
}
