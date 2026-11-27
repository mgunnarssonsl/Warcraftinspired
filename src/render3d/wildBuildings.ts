// Thornwild buildings in the painted style (sheet 06): grown, not built.
// Gnarled trunks and roots, leaf canopies, bone tusks, amber and moon-blue
// glows, mossy stones; the team colour on hanging banners. The Heartwood
// grows into the Deepwood and the Ancient.

import * as THREE from 'three';
import { Sculpt, ball, blob, capsule, cone, cyl, lathe, leafFan, rand, rbox, slab, type V3 } from './kit';
import { B, barrel, fence, grassSkirt } from './bkit';
import { W } from './wildUnits';

const LEAVES = ['#9ccc4c', '#86bc40', '#b6dc5c', '#76aa36'];

const done = (s: Sculpt) => {
  const g = new THREE.Group();
  g.add(s.build());
  return g;
};

/** A leafy canopy of clumps around a centre. */
function canopy(s: Sculpt, at: V3, r: number, seed: number, n = 7): void {
  const rnd = rand(seed);
  s.add(blob(r * 0.75, seed, 0.22, 1), LEAVES[1], 'matte', { at, scale: [1.2, 0.8, 1.2] });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.4;
    const rr = r * (0.55 + rnd() * 0.3);
    s.add(blob(r * (0.4 + rnd() * 0.18), seed * 13 + i, 0.25, 1), LEAVES[i % LEAVES.length], 'matte', {
      at: [at[0] + Math.cos(a) * rr, at[1] + (rnd() - 0.3) * r * 0.45, at[2] + Math.sin(a) * rr],
      scale: [1, 0.8, 1],
    });
  }
  s.add(blob(r * 0.5, seed * 7, 0.25, 1), LEAVES[2], 'matte', { at: [at[0], at[1] + r * 0.45, at[2]] });
}

/** A gnarled trunk with flaring roots. */
function trunk(s: Sculpt, at: V3, r: number, h: number, seed: number, roots = 6): void {
  const rnd = rand(seed);
  s.add(lathe([[r * 1.6, 0], [r * 1.15, h * 0.12], [r * 0.95, h * 0.4], [r * 1.0, h * 0.75], [r * 1.2, h]], 9), W.bark, 'matte', { at });
  for (let i = 0; i < 4; i++) s.add(capsule(r * 0.18, h * 0.6, 4), W.barkD, 'matte', { at: [at[0] + Math.cos(i * 1.6) * r * 0.95, at[1] + h * 0.45, at[2] + Math.sin(i * 1.6) * r * 0.95], rot: [0, 0, (rnd() - 0.5) * 0.25] });
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * Math.PI * 2 + rnd() * 0.3;
    s.add(capsule(r * 0.28, r * 1.3, 5), i % 2 ? W.bark : W.barkD, 'matte', {
      at: [at[0] + Math.cos(a) * r * 1.5, at[1] + r * 0.2, at[2] + Math.sin(a) * r * 1.5],
      rot: [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2],
    });
  }
}

function tusk(s: Sculpt, at: V3, len: number, rotY: number, lean = 0.6): void {
  s.add(cone(len * 0.12, len, 6), W.bone, 'matte', { at: [at[0], at[1] + len * 0.4, at[2]], rot: [lean * Math.cos(rotY), rotY, -lean * Math.sin(rotY)] });
}

function stones(s: Sculpt, n: number, radius: number, seed: number): void {
  const rnd = rand(seed);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    s.add(blob(0.1 + rnd() * 0.12, seed + i, 0.3), rnd() < 0.5 ? B.stone : B.stoneD, 'matte', { at: [Math.cos(a) * radius, 0.08, Math.sin(a) * radius] });
  }
}

