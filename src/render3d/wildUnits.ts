// Thornwild units in the painted style: bark, leaf and amber, with the team
// colour on sashes, shields and saddle cloths. Heroes are a size up, each with
// its own silhouette: the Thorn Warden's antlers, the Huntress's leaf cloak and
// braid, the Grove Speaker's leaf crown and antler staff.

import * as THREE from 'three';
import { Sculpt, ball, blob, capsule, cone, cyl, cloth, lathe, leafFan, rbox, slab } from './kit';
import { assemble, humanoid, HIP_Y, SHOULDER_Y, type Figure } from './rig';
import { beastModel } from './beasts';
import { backPennant, bow } from './crownUnits';

export const W = {
  bark: '#a0703f',
  barkD: '#74502c',
  barkL: '#c08a52',
  leaf: '#8fc244',
  leafD: '#62962e',
  leafL: '#b8dc5c',
  moss: '#6a8f2e',
  amber: '#ffb43a',
  bone: '#ece0c2',
  cream: '#efe4c8',
  auburn: '#b5562a',
  skin: '#eab98e',
  leather: '#7a5230',
};

const HAND: [number, number, number] = [0, -0.27, 0.015];
const along = (d: number, tilt: number): [number, number, number] => [HAND[0], HAND[1] + Math.sin(tilt) * d, HAND[2] + Math.cos(tilt) * d];
const shaftRot = (tilt: number): [number, number, number] => [Math.PI / 2 - tilt, 0, 0];

function leafHood(t: Sculpt, color = W.leaf, tall = 0): void {
  t.add(ball(0.11, 10, 8), color, 'cloth', { at: [0, SHOULDER_Y + 0.13, -0.02], scale: [1, 1.05, 1.08] });
  t.add(cone(0.085, 0.13 + tall, 8), color, 'cloth', { at: [0, SHOULDER_Y + 0.23 + tall * 0.4, -0.07], rot: [-0.55 - tall, 0, 0] });
}

/** A mantle of big leaves over the shoulders and back. */
function leafMantle(t: Sculpt, color = W.leaf, dark = W.leafD, size = 1): void {
  t.add(leafFan(7, 0.2 * size, 0.1 * size, 2.4, 5), color, 'cloth', { at: [0, SHOULDER_Y + 0.04, -0.1], rot: [Math.PI, 0, 0] });
  t.add(leafFan(6, 0.24 * size, 0.11 * size, 2.0, 6), dark, 'cloth', { at: [0, SHOULDER_Y - 0.02, -0.13], rot: [Math.PI + 0.25, 0, 0] });
  for (const x of [-1, 1]) t.add(leafFan(3, 0.12 * size, 0.08 * size, 1.2, 7 + x), color, 'cloth', { at: [x * 0.17, SHOULDER_Y + 0.05, 0], rot: [Math.PI, 0, -x * 1.2] });
}

function sash(t: Sculpt, team: string): void {
  t.add(cloth(0.095, 0.34, 0.02), team, 'cloth', { at: [0.03, SHOULDER_Y - 0.01, 0.135], rot: [0, 0, 0.55] });
  t.add(cloth(0.095, 0.3, 0.02), team, 'cloth', { at: [-0.03, SHOULDER_Y - 0.01, -0.135], rot: [0, Math.PI, 0.55] });
}

function braid(t: Sculpt, color = W.auburn): void {
  for (let i = 0; i < 4; i++) t.add(ball(0.03 - i * 0.003, 6, 4), color, 'matte', { at: [0.07, SHOULDER_Y + 0.07 - i * 0.05, -0.06 + i * 0.01] });
}

