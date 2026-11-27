// Four-legged figures: horses, the Thornwild stag, wolves and foxes, with or
// without a rider. Front legs are the legL/legR pivots, hind legs hindL/hindR.

import * as THREE from 'three';
import { Sculpt, ball, capsule, cone, cyl, lathe, rbox, slab } from './kit';
import { Figure, SHOULDER_X, SHOULDER_Y, UNIT_SIZE, type UnitParts } from './rig';

export interface Beast {
  coat: string;
  belly?: string;
  mane?: string;
  hoof: string;
  /** Leg length and body length. */
  legH: number;
  len: number;
  girth: number;
  head: 'horse' | 'stag' | 'wolf' | 'fox';
  /** Cloth or armour over the back (a caparison in the team colour). */
  barding?: string;
  bardingTrim?: string;
  armoured?: boolean;
  tail?: string;
}

/** Build a beast; optionally seat a rider figure on it. Returns the model root. */
export function beastModel(b: Beast, scale: number, rider?: Figure, style: UnitParts['style'] = 'melee'): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  body.scale.setScalar(scale * UNIT_SIZE);
  root.add(body);
  const torso = new Sculpt();
  const cy = b.legH + b.girth * 0.55;
  const half = b.len / 2;
  // Barrel of the body, chest and rump.
  torso.add(capsule(b.girth, b.len * 0.62, 10), b.coat, 'matte', { at: [0, cy, 0], rot: [Math.PI / 2, 0, 0], scale: [0.95, 1, 1] });
  if (b.belly) torso.add(capsule(b.girth * 0.82, b.len * 0.5, 8), b.belly, 'matte', { at: [0, cy - b.girth * 0.25, 0], rot: [Math.PI / 2, 0, 0], scale: [0.8, 1, 0.9] });
  // Neck and head.
  const nx = half * 0.92;
  if (b.head === 'horse' || b.head === 'stag') {
    torso.add(capsule(b.girth * 0.5, b.girth * 1.3, 8), b.coat, 'matte', { at: [0, cy + b.girth * 0.9, nx], rot: [0.55, 0, 0] });
    const hz = nx + b.girth * 0.85;
    const hy = cy + b.girth * 1.75;
    torso.add(capsule(b.girth * 0.33, b.girth * 0.75, 8), b.coat, 'matte', { at: [0, hy, hz], rot: [1.25, 0, 0] });
    torso.add(ball(b.girth * 0.28, 8, 6), b.belly ?? b.coat, 'matte', { at: [0, hy - b.girth * 0.3, hz + b.girth * 0.55] });
    for (const x of [-1, 1]) torso.add(cone(b.girth * 0.12, b.girth * 0.3, 5), b.coat, 'matte', { at: [x * b.girth * 0.2, hy + b.girth * 0.42, hz - b.girth * 0.1] });
    if (b.mane) torso.add(rbox(0.04, b.girth * 0.5, b.girth * 1.5, 0.015), b.mane, 'matte', { at: [0, cy + b.girth * 1.3, nx - b.girth * 0.15], rot: [0.55, 0, 0] });
    if (b.head === 'stag') {
      // Antlers: the stag's silhouette, wide and branching.
      for (const x of [-1, 1]) {
        torso.add(capsule(0.018, b.girth * 0.9, 4), '#7a5634', 'matte', { at: [x * b.girth * 0.35, hy + b.girth * 0.85, hz - b.girth * 0.2], rot: [-0.35, 0, -x * 0.6] });
        torso.add(capsule(0.016, b.girth * 0.6, 4), '#8a6640', 'matte', { at: [x * b.girth * 0.75, hy + b.girth * 1.35, hz - b.girth * 0.35], rot: [-0.2, 0, -x * 1.1] });
        torso.add(capsule(0.014, b.girth * 0.5, 4), '#8a6640', 'matte', { at: [x * b.girth * 0.55, hy + b.girth * 1.45, hz + b.girth * 0.05], rot: [0.5, 0, -x * 0.3] });
        torso.add(capsule(0.014, b.girth * 0.45, 4), '#8a6640', 'matte', { at: [x * b.girth * 1.05, hy + b.girth * 1.75, hz - b.girth * 0.25], rot: [-0.2, 0, -x * 0.4] });
      }
      torso.add(ball(b.girth * 0.42, 8, 6), '#efe2c6', 'matte', { at: [0, cy + b.girth * 0.7, nx + b.girth * 0.25], scale: [1, 1.2, 0.8] }); // pale ruff
    }
    if (b.head === 'horse' && b.armoured) torso.add(rbox(b.girth * 0.55, b.girth * 0.5, b.girth * 0.75, 0.03), '#aeb6c1', 'metal', { at: [0, hy + b.girth * 0.1, hz + b.girth * 0.1], rot: [1.25, 0, 0] });
  } else {
    // Wolf or fox: low head on a short neck, pointed ears and snout.
    const hy = cy + b.girth * 0.55;
    const hz = nx + b.girth * 0.7;
    torso.add(ball(b.girth * 0.62, 10, 8), b.coat, 'matte', { at: [0, hy, hz] });
    torso.add(lathe([[b.girth * 0.3, 0], [b.girth * 0.2, b.girth * 0.45], [0.01, b.girth * 0.75]], 8), b.belly ?? b.coat, 'matte', { at: [0, hy - b.girth * 0.12, hz + b.girth * 0.35], rot: [Math.PI / 2, 0, 0] });
    torso.add(ball(b.girth * 0.07, 5, 4), '#1e1814', 'matte', { at: [0, hy - b.girth * 0.08, hz + b.girth * 1.1] });
    for (const x of [-1, 1]) torso.add(cone(b.girth * 0.2, b.girth * 0.55, 4), b.coat, 'matte', { at: [x * b.girth * 0.32, hy + b.girth * 0.6, hz - b.girth * 0.12], rot: [-0.2, 0, -x * 0.25] });
    torso.add(ball(b.girth * 0.7, 10, 8), b.mane ?? b.coat, 'matte', { at: [0, cy + b.girth * 0.25, half * 0.55], scale: [1.05, 1.1, 0.9] }); // ruff
  }
  // Tail.
  if (b.head === 'fox') torso.add(capsule(b.girth * 0.42, b.len * 0.55, 8), b.coat, 'matte', { at: [0, cy + b.girth * 0.2, -half - b.len * 0.25], rot: [-1.1, 0, 0] });
  else if (b.head === 'wolf') torso.add(capsule(b.girth * 0.25, b.len * 0.45, 6), b.coat, 'matte', { at: [0, cy + b.girth * 0.1, -half - b.len * 0.18], rot: [-0.9, 0, 0] });
  else torso.add(capsule(b.girth * 0.18, b.len * 0.4, 6), b.tail ?? b.mane ?? b.coat, 'matte', { at: [0, cy - b.girth * 0.1, -half - b.girth * 0.4], rot: [-0.45, 0, 0] });
  if (b.head === 'fox') torso.add(ball(b.girth * 0.32, 8, 6), '#f4ece0', 'matte', { at: [0, cy + b.girth * 0.65, -half - b.len * 0.5] });
  // Barding: a caparison in the team colour, with a trim.
  if (b.barding) {
    torso.add(cyl(b.girth * 1.02, b.girth * 1.12, b.girth * 1.3, 12, ), b.barding, 'cloth', { at: [0, cy - b.girth * 0.2, -half * 0.1], scale: [0.95, 1, b.len / (b.girth * 2.1)] });
    if (b.bardingTrim) torso.add(cyl(b.girth * 1.13, b.girth * 1.13, 0.03, 12), b.bardingTrim, 'gold', { at: [0, cy - b.girth * 0.85, -half * 0.1], scale: [0.95, 1, b.len / (b.girth * 2.1)] });
    if (b.armoured) torso.add(lathe([[b.girth * 0.9, 0], [b.girth * 0.95, b.girth * 0.3], [b.girth * 0.7, b.girth * 0.6]], 10), '#aeb6c1', 'metal', { at: [0, cy - b.girth * 0.1, half * 0.62], rot: [Math.PI / 2, 0, 0] });
  }
  // Saddle and the rider.
  let tool: THREE.Group | null = null;
  const seatY = cy + b.girth * 0.85;
  if (rider) {
    torso.add(rbox(b.girth * 1.1, 0.05, b.girth * 1.0, 0.02), '#5a3620', 'matte', { at: [0, seatY - 0.04, -half * 0.05] });
    const lift = seatY - 0.3; // rider hips sit on the saddle
    torso.absorb(rider.torso, { at: [0, lift, -half * 0.05] });
    torso.absorb(rider.legL, { at: [-b.girth * 0.75, lift + 0.3, -half * 0.02], rot: [-1.0, 0, 0.55] });
    torso.absorb(rider.legR, { at: [b.girth * 0.75, lift + 0.3, -half * 0.02], rot: [-1.0, 0, -0.55] });
    torso.absorb(rider.armL, { at: [-SHOULDER_X * (rider.look.bulk ?? 1), lift + SHOULDER_Y - 0.02, -half * 0.05], rot: [-0.9, 0, 0.15] });
    tool = new THREE.Group();
    tool.name = 'tool';
    tool.position.set(SHOULDER_X * (rider.look.bulk ?? 1), lift + SHOULDER_Y - 0.02, -half * 0.05);
    if (!rider.armR.empty) tool.add(rider.armR.build('', false));
    if (!rider.flag.empty) {
      const flag = new THREE.Group();
      flag.name = 'flag';
      flag.position.set(rider.flagAt[0], rider.flagAt[1] + lift, rider.flagAt[2] - half * 0.05);
      flag.add(rider.flag.build('', false));
      body.add(flag);
    }
  }
  body.add(torso.build('torso'));
  if (tool) body.add(tool);
  else {
    const t = new THREE.Group();
    t.name = 'tool';
    t.position.set(0, cy + b.girth * 0.5, half);
    body.add(t);
  }
  // Legs.
  const leg = (name: string, x: number, z: number, hind: boolean) => {
    const s = new Sculpt();
    const l = b.legH;
    s.add(capsule(b.girth * (hind ? 0.32 : 0.27), l * 0.38, 6), b.coat, 'matte', { at: [0, -l * 0.25, 0], rot: [hind ? -0.15 : 0.05, 0, 0] });
    s.add(capsule(b.girth * 0.16, l * 0.42, 6), b.belly ?? b.coat, 'matte', { at: [0, -l * 0.66, hind ? -0.02 : 0.01] });
    if (b.head === 'horse' || b.head === 'stag') {
      s.add(cyl(b.girth * 0.2, b.girth * 0.24, 0.05, 8), b.hoof, 'matte', { at: [0, -l + 0.025, 0.005] });
      if (b.head === 'horse') s.add(cyl(b.girth * 0.25, b.girth * 0.22, 0.08, 8), b.mane === '#2a1d14' ? '#efe6d6' : '#efe6d6', 'matte', { at: [0, -l + 0.09, 0] }); // feathering
    } else s.add(ball(b.girth * 0.2, 6, 4), b.hoof, 'matte', { at: [0, -l + 0.03, 0.03], scale: [1, 0.6, 1.4] });
    const p = new THREE.Group();
    p.name = name;
    p.position.set(x, l, z);
    p.add(s.build('', false));
    body.add(p);
  };
  const lx = b.girth * 0.5;
  leg('legL', -lx, half * 0.72, false);
  leg('legR', lx, half * 0.72, false);
  leg('hindL', -lx, -half * 0.72, true);
  leg('hindR', lx, -half * 0.72, true);
  root.userData.style = style;
  return root;
}

