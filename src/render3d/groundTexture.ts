// Ground texture painted on a canvas at TILE pixels per tile, then draped
// over the 3D ground plane. Height comes from 3D props (rocks, trees).

import { hash2, valueNoise } from '../sim/rng';
import { TERRAIN, type MapData } from '../sim/types';

export const TILE = 32;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

/** Paint the ground texture (grass, dirt, lake beds, rocky ground, forest floor). */
export function paintGround(map: MapData, seed: number, trees?: Uint8Array): HTMLCanvasElement {
  const { width: W, height: H, terrain } = map;
  const [small, sctx] = canvas(W, H);
  const grassA: [number, number, number] = [106, 152, 62];
  const grassB: [number, number, number] = [138, 182, 78];
  const meadow: [number, number, number] = [92, 136, 56];
  const dirtA: [number, number, number] = [174, 138, 92];
  const dirtB: [number, number, number] = [200, 166, 112];
  const forest: [number, number, number] = [96, 116, 58];
  const forestNear = (x: number, y: number) => {
    if (!trees) return 0;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && trees[yy * W + xx]) n++;
      }
    return n / 9;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = terrain[y * W + x];
      const n = valueNoise(x, y, 6, seed + 11);
      const big = valueNoise(x, y, 16, seed + 17);
      let col: string;
      if (t === TERRAIN.water) col = mix([46, 84, 104], [56, 98, 118], n);
      else if (t === TERRAIN.dirt) col = mix(dirtA, dirtB, n);
      else if (t === TERRAIN.rock) col = mix([140, 130, 114], [160, 150, 132], n);
      else {
        const g = mix(grassA, grassB, n * 0.7 + big * 0.3);
        const f = forestNear(x, y);
        const parsed = g.match(/\d+/g)!.map(Number) as [number, number, number];
        const base: [number, number, number] = big < 0.35 ? (mix(meadow, parsed, big / 0.35).match(/\d+/g)!.map(Number) as [number, number, number]) : parsed;
        col = f > 0 ? mix(base, forest, Math.min(1, f * 1.4)) : mix(base, base, 0);
      }
      sctx.fillStyle = col;
      sctx.fillRect(x, y, 1, 1);
    }
  const [big, ctx] = canvas(W * TILE, H * TILE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // A soft blur breaks the tile grid at every edge between surfaces.
  ctx.filter = `blur(${TILE * 0.3}px)`;
  ctx.drawImage(small, -TILE / 2, -TILE / 2, (W + 1) * TILE, (H + 1) * TILE);
  ctx.filter = 'none';

  // Fine speckle texture.
  const [tex, tctx] = canvas(128, 128);
  for (let i = 0; i < 1400; i++) {
    const h1 = hash2(i, 1, seed);
    const h2 = hash2(i, 2, seed);
    const h3 = hash2(i, 3, seed);
    tctx.fillStyle = h3 > 0.5 ? 'rgba(255,255,230,0.05)' : 'rgba(0,0,0,0.06)';
    tctx.fillRect(Math.floor(h1 * 128), Math.floor(h2 * 128), 2, 2);
  }
  ctx.fillStyle = ctx.createPattern(tex, 'repeat')!;
  ctx.fillRect(0, 0, W * TILE, H * TILE);

  // Painterly brushwork, batched by colour so it stays fast.
  const strokes: Record<string, Path2D> = {};
  const dots: Record<string, Path2D> = {};
  const path = (rec: Record<string, Path2D>, c: string) => (rec[c] ??= new Path2D());
  // Each ellipse starts its own subpath: without the moveTo, a batched path joins
  // consecutive ellipses with straight lines, and filling it paints long spikes.
  const oval = (p: Path2D, x: number, y: number, rx: number, ry: number, rot: number) => {
    p.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
    p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  };
  const GRASS_STROKES = ['rgba(176,214,104,0.5)', 'rgba(70,112,40,0.45)', 'rgba(150,196,86,0.4)'];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = terrain[y * W + x];
      const px = x * TILE;
      const py = y * TILE;
      const r = hash2(x, y, seed + 3);
      if (t === TERRAIN.grass) {
        const n = 4 + Math.floor(r * 5);
        for (let k = 0; k < n; k++) {
          const gx = px + hash2(x * 7 + k, y, seed) * TILE;
          const gy = py + hash2(x, y * 7 + k, seed) * TILE;
          const p = path(strokes, GRASS_STROKES[k % 3]);
          p.moveTo(gx, gy);
          p.quadraticCurveTo(gx + 1, gy - 3, gx + 3, gy - 6);
          p.moveTo(gx + 2, gy);
          p.quadraticCurveTo(gx + 2, gy - 3, gx + 1, gy - 5);
        }
        if (trees && trees[y * W + x] === 0 && forestNear(x, y) > 0 && r < 0.6) {
          // Leaf litter at the forest edge.
          for (let k = 0; k < 4; k++) {
            const lx = px + hash2(k, x, y + seed) * TILE;
            const ly = py + hash2(y, k, x + seed) * TILE;
            oval(path(dots, k % 2 ? 'rgba(150,96,44,0.55)' : 'rgba(200,140,60,0.45)'), lx, ly, 2.2, 1.3, k);
          }
        }
        if (r < 0.025) {
          const c = ['#f6f2e6', '#f2d45a', '#bca0e8', '#f29aaa'][Math.floor(r * 160) % 4];
          for (let k = 0; k < 5; k++) {
            const p = path(dots, c);
            const fx = px + 10 + hash2(k, y, x) * 12;
            const fy = py + 10 + hash2(x, k, y) * 12;
            p.moveTo(fx + 1.8, fy);
            p.arc(fx, fy, 1.8, 0, Math.PI * 2);
          }
        }
      } else if (t === TERRAIN.dirt) {
        for (let k = 0; k < 3; k++) {
          if (hash2(x + k, y, seed + 7) > 0.45) continue;
          const ex = px + hash2(k, x, y) * TILE;
          const ey = py + hash2(y, k, x) * TILE;
          oval(path(dots, k % 2 ? 'rgba(120,96,66,0.5)' : 'rgba(226,200,150,0.5)'), ex, ey, 2.6, 1.7, 0);
        }
        if (r < 0.18) oval(path(dots, 'rgba(230,206,160,0.22)'), px + 16, py + 16, 12, 7, r * 6);
      } else if (t === TERRAIN.water) {
        const p = path(strokes, 'rgba(180,220,240,0.18)');
        const wy = py + 10 + r * 12;
        p.moveTo(px + 6, wy);
        p.quadraticCurveTo(px + 12, wy - 3, px + 18, wy);
      }
    }
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  for (const [c, p] of Object.entries(strokes)) {
    ctx.strokeStyle = c;
    ctx.stroke(p);
  }
  for (const [c, p] of Object.entries(dots)) {
    ctx.fillStyle = c;
    ctx.fill(p);
  }

  // Shores: a pale bank of wet sand, then a dark lake bed, both drawn from
  // rounded blurred shapes so the edge never follows the tile grid.
  // Each layer is one path (the union of a disc per water tile), and the
  // blur is applied once, when the layers are laid onto the ground: a
  // filter on every disc made this take seconds.
  const [shore, shctx] = canvas(W * TILE, H * TILE);
  const disc = (r: number, fill: string) => {
    shctx.fillStyle = fill;
    shctx.beginPath();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (terrain[y * W + x] !== TERRAIN.water) continue;
        const cx = (x + 0.5) * TILE;
        const cy = (y + 0.5) * TILE;
        shctx.moveTo(cx + TILE * r, cy);
        shctx.arc(cx, cy, TILE * r, 0, Math.PI * 2);
      }
    shctx.fill('nonzero');
  };
  disc(1.05, 'rgba(206,186,132,0.9)');
  disc(0.82, 'rgba(150,132,96,0.9)');
  disc(0.66, 'rgb(48,74,88)');
  ctx.filter = `blur(${TILE * 0.22}px)`;
  ctx.drawImage(shore, 0, 0);
  ctx.filter = 'none';

  return big;
}

