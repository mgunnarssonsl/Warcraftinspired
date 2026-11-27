// Building parts for the painted style: grassy stone footings, coursed walls,
// tiled gable roofs, conical tower roofs with gold finials, crenellations,
// timber framing, glowing windows, banners. Everything goes into a Sculpt, so
// a whole building is a few draw calls.

import * as THREE from 'three';
import { Sculpt, ball, blob, cone, crownGeo, cyl, cloth, lathe, rand, rbox, slab, type V3 } from './kit';

export const B = {
  stone: '#b9ad98',
  stoneD: '#8f8472',
  stoneL: '#d4c8b0',
  plaster: '#efe2c4',
  timber: '#7a4e2a',
  timberL: '#9a6a3c',
  roofTrim: '#e6b24c',
  gold: '#efbd52',
  door: '#5a3a22',
  dark: '#2e2218',
  glow: '#ffc25a',
  grass: '#94c252',
  grassD: '#79ad3e',
  dirt: '#c4a676',
  iron: '#6f757e',
};

/** A ring of grass and small stones around a footing: grounds the building in the terrain. */
export function grassSkirt(s: Sculpt, w: number, d: number, seed = 1): void {
  const r = rand(seed);
  const n = Math.round((w + d) * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.3;
    const x = Math.cos(a) * (w / 2 + 0.05 - r() * 0.15);
    const z = Math.sin(a) * (d / 2 + 0.05 - r() * 0.15);
    if (r() < 0.75) s.add(blob(0.13 + r() * 0.1, seed * 31 + i, 0.25, 1), r() < 0.5 ? B.grass : B.grassD, 'matte', { at: [x, 0.02, z], scale: [1.4, 0.35, 1.4] });
    else s.add(blob(0.07 + r() * 0.08, seed * 37 + i, 0.3, 1), r() < 0.5 ? B.stoneL : B.stone, 'matte', { at: [x, 0.05, z] });
  }
}

/** A stone footing slab with a stepped edge. */
export function footing(s: Sculpt, w: number, d: number, h = 0.18, color = B.stoneD): void {
  s.add(rbox(w, h, d, 0.05), color, 'matte', { at: [0, h / 2, 0] });
  s.add(rbox(w - 0.2, 0.06, d - 0.2, 0.03), B.stone, 'matte', { at: [0, h + 0.03, 0] });
}

/** A wall block with stone courses (darker bands) and a few proud stones. */
export function stoneWall(s: Sculpt, w: number, h: number, d: number, at: V3, seed = 1, color = B.stone): void {
  s.add(rbox(w, h, d, 0.04), color, 'matte', { at });
  const r = rand(seed);
  const courses = Math.max(1, Math.round(h / 0.32));
  for (let i = 1; i < courses; i++) {
    const y = at[1] - h / 2 + (i * h) / courses;
    s.add(rbox(w + 0.02, 0.025, d + 0.02, 0.008), B.stoneD, 'matte', { at: [at[0], y, at[2]] });
  }
  const n = Math.round((w + d) * h * 2);
  for (let i = 0; i < n; i++) {
    const side = r() < 0.5 ? 1 : -1;
    const alongX = r() < w / (w + d);
    const x = alongX ? at[0] + (r() - 0.5) * w * 0.9 : at[0] + side * (w / 2 + 0.005);
    const z = alongX ? at[2] + side * (d / 2 + 0.005) : at[2] + (r() - 0.5) * d * 0.9;
    s.add(rbox(0.16 + r() * 0.1, 0.1, 0.04, 0.015), r() < 0.5 ? B.stoneL : B.stoneD, 'matte', { at: [x, at[1] + (r() - 0.5) * h * 0.85, z], rot: [0, alongX ? 0 : Math.PI / 2, 0] });
  }
}

/** A round stone tower body. */
export function roundTower(s: Sculpt, r: number, h: number, at: V3, color = B.stone): void {
  s.add(lathe([[r * 1.08, 0], [r, 0.15], [r * 0.96, h * 0.95], [r * 1.05, h]], 12), color, 'matte', { at });
  for (let i = 1; i < Math.round(h / 0.35); i++) s.add(new THREE.TorusGeometry(r * 0.99, 0.012, 3, 14), B.stoneD, 'matte', { at: [at[0], at[1] + i * 0.35, at[2]], rot: [Math.PI / 2, 0, 0] });
}