/** A lance held in the hand (shoulder-local): long, striped, steel tip, pennant. */
export function lance(s: Sculpt, team: string, len = 1.1): void {
  const l = new Sculpt();
  const mid = len * 0.3;
  l.add(cyl(0.022, 0.03, len, 6), '#e9dcc0', 'matte', { at: [0, 0, mid], rot: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 4; i++) l.add(cyl(0.032, 0.032, 0.07, 6), team, 'cloth', { at: [0, 0, mid - len * 0.2 + i * len * 0.14], rot: [Math.PI / 2, 0, 0] });
  l.add(cone(0.07, 0.14, 8), '#b9c1cc', 'metal', { at: [0, 0, mid - len * 0.38], rot: [-Math.PI / 2, 0, 0] });
  l.add(cone(0.035, 0.2, 6), '#e1e6ee', 'metal', { at: [0, 0, mid + len / 2 + 0.09], rot: [Math.PI / 2, 0, 0] });
  l.add(slab([[0, 0], [0.2, -0.045], [0, -0.1]], 0.008, 0), team, 'cloth', { at: [0, 0.02, mid + len / 2 - 0.12], rot: [0, -Math.PI / 2, 0] });
  s.absorb(l, { at: [0, -0.27, 0.02], rot: [-0.12, 0, 0] });
}
