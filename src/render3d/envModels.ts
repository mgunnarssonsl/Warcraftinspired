// The world around the bases in the painted style (sheets 07-09): tree
// species, stumps and saplings, mossy cliff boulders, forest-floor and shore
// details, and gold mines of every size. Trees, rocks and details are single
// vertex-coloured geometries for instanced meshes.

import * as THREE from 'three';
import { Sculpt, ball, blob, capsule, cone, cyl, lathe, leafFan, rand, rbox, type V3 } from './kit';
import { B, barrel, crate, fence } from './bkit';

export type TreeKind = 'oak' | 'birch' | 'pine' | 'autumn' | 'twisted' | 'willow';
export const TREE_KINDS: TreeKind[] = ['oak', 'birch', 'pine', 'autumn', 'twisted', 'willow'];

const BARK = '#7a5232';
const BARK_D = '#5c3c22';

function clumps(s: Sculpt, at: V3, r: number, colors: string[], seed: number, n = 6, flat = 0.8): void {
  const rnd = rand(seed);
  s.add(blob(r * 0.8, seed, 0.2, 0, true), colors[0], 'matte', { at, scale: [1.15, flat, 1.15] });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.5;
    const rr = r * (0.5 + rnd() * 0.3);
    s.add(blob(r * (0.42 + rnd() * 0.15), seed * 11 + i, 0.18, 0, true), colors[(i % (colors.length - 1)) + 1], 'matte', {
      at: [at[0] + Math.cos(a) * rr, at[1] + (rnd() - 0.35) * r * 0.5, at[2] + Math.sin(a) * rr],
      scale: [1, flat, 1],
    });
  }
  s.add(blob(r * 0.5, seed * 3, 0.18, 0, true), colors[colors.length - 1], 'matte', { at: [at[0] - r * 0.1, at[1] + r * 0.45, at[2] + r * 0.15], scale: [1, flat, 1] });
}

