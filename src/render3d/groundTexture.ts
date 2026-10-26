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

/** Paint the ground texture (grass, dirt, lake beds, rocky ground). */
export function paintGround(map: MapData, seed: number): HTMLCanvasElement {
  const { width: W, height: H, terrain } = map;
  const [small, sctx] = canvas(W, H);
  const grassA: [number, number, number] = [74, 112, 52];
  const grassB: [number, number, number] = [96, 132, 62];
  const dirtA: [number, number, number] = [128, 104, 70];
  const dirtB: [number, number, number] = [150, 124, 84];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = terrain[y * W + x];
      const n = valueNoise(x, y, 6, seed + 11);
      let col: string;
      if (t === TERRAIN.water) col = mix([38, 74, 108], [46, 88, 124], n);
      else if (t === TERRAIN.dirt) col = mix(dirtA, dirtB, n);
      else if (t === TERRAIN.rock) col = mix([92, 86, 78], [108, 100, 90], n);
      else col = mix(grassA, grassB, n);
      sctx.fillStyle = col;
      sctx.fillRect(x, y, 1, 1);
    }
  const [big, ctx] = canvas(W * TILE, H * TILE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, W * TILE, H * TILE);

  // Fine speckle texture.
  const [tex, tctx] = canvas(128, 128);
  for (let i = 0; i < 1400; i++) {
    const h1 = hash2(i, 1, seed);
    const h2 = hash2(i, 2, seed);
    const h3 = hash2(i, 3, seed);
    tctx.fillStyle = h3 > 0.5 ? 'rgba(255,255,230,0.05)' : 'rgba(0,0,0,0.07)';
    tctx.fillRect(Math.floor(h1 * 128), Math.floor(h2 * 128), 2, 2);
  }
  ctx.fillStyle = ctx.createPattern(tex, 'repeat')!;
  ctx.fillRect(0, 0, W * TILE, H * TILE);

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = terrain[y * W + x];
      const px = x * TILE;
      const py = y * TILE;
      const r = hash2(x, y, seed + 3);
      if (t === TERRAIN.grass && r < 0.55) {
        // Grass tufts and the odd flower.
        ctx.strokeStyle = r < 0.2 ? 'rgba(40,70,28,0.55)' : 'rgba(140,170,80,0.45)';
        ctx.lineWidth = 1.2;
        const n = 2 + Math.floor(r * 6);
        for (let k = 0; k < n; k++) {
          const gx = px + hash2(x * 7 + k, y, seed) * TILE;
          const gy = py + hash2(x, y * 7 + k, seed) * TILE;
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx - 1.5, gy - 4);
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx + 1.5, gy - 3.5);
          ctx.stroke();
        }
        if (r < 0.03) {
          ctx.fillStyle = r < 0.015 ? '#e8d86a' : '#d9e6f2';
          ctx.beginPath();
          ctx.arc(px + 16, py + 16, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (t === TERRAIN.dirt && r < 0.25) {
        ctx.fillStyle = 'rgba(70,55,35,0.35)';
        ctx.beginPath();
        ctx.ellipse(px + r * 60 % TILE, py + (r * 97) % TILE, 2.5, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (t === TERRAIN.water) {
        ctx.strokeStyle = 'rgba(180,220,240,0.18)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const wy = py + 10 + r * 12;
        ctx.moveTo(px + 6, wy);
        ctx.quadraticCurveTo(px + 12, wy - 3, px + 18, wy);
        ctx.stroke();
      }
    }

  // Shores: a pale bank of wet sand, then a dark lake bed, both drawn from
  // rounded blurred shapes so the edge never follows the tile grid.
  const [shore, shctx] = canvas(W * TILE, H * TILE);
  shctx.filter = `blur(${TILE * 0.22}px)`;
  const disc = (r: number, fill: string) => {
    shctx.fillStyle = fill;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (terrain[y * W + x] !== TERRAIN.water) continue;
        shctx.beginPath();
        shctx.arc((x + 0.5) * TILE, (y + 0.5) * TILE, TILE * r, 0, Math.PI * 2);
        shctx.fill();
      }
  };
  disc(1.0, 'rgba(176,160,118,0.75)');
  disc(0.7, 'rgb(40,62,78)');
  ctx.drawImage(shore, 0, 0);

  return big;
}

