// Grid A* with an inclusive goal rectangle and closest-node fallback, plus
// line-of-sight smoothing so units walk natural straight lines.

import type { NavGrid } from './nav';
import type { Vec } from './types';

/** Inclusive tile rectangle the search may end in. */
export interface GoalRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PathResult {
  /** Tile indices from start (exclusive) to end (inclusive). */
  tiles: number[];
  /** True if the path ends inside the goal rect. */
  reached: boolean;
}

const SQRT2 = Math.SQRT2;
const DIRS: ReadonlyArray<[number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

// Scratch buffers reused across searches (stamped by generation).
let cap = 0;
let gScore = new Float64Array(0);
let parent = new Int32Array(0);
let stamp = new Uint32Array(0);
let closed = new Uint32Array(0);
let gen = 0;

function ensure(n: number): void {
  if (n <= cap) return;
  cap = n;
  gScore = new Float64Array(n);
  parent = new Int32Array(n);
  stamp = new Uint32Array(n);
  closed = new Uint32Array(n);
}

function octile(dx: number, dy: number): number {
  const a = Math.abs(dx);
  const b = Math.abs(dy);
  return a > b ? a + (SQRT2 - 1) * b : b + (SQRT2 - 1) * a;
}

function hToRect(x: number, y: number, g: GoalRect): number {
  const dx = x < g.x0 ? g.x0 - x : x > g.x1 ? x - g.x1 : 0;
  const dy = y < g.y0 ? g.y0 - y : y > g.y1 ? y - g.y1 : 0;
  return octile(dx, dy);
}

/** Binary min-heap of (f, index) pairs. */
class Heap {
  f: number[] = [];
  v: number[] = [];
  get size(): number {
    return this.v.length;
  }
  push(f: number, v: number): void {
    const F = this.f;
    const V = this.v;
    let i = V.length;
    F.push(f);
    V.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p] <= f) break;
      F[i] = F[p];
      V[i] = V[p];
      i = p;
    }
    F[i] = f;
    V[i] = v;
  }
  pop(): number {
    const F = this.f;
    const V = this.v;
    const top = V[0];
    const lf = F.pop()!;
    const lv = V.pop()!;
    const n = V.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && F[c + 1] < F[c]) c++;
        if (F[c] >= lf) break;
        F[i] = F[c];
        V[i] = V[c];
        i = c;
      }
      F[i] = lf;
      V[i] = lv;
    }
    return top;
  }
}

export function findPath(
  nav: NavGrid,
  sx: number,
  sy: number,
  goal: GoalRect,
  maxNodes = 20000,
): PathResult {
  const { w, h } = nav;
  ensure(w * h);
  gen++;
  if (gen === 0xffffffff) {
    stamp.fill(0);
    closed.fill(0);
    gen = 1;
  }
  sx = Math.min(w - 1, Math.max(0, sx));
  sy = Math.min(h - 1, Math.max(0, sy));
  const start = sy * w + sx;
  const heap = new Heap();
  stamp[start] = gen;
  gScore[start] = 0;
  parent[start] = -1;
  heap.push(hToRect(sx, sy, goal), start);

  let best = start;
  let bestH = hToRect(sx, sy, goal);
  let bestG = 0;
  let found = -1;
  let expanded = 0;

  while (heap.size > 0 && expanded < maxNodes) {
    const cur = heap.pop();
    if (closed[cur] === gen) continue;
    closed[cur] = gen;
    expanded++;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    const cg = gScore[cur];
    const ch = hToRect(cx, cy, goal);
    if (ch === 0 && (cur === start || nav.passable(cx, cy))) {
      found = cur;
      break;
    }
    if (ch < bestH || (ch === bestH && cg < bestG)) {
      best = cur;
      bestH = ch;
      bestG = cg;
    }
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!nav.passable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!nav.passable(cx + dx, cy) || !nav.passable(cx, cy + dy))) continue;
      const ni = ny * w + nx;
      if (closed[ni] === gen) continue;
      const ng = cg + cost;
      if (stamp[ni] === gen && ng >= gScore[ni]) continue;
      stamp[ni] = gen;
      gScore[ni] = ng;
      parent[ni] = cur;
      heap.push(ng + hToRect(nx, ny, goal) * 1.0001, ni);
    }
  }

  const end = found >= 0 ? found : best;
  const tiles: number[] = [];
  for (let i = end; i !== start && i >= 0; i = parent[i]) tiles.push(i);
  tiles.reverse();
  return { tiles, reached: found >= 0 };
}

/**
 * Turn a tile path into world waypoints, skipping intermediate points that are
 * directly visible (with clearance r) from the current anchor.
 */
export function smoothPath(nav: NavGrid, from: Vec, tiles: number[], r: number): Vec[] {
  const pts: Vec[] = tiles.map((i) => {
    const x = i % nav.w;
    return { x: x + 0.5, y: (i - x) / nav.w + 0.5 };
  });
  if (pts.length <= 1) return pts;
  const out: Vec[] = [];
  let anchor = from;
  let i = 0;
  while (i < pts.length) {
    let j = i;
    while (j + 1 < pts.length && nav.lineClear(anchor.x, anchor.y, pts[j + 1].x, pts[j + 1].y, r)) j++;
    out.push(pts[j]);
    anchor = pts[j];
    i = j + 1;
  }
  return out;
}