function livingTools(f: Figure): void {
  const tilt = 0.35;
  f.armR.add(cyl(0.017, 0.017, 0.42, 6), W.barkL, 'matte', { at: along(0.13, tilt), rot: shaftRot(tilt) });
  f.armR.add(leafFan(2, 0.06, 0.04, 1.2, 3), W.leaf, 'cloth', { at: along(0.05, tilt), rot: [-tilt, 0, 0] });
  const tip = along(0.32, tilt);
  const head = (name: string, build: (s: Sculpt) => void) => {
    const s = new Sculpt();
    build(s);
    f.extras.push({ name, sculpt: s, parent: 'tool' });
  };
  head('pick', (s) => s.add(lathe([[0.004, -0.14], [0.022, 0], [0.004, 0.14]], 6), '#a7a39a', 'metal', { at: tip, rot: [-tilt, 0, 0] }));
  head('axe', (s) => s.add(slab([[0, -0.03], [0.1, -0.06], [0.11, 0.06], [0, 0.03]], 0.02, 0.005), '#b8b4aa', 'metal', { at: [tip[0] + 0.01, tip[1], tip[2]], rot: [-tilt, Math.PI / 2, 0] }));
  head('hammer', (s) => s.add(rbox(0.08, 0.08, 0.15, 0.02), W.barkL, 'matte', { at: tip, rot: [-tilt, 0, 0] }));
  const sack = new Sculpt();
  sack.add(lathe([[0.07, 0], [0.11, 0.05], [0.11, 0.12]], 10), '#b48a4a', 'matte', { at: [0, SHOULDER_Y - 0.16, -0.18] }); // basket
  for (let i = 0; i < 3; i++) sack.add(new THREE.OctahedronGeometry(0.035, 0), '#ffd34a', 'gold', { at: [-0.04 + i * 0.04, SHOULDER_Y - 0.02, -0.18] });
  f.extras.push({ name: 'sack', sculpt: sack, parent: 'body' });
  for (let i = 0; i < 3; i++) {
    const l = new Sculpt();
    l.add(cyl(0.045, 0.045, 0.36, 8), i % 2 ? '#8a5a32' : '#a26e3c', 'matte', { at: [0, SHOULDER_Y - 0.1 + i * 0.085, -0.19], rot: [0, 0, Math.PI / 2] });
    l.add(leafFan(2, 0.06, 0.04, 1, i), W.leaf, 'cloth', { at: [0.17, SHOULDER_Y - 0.08 + i * 0.085, -0.19], rot: [0, 0, -Math.PI / 2] });
    f.extras.push({ name: `log${i}`, sculpt: l, parent: 'body' });
  }
}

function woodShield(s: Sculpt, team: string, r = 0.17): void {
  const at: [number, number, number] = [-0.05, -0.2, 0.06];
  s.add(cyl(r, r, 0.05, 12), W.barkL, 'matte', { at, rot: [0, 0, Math.PI / 2] });
  s.add(new THREE.TorusGeometry(r, 0.02, 4, 14), W.barkD, 'matte', { at: [at[0] - 0.01, at[1], at[2]], rot: [0, Math.PI / 2, 0] });
  // The team mark: a spiral disc at the centre.
  s.add(cyl(r * 0.45, r * 0.45, 0.03, 10), team, 'cloth', { at: [at[0] - 0.02, at[1], at[2]], rot: [0, 0, Math.PI / 2] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    s.add(cone(0.025, 0.08, 5), W.bone, 'matte', { at: [at[0], at[1] + Math.sin(a) * r, at[2] + Math.cos(a) * r], rot: [a + Math.PI / 2, 0, 0] });
  }
}

function spikedMace(s: Sculpt, len = 0.42): void {
  const tilt = 0.55;
  s.add(cyl(0.022, 0.026, len, 6), W.barkD, 'matte', { at: along(len * 0.32, tilt), rot: shaftRot(tilt) });
  const head = along(len * 0.82, tilt);
  s.add(blob(0.075, 41, 0.15, 1), W.barkL, 'matte', { at: head });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    s.add(cone(0.022, 0.07, 4), W.bone, 'matte', { at: [head[0] + Math.cos(a) * 0.07, head[1] + Math.sin(a) * 0.07, head[2]], rot: [0, 0, a - Math.PI / 2] });
  }
}

// ---- units --------------------------------------------------------------------------

export function tender(team: string): THREE.Group {
  const f = humanoid({ shirt: W.cream, over: W.leaf, pants: '#6a5a3a', boots: W.leather, belt: W.leather, buckle: '#d8a640', hair: W.auburn, bulk: 1.1 });
  leafHood(f.torso);
  sash(f.torso, team);
  f.torso.add(leafFan(5, 0.16, 0.08, 1.6, 9), W.leafD, 'cloth', { at: [0, HIP_Y + 0.05, 0.06], rot: [Math.PI, 0, 0] }); // leaf skirt
  braid(f.torso);
  livingTools(f);
  return assemble(f, 1.62, 'melee');
}