/** A team banner hanging from a branch or pole, edged with leaves. */
function leafBanner(s: Sculpt, team: string, at: V3, w = 0.26, h = 0.45, rotY = 0): void {
  s.add(cyl(0.015, 0.015, w + 0.1, 5), W.barkD, 'matte', { at, rot: [0, rotY, Math.PI / 2] });
  s.add(slab([[-w / 2, 0], [w / 2, 0], [w / 2, -h], [0, -h - w * 0.3], [-w / 2, -h]], 0.02, 0.005), team, 'cloth', { at, rot: [0, rotY, 0] });
  s.add(leafFan(3, 0.09, 0.06, 1.5, 7), W.leafL, 'cloth', { at: [at[0], at[1] - h * 0.45, at[2] + 0.02], rot: [0, rotY, 0] });
}

function doorGlow(s: Sculpt, at: V3, w = 0.45, h = 0.6): void {
  const arch = (ww: number, hh: number) => slab([[-ww / 2, 0], [ww / 2, 0], [ww / 2, hh * 0.6], [ww * 0.3, hh * 0.95], [0, hh], [-ww * 0.3, hh * 0.95], [-ww / 2, hh * 0.6]], 0.04, 0.01, true);
  s.add(arch(w + 0.1, h + 0.08), W.barkD, 'matte', { at });
  s.add(arch(w, h), '#ffb84a', 'glow', { at: [at[0], at[1], at[2] + 0.02] });
}

function lantern(s: Sculpt, at: V3): void {
  s.add(cyl(0.006, 0.006, 0.15, 3), W.barkD, 'matte', { at: [at[0], at[1] + 0.08, at[2]] });
  s.add(lathe([[0.03, 0], [0.05, 0.04], [0.03, 0.1]], 6), '#ffc84a', 'glow', { at: [at[0], at[1] - 0.08, at[2]] });
}

// ---- buildings ----------------------------------------------------------------

/** Heartwood (tier 1), Deepwood (2), Ancient (3). */
export function heartwood(team: string, tier = 1): THREE.Group {
  const s = new Sculpt();
  const k = 1 + (tier - 1) * 0.15;
  grassSkirt(s, 3.9, 3.9, 31);
  s.add(cyl(1.5, 1.7, 0.14, 14), '#9a7e56', 'matte', { at: [0, 0.07, 0] });
  stones(s, 9, 1.6, 33);
  trunk(s, [0, 0.12, -0.2], 0.68 * k, 2.6 * k, 35, 7);
  doorGlow(s, [0, 0.16, 0.5 * k], 0.5, 0.75);
  // A wooden platform with railings around the trunk.
  s.add(cyl(1.05 * k, 1.05 * k, 0.08, 12), W.barkL, 'matte', { at: [0, 1.1 * k, -0.2] });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    s.add(rbox(0.05, 0.25, 0.05, 0.01), W.barkD, 'matte', { at: [Math.cos(a) * 1.0 * k, 1.25 * k, -0.2 + Math.sin(a) * 1.0 * k] });
  }
  s.add(new THREE.TorusGeometry(1.0 * k, 0.025, 3, 20), W.barkD, 'matte', { at: [0, 1.36 * k, -0.2], rot: [Math.PI / 2, 0, 0] });
  canopy(s, [0, 3.05 * k, -0.2], 1.45 * k, 37, 10);
  for (const x of [-1, 1]) leafBanner(s, team, [x * 0.75 * k, 1.05 * k, 0.75 * k], 0.28, 0.5);
  lantern(s, [-0.9, 2.0 * k, 0.4]);
  lantern(s, [0.95, 2.05 * k, 0.2]);
  if (tier > 1) {
    // Deepwood: a second, higher platform and a hut in the branches.
    s.add(cyl(0.7, 0.7, 0.07, 10), W.barkL, 'matte', { at: [0.55, 2.0 * k, -0.6] });
    s.add(lathe([[0.32, 0], [0.32, 0.25], [0.0, 0.55]], 8), W.leafD, 'matte', { at: [0.55, 2.04 * k, -0.6] });
    lantern(s, [0.0, 2.3 * k, 0.65]);
  }
  if (tier > 2) {
    // Ancient: great bone tusks and an amber heart.
    for (const a of [0.5, 2.6, 3.7, 5.7]) tusk(s, [Math.cos(a) * 1.25, 0.1, -0.2 + Math.sin(a) * 1.25], 0.9, -a + Math.PI / 2, 0.45);
    s.add(new THREE.OctahedronGeometry(0.2, 0), '#ffb43a', 'glow', { at: [0, 1.65 * k, 0.45], scale: [1, 1.5, 0.6] });
  }
  return done(s);
}