/** Merlons around a rectangle (walls) or a circle (towers). */
export function crenels(s: Sculpt, w: number, d: number, y: number, at: [number, number] = [0, 0], color = B.stone, round = false): void {
  if (round) {
    const n = Math.max(6, Math.round(w * 6));
    for (let i = 0; i < n; i += 1) {
      if (i % 2) continue;
      const a = (i / n) * Math.PI * 2;
      s.add(rbox(0.13, 0.14, 0.1, 0.02), color, 'matte', { at: [at[0] + Math.cos(a) * w, y + 0.07, at[1] + Math.sin(a) * w], rot: [0, -a, 0] });
    }
    return;
  }
  for (const [len, axis] of [
    [w, 'x'],
    [d, 'z'],
  ] as const) {
    const n = Math.max(2, Math.round(len / 0.28));
    for (let i = 0; i <= n; i += 2)
      for (const side of [-1, 1]) {
        const t = -len / 2 + (i / n) * len;
        const pos: V3 = axis === 'x' ? [at[0] + t, y + 0.07, at[1] + side * (d / 2)] : [at[0] + side * (w / 2), y + 0.07, at[1] + t];
        s.add(rbox(0.13, 0.14, 0.13, 0.02), color, 'matte', { at: pos });
      }
  }
}

/** A gabled roof over w (along X) by d (along Z), ridge along X: staggered shingles, gold ridge. */
export function gableRoof(s: Sculpt, w: number, d: number, h: number, at: V3, color: string, trim = B.roofTrim, overhang = 0.12): void {
  const dd = d / 2 + overhang;
  const ww = w + overhang * 2;
  const tri = slab(
    [
      [-dd, 0],
      [dd, 0],
      [0, h],
    ],
    ww,
    0.02,
  );
  const base = new THREE.Color(color);
  const dark = base.clone().multiplyScalar(0.8).getStyle();
  s.add(tri, dark, 'matte', { at, rot: [0, Math.PI / 2, 0] });
  // Shingle rows: overlapping tiles, every other row offset, shades varied.
  const slope = Math.atan2(h, dd);
  const len = Math.hypot(h, dd);
  const rows = Math.max(3, Math.round(len / 0.16));
  const tile = 0.2;
  const per = Math.max(2, Math.round(ww / tile));
  const r = rand(Math.round(w * 100 + d * 10 + h));
  for (const side of [-1, 1])
    for (let i = 0; i < rows; i++) {
      const t = (i + 0.5) / rows;
      const y = at[1] + h * (1 - t) + 0.02;
      const z = at[2] + side * dd * t;
      for (let j = 0; j < per; j++) {
        const x = at[0] - ww / 2 + ((j + (i % 2 ? 0.5 : 0)) / per) * ww;
        if (x > at[0] + ww / 2 - 0.02) continue;
        const shade = base.clone().multiplyScalar(0.86 + r() * 0.28).getStyle();
        s.add(new THREE.BoxGeometry(ww / per - 0.012, 0.035, len / rows + 0.04), shade, 'matte', {
          at: [x + ww / per / 2, y, z],
          rot: [side * slope, 0, 0],
        });
      }
    }
  s.add(rbox(ww + 0.06, 0.08, 0.1, 0.02), trim, 'gold', { at: [at[0], at[1] + h + 0.02, at[2]] });
}

/** A cross gable facing +Z: a small roof with its ridge running forward, and the triangle wall under it. */
export function crossGable(s: Sculpt, w: number, depth: number, h: number, at: V3, color: string, wall = B.plaster): void {
  const g = new Sculpt();
  gableRoof(g, depth, w, h, [0, 0, 0], color);
  // The gable end: local -X becomes the front (+Z) once turned.
  g.add(
    slab(
      [
        [-w / 2, 0],
        [w / 2, 0],
        [0, h * 0.92],
      ],
      0.06,
      0.01,
    ),
    wall,
    'matte',
    { at: [-depth / 2 - 0.15, 0, 0], rot: [0, Math.PI / 2, 0] },
  );
  g.add(rbox(0.04, h * 0.8, 0.05, 0.01), B.timber, 'matte', { at: [-depth / 2 - 0.19, h * 0.4, 0] });
  g.add(rbox(0.04, 0.05, w * 0.8, 0.01), B.timber, 'matte', { at: [-depth / 2 - 0.19, 0.05, 0] });
  s.absorb(g, { at, rot: [0, Math.PI / 2, 0] });
}