/** One tree of a species, about 2 tiles tall, its foot at the origin. */
export function treeGeometry(kind: TreeKind): THREE.BufferGeometry {
  const s = new Sculpt();
  const roots = (r: number, n: number, color = BARK) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4;
      s.add(capsule(r * 0.3, r * 1.1, 4), color, 'matte', { at: [Math.cos(a) * r * 0.9, r * 0.15, Math.sin(a) * r * 0.9], rot: [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25] });
    }
  };
  if (kind === 'pine') {
    s.add(lathe([[0.13, 0], [0.09, 0.4], [0.05, 1.9]], 7), BARK_D, 'matte');
    roots(0.12, 4, BARK_D);
    const greens = ['#2f6e3c', '#3f8246', '#4a8f4c'];
    for (let i = 0; i < 5; i++) {
      const y = 0.45 + i * 0.34;
      const r = 0.62 - i * 0.11;
      s.add(lathe([[r, 0], [r * 0.85, 0.1], [r * 0.35, 0.36], [0, 0.46]], 9), greens[i % 3], 'matte', { at: [0, y, 0], rot: [0, i * 0.5, 0] });
    }
  } else if (kind === 'birch') {
    for (const [x, z, lean] of [
      [0, 0, 0],
      [0.14, 0.06, 0.2],
    ] as const) {
      s.add(lathe([[0.075, 0], [0.06, 0.5], [0.045, 1.35]], 7), '#eee8dc', 'matte', { at: [x, 0, z], rot: [0, 0, -lean] });
      for (let i = 0; i < 4; i++) s.add(new THREE.BoxGeometry(0.07, 0.025, 0.04), '#2e2a26', 'matte', { at: [x + lean * i * 0.25 * 0.3, 0.2 + i * 0.28, z + 0.05], rot: [0, 0, -lean] });
    }
    clumps(s, [0.06, 1.45, 0.02], 0.55, ['#9cc84a', '#b4d85c', '#8abc40', '#c4e070'], 7, 6, 0.85);
  } else if (kind === 'willow') {
    s.add(lathe([[0.18, 0], [0.13, 0.4], [0.12, 0.9], [0.16, 1.1]], 8), BARK, 'matte', { rot: [0, 0, -0.15] });
    roots(0.16, 5);
    clumps(s, [0.12, 1.3, 0], 0.62, ['#8cbc3c', '#a4d050', '#7aae34', '#b8dc62'], 11, 6, 0.7);
    // Drooping curtains of leaves.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      s.add(capsule(0.07, 0.6, 4), i % 2 ? '#9cc84a' : '#86b83e', 'matte', { at: [0.12 + Math.cos(a) * 0.6, 0.95, Math.sin(a) * 0.6], scale: [1, 1, 0.6], rot: [0, -a, 0] });
    }
  } else if (kind === 'twisted') {
    s.add(lathe([[0.3, 0], [0.2, 0.25], [0.17, 0.6], [0.22, 0.95]], 8), BARK, 'matte', { rot: [0.12, 0, -0.18] });
    s.add(capsule(0.09, 0.6, 5), BARK_D, 'matte', { at: [0.28, 1.0, 0], rot: [0, 0, -0.9] });
    s.add(capsule(0.08, 0.5, 5), BARK_D, 'matte', { at: [-0.25, 1.05, 0.05], rot: [0, 0, 0.8] });
    s.add(blob(0.12, 5, 0.3, 1), '#6a9a34', 'matte', { at: [0.05, 0.55, 0.17], scale: [1, 1.4, 0.4] }); // moss
    roots(0.22, 6);
    clumps(s, [0.05, 1.45, 0], 0.68, ['#6f9e36', '#86b43e', '#5f8f30', '#9cc84a'], 13, 7, 0.65);
  } else {
    const colors = kind === 'autumn' ? ['#d0782a', '#e8962e', '#c4602a', '#f0b040'] : ['#6fa43a', '#86b844', '#5c9234', '#a0cc52'];
    s.add(lathe([[0.22, 0], [0.15, 0.3], [0.13, 0.8], [0.17, 1.0]], 8), BARK, 'matte');
    for (const x of [-1, 1]) s.add(capsule(0.07, 0.45, 5), BARK, 'matte', { at: [x * 0.2, 1.05, 0], rot: [0, 0, -x * 0.8] });
    roots(0.2, 5);
    clumps(s, [0, 1.45, 0], 0.64, colors, kind === 'autumn' ? 17 : 19, 7, 0.75);
    if (kind === 'autumn') for (let i = 0; i < 6; i++) s.add(rbox(0.06, 0.01, 0.05, 0.003), colors[i % 4], 'matte', { at: [Math.cos(i) * 0.4, 0.01, Math.sin(i * 1.3) * 0.4], rot: [0, i, 0] });
  }
  return s.geometry();
}

/** A cheap stand-in that casts a tree's shadow (the painted tree itself does not): a cone on a post. */
export function treeShadowGeometry(kind: TreeKind): THREE.BufferGeometry {
  const s = new Sculpt();
  s.add(cyl(0.1, 0.14, 1.0, 5), '#000000', 'matte', { at: [0, 0.5, 0] });
  if (kind === 'pine') s.add(cone(0.62, 1.7, 6), '#000000', 'matte', { at: [0, 1.25, 0] });
  else s.add(blob(kind === 'birch' ? 0.55 : 0.72, 3, 0.1, 0, false), '#000000', 'matte', { at: [0, 1.5, 0], scale: [1.1, 0.75, 1.1] });
  return s.geometry();
}

/** A stump with a pale cut, for felled trees. */
export function stumpGeometry(): THREE.BufferGeometry {
  const s = new Sculpt();
  s.add(lathe([[0.22, 0], [0.17, 0.1], [0.15, 0.22]], 9), BARK, 'matte');
  s.add(cyl(0.15, 0.15, 0.02, 9), '#e2c08a', 'matte', { at: [0, 0.225, 0] });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    s.add(capsule(0.05, 0.2, 4), BARK_D, 'matte', { at: [Math.cos(a) * 0.2, 0.04, Math.sin(a) * 0.2], rot: [Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3] });
  }
  s.add(blob(0.05, 3, 0.3, 1), '#e8d6b0', 'matte', { at: [0.18, 0.04, 0.1] }); // chips
  return s.geometry();
}

/** A young sapling regrowing beside an old stump. */
export function saplingGeometry(): THREE.BufferGeometry {
  const s = new Sculpt();
  s.add(cyl(0.02, 0.03, 0.45, 5), BARK, 'matte', { at: [0, 0.22, 0] });
  s.add(leafFan(5, 0.16, 0.1, 2.6, 3), '#8cc044', 'cloth', { at: [0, 0.4, 0], rot: [Math.PI, 0, 0] });
  s.add(blob(0.12, 9, 0.2, 1), '#9ccc4c', 'matte', { at: [0, 0.48, 0] });
  return s.geometry();
}