export function grove(team: string): THREE.Group {
  const s = new Sculpt();
  grassSkirt(s, 1.9, 1.9, 41);
  // Leaf hut.
  s.add(cyl(0.45, 0.5, 0.42, 10), W.barkL, 'matte', { at: [-0.35, 0.22, -0.3] });
  s.add(lathe([[0.66, 0], [0.6, 0.25], [0.36, 0.55], [0, 0.72]], 12), LEAVES[0], 'matte', { at: [-0.35, 0.4, -0.3] });
  s.add(leafFan(7, 0.3, 0.16, 3.0, 43), LEAVES[3], 'cloth', { at: [-0.4, 0.9, -0.35], rot: [Math.PI, 0, 0] });
  doorGlow(s, [-0.4, 0.05, 0.05], 0.22, 0.3);
  tusk(s, [-0.05, 0.25, -0.45], 0.45, -Math.PI / 2, 0.8);
  // Fruit beds and a little fruit tree.
  for (const [x, z] of [
    [0.45, 0.2],
    [0.45, 0.65],
  ]) {
    s.add(rbox(0.7, 0.12, 0.32, 0.02), W.barkD, 'matte', { at: [x, 0.06, z] });
    for (let i = 0; i < 4; i++) {
      s.add(blob(0.07, i + x * 10, 0.3, 0), LEAVES[1], 'matte', { at: [x - 0.25 + i * 0.17, 0.16, z] });
      s.add(ball(0.035, 6, 4), '#e0402e', 'matte', { at: [x - 0.25 + i * 0.17 + 0.03, 0.2, z + 0.03] });
    }
  }
  s.add(cyl(0.05, 0.07, 0.6, 6), W.bark, 'matte', { at: [0.55, 0.3, -0.5] });
  canopy(s, [0.55, 0.8, -0.5], 0.32, 45, 5);
  for (let i = 0; i < 5; i++) s.add(ball(0.04, 6, 4), '#e8502e', 'matte', { at: [0.55 + Math.cos(i) * 0.25, 0.75, -0.5 + Math.sin(i) * 0.25] });
  fence(s, [-0.9, 0.9], [0.85, 0.9], W.barkL);
  barrel(s, [-0.75, 0.0, 0.55], 0.1);
  leafBanner(s, team, [-0.1, 0.55, 0.07], 0.2, 0.32);
  return done(s);
}

export function saplodge(team: string): THREE.Group {
  const s = new Sculpt();
  grassSkirt(s, 2.9, 2.9, 51);
  trunk(s, [-0.45, 0.05, -0.4], 0.42, 1.2, 53, 5);
  canopy(s, [-0.45, 1.5, -0.4], 0.8, 55, 7);
  doorGlow(s, [-0.45, 0.06, -0.02], 0.36, 0.5);
  // A branch spout pouring glowing sap into tubs.
  s.add(capsule(0.06, 0.8, 5), W.barkD, 'matte', { at: [0.25, 0.95, -0.25], rot: [0, 0, 1.2] });
  s.add(capsule(0.04, 0.5, 5), '#ffb43a', 'glow', { at: [0.6, 0.55, -0.15], rot: [0, 0, 0.25] });
  for (const [x, z] of [
    [0.7, 0.0],
    [0.35, 0.45],
    [0.95, 0.5],
  ]) {
    s.add(lathe([[0.18, 0], [0.22, 0.2], [0.21, 0.25]], 10), W.barkL, 'matte', { at: [x, 0.04, z] });
    s.add(cyl(0.19, 0.19, 0.03, 10), '#ffbe4a', 'glow', { at: [x, 0.26, z] });
  }
  barrel(s, [-1.0, 0.0, 0.7], 0.12);
  barrel(s, [-0.75, 0.0, 0.9], 0.11);
  for (let i = 0; i < 3; i++) s.add(new THREE.OctahedronGeometry(0.05, 0), '#ffb43a', 'glow', { at: [0.2 + i * 0.12, 0.88 - i * 0.04, -0.6], scale: [1, 1.6, 1] });
  fence(s, [-1.2, 1.15], [1.2, 1.15], W.barkL);
  leafBanner(s, team, [-0.45, 0.95, -0.02], 0.24, 0.38);
  return done(s);
}