export function thornguard(team: string): THREE.Group {
  const f = humanoid({ shirt: W.bark, over: team, pants: W.barkD, boots: W.barkD, belt: W.barkD, buckle: '#d8a640', sleeve: W.bark, glove: W.barkD, skin: W.barkL, bulk: 1.4 });
  const t = f.torso;
  // Bark plates and a horned wooden helm.
  t.add(blob(0.17, 51, 0.12), W.bark, 'matte', { at: [0, SHOULDER_Y - 0.08, 0.03], scale: [1.1, 0.95, 0.85] });
  t.add(lathe([[0.1, -0.05], [0.105, 0.03], [0.07, 0.1], [0, 0.12]], 10), W.barkL, 'matte', { at: [0, SHOULDER_Y + 0.13, 0] });
  t.add(rbox(0.12, 0.016, 0.02, 0.005), '#2a1d12', 'matte', { at: [0, SHOULDER_Y + 0.12, 0.1] });
  for (const x of [-1, 1]) t.add(cone(0.025, 0.14, 5), W.bone, 'matte', { at: [x * 0.07, SHOULDER_Y + 0.27, 0], rot: [0, 0, -x * 0.35] });
  for (const x of [-1, 1]) t.add(leafFan(4, 0.14, 0.09, 1.5, 11 + x), W.leaf, 'cloth', { at: [x * 0.22, SHOULDER_Y + 0.06, 0], rot: [Math.PI, 0, -x * 1.3] });
  t.add(ball(0.04, 6, 4), W.amber, 'glow', { at: [0, HIP_Y + 0.2, 0.17] });
  woodShield(f.armL, team, 0.19);
  spikedMace(f.armR);
  return assemble(f, 1.75, 'melee');
}

export function slinger(team: string): THREE.Group {
  const f = humanoid({ shirt: W.cream, over: W.leaf, pants: '#6a5a3a', boots: W.leather, belt: W.leather, buckle: '#d8a640', hair: W.auburn, sleeve: W.leaf, glove: W.leather, bulk: 1.0 });
  leafHood(f.torso);
  sash(f.torso, team);
  braid(f.torso);
  f.torso.add(leafFan(5, 0.15, 0.08, 1.6, 19), W.leafD, 'cloth', { at: [0, HIP_Y + 0.05, 0.05], rot: [Math.PI, 0, 0] });
  f.torso.add(lathe([[0.04, 0], [0.06, 0.04], [0.05, 0.08]], 8), '#b48a4a', 'matte', { at: [-0.13, HIP_Y + 0.0, 0.05] }); // seed pouch
  // The sling: a vine cord and a pouch holding a thorn-seed.
  f.armR.add(new THREE.TorusGeometry(0.1, 0.008, 4, 12, Math.PI * 1.4), W.leafD, 'matte', { at: [0, -0.33, 0.02], rot: [0, Math.PI / 2, 0] });
  f.armR.add(ball(0.035, 6, 4), '#8a5a32', 'matte', { at: [0, -0.42, 0.04] });
  return assemble(f, 1.7, 'throw');
}

export function fox(team: string): THREE.Group {
  const root = beastModel({ coat: '#ec8a34', belly: '#f4ece0', mane: '#f0e6d4', hoof: '#3a2418', legH: 0.22, len: 0.5, girth: 0.11, head: 'fox' }, 1.6, undefined, 'beast');
  // Leaf collar in the team colour.
  const s = new Sculpt();
  s.add(new THREE.TorusGeometry(0.09, 0.025, 5, 12), team, 'cloth', { at: [0, 0.4, 0.2], rot: [1.1, 0, 0] });
  s.add(leafFan(5, 0.07, 0.05, 2.4, 3), W.leaf, 'cloth', { at: [0, 0.38, 0.24], rot: [Math.PI + 0.6, 0, 0] });
  (root.getObjectByName('body') as THREE.Group).add(s.build());
  return root;
}

export function stagrider(team: string): THREE.Group {
  const rider = humanoid({ shirt: W.cream, over: W.leaf, pants: '#5a4a30', boots: W.leather, belt: W.leather, hair: W.auburn, sleeve: W.leaf, bulk: 1.0 });
  leafHood(rider.torso);
  sash(rider.torso, team);
  rider.torso.add(cloth(0.26, 0.3, 0.06, 0.06, 23), W.leafD, 'cloth', { at: [0, SHOULDER_Y + 0.02, -0.13] });
  const t = 0.35;
  rider.armR.add(cyl(0.015, 0.018, 1.0, 6), W.barkL, 'matte', { at: along(0.32, t), rot: shaftRot(t) });
  rider.armR.add(slab([[-0.03, 0], [0.03, 0], [0, 0.16]], 0.015, 0.004), '#d9c18a', 'gold', { at: along(0.83, t), rot: [Math.PI / 2 - t, 0, 0] });
  rider.armR.add(leafFan(3, 0.08, 0.05, 1.4, 4), W.leaf, 'cloth', { at: along(0.78, t), rot: [-t, 0, 0] });
  backPennant(rider, team);
  return beastModel({ coat: '#b07a48', belly: '#ecdcbc', mane: '#efe2c6', hoof: '#3a2a1c', legH: 0.48, len: 0.82, girth: 0.18, head: 'stag', barding: team, bardingTrim: W.leafD }, 1.5, rider, 'melee');
}