/** A mossy cliff boulder (three shapes), one unit across. */
export function rockGeometry(variant: number): THREE.BufferGeometry {
  const s = new Sculpt();
  const greys = ['#b8ae9e', '#a89e8e', '#c6bca8'];
  s.add(blob(0.55, 100 + variant, 0.22, 1, false), greys[variant % 3], 'matte', { at: [0, 0.3, 0], scale: [1.0, 0.85 + variant * 0.12, 0.9] });
  s.add(blob(0.3, 110 + variant, 0.25, 1, false), greys[(variant + 1) % 3], 'matte', { at: [0.32, 0.15, 0.22] });
  s.add(blob(0.42, 120 + variant, 0.2, 2), '#7ea83e', 'matte', { at: [-0.05, 0.62 + variant * 0.06, -0.05], scale: [1.05, 0.28, 0.95] }); // moss cap
  s.add(blob(0.16, 130 + variant, 0.3, 1), '#8cb848', 'matte', { at: [-0.4, 0.06, 0.3], scale: [1.4, 0.5, 1.4] });
  return s.geometry();
}

/** Small details: ferns and flowers in the grass, reeds at the shore, mushrooms by trees. */
export function decorGeometry(kind: 'fern' | 'reeds' | 'flowers' | 'mushrooms' | 'pebbles'): THREE.BufferGeometry {
  const s = new Sculpt();
  if (kind === 'fern') {
    s.add(leafFan(7, 0.26, 0.11, 4.4, 1), '#86bc48', 'matte', { at: [0, 0.02, 0], rot: [Math.PI + 1.1, 0, 0] });
    s.add(leafFan(5, 0.22, 0.1, 3.6, 2), '#9ccc56', 'matte', { at: [0, 0.02, 0], rot: [Math.PI + 0.95, 1.2, 0] });
  } else if (kind === 'reeds') {
    const r = rand(5);
    for (let i = 0; i < 5; i++) {
      const x = (r() - 0.5) * 0.4;
      const z = (r() - 0.5) * 0.4;
      const h = 0.4 + r() * 0.3;
      s.add(cyl(0.012, 0.018, h * 0.8, 4), '#9ccc56', 'matte', { at: [x, h / 2, z], rot: [(r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.2] });
      if (i % 2 === 0) s.add(capsule(0.025, 0.08, 4), '#7a4a24', 'matte', { at: [x, h + 0.02, z] });
    }
  } else if (kind === 'flowers') {
    const r = rand(9);
    const cols = ['#f4f0e4', '#f0d050', '#b490e0', '#f08aa0'];
    for (let i = 0; i < 6; i++) {
      const x = (r() - 0.5) * 0.5;
      const z = (r() - 0.5) * 0.5;
      s.add(cyl(0.006, 0.006, 0.1, 3), '#5e9a34', 'matte', { at: [x, 0.05, z] });
      s.add(ball(0.03, 5, 3), cols[i % 4], 'matte', { at: [x, 0.11, z] });
    }
    s.add(blob(0.1, 3, 0.3, 1), '#74b03e', 'matte', { at: [0, 0.02, 0], scale: [1.6, 0.4, 1.6] });
  } else if (kind === 'mushrooms') {
    for (const [x, z, h] of [
      [0, 0, 0.12],
      [0.08, 0.05, 0.08],
      [-0.06, 0.07, 0.06],
    ]) {
      s.add(cyl(0.015, 0.02, h, 5), '#f0e6d0', 'matte', { at: [x, h / 2, z] });
      s.add(lathe([[0.06, 0], [0.05, 0.03], [0, 0.05]], 7), '#d8402e', 'matte', { at: [x, h, z] });
    }
  } else {
    const r = rand(13);
    for (let i = 0; i < 5; i++) s.add(blob(0.05 + r() * 0.05, i, 0.3, 0), r() < 0.5 ? '#a49a8a' : '#8a8274', 'matte', { at: [(r() - 0.5) * 0.4, 0.03, (r() - 0.5) * 0.4] });
  }
  return s.geometry();
}

// ---- gold mines -------------------------------------------------------------------

export type MineLook = 'tiny' | 'small' | 'start' | 'standard' | 'rich' | 'depleted';

/** Which look a mine gets from its size and how many may work it at once. */
export function mineLook(maxAmount: number, miners: number, maxMiners: number): MineLook {
  if (miners > maxMiners) return 'rich';
  if (maxAmount <= 1500) return 'tiny';
  if (maxAmount <= 5000) return 'small';
  if (maxAmount <= 8000) return 'start';
  return 'standard';
}

export interface MineModel {
  root: THREE.Group;
  /** Gold piles in carts and crates, shown in proportion to what is left. */
  nuggets: THREE.Object3D[];
  /** The lantern-lit mouth: brighter while Laborers work inside. */
  glow: THREE.Mesh;
}

/** A gold mine on its 3x3 footprint, the entrance toward +Z. */
export function mineModel(look: MineLook): MineModel {
  const s = new Sculpt();
  const big = look === 'rich' ? 1.15 : look === 'tiny' ? 0.72 : look === 'small' ? 0.85 : 1;
  const depleted = look === 'depleted';
  // The rocky mound, gold veins running through it.
  const greys = ['#b4aa9a', '#a39a8c', '#c2b8a6'];
  const rnd = rand(look.length * 7 + 3);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI + Math.PI;
    const r = 0.95 * big;
    s.add(blob(0.55 * big * (0.8 + rnd() * 0.4), 200 + i, 0.2, 1, false), greys[i % 3], 'matte', { at: [Math.cos(a) * r * 0.9, 0.35 * big, -0.2 + Math.sin(a) * r * 0.6], scale: [1, 0.9, 0.9] });
  }
  s.add(blob(0.95 * big, 210, 0.18, 1, false), greys[0], 'matte', { at: [0, 0.55 * big, -0.35], scale: [1.2, 0.85, 0.9] });
  s.add(blob(0.5 * big, 211, 0.2, 2), '#7ea83e', 'matte', { at: [-0.4, 1.15 * big, -0.5], scale: [1.2, 0.3, 1] });
  if (!depleted)
    for (let i = 0; i < (look === 'rich' ? 9 : 5); i++)
      s.add(rbox(0.5 * big, 0.06, 0.06, 0.02), '#ffc63a', 'gold', {
        at: [(rnd() - 0.5) * 1.5 * big, 0.4 + rnd() * 0.7 * big, 0.1 - rnd() * 0.6],
        rot: [0, rnd() * 0.6 - 0.3, rnd() * 1.2 - 0.6],
      });
  // Timber entrance with iron brackets.
  const ew = 0.75 * Math.max(0.85, big);
  const eh = 0.85 * Math.max(0.85, big);
  for (const x of [-1, 1]) s.add(rbox(0.13, eh, 0.13, 0.02), '#8a5a30', 'matte', { at: [x * ew * 0.5, eh / 2, 0.55] });
  s.add(rbox(ew + 0.3, 0.14, 0.15, 0.02), '#8a5a30', 'matte', { at: [0, eh + 0.05, 0.55] });
  for (const x of [-1, 1]) s.add(rbox(0.16, 0.1, 0.17, 0.01), B.iron, 'metal', { at: [x * ew * 0.5, eh + 0.05, 0.56] });
  s.add(rbox(ew - 0.1, eh - 0.05, 0.1, 0.02), '#1e1610', 'matte', { at: [0, eh / 2, 0.47] });
  if (depleted) {
    // Boarded up: planks across the mouth, an empty cart.
    for (let i = 0; i < 3; i++) s.add(rbox(ew + 0.05, 0.1, 0.04, 0.01), '#9a6a3a', 'matte', { at: [0, 0.2 + i * 0.25, 0.6], rot: [0, 0, (i - 1) * 0.12] });
    s.add(rbox(0.06, eh * 0.9, 0.04, 0.01), '#7a4e2a', 'matte', { at: [0, eh * 0.45, 0.62], rot: [0, 0, 0.7] });
  }
  // Rails and an ore cart.
  for (const x of [-0.18, 0.18]) s.add(rbox(0.04, 0.03, 1.0, 0.005), '#5a5e64', 'metal', { at: [x, 0.02, 1.0] });
  for (let i = 0; i < 4; i++) s.add(rbox(0.5, 0.025, 0.07, 0.005), '#6a4628', 'matte', { at: [0, 0.01, 0.6 + i * 0.27] });
  s.add(rbox(0.42, 0.22, 0.32, 0.03), '#7a5232', 'matte', { at: [0, 0.2, 1.15] });
  s.add(rbox(0.44, 0.04, 0.34, 0.01), B.iron, 'metal', { at: [0, 0.3, 1.15] });
  for (const x of [-0.18, 0.18]) for (const z of [1.03, 1.27]) s.add(cyl(0.06, 0.06, 0.04, 8), '#3a3a40', 'metal', { at: [x, 0.07, z], rot: [0, 0, Math.PI / 2] });
  // Lanterns at the entrance.
  for (const x of [-1, 1]) {
    s.add(rbox(0.1, 0.13, 0.1, 0.02), '#3a2a1c', 'matte', { at: [x * (ew * 0.5 + 0.12), eh * 0.75, 0.66] });
    s.add(rbox(0.07, 0.09, 0.07, 0.01), depleted ? '#3a2a1c' : '#ffc25a', depleted ? 'matte' : 'glow', { at: [x * (ew * 0.5 + 0.12), eh * 0.75, 0.66] });
  }
  // Winch for the larger mines, a crane and bucket for a rich one, a fence.
  if (look === 'standard' || look === 'rich' || look === 'start' || depleted) {
    s.add(rbox(0.08, 0.5, 0.08, 0.01), '#8a5a30', 'matte', { at: [0.95, 0.25, 0.75] });
    s.add(cyl(0.09, 0.09, 0.3, 10), '#c8a46a', 'matte', { at: [0.95, 0.42, 0.75], rot: [0, 0, Math.PI / 2] });
    s.add(cyl(0.12, 0.12, 0.03, 10), B.iron, 'metal', { at: [1.11, 0.42, 0.75], rot: [0, 0, Math.PI / 2] });
  }
  if (look === 'rich') {
    s.add(rbox(0.1, 1.6, 0.1, 0.02), '#8a5a30', 'matte', { at: [-0.95, 0.8, 0.5] });
    s.add(rbox(0.7, 0.08, 0.08, 0.02), '#8a5a30', 'matte', { at: [-0.7, 1.58, 0.5] });
    s.add(cyl(0.006, 0.006, 0.45, 3), '#d8c08a', 'matte', { at: [-0.42, 1.35, 0.5] });
    s.add(rbox(0.2, 0.15, 0.2, 0.02), '#7a5232', 'matte', { at: [-0.42, 1.08, 0.5] });
  }
  if (look !== 'tiny') fence(s, [0.75, 1.35], [1.3, 0.85], '#9a6a3a');
  if (look === 'standard' || look === 'start') barrel(s, [-0.95, 0, 0.95], 0.11);
  if (look === 'rich') crate(s, [-0.75, 0, 1.15], 0.24, 0.3);
  const root = new THREE.Group();
  root.scale.setScalar(1.3);
  root.add(s.build());
  // Gold piles (shown by what is left) and the glowing mouth, kept separate.
  const nuggets: THREE.Object3D[] = [];
  const piles: V3[] = depleted
    ? []
    : [
        [0, 0.34, 1.15],
        [-0.08, 0.36, 1.1],
        [0.1, 0.35, 1.2],
        [-0.5, 0.1, 0.85],
        [0.55, 0.1, 1.0],
        [0.45, 0.12, 1.25],
      ];
  piles.forEach((p, i) => {
    const n = new Sculpt();
    n.add(new THREE.OctahedronGeometry(0.075 + (i % 2) * 0.02, 0), '#ffd34a', 'gold', { at: p, rot: [i, i * 2, 0] });
    n.add(new THREE.OctahedronGeometry(0.05, 0), '#ffe27a', 'gold', { at: [p[0] + 0.06, p[1] + 0.02, p[2] - 0.04] });
    const o = n.build();
    root.add(o);
    nuggets.push(o);
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(ew - 0.15, eh - 0.1), new THREE.MeshBasicMaterial({ color: '#1b1410' }));
  glow.position.set(0, eh / 2, 0.53);
  root.add(glow);
  return { root, nuggets, glow };
}