export function den(team: string): THREE.Group {
  const s = new Sculpt();
  grassSkirt(s, 2.9, 2.9, 61);
  // A dome of woven branches, leaves on top, tusks around.
  s.add(lathe([[1.05, 0], [1.0, 0.35], [0.75, 0.75], [0.35, 1.0], [0, 1.05]], 12), W.bark, 'matte', { at: [0, 0.05, -0.25] });
  for (let i = 0; i < 6; i++) s.add(new THREE.TorusGeometry(0.95 - i * 0.02, 0.05, 4, 16, Math.PI), i % 2 ? W.barkD : W.barkL, 'matte', { at: [0, 0.05, -0.25], rot: [0, (i * Math.PI) / 6, 0] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    s.add(blob(0.25, 63 + i, 0.3), LEAVES[i % 4], 'matte', { at: [Math.cos(a) * 0.55, 0.85, -0.25 + Math.sin(a) * 0.55], scale: [1, 0.6, 1] });
  }
  s.add(rbox(0.6, 0.6, 0.3, 0.1), '#2a1a10', 'matte', { at: [0, 0.35, 0.65] });
  s.add(new THREE.TorusGeometry(0.38, 0.06, 4, 10, Math.PI), W.barkD, 'matte', { at: [0, 0.3, 0.7] });
  for (const a of [0.4, 1.2, 1.95, 2.75]) tusk(s, [Math.cos(a) * 1.0, 0.1, -0.25 + Math.sin(a) * 1.0], 0.7, -a + Math.PI / 2, 0.5);
  // Targets and a fence.
  for (const x of [-0.9, 0.9]) {
    s.add(rbox(0.04, 0.45, 0.04, 0.01), W.barkD, 'matte', { at: [x, 0.25, 1.0] });
    s.add(cyl(0.16, 0.16, 0.04, 12), '#efe6d0', 'matte', { at: [x, 0.42, 1.02], rot: [Math.PI / 2, 0, 0] });
    s.add(cyl(0.09, 0.09, 0.045, 12), '#c8402e', 'matte', { at: [x, 0.42, 1.02], rot: [Math.PI / 2, 0, 0] });
  }
  fence(s, [-1.3, 1.25], [-0.45, 1.25], W.barkL);
  fence(s, [0.45, 1.25], [1.3, 1.25], W.barkL);
  for (const x of [-0.55, 0.55]) leafBanner(s, team, [x, 0.8, 0.62], 0.22, 0.36);
  return done(s);
}

export function spire(team: string): THREE.Group {
  const s = new Sculpt();
  grassSkirt(s, 1.8, 1.8, 71);
  stones(s, 6, 0.65, 73);
  // Three vines twisting up into a crown of thorns around a green crystal.
  for (let v = 0; v < 3; v++)
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const a = v * 2.1 + t * 5;
      const r = 0.34 * (1 - t * 0.55);
      s.add(capsule(0.14 * (1 - t * 0.45), 0.34, 6), v === 0 ? W.bark : v === 1 ? W.barkL : W.barkD, 'matte', { at: [Math.cos(a) * r, 0.15 + t * 2.1, Math.sin(a) * r], rot: [Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3] });
      if (i % 2) s.add(cone(0.03, 0.16, 4), W.bone, 'matte', { at: [Math.cos(a) * (r + 0.1), 0.15 + t * 2.1, Math.sin(a) * (r + 0.1)], rot: [0, -a, Math.PI / 2] });
    }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    s.add(capsule(0.04, 0.35, 4), W.barkL, 'matte', { at: [Math.cos(a) * 0.2, 2.35, Math.sin(a) * 0.2], rot: [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6] });
  }
  s.add(new THREE.OctahedronGeometry(0.17, 0), '#7dff5a', 'glow', { at: [0, 2.45, 0], scale: [1, 1.6, 1] });
  s.add(leafFan(5, 0.18, 0.1, 2.4, 75), LEAVES[0], 'cloth', { at: [0, 0.9, 0.05], rot: [Math.PI, 0, 0] });
  leafBanner(s, team, [0.0, 1.35, 0.33], 0.2, 0.36);
  return done(s);
}