/** A conical (or faceted) tower roof with a gold band and finial. */
export function coneRoof(s: Sculpt, r: number, h: number, at: V3, color: string, segs = 10, finial = true): void {
  s.add(lathe([[r * 1.12, 0], [r * 0.95, h * 0.1], [r * 0.45, h * 0.6], [0.0, h]], segs), color, 'matte', { at });
  s.add(new THREE.TorusGeometry(r * 1.05, 0.03, 4, segs * 2), B.roofTrim, 'gold', { at: [at[0], at[1] + 0.02, at[2]], rot: [Math.PI / 2, 0, 0] });
  if (finial) {
    s.add(cyl(0.02, 0.02, 0.25, 5), B.gold, 'gold', { at: [at[0], at[1] + h + 0.1, at[2]] });
    s.add(ball(0.05, 6, 4), B.gold, 'gold', { at: [at[0], at[1] + h + 0.22, at[2]] });
  }
}

/** A pole with a waving team pennant (static; buildings do not animate). */
export function flagPole(s: Sculpt, team: string, at: V3, h = 0.6): void {
  s.add(cyl(0.018, 0.018, h, 5), B.timber, 'matte', { at: [at[0], at[1] + h / 2, at[2]] });
  s.add(cloth(0.3, 0.16, 0.05, 0, 2), team, 'cloth', { at: [at[0] + 0.16, at[1] + h - 0.02, at[2]], rot: [0, Math.PI / 2, -Math.PI / 2], scale: [1, 1, 1] });
}

/** A hanging banner with a gold crown, on a wall facing +Z. */
export function crownBanner(s: Sculpt, team: string, at: V3, w = 0.34, h = 0.6, rotY = 0): void {
  const dir = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
  s.add(cyl(0.015, 0.015, w + 0.08, 5), B.gold, 'gold', { at, rot: [0, rotY, Math.PI / 2] });
  s.add(
    slab(
      [
        [-w / 2, 0],
        [w / 2, 0],
        [w / 2, -h],
        [0, -h - w * 0.35],
        [-w / 2, -h],
      ],
      0.02,
      0.005,
    ),
    team,
    'cloth',
    { at: [at[0] + dir.x * 0.01, at[1], at[2] + dir.z * 0.01], rot: [0, rotY, 0] },
  );
  s.add(crownGeo(w * 0.22, w * 0.3), B.gold, 'gold', { at: [at[0] + dir.x * 0.03, at[1] - h * 0.45, at[2] + dir.z * 0.03], rot: [Math.PI / 2, rotY, 0], scale: [1, 0.4, 1] });
  s.add(slab([[-w / 2, 0], [w / 2, 0], [w / 2, -0.03], [-w / 2, -0.03]], 0.025, 0), B.gold, 'gold', { at: [at[0] + dir.x * 0.015, at[1] - h + 0.02, at[2] + dir.z * 0.015], rot: [0, rotY, 0] });
}

/** A glowing window (or a dark one), on a wall facing +Z, with a frame. */
export function windowGlow(s: Sculpt, at: V3, w = 0.16, h = 0.24, rotY = 0, lit = true, frame = B.timber): void {
  s.add(rbox(w + 0.06, h + 0.06, 0.04, 0.012), frame, 'matte', { at, rot: [0, rotY, 0] });
  s.add(rbox(w, h, 0.05, 0.01), lit ? B.glow : B.dark, lit ? 'glow' : 'matte', { at, rot: [0, rotY, 0] });
}

/** An arched door on a wall facing +Z. */
export function archDoor(s: Sculpt, at: V3, w = 0.5, h = 0.7, color = B.door, frame = B.stoneL): void {
  const arch = (ww: number, hh: number) =>
    slab(
      [
        [-ww / 2, 0],
        [ww / 2, 0],
        [ww / 2, hh - ww / 2],
        [ww * 0.35, hh - ww * 0.15],
        [0, hh],
        [-ww * 0.35, hh - ww * 0.15],
        [-ww / 2, hh - ww / 2],
      ],
      0.04,
      0.01,
    );
  s.add(arch(w + 0.12, h + 0.08), frame, 'matte', { at });
  s.add(arch(w, h), color, 'matte', { at: [at[0], at[1], at[2] + 0.02] });
  for (let i = -1; i <= 1; i++) s.add(rbox(0.02, h * 0.8, 0.02, 0.005), B.dark, 'matte', { at: [at[0] + i * w * 0.25, at[1] + h * 0.42, at[2] + 0.045] });
  s.add(rbox(w * 0.9, 0.03, 0.02, 0.005), B.iron, 'metal', { at: [at[0], at[1] + h * 0.3, at[2] + 0.05] });
}

