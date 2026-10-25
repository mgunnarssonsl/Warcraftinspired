// Builds a skirmish map from its definition (src/sim/maps.ts). Features are
// authored for one half and the map is made point-symmetric (180° rotation)
// so both starting positions are identical. Seeded noise only roughens
// edges, so every seed keeps the same strategic layout.

import { CONFIG, type MineKind } from './config';
import { mapById, type MapDef } from './maps';
import { valueNoise } from './rng';
import { TERRAIN } from './types';

export interface MinePlacement {
  tx: number;
  ty: number;
  kind: MineKind;
  camp: number;
  label: string;
}

export interface StartPlacement {
  hq: { tx: number; ty: number };
}

export interface MapLayout {
  def: MapDef;
  width: number;
  height: number;
  terrain: number[];
  /** Tiles that hold a tree (index list, ascending). */
  trees: number[];
  /** Mirrored pairs: index 2k is player 1's side, 2k+1 its mirror. */
  mines: MinePlacement[];
  /** Mirrored pairs, like mines. */
  lairs: Array<{ x: number; y: number; level: 2 | 3 }>;
  /** Mirrored pairs (footprint top-left). */
  objectives: Array<{ type: 'shop' | 'fountain'; tx: number; ty: number }>;
  starts: StartPlacement[];
}

const HQ = CONFIG.buildings.hq.size;
const MINE = CONFIG.resources.goldmine.size;

/** Distance from (px, py) to segment a-b, and the position t along it. */
function onSegment(px: number, py: number, x0: number, y0: number, x1: number, y1: number): { d: number; t: number } {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  const t = ((px - x0) * dx + (py - y0) * dy) / len2;
  const ct = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(px - (x0 + dx * ct), py - (y0 + dy * ct)), t };
}

/** Is angle a within [a0, a1] (radians, any winding)? */
function angleIn(a: number, a0: number, a1: number): boolean {
  const norm = (v: number) => ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const s = norm(a - a0);
  return s <= norm(a1 - a0);
}