export function circle(team: string): THREE.Group {
  const s = new Sculpt();
  grassSkirt(s, 2.9, 2.9, 81);
  s.add(cyl(1.0, 1.05, 0.06, 16), B.stoneL, 'matte', { at: [0, 0.03, 0] });
  s.add(new THREE.TorusGeometry(0.75, 0.04, 3, 24), '#7dff5a', 'glow', { at: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0] });
  // Standing stones with glowing runes.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    const x = Math.cos(a) * 1.15;
    const z = Math.sin(a) * 1.15;
    s.add(blob(0.22, 83 + i, 0.15), '#8f8a80', 'matte', { at: [x, 0.42, z], scale: [0.85, 2.0, 0.55], rot: [0, -a, 0] });
    s.add(blob(0.12, 90 + i, 0.3), LEAVES[3], 'matte', { at: [x, 0.78, z], scale: [1, 0.4, 1] });
    s.add(rbox(0.09, 0.16, 0.03, 0.01), '#7dff5a', 'glow', { at: [x * 0.86, 0.45, z * 0.86], rot: [0, -a + Math.PI / 2, 0] });
  }
  // A young glowing tree at the centre.
  s.add(cyl(0.06, 0.1, 0.9, 6), W.bark, 'matte', { at: [0, 0.5, 0] });
  canopy(s, [0, 1.15, 0], 0.48, 87, 6);
  for (let i = 0; i < 4; i++) s.add(ball(0.04, 6, 4), '#c8ff8a', 'glow', { at: [Math.cos(i * 1.6) * 0.35, 1.05, Math.sin(i * 1.6) * 0.35] });
  leafBanner(s, team, [0, 0.62, 0.12], 0.18, 0.3);
  return done(s);
}

export function barkweaver(team: string): THREE.Group {
  const s = new Sculpt();
  grassSkirt(s, 2.9, 2.9, 91);
  // A bark hut under a leaf roof with a great tusk ridge.
  s.add(rbox(1.7, 0.75, 1.1, 0.12), W.bark, 'matte', { at: [-0.1, 0.4, -0.35] });
  for (let i = 0; i < 6; i++) s.add(rbox(0.06, 0.78, 0.05, 0.02), W.barkD, 'matte', { at: [-0.85 + i * 0.3, 0.4, 0.21] });
  s.add(lathe([[1.0, 0], [0.9, 0.25], [0.5, 0.55], [0, 0.65]], 10), LEAVES[3], 'matte', { at: [-0.1, 0.76, -0.35], scale: [1.1, 1, 0.8] });
  for (let i = 0; i < 6; i++) s.add(leafFan(3, 0.3, 0.16, 1.4, 93 + i), LEAVES[i % 4], 'cloth', { at: [-0.9 + i * 0.32, 1.0, 0.12], rot: [Math.PI + 0.6, 0, 0] });
  s.add(capsule(0.07, 1.4, 6), W.bone, 'matte', { at: [-0.1, 1.38, -0.35], rot: [0, 0, Math.PI / 2 - 0.3] });
  doorGlow(s, [-0.1, 0.05, 0.23], 0.4, 0.5);
  // Bark armour on a stand, a workbench.
  s.add(rbox(0.04, 0.8, 0.04, 0.01), W.barkD, 'matte', { at: [0.95, 0.4, 0.55] });
  s.add(lathe([[0.15, 0], [0.18, 0.12], [0.15, 0.3], [0.08, 0.36]], 8), '#b89a52', 'matte', { at: [0.95, 0.38, 0.55] });
  s.add(leafFan(3, 0.12, 0.08, 1.5, 97), LEAVES[0], 'cloth', { at: [0.95, 0.72, 0.55], rot: [Math.PI, 0, 0] });
  s.add(rbox(0.7, 0.08, 0.32, 0.02), W.barkL, 'matte', { at: [0.3, 0.35, 0.85] });
  for (const x of [0.0, 0.6]) s.add(rbox(0.06, 0.32, 0.26, 0.01), W.barkD, 'matte', { at: [x, 0.16, 0.85] });
  leafBanner(s, team, [-0.75, 0.68, 0.25], 0.22, 0.36);
  return done(s);
}