/** Timber framing on a plaster wall facing +Z: posts, a rail and braces. */
export function timberFrame(s: Sculpt, w: number, h: number, at: V3, rotY = 0): void {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
  const put = (x: number, y: number, geo: THREE.BufferGeometry, rz = 0) => {
    const p = new THREE.Vector3(x, y, 0.01).applyQuaternion(q).add(new THREE.Vector3(...at));
    s.add(geo, B.timber, 'matte', { at: [p.x, p.y, p.z], rot: [0, rotY, rz] });
  };
  for (const x of [-w / 2, 0, w / 2]) put(x, 0, rbox(0.07, h, 0.05, 0.01));
  put(0, -h / 2 + 0.04, rbox(w, 0.07, 0.05, 0.01));
  put(0, h / 2 - 0.04, rbox(w, 0.07, 0.05, 0.01));
  put(-w / 4, 0, rbox(0.05, h * 0.9, 0.04, 0.01), 0.45);
  put(w / 4, 0, rbox(0.05, h * 0.9, 0.04, 0.01), -0.45);
}

/** Small props for yards: barrels, crates, sacks, log piles, hay. */
export function barrel(s: Sculpt, at: V3, r = 0.12): void {
  s.add(lathe([[r * 0.85, 0], [r, r * 1.1], [r * 0.85, r * 2.2]], 10), '#9a6a3a', 'matte', { at });
  for (const y of [0.25, 0.75]) s.add(new THREE.TorusGeometry(r * 0.96, 0.012, 3, 12), B.iron, 'metal', { at: [at[0], at[1] + r * 2.2 * y, at[2]], rot: [Math.PI / 2, 0, 0] });
}
export function crate(s: Sculpt, at: V3, size = 0.22, rotY = 0): void {
  s.add(rbox(size, size, size, 0.02), '#a8783e', 'matte', { at: [at[0], at[1] + size / 2, at[2]], rot: [0, rotY, 0] });
  s.add(rbox(size * 1.02, size * 0.12, size * 1.02, 0.01), B.timber, 'matte', { at: [at[0], at[1] + size * 0.9, at[2]], rot: [0, rotY, 0] });
}
export function logPile(s: Sculpt, at: V3, n = 3, len = 0.6, rotY = 0): void {
  let k = 0;
  for (let row = 0; row < n; row++)
    for (let i = 0; i < n - row; i++) {
      const x = (i - (n - row - 1) / 2) * 0.15;
      const q = new THREE.Vector3(x, 0.075 + row * 0.13, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
      s.add(cyl(0.075, 0.075, len, 8), k++ % 2 ? '#8a5a32' : '#a06c3c', 'matte', { at: [at[0] + q.x, at[1] + q.y, at[2] + q.z], rot: [Math.PI / 2, rotY, 0] });
      s.add(cyl(0.06, 0.06, len + 0.005, 8), '#e2c08a', 'matte', { at: [at[0] + q.x, at[1] + q.y, at[2] + q.z], rot: [Math.PI / 2, rotY, 0] });
    }
}
export function hay(s: Sculpt, at: V3, r = 0.2): void {
  s.add(lathe([[r, 0], [r * 1.05, r * 0.6], [r * 0.6, r * 1.3], [0, r * 1.5]], 10), '#e0bd5a', 'matte', { at });
}
export function fence(s: Sculpt, from: [number, number], to: [number, number], color = B.timberL): void {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const a = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const n = Math.max(1, Math.round(len / 0.4));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    s.add(rbox(0.05, 0.26, 0.05, 0.01), color, 'matte', { at: [from[0] + (to[0] - from[0]) * t, 0.13, from[1] + (to[1] - from[1]) * t] });
  }
  for (const y of [0.1, 0.2]) s.add(rbox(len, 0.035, 0.03, 0.01), color, 'matte', { at: [(from[0] + to[0]) / 2, y, (from[1] + to[1]) / 2], rot: [0, -a, 0] });
}
export function brazier(s: Sculpt, at: V3): void {
  s.add(lathe([[0.06, 0], [0.04, 0.2], [0.13, 0.32], [0.14, 0.4]], 8), B.stoneL, 'matte', { at });
  s.add(cone(0.1, 0.22, 6), '#ffb43a', 'glow', { at: [at[0], at[1] + 0.48, at[2]] });
  s.add(cone(0.06, 0.16, 5), '#fff0a0', 'glow', { at: [at[0], at[1] + 0.47, at[2]] });
}
export function emblemCrown(s: Sculpt, at: V3, size = 0.12): void {
  s.add(crownGeo(size, size * 1.3), B.gold, 'gold', { at, rot: [Math.PI / 2, 0, 0], scale: [1, 0.45, 1] });
}