export function mender(team: string): THREE.Group {
  const f = humanoid({ shirt: W.cream, over: W.leaf, pants: W.cream, boots: W.leather, belt: '#d8a640', buckle: '#d8a640', robe: W.cream, sleeve: W.leaf, hair: W.auburn, bulk: 1.0 });
  leafHood(f.torso);
  sash(f.torso, team);
  braid(f.torso);
  f.torso.add(cloth(0.34, 0.4, 0.06, 0.05, 29), W.leaf, 'cloth', { at: [0, SHOULDER_Y + 0.02, -0.13] });
  const tilt = 1.25;
  f.armR.add(cyl(0.016, 0.02, 0.82, 6), W.barkL, 'matte', { at: along(0.14, tilt), rot: shaftRot(tilt) });
  const top = along(0.55, tilt);
  f.armR.add(leafFan(5, 0.08, 0.05, 2.4, 13), W.leaf, 'cloth', { at: [top[0], top[1] + 0.02, top[2]], rot: [Math.PI, 0, 0] });
  f.armR.add(ball(0.05, 8, 6), '#a8ff6a', 'glow', { at: [top[0], top[1] + 0.07, top[2]] });
  return assemble(f, 1.72, 'staff');
}

export function rootcrusher(team: string): THREE.Group {
  // A walking tree: a gnarled trunk body under a crown of leaves, root legs and huge wooden fists.
  const f = humanoid({ shirt: W.bark, pants: W.barkD, boots: W.barkD, belt: team, skin: W.barkL, sleeve: W.bark, glove: W.barkD, bulk: 1.8 });
  const t = f.torso;
  t.add(lathe([[0.2, 0], [0.18, 0.15], [0.2, 0.3], [0.24, 0.45]], 9), W.bark, 'matte', { at: [0, HIP_Y - 0.02, 0] });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    t.add(blob(0.17, 60 + i, 0.25), i % 2 ? W.leaf : W.leafD, 'matte', { at: [Math.cos(a) * 0.17, SHOULDER_Y + 0.25, Math.sin(a) * 0.15 - 0.03] });
  }
  t.add(blob(0.2, 66, 0.25), W.leafL, 'matte', { at: [0, SHOULDER_Y + 0.38, -0.02] });
  for (const x of [-1, 1]) t.add(ball(0.028, 6, 4), W.amber, 'glow', { at: [x * 0.06, SHOULDER_Y + 0.1, 0.17] });
  t.add(ball(0.05, 6, 4), W.amber, 'glow', { at: [0, HIP_Y + 0.08, 0.19] });
  for (const x of [-1, 1]) t.add(cone(0.03, 0.16, 5), W.bone, 'matte', { at: [x * 0.27, SHOULDER_Y + 0.05, 0.02], rot: [0, 0, -x * 1.1] });
  for (const s of [f.armL, f.armR]) s.add(blob(0.11, 71, 0.25), W.barkL, 'matte', { at: [0, -0.31, 0.03], scale: [1, 1.2, 1.1] });
  return assemble(f, 1.9, 'melee');
}

// ---- heroes --------------------------------------------------------------------------

function heroRing(f: Figure, r = 0.34): void {
  const s = new Sculpt();
  s.add(new THREE.TorusGeometry(r, 0.012, 4, 28), '#ffd36a', 'glow', { at: [0, 0.015, 0], rot: [Math.PI / 2, 0, 0] });
  f.extras.push({ name: 'halo', sculpt: s, parent: 'body' });
}