export function moonwell(team: string): THREE.Group {
  const s = new Sculpt();
  grassSkirt(s, 2.9, 2.9, 101);
  s.add(lathe([[0.9, 0], [0.95, 0.3], [0.78, 0.34], [0.75, 0.15]], 18), B.stoneD, 'matte', { at: [0, 0.02, 0.1] });
  s.add(cyl(0.77, 0.77, 0.03, 18), '#4ac8ff', 'glow', { at: [0, 0.3, 0.1] });
  // A root arch with a glowing waterfall, two runestones.
  for (const x of [-1, 1]) s.add(capsule(0.12, 1.3, 6), W.bark, 'matte', { at: [x * 0.6, 0.75, -0.6], rot: [0, 0, -x * 0.3] });
  s.add(new THREE.TorusGeometry(0.62, 0.11, 5, 12, Math.PI), W.barkL, 'matte', { at: [0, 1.35, -0.62] });
  canopy(s, [0, 1.95, -0.62], 0.45, 103, 5);
  s.add(rbox(0.32, 1.1, 0.04, 0.02), '#7ad8ff', 'glow', { at: [0, 0.85, -0.5] });
  s.add(rbox(0.36, 0.1, 0.36, 0.03), '#9ae6ff', 'glow', { at: [0, 0.32, -0.38] });
  for (const x of [-1.05, 1.05]) {
    s.add(blob(0.2, 105 + x, 0.15), '#8f8a80', 'matte', { at: [x, 0.4, -0.1], scale: [0.8, 1.8, 0.55] });
    s.add(new THREE.TorusGeometry(0.06, 0.015, 4, 10), '#6ad0ff', 'glow', { at: [x, 0.5, 0.0] });
  }
  stones(s, 6, 1.1, 107);
  leafBanner(s, team, [0, 1.25, -0.48], 0.24, 0.3);
  return done(s);
}

export function rootpit(team: string): THREE.Group {
  const s = new Sculpt();
  grassSkirt(s, 2.9, 2.9, 111);
  s.add(cyl(1.2, 1.25, 0.05, 16), '#7a6040', 'matte', { at: [0, 0.025, 0] });
  s.add(cyl(0.7, 0.7, 0.02, 14), '#ffa83a', 'glow', { at: [0, 0.06, 0] });
  // Great roots arching over a glowing pit.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    s.add(new THREE.TorusGeometry(0.75, 0.1, 5, 10, Math.PI), i % 2 ? W.bark : W.barkD, 'matte', { at: [0, 0.05, 0], rot: [0, a, 0], scale: [1, 0.9, 1] });
  }
  s.add(cyl(0.13, 0.2, 1.1, 7), W.barkL, 'matte', { at: [0, 0.6, 0] });
  canopy(s, [0, 1.25, 0], 0.4, 113, 5);
  for (let i = 0; i < 5; i++) s.add(cone(0.06, 0.25, 4), '#ffb43a', 'glow', { at: [Math.cos(i * 1.3) * 0.4, 0.15, Math.sin(i * 1.3) * 0.4] });
  stones(s, 7, 1.15, 115);
  leafBanner(s, team, [0.0, 0.85, 0.15], 0.22, 0.32);
  return done(s);
}

export const WILD_BUILDINGS_NEW = { heartwood, grove, saplodge, den, spire, circle, barkweaver, moonwell, rootpit } as const;
