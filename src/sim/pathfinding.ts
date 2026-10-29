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
  /** Tiles the search expanded (its cost). */
  expanded: number;
}

const SQRT2 = Math.SQRT2;

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

// Binary min-heap of (f, tile) pairs in reused typed arrays. The same
// sift rules as a plain array heap, so ties pop in the same order.
let heapF = new Float64Array(1024);
let heapV = new Int32Array(1024);
let heapN = 0;

function heapPush(f: number, v: number): void {
  if (heapN === heapV.length) {
    const F = new Float64Array(heapN * 2);
    const V = new Int32Array(heapN * 2);
    F.set(heapF);
    V.set(heapV);
    heapF = F;
    heapV = V;
  }
  let i = heapN++;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heapF[p] <= f) break;
    heapF[i] = heapF[p];
    heapV[i] = heapV[p];
    i = p;
  }
  heapF[i] = f;
  heapV[i] = v;
}

function heapPop(): number {
  const top = heapV[0];
  const n = --heapN;
  if (n > 0) {
    const lf = heapF[n];
    const lv = heapV[n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && heapF[c + 1] < heapF[c]) c++;
      if (heapF[c] >= lf) break;
      heapF[i] = heapF[c];
      heapV[i] = heapV[c];
      i = c;
    }
    heapF[i] = lf;
    heapV[i] = lv;
  }
  return top;
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

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
  // A goal no walkable tile of which connects to the start (under a
  // building, on an island, across a wall) would make A* search every tile
  // it can reach before settling for the closest one. Aim straight for that
  // closest tile instead: the same place, found in one pass over the grid.
  const asked = goal;
  const startComp = nav.component(sx, sy);
  if (startComp > 0 && !rectInComponent(nav, goal, startComp)) {
    const near = nearestInComponent(nav, goal, startComp, sx, sy);
    if (near >= 0) {
      const nx = near % w;
      const ny = (near - nx) / w;
      goal = { x0: nx, y0: ny, x1: nx, y1: ny };
    }
  }
  heapN = 0;
  const occ = nav.occ;
  stamp[start] = gen;
  gScore[start] = 0;
  parent[start] = -1;
  heapPush(hToRect(sx, sy, goal), start);

  let best = start;
  let bestH = hToRect(sx, sy, goal);
  let bestG = 0;
  let found = -1;
  let expanded = 0;

  while (heapN > 0 && expanded < maxNodes) {
    const cur = heapPop();
    if (closed[cur] === gen) continue;
    closed[cur] = gen;
    expanded++;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    const cg = gScore[cur];
    const ch = hToRect(cx, cy, goal);
    if (ch === 0 && (cur === start || occ[cur] === 0)) {
      found = cur;
      break;
    }
    if (ch < bestH || (ch === bestH && cg < bestG)) {
      best = cur;
      bestH = ch;
      bestG = cg;
    }
    // Which of the four sides are open decides the diagonals too.
    const e = cx + 1 < w && occ[cur + 1] === 0;
    const wst = cx > 0 && occ[cur - 1] === 0;
    const s = cy + 1 < h && occ[cur + w] === 0;
    const n = cy > 0 && occ[cur - w] === 0;
    for (let d = 0; d < 8; d++) {
      const dx = DX[d];
      const dy = DY[d];
      let ok: boolean;
      let cost = 1;
      if (d < 4) ok = d === 0 ? e : d === 1 ? wst : d === 2 ? s : n;
      else {
        cost = SQRT2;
        ok = (dx > 0 ? e : wst) && (dy > 0 ? s : n) && occ[cur + dy * w + dx] === 0;
      }
      if (!ok) continue;
      const ni = cur + dy * w + dx;
      if (closed[ni] === gen) continue;
      const ng = cg + cost;
      if (stamp[ni] === gen && ng >= gScore[ni]) continue;
      stamp[ni] = gen;
      gScore[ni] = ng;
      parent[ni] = cur;
      heapPush(ng + hToRect(cx + dx, cy + dy, goal) * 1.0001, ni);
    }
  }

  const end = found >= 0 ? found : best;
  const tiles: number[] = [];
  for (let i = end; i !== start && i >= 0; i = parent[i]) tiles.push(i);
  tiles.reverse();
  return { tiles, reached: found >= 0 && goal === asked, expanded };
}

/** Does the goal rectangle hold a walkable tile of this connected region? */
function rectInComponent(nav: NavGrid, g: GoalRect, comp: number): boolean {
  for (let y = Math.max(0, g.y0); y <= Math.min(nav.h - 1, g.y1); y++)
    for (let x = Math.max(0, g.x0); x <= Math.min(nav.w - 1, g.x1); x++) if (nav.component(x, y) === comp) return true;
  return false;
}

/**
 * The walkable tile of this region closest to the goal (as the search's
 * own fallback would pick it: nearest by the heuristic, then nearest the
 * start, then lowest index), or -1.
 */
function nearestInComponent(nav: NavGrid, g: GoalRect, comp: number, sx: number, sy: number): number {
  let best = -1;
  let bestH = Infinity;
  let bestS = Infinity;
  for (let y = 0; y < nav.h; y++)
    for (let x = 0; x < nav.w; x++) {
      const h = hToRect(x, y, g);
      if (h > bestH) continue;
      if (nav.component(x, y) !== comp) continue;
      const s = octile(x - sx, y - sy);
      if (h < bestH || s < bestS) {
        best = y * nav.w + x;
        bestH = h;
        bestS = s;
      }
    }
  return best;
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
  const clear = (k: number) => nav.lineClear(anchor.x, anchor.y, pts[k].x, pts[k].y, r);
  while (i < pts.length) {
    // The farthest point ahead in a straight clear line: gallop out
    // (1, 2, 4... points ahead) while clear, then narrow down between the
    // last clear point and the first blocked one. Checking one point at a
    // time cost time growing with the square of the path's length.
    let j = i;
    let step = 1;
    while (j + step < pts.length && clear(j + step)) {
      j += step;
      step *= 2;
    }
    let hi = Math.min(pts.length, j + step); // first index not known clear
    while (hi - j > 1) {
      const mid = (j + hi) >> 1;
      if (clear(mid)) j = mid;
      else hi = mid;
    }
    out.push(pts[j]);
    anchor = pts[j];
    i = j + 1;
  }
  return out;
}