export function thornWarden(team: string): THREE.Group {
  const f = humanoid({ shirt: W.bark, over: team, pants: W.barkD, boots: W.barkD, belt: W.barkD, buckle: '#d8a640', skin: W.barkL, sleeve: W.bark, glove: W.barkD, bulk: 1.45 });
  const t = f.torso;
  heroRing(f, 0.38);
  t.add(blob(0.19, 81, 0.12), W.bark, 'matte', { at: [0, SHOULDER_Y - 0.07, 0.03], scale: [1.1, 1, 0.85] });
  leafMantle(t, W.leaf, W.leafD, 1.2);
  // A wooden mask and great antlers: the Warden's silhouette.
  t.add(rbox(0.13, 0.15, 0.06, 0.02), W.barkL, 'matte', { at: [0, SHOULDER_Y + 0.12, 0.07] });
  for (const x of [-1, 1]) t.add(ball(0.016, 5, 4), W.amber, 'glow', { at: [x * 0.035, SHOULDER_Y + 0.14, 0.105] });
  for (const x of [-1, 1]) {
    t.add(capsule(0.02, 0.2, 4), W.barkL, 'matte', { at: [x * 0.1, SHOULDER_Y + 0.3, -0.02], rot: [0, 0, -x * 0.55] });
    t.add(capsule(0.017, 0.14, 4), W.barkL, 'matte', { at: [x * 0.2, SHOULDER_Y + 0.42, -0.02], rot: [0, 0, -x * 1.0] });
    t.add(capsule(0.016, 0.12, 4), W.barkL, 'matte', { at: [x * 0.14, SHOULDER_Y + 0.46, 0.02], rot: [0.3, 0, -x * 0.2] });
    t.add(capsule(0.014, 0.1, 4), W.barkL, 'matte', { at: [x * 0.29, SHOULDER_Y + 0.5, -0.02], rot: [0, 0, -x * 0.5] });
  }
  woodShield(f.armL, team, 0.22);
  spikedMace(f.armR, 0.5);
  backPennant(f, team, 0.5);
  return assemble(f, 2.3, 'melee');
}

export function huntress(team: string): THREE.Group {
  const f = humanoid({ shirt: W.leafD, over: W.leaf, pants: '#5a4a30', boots: W.leather, belt: W.leather, buckle: '#d8a640', hair: W.auburn, sleeve: W.cream, glove: W.leather, bulk: 1.05 });
  const t = f.torso;
  heroRing(f);
  leafHood(t, W.leaf, 0.14);
  braid(t);
  sash(t, team);
  // The long leaf cloak.
  t.add(leafFan(9, 0.46, 0.13, 1.6, 31), W.leaf, 'cloth', { at: [0, SHOULDER_Y + 0.03, -0.13], rot: [Math.PI + 0.1, 0, 0] });
  t.add(leafFan(7, 0.4, 0.12, 1.4, 32), W.leafD, 'cloth', { at: [0, SHOULDER_Y + 0.0, -0.15], rot: [Math.PI + 0.18, 0, 0] });
  t.add(cyl(0.05, 0.045, 0.28, 8), W.leather, 'matte', { at: [0.06, SHOULDER_Y - 0.08, -0.15], rot: [0.25, 0, -0.35] });
  bow(f, 0.86, '#b8803e', W.leather);
  backPennant(f, team);
  return assemble(f, 2.3, 'bow');
}

export function groveSpeaker(team: string): THREE.Group {
  const f = humanoid({ shirt: W.cream, over: W.leaf, pants: W.cream, boots: W.leather, belt: '#d8a640', buckle: '#d8a640', robe: W.cream, sleeve: W.leaf, beard: '#f2efe8', hair: '#f2efe8', bulk: 1.15 });
  const t = f.torso;
  heroRing(f);
  leafMantle(t, W.leaf, W.leafD, 1.1);
  sash(t, team);
  t.add(lathe([[0.075, 0], [0.085, 0.08], [0.05, 0.2], [0, 0.27]], 8), '#f2efe8', 'matte', { at: [0, SHOULDER_Y - 0.17, 0.06], scale: [1, 1, 0.6] });
  // A crown of leaves.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    t.add(leafFan(1, 0.1, 0.05, 0, i), i % 2 ? W.leafL : W.leaf, 'cloth', { at: [Math.sin(a) * 0.085, SHOULDER_Y + 0.2, Math.cos(a) * 0.085], rot: [0, a, 0] });
  }
  // Antler staff with a green glow.
  const tilt = 1.3;
  f.armR.add(cyl(0.02, 0.026, 0.98, 6), W.barkD, 'matte', { at: along(0.18, tilt), rot: shaftRot(tilt) });
  const top = along(0.68, tilt);
  for (const x of [-1, 1]) f.armR.add(capsule(0.014, 0.12, 4), W.barkL, 'matte', { at: [top[0] + x * 0.05, top[1] + 0.06, top[2]], rot: [0, 0, -x * 0.6] });
  f.armR.add(new THREE.OctahedronGeometry(0.055, 0), '#7dff5a', 'glow', { at: [top[0], top[1] + 0.12, top[2]], scale: [1, 1.5, 1] });
  backPennant(f, team);
  return assemble(f, 2.3, 'staff');
}
