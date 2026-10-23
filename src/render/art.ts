// Procedurally drawn placeholder art. Everything here is original and
// generated at load time; no external image assets are used.

import { hash2, valueNoise } from '../sim/rng';
import { TERRAIN, type MapData } from '../sim/types';
import { TILE } from './camera';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const t = f < 0 ? 0 : 255;
  const k = Math.abs(f);
  return `rgb(${Math.round(r + (t - r) * k)},${Math.round(g + (t - g) * k)},${Math.round(b + (t - b) * k)})`;
}

/** Pre-render the static ground layer (grass, dirt, water, cliffs). */
export function renderTerrain(map: MapData, seed: number): HTMLCanvasElement {
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

  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : terrain[y * W + x]);
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
        // Soft shoreline: a faint wash where water meets land.
        const shore = (nx: number, ny: number) => at(nx, ny) !== TERRAIN.water && at(nx, ny) !== -1;
        const g = (x0: number, y0: number, x1: number, y1: number) => {
          const gr = ctx.createLinearGradient(x0, y0, x1, y1);
          gr.addColorStop(0, 'rgba(200,225,215,0.28)');
          gr.addColorStop(1, 'rgba(200,225,215,0)');
          return gr;
        };
        if (shore(x, y - 1)) (ctx.fillStyle = g(px, py, px, py + 10)), ctx.fillRect(px, py, TILE, 10);
        if (shore(x, y + 1)) (ctx.fillStyle = g(px, py + TILE, px, py + TILE - 10)), ctx.fillRect(px, py + TILE - 10, TILE, 10);
        if (shore(x - 1, y)) (ctx.fillStyle = g(px, py, px + 10, py)), ctx.fillRect(px, py, 10, TILE);
        if (shore(x + 1, y)) (ctx.fillStyle = g(px + TILE, py, px + TILE - 10, py)), ctx.fillRect(px + TILE - 10, py, 10, TILE);
      }
    }

  // Cliffs: raised blocks with a lit top and a dark southern face.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (terrain[y * W + x] !== TERRAIN.rock) continue;
      const px = x * TILE;
      const py = y * TILE;
      const r = hash2(x, y, seed + 5);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(px + 4, py + 8, TILE, TILE);
      ctx.fillStyle = mix([84, 78, 72], [104, 96, 86], r);
      ctx.fillRect(px, py, TILE, TILE);
      if (at(x, y + 1) !== TERRAIN.rock) {
        ctx.fillStyle = '#4a433c';
        ctx.fillRect(px, py + TILE - 10, TILE, 10);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(px + 6 + r * 10, py + TILE - 10, 2, 10);
      }
      if (at(x, y - 1) !== TERRAIN.rock) {
        ctx.fillStyle = 'rgba(255,255,240,0.18)';
        ctx.fillRect(px, py, TILE, 3);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.ellipse(px + 10 + r * 12, py + 9 + r * 6, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  return big;
}

/** Conifer sprites; anchor is bottom-center of the canvas at the tile center. */
export function makeTreeSprites(): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  const palettes: Array<[string, string, string]> = [
    ['#1f4d2b', '#2e6b3a', '#4b8a4c'],
    ['#24502c', '#356f3b', '#5a9450'],
    ['#1c4630', '#2b6240', '#43805a'],
  ];
  for (let v = 0; v < 6; v++) {
    const [c, ctx] = canvas(44, 60);
    const [dark, mid, light] = palettes[v % 3];
    const s = 0.9 + (v % 3) * 0.08;
    ctx.translate(22, 52);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(4, 2, 15 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a3d22';
    ctx.fillRect(-2.5, -8, 5, 9);
    const tiers = [
      [16, -6, 14],
      [13, -17, 13],
      [9, -27, 12],
    ];
    for (const [hw, y, h] of tiers) {
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(-hw * s, y);
      ctx.lineTo(0, (y - h) * s);
      ctx.lineTo(hw * s, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = mid;
      ctx.beginPath();
      ctx.moveTo(-hw * s * 0.85, y - 1);
      ctx.lineTo(0, (y - h) * s);
      ctx.lineTo(hw * s * 0.15, y - 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(-3, -30 * s, 1.6, 0, Math.PI * 2);
    ctx.fill();
    out.push(c);
  }
  return out;
}

/** Gold mine: a rocky mound with a timbered entrance. 3x3 tiles + overhang. */
export function makeMineSprite(depletedRatio = 0): HTMLCanvasElement {
  const w = 3 * TILE;
  const [c, ctx] = canvas(w + 16, w + 24);
  ctx.translate(8, 20);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(w / 2 + 6, w - 10, w / 2 + 4, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  // Mound
  const grad = ctx.createLinearGradient(0, -10, 0, w);
  grad.addColorStop(0, '#9b8c76');
  grad.addColorStop(1, '#5c5246');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(2, w - 8);
  ctx.quadraticCurveTo(0, 20, 26, 6);
  ctx.quadraticCurveTo(48, -16, 72, 4);
  ctx.quadraticCurveTo(w + 2, 18, w - 2, w - 8);
  ctx.closePath();
  ctx.fill();
  // Rock facets
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.moveTo(22, 14);
  ctx.lineTo(44, -2);
  ctx.lineTo(50, 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.moveTo(64, 10);
  ctx.lineTo(88, 30);
  ctx.lineTo(70, 40);
  ctx.closePath();
  ctx.fill();
  // Gold veins
  const golds = [
    [18, 30], [30, 22], [62, 24], [74, 44], [14, 52], [80, 60], [40, 12], [56, 8],
  ];
  golds.forEach(([gx, gy], i) => {
    if (i / golds.length < depletedRatio) return;
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath();
    ctx.moveTo(gx, gy - 3);
    ctx.lineTo(gx + 3, gy);
    ctx.lineTo(gx, gy + 3);
    ctx.lineTo(gx - 3, gy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff6cf';
    ctx.fillRect(gx - 1, gy - 1, 1.5, 1.5);
  });
  // Entrance
  const ex = w / 2;
  const ey = w - 10;
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(ex - 18, ey - 30, 5, 30);
  ctx.fillRect(ex + 13, ey - 30, 5, 30);
  ctx.fillRect(ex - 20, ey - 34, 40, 6);
  ctx.fillStyle = '#1b1410';
  ctx.beginPath();
  ctx.moveTo(ex - 13, ey);
  ctx.lineTo(ex - 13, ey - 18);
  ctx.quadraticCurveTo(ex, ey - 30, ex + 13, ey - 18);
  ctx.lineTo(ex + 13, ey);
  ctx.closePath();
  ctx.fill();
  // Cart rails
  ctx.strokeStyle = '#3d3024';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ex - 7, ey);
  ctx.lineTo(ex - 10, ey + 10);
  ctx.moveTo(ex + 7, ey);
  ctx.lineTo(ex + 10, ey + 10);
  ctx.stroke();
  return c;
}

/** The Keep (headquarters), tinted with the owner's color. 4x4 tiles. */
export function makeKeepSprite(color: string): HTMLCanvasElement {
  const w = 4 * TILE;
  const [c, ctx] = canvas(w + 20, w + 60);
  ctx.translate(10, 56);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(10, 18, w, w - 10);
  // Courtyard base
  ctx.fillStyle = '#7d715f';
  ctx.fillRect(4, 10, w - 8, w - 14);
  ctx.fillStyle = '#8f8370';
  for (let i = 0; i < 6; i++) ctx.fillRect(8 + i * 19, 14, 15, 8);
  // Main hall walls
  const wallTop = 6;
  const wallBottom = w - 10;
  const g = ctx.createLinearGradient(0, wallTop, 0, wallBottom);
  g.addColorStop(0, '#c9bba0');
  g.addColorStop(1, '#9d8f76');
  ctx.fillStyle = g;
  ctx.fillRect(16, wallTop + 30, w - 32, wallBottom - wallTop - 30);
  // Stone courses
  ctx.strokeStyle = 'rgba(70,60,45,0.35)';
  ctx.lineWidth = 1;
  for (let y = wallTop + 40; y < wallBottom; y += 9) {
    ctx.beginPath();
    ctx.moveTo(16, y);
    ctx.lineTo(w - 16, y);
    ctx.stroke();
  }
  // Roof in team color
  ctx.fillStyle = shade(color, -0.25);
  ctx.beginPath();
  ctx.moveTo(8, wallTop + 34);
  ctx.lineTo(w / 2, wallTop - 22);
  ctx.lineTo(w - 8, wallTop + 34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(8, wallTop + 34);
  ctx.lineTo(w / 2, wallTop - 22);
  ctx.lineTo(w / 2, wallTop + 34);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    ctx.beginPath();
    ctx.moveTo(8 + (w / 2 - 8) * t, wallTop + 34 - 56 * t);
    ctx.lineTo(w - 8 - (w / 2 - 8) * t, wallTop + 34 - 56 * t);
    ctx.stroke();
  }
  // Corner towers
  for (const tx of [4, w - 26]) {
    ctx.fillStyle = '#b2a58c';
    ctx.fillRect(tx, wallTop + 18, 22, wallBottom - wallTop - 14);
    ctx.fillStyle = '#d4c7ac';
    for (let i = 0; i < 3; i++) ctx.fillRect(tx + i * 8, wallTop + 12, 6, 7);
    ctx.fillStyle = shade(color, -0.1);
    ctx.beginPath();
    ctx.moveTo(tx - 2, wallTop + 12);
    ctx.lineTo(tx + 11, wallTop - 10);
    ctx.lineTo(tx + 24, wallTop + 12);
    ctx.closePath();
    ctx.fill();
  }
  // Gate
  ctx.fillStyle = '#3b2a1c';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 12, wallBottom);
  ctx.lineTo(w / 2 - 12, wallBottom - 18);
  ctx.quadraticCurveTo(w / 2, wallBottom - 30, w / 2 + 12, wallBottom - 18);
  ctx.lineTo(w / 2 + 12, wallBottom);
  ctx.closePath();
  ctx.fill();
  // Banner
  ctx.strokeStyle = '#3b2a1c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2, wallTop - 22);
  ctx.lineTo(w / 2, wallTop - 46);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(w / 2, wallTop - 46);
  ctx.lineTo(w / 2 + 18, wallTop - 41);
  ctx.lineTo(w / 2, wallTop - 35);
  ctx.closePath();
  ctx.fill();
  return c;
}