export function generateMap(seed: number, mapId?: string): MapLayout {
  const def = mapById(mapId);
  const W = def.width;
  const H = def.height;
  const terrain = new Array<number>(W * H).fill(TERRAIN.grass);
  const tree = new Uint8Array(W * H);
  const n = (x: number, y: number, s: number, k: number) => valueNoise(x, y, s, seed + k);
  const mirrorIndex = (i: number) => W * H - 1 - i;

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const px = x + 0.5;
      const py = y + 0.5;
      // Border forest, 2-5 tiles deep.
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (edge < 2 + n(x, y, 4, 1) * 3) tree[i] = 1;
      for (const f of def.forests) {
        const jitter = (n(x, y, 3, 2) - 0.5) * 2.5;
        if (x >= f.x0 + jitter && x <= f.x1 + jitter && y >= f.y0 + jitter && y <= f.y1 - jitter * 0.5) tree[i] = 1;
      }
      for (const [cx, cy, r] of def.groves) if (Math.hypot(px - cx, py - cy) < r + (n(x, y, 2.5, 3) - 0.5) * 2) tree[i] = 1;
      for (const [cx, cy, r] of def.lakes) {
        if (Math.hypot(px - cx, py - cy) < r + (n(x, y, 2, 4) - 0.5) * 1.5) {
          terrain[i] = TERRAIN.water;
          tree[i] = 0;
        }
      }
      for (const [x0, y0, x1, y1, g0, g1] of def.ridges) {
        const { d, t } = onSegment(px, py, x0, y0, x1, y1);
        if (t < 0 || t > 1 || (t > g0 && t < g1)) continue;
        if (d < 1.1 + n(x, y, 3, 5) * 0.6) {
          terrain[i] = TERRAIN.rock;
          tree[i] = 0;
        }
      }
      for (const [cx, cy, r] of def.outcrops) {
        if (Math.hypot(px - cx, py - cy) < r + (n(x, y, 2, 6) - 0.5)) {
          terrain[i] = TERRAIN.rock;
          tree[i] = 0;
        }
      }
      for (const rv of def.rivers) {
        const { d, t } = onSegment(px, py, rv.x0, rv.y0, rv.x1, rv.y1);
        // Smooth banks: no noise on the width, so fords stay exactly mirrored.
        if (d >= rv.width) continue;
        const ford = rv.fords.some(([a, b]) => t >= a && t <= b);
        terrain[i] = ford ? TERRAIN.dirt : TERRAIN.water;
        tree[i] = 0;
      }
      for (const ring of def.rings) {
        const d = Math.hypot(px - ring.cx, py - ring.cy);
        if (Math.abs(d - ring.r) > ring.width) continue;
        const a = Math.atan2(py - ring.cy, px - ring.cx);
        if (ring.ramps.some(([a0, a1]) => angleIn(a, a0, a1))) {
          terrain[i] = TERRAIN.dirt;
          tree[i] = 0;
          continue;
        }
        terrain[i] = TERRAIN.rock;
        tree[i] = 0;
      }
    }

  // Point symmetry: union features from both halves so either side may author them.
  for (let i = 0; i < W * H; i++) {
    const j = mirrorIndex(i);
    if (i >= j) continue;
    // Rock and water outrank dirt and grass.
    const rank = (t: number) => (t === TERRAIN.rock ? 3 : t === TERRAIN.water ? 2 : t === TERRAIN.dirt ? 1 : 0);
    const t = rank(terrain[i]) >= rank(terrain[j]) ? terrain[i] : terrain[j];
    terrain[i] = terrain[j] = t;
    tree[i] = tree[j] = tree[i] | tree[j];
  }

  const clearRect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
        tree[y * W + x] = 0;
        if (terrain[y * W + x] !== TERRAIN.dirt) terrain[y * W + x] = TERRAIN.grass;
      }
  };
  const clearMirrored = (x0: number, y0: number, x1: number, y1: number) => {
    clearRect(x0, y0, x1, y1);
    clearRect(W - 1 - x1, H - 1 - y1, W - 1 - x0, H - 1 - y0);
  };
  const start = def.start;
  const startMine = def.mines.find((m) => m.kind === 'start') ?? def.mines[0];
  // Keep space around the bases, mines, lairs and objectives.
  clearMirrored(start.tx - 3, start.ty - 3, start.tx + HQ + 2, start.ty + HQ + 3);
  clearMirrored(start.tx + HQ, start.ty, startMine.tx, start.ty + HQ - 1);
  for (const m of def.mines) clearMirrored(m.tx - 2, m.ty - 2, m.tx + MINE + 1, m.ty + MINE + 1);
  for (const l of def.lairs) clearMirrored(Math.floor(l.x) - 2, Math.floor(l.y) - 2, Math.floor(l.x) + 2, Math.floor(l.y) + 2);
  for (const o of def.objectives) {
    const s = CONFIG.buildings[o.type].size;
    clearMirrored(o.tx - 1, o.ty - 1, o.tx + s, o.ty + s);
  }

  // Cosmetic dirt around each base (noise sampled in mirrored coordinates).
  const cx = start.tx + HQ / 2;
  const cy = start.ty + HQ / 2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (terrain[i] !== TERRAIN.grass || tree[i]) continue;
      const south = y >= H / 2;
      const lx = south ? x : W - 1 - x;
      const ly = south ? y : H - 1 - y;
      if (Math.hypot(lx + 0.5 - cx, ly + 0.5 - cy) < 5.5 + n(lx, ly, 2, 7) * 2.5) terrain[i] = TERRAIN.dirt;
    }

  const mirrorFoot = (tx: number, ty: number, w: number, h: number) => ({ tx: W - tx - w, ty: H - ty - h });
  const mines: MinePlacement[] = [];
  for (const m of def.mines) {
    const p = { tx: m.tx, ty: m.ty, kind: m.kind, camp: m.camp, label: m.label };
    mines.push(p, { ...p, ...mirrorFoot(m.tx, m.ty, MINE, MINE) });
  }
  const lairs: MapLayout['lairs'] = [];
  for (const l of def.lairs) lairs.push(l, { x: W - l.x, y: H - l.y, level: l.level });
  const objectives: MapLayout['objectives'] = [];
  for (const o of def.objectives) {
    const s = CONFIG.buildings[o.type].size;
    objectives.push(o, { type: o.type, ...mirrorFoot(o.tx, o.ty, s, s) });
  }
  const trees: number[] = [];
  for (let i = 0; i < W * H; i++) if (tree[i] && terrain[i] !== TERRAIN.water && terrain[i] !== TERRAIN.rock) trees.push(i);

  return {
    def,
    width: W,
    height: H,
    terrain,
    trees,
    mines,
    lairs,
    objectives,
    starts: [{ hq: { ...start } }, { hq: mirrorFoot(start.tx, start.ty, HQ, HQ) }],
  };
}
