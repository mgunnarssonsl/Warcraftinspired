// Ironvale Crown and neutral units in the painted style: steel and gold over
// the team colour (tabards, capes, shields, barding), chunky readable shapes.
// Heroes are a size up with a silhouette each: the Marshal's crown, cape and
// great hammer, the Pathfinder's tall hood and bow, the Sage's pointed hat.

import * as THREE from 'three';
import { Sculpt, ball, capsule, cone, crownGeo, cyl, cloth, kiteShield, lathe, rbox, slab, blob } from './kit';
import { Figure, assemble, humanoid, SHOULDER_Y, HIP_Y } from './rig';
import { beastModel, lance } from './beasts';

export const C = {
  steel: '#c4ccd8',
  steelD: '#939ca9',
  gold: '#efbd52',
  leather: '#a06a3a',
  leatherD: '#74492a',
  cream: '#efe3c4',
  skin: '#eab98e',
  wood: '#a8713e',
  woodD: '#7a4e2a',
  hairBrown: '#5a3a22',
  black: '#2a211a',
};

const HAND: [number, number, number] = [0, -0.27, 0.015];
/** A point along a held shaft: from the hand, tilted up from forward by `tilt`. */
function along(d: number, tilt: number): [number, number, number] {
  return [HAND[0], HAND[1] + Math.sin(tilt) * d, HAND[2] + Math.cos(tilt) * d];
}
/** Rotation that turns a Y-axis primitive to point forward, tilted up by `tilt`. */
const shaftRot = (tilt: number): [number, number, number] => [Math.PI / 2 - tilt, 0, 0];

// ---- weapons and gear (shoulder-local, in the hand) -------------------------

export function sword(s: Sculpt, len = 0.42, blade = C.steel): void {
  const t = 0.35;
  s.add(cyl(0.022, 0.022, 0.09, 6), C.leatherD, 'matte', { at: along(0, t), rot: shaftRot(t) });
  s.add(rbox(0.16, 0.03, 0.04, 0.01), C.gold, 'gold', { at: along(0.06, t), rot: [-t, 0, 0] });
  s.add(slab([[-0.032, 0], [0.032, 0], [0.028, len * 0.85], [0, len], [-0.028, len * 0.85]], 0.016, 0.006), blade, 'metal', { at: along(0.07, t), rot: [Math.PI / 2 - t, 0, 0], scale: [1, 1, 1] });
  s.add(ball(0.025, 6, 4), C.gold, 'gold', { at: along(-0.06, t) });
}

export function shieldOnArm(s: Sculpt, face: string, rim: string, emblem: string | null, w = 0.3, h = 0.4): void {
  // Strapped to the forearm, facing out and a little forward.
  const at: [number, number, number] = [-0.05, -0.2, 0.06];
  const rot: [number, number, number] = [0, -1.0, 0];
  s.add(kiteShield(w, h, 0.05), rim, 'gold', { at, rot });
  s.add(kiteShield(w * 0.86, h * 0.86, 0.06), face, 'cloth', { at: [at[0] - 0.012, at[1], at[2] + 0.008], rot });
  if (emblem) s.add(crownGeo(0.05, 0.07), emblem, 'gold', { at: [at[0] - 0.045, at[1] + 0.02, at[2] + 0.04], rot: [Math.PI / 2, 0, -1.0], scale: [1, 0.5, 1] });
}

/** A bow in the left hand, on its own pivot so it stays upright (see UnitParts.bow). */
export function bow(f: Figure, len = 0.62, wood = C.wood, grip = C.leatherD): void {
  const s = new Sculpt();
  const arc = new THREE.TorusGeometry(len / 2, 0.017, 5, 14, Math.PI * 0.72).rotateZ(-Math.PI * 0.36);
  s.add(arc, wood, 'matte', { at: [0, 0, -len * 0.27], rot: [0, Math.PI / 2, 0], scale: [1, 1, 0.55] });
  s.add(cyl(0.003, 0.003, len * 0.92, 3), '#efe6d0', 'matte', { at: [0, 0, -0.05] });
  s.add(cyl(0.024, 0.024, 0.08, 6), grip, 'matte');
  f.extras.push({ name: 'bow', sculpt: s, parent: 'armL', at: [HAND[0], HAND[1], HAND[2] + 0.02] });
}

function quiver(t: Sculpt, color = C.leather): void {
  t.add(cyl(0.05, 0.045, 0.28, 8), color, 'matte', { at: [0.06, SHOULDER_Y - 0.08, -0.15], rot: [0.25, 0, -0.35] });
  for (let i = 0; i < 4; i++) t.add(cyl(0.008, 0.008, 0.1, 3), i % 2 ? '#e8e0c8' : '#c94a3a', 'matte', { at: [0.11 + i * 0.012, SHOULDER_Y + 0.09, -0.19 - i * 0.008], rot: [0.25, 0, -0.35] });
}

function cape(t: Sculpt, color: string, w = 0.3, h = 0.42, trim?: string): void {
  t.add(cloth(w, h, 0.07, 0, 3), color, 'cloth', { at: [0, SHOULDER_Y + 0.02, -0.13] });
  if (trim) t.add(cloth(w * 1.02, 0.03, 0.07, 0, 3), trim, 'gold', { at: [0, SHOULDER_Y + 0.02 - h + 0.03, -0.131 - 0.06] });
}

function hood(t: Sculpt, color: string, tall = 0): void {
  t.add(ball(0.11, 10, 8, ), color, 'cloth', { at: [0, SHOULDER_Y + 0.13, -0.02], scale: [1, 1.05, 1.08] });
  t.add(cone(0.085, 0.12 + tall, 8), color, 'cloth', { at: [0, SHOULDER_Y + 0.22 + tall * 0.4, -0.06], rot: [-0.5 - tall, 0, 0] });
  t.add(lathe([[0.17, 0], [0.13, 0.06], [0.09, 0.1]], 10), color, 'cloth', { at: [0, SHOULDER_Y - 0.03, -0.01] });
}

function helm(t: Sculpt, plume?: string): void {
  const y = SHOULDER_Y + 0.12;
  t.add(lathe([[0.095, -0.07], [0.1, 0.0], [0.096, 0.06], [0.06, 0.1], [0.0, 0.11]], 12), C.steel, 'metal', { at: [0, y, 0] });
  t.add(rbox(0.12, 0.016, 0.02, 0.005), C.black, 'matte', { at: [0, y + 0.0, 0.098] }); // visor slit
  t.add(rbox(0.02, 0.1, 0.02, 0.006), C.gold, 'gold', { at: [0, y + 0.02, 0.1] });
  if (plume) t.add(capsule(0.03, 0.12, 6), plume, 'cloth', { at: [0, y + 0.14, -0.05], rot: [-1.0, 0, 0] });
}

/** Ground halo for heroes: a gold ring that stays under them. */
function heroRing(f: Figure, r = 0.34): void {
  const s = new Sculpt();
  s.add(new THREE.TorusGeometry(r, 0.012, 4, 28), '#ffd36a', 'glow', { at: [0, 0.015, 0], rot: [Math.PI / 2, 0, 0] });
  f.extras.push({ name: 'halo', sculpt: s, parent: 'body' });
}

/** A small team-colour pennant on a short pole, carried on the back (it sways). */
export function backPennant(f: Figure, team: string, h = 0.4): void {
  f.flag.add(cyl(0.009, 0.009, h, 5), '#6a4a2a', 'matte', { at: [0, h / 2, 0] });
  f.flag.add(cloth(0.15, 0.12, 0.02), team, 'cloth', { at: [0.08, h, 0], rot: [0, Math.PI / 2, 0] });
  f.flagAt = [-0.09, SHOULDER_Y - 0.02, -0.16];
}

// ---- Crown ----------------------------------------------------------------------

export function laborer(team: string, hat = '#d9b45a'): THREE.Group {
  const f = humanoid({ shirt: C.cream, over: team, pants: team, boots: C.leatherD, belt: C.leather, buckle: C.gold, hair: C.hairBrown, beard: C.hairBrown, bulk: 1.25 });
  const t = f.torso;
  // Straw hat: the Laborer's silhouette.
  t.add(cyl(0.2, 0.2, 0.015, 12), hat, 'matte', { at: [0, SHOULDER_Y + 0.19, 0] });
  t.add(lathe([[0.1, 0], [0.095, 0.05], [0.05, 0.09], [0, 0.095]], 10), hat, 'matte', { at: [0, SHOULDER_Y + 0.19, 0] });
  t.add(cyl(0.101, 0.101, 0.02, 10), '#8a5a32', 'matte', { at: [0, SHOULDER_Y + 0.215, 0] });
  // Pouches on the belt.
  t.add(rbox(0.06, 0.07, 0.04, 0.012), C.leather, 'matte', { at: [0.12, HIP_Y + 0.04, 0.09] });
  // Tool: a handle, with the head for the job shown.
  const r = f.armR;
  const tilt = 0.35;
  r.add(cyl(0.017, 0.017, 0.42, 6), C.wood, 'matte', { at: along(0.13, tilt), rot: shaftRot(tilt) });
  const head = (name: string, build: (s: Sculpt) => void) => {
    const s = new Sculpt();
    build(s);
    f.extras.push({ name, sculpt: s, parent: 'tool' });
  };
  const tip = along(0.32, tilt);
  head('pick', (s) => s.add(lathe([[0.004, -0.15], [0.022, 0], [0.004, 0.15]], 6), '#9aa3ae', 'metal', { at: tip, rot: [-tilt, 0, 0] }));
  head('axe', (s) => s.add(slab([[0, -0.03], [0.1, -0.06], [0.11, 0.06], [0, 0.03]], 0.02, 0.005), '#b4bcc6', 'metal', { at: [tip[0] + 0.01, tip[1], tip[2]], rot: [-tilt, Math.PI / 2, 0] }));
  head('hammer', (s) => s.add(rbox(0.07, 0.07, 0.15, 0.015), '#767c86', 'metal', { at: tip, rot: [-tilt, 0, 0] }));
  // Loads on the back.
  const sack = new Sculpt();
  sack.add(blob(0.1, 3, 0.15), '#9c7a44', 'cloth', { at: [0, SHOULDER_Y - 0.05, -0.17], scale: [1, 1.1, 0.9] });
  for (let i = 0; i < 3; i++) sack.add(new THREE.OctahedronGeometry(0.035, 0), '#ffd34a', 'gold', { at: [-0.04 + i * 0.04, SHOULDER_Y + 0.06, -0.17 + (i % 2) * 0.02] });
  f.extras.push({ name: 'sack', sculpt: sack, parent: 'body' });
  for (let i = 0; i < 3; i++) {
    const l = new Sculpt();
    l.add(cyl(0.045, 0.045, 0.36, 8), i % 2 ? '#8a5a32' : '#a26e3c', 'matte', { at: [0, SHOULDER_Y - 0.1 + i * 0.085, -0.19], rot: [0, 0, Math.PI / 2] });
    l.add(cyl(0.035, 0.035, 0.362, 8), '#e2c08a', 'matte', { at: [0, SHOULDER_Y - 0.1 + i * 0.085, -0.19], rot: [0, 0, Math.PI / 2], scale: [1, 1.001, 1] });
    f.extras.push({ name: `log${i}`, sculpt: l, parent: 'body' });
  }
  return assemble(f, 1.6, 'melee');
}

export function guard(team: string): THREE.Group {
  const f = humanoid({ shirt: C.steelD, over: team, pants: C.steelD, boots: C.steelD, belt: C.leather, buckle: C.gold, sleeve: C.steel, glove: C.steelD, bulk: 1.15, pauldron: C.steel, plate: C.steel });
  helm(f.torso, team);
  f.torso.add(crownGeo(0.035, 0.05), C.gold, 'gold', { at: [0, HIP_Y + 0.2, 0.14], rot: [Math.PI / 2, 0, 0], scale: [1, 0.45, 1] });
  for (const x of [-1, 1]) f.torso.add(ball(0.04, 6, 4), C.gold, 'gold', { at: [x * 0.19, SHOULDER_Y + 0.03, 0.02] });
  shieldOnArm(f.armL, team, C.gold, C.gold, 0.32, 0.44);
  sword(f.armR, 0.42);
  return assemble(f, 1.75, 'melee');
}

export function archer(team: string): THREE.Group {
  const f = humanoid({ shirt: C.leather, over: '#e9dcbc', pants: '#4a3a2a', boots: C.leatherD, belt: C.leatherD, buckle: C.gold, sleeve: '#d8c9a4', glove: C.leatherD, bulk: 1.0 });
  hood(f.torso, team);
  cape(f.torso, team, 0.26, 0.36, C.gold);
  quiver(f.torso);
  bow(f, 0.66);
  return assemble(f, 1.72, 'bow');
}

export function cleric(team: string): THREE.Group {
  const f = humanoid({ shirt: C.cream, over: team, pants: C.cream, boots: C.leather, belt: C.gold, buckle: C.gold, robe: C.cream, bulk: 1.0 });
  hood(f.torso, '#f1e6cc');
  f.torso.add(cloth(0.1, 0.36, 0.02), team, 'cloth', { at: [0, SHOULDER_Y - 0.02, 0.125] }); // stole
  const tilt = 1.25;
  f.armR.add(cyl(0.016, 0.02, 0.8, 6), C.gold, 'gold', { at: along(0.12, tilt), rot: shaftRot(tilt) });
  const top = along(0.52, tilt);
  f.armR.add(lathe([[0.02, 0], [0.06, 0.05], [0.04, 0.1]], 6), C.gold, 'gold', { at: [top[0], top[1] - 0.04, top[2]], rot: [-(Math.PI / 2 - tilt) * 0, 0, 0] });
  f.armR.add(new THREE.OctahedronGeometry(0.05, 0), '#9dff6a', 'glow', { at: [top[0], top[1] + 0.08, top[2]], scale: [1, 1.5, 1] });
  return assemble(f, 1.72, 'staff');
}

export function lancer(team: string): THREE.Group {
  const rider = humanoid({ shirt: C.steelD, over: team, pants: C.steelD, boots: C.steelD, belt: C.leather, sleeve: C.steel, glove: C.steelD, pauldron: C.steel, plate: C.steel, bulk: 1.1 });
  helm(rider.torso, team);
  shieldOnArm(rider.armL, team, C.gold, C.gold, 0.26, 0.34);
  lance(rider.armR, team, 1.15);
  backPennant(rider, team);
  return beastModel(
    { coat: '#8a5a34', belly: '#74482a', mane: '#3a2818', hoof: '#2a2420', legH: 0.46, len: 0.86, girth: 0.2, head: 'horse', barding: team, bardingTrim: C.gold, armoured: true },
    1.5,
    rider,
    'melee',
  );
}

export function outrider(team: string): THREE.Group {
  const rider = humanoid({ shirt: C.leather, over: '#e2d2ac', pants: '#4a3a2a', boots: C.leatherD, belt: C.leatherD, sleeve: '#d8c9a4', bulk: 1.0 });
  hood(rider.torso, team);
  cape(rider.torso, team, 0.24, 0.3);
  // A light spear with a long pennant in the team colour.
  const t = 1.2;
  rider.armR.add(cyl(0.014, 0.016, 0.95, 6), C.wood, 'matte', { at: along(0.25, t), rot: shaftRot(t) });
  const tip = along(0.74, t);
  rider.armR.add(cone(0.025, 0.1, 6), C.steel, 'metal', { at: tip, rot: shaftRot(t) });
  rider.armR.add(cloth(0.24, 0.08, 0.02), team, 'cloth', { at: [tip[0], tip[1] - 0.03, tip[2] - 0.02], rot: [0, Math.PI / 2, -Math.PI / 2] });
  backPennant(rider, team);
  return beastModel({ coat: '#b07440', belly: '#d49c66', mane: '#4a3020', hoof: '#2a2420', legH: 0.44, len: 0.8, girth: 0.18, head: 'horse', barding: '#5d3a1f', bardingTrim: team }, 1.45, rider, 'melee');
}

export function mangonel(team: string): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  body.scale.setScalar(1.45);
  root.add(body);
  const frame = new Sculpt();
  for (const x of [-1, 1]) {
    frame.add(rbox(0.09, 0.09, 1.0, 0.02), C.wood, 'matte', { at: [x * 0.27, 0.25, 0] });
    frame.add(rbox(0.08, 0.55, 0.08, 0.02), C.woodD, 'matte', { at: [x * 0.2, 0.52, -0.05], rot: [0.25, 0, 0] });
    for (const z of [-0.42, 0.42]) frame.add(rbox(0.06, 0.1, 0.06, 0.01), '#7a7f88', 'metal', { at: [x * 0.27, 0.25, z] });
  }
  frame.add(rbox(0.62, 0.08, 0.1, 0.02), C.wood, 'matte', { at: [0, 0.25, 0.38] });
  frame.add(rbox(0.62, 0.08, 0.1, 0.02), C.wood, 'matte', { at: [0, 0.25, -0.38] });
  frame.add(rbox(0.5, 0.08, 0.1, 0.02), C.woodD, 'matte', { at: [0, 0.78, -0.12] });
  frame.add(cyl(0.07, 0.07, 0.48, 10), '#c8a46a', 'matte', { at: [0, 0.4, -0.2], rot: [0, 0, Math.PI / 2] }); // rope winch
  // Team shield on the front.
  frame.add(kiteShield(0.22, 0.28, 0.04), team, 'cloth', { at: [0, 0.42, 0.45] });
  frame.add(crownGeo(0.04, 0.06), C.gold, 'gold', { at: [0, 0.44, 0.48], rot: [Math.PI / 2, 0, 0], scale: [1, 0.5, 1] });
  frame.add(blob(0.09, 4, 0.2, 0), '#8a8478', 'matte', { at: [0.18, 0.36, 0.3] });
  frame.add(blob(0.08, 5, 0.2, 0), '#7a7468', 'matte', { at: [0.1, 0.36, 0.34] });
  body.add(frame.build('torso'));
  const axle = (name: string, z: number) => {
    const s = new Sculpt();
    for (const x of [-1, 1]) {
      s.add(cyl(0.17, 0.17, 0.06, 12), C.wood, 'matte', { at: [x * 0.4, 0, 0], rot: [0, 0, Math.PI / 2] });
      s.add(cyl(0.18, 0.18, 0.035, 12), '#6c717a', 'metal', { at: [x * 0.4, 0, 0], rot: [0, 0, Math.PI / 2] });
      s.add(cyl(0.05, 0.05, 0.09, 8), C.woodD, 'matte', { at: [x * 0.4, 0, 0], rot: [0, 0, Math.PI / 2] });
      for (let k = 0; k < 3; k++) s.add(rbox(0.03, 0.3, 0.03, 0.008), C.woodD, 'matte', { at: [x * 0.43, 0, 0], rot: [(k * Math.PI) / 3, 0, 0] });
    }
    s.add(cyl(0.03, 0.03, 0.8, 6), C.woodD, 'matte', { rot: [0, 0, Math.PI / 2] });
    const p = new THREE.Group();
    p.name = name;
    p.position.set(0, 0.18, z);
    p.add(s.build());
    body.add(p);
  };
  axle('legL', 0.34);
  axle('legR', -0.34);
  // The throwing arm: the bucket rests low at the back and whips over the top.
  const arm = new Sculpt();
  arm.add(rbox(0.07, 0.07, 0.95, 0.02), C.wood, 'matte', { at: [0, 0, -0.32] });
  arm.add(lathe([[0.02, 0], [0.12, 0.03], [0.13, 0.09]], 10), C.woodD, 'matte', { at: [0, 0.02, -0.8] });
  arm.add(blob(0.1, 9, 0.2, 0), '#8a8478', 'matte', { at: [0, 0.1, -0.8] });
  arm.add(cyl(0.04, 0.04, 0.1, 6), '#6c717a', 'metal', { rot: [0, 0, Math.PI / 2] });
  const tool = new THREE.Group();
  tool.name = 'tool';
  tool.position.set(0, 0.6, 0.12);
  tool.rotation.x = -0.25;
  tool.add(arm.build());
  body.add(tool);
  root.userData.style = 'siege';
  return root;
}

// ---- Crown heroes ---------------------------------------------------------------

export function marshal(team: string): THREE.Group {
  const f = humanoid({ shirt: C.steelD, over: team, pants: C.steelD, boots: C.steelD, belt: C.leather, buckle: C.gold, sleeve: C.steel, glove: C.steelD, hair: '#6a4022', beard: '#6a4022', bulk: 1.3, pauldron: C.steel, plate: C.steel });
  const t = f.torso;
  heroRing(f);
  // Great pauldrons rimmed in gold, a crown, a long team cape.
  for (const x of [-1, 1]) {
    t.add(ball(0.11, 10, 6), C.steel, 'metal', { at: [x * 0.22, SHOULDER_Y + 0.02, 0], scale: [1.2, 0.75, 1.1] });
    t.add(new THREE.TorusGeometry(0.1, 0.014, 4, 14), C.gold, 'gold', { at: [x * 0.22, SHOULDER_Y + 0.0, 0], rot: [Math.PI / 2, 0, 0], scale: [1.2, 1.1, 1] });
  }
  t.add(crownGeo(0.075, 0.09), C.gold, 'gold', { at: [0, SHOULDER_Y + 0.2, 0] });
  cape(t, team, 0.42, 0.5, C.gold);
  t.add(crownGeo(0.045, 0.06), C.gold, 'gold', { at: [0, HIP_Y + 0.2, 0.175], rot: [Math.PI / 2, 0, 0], scale: [1, 0.45, 1] });
  shieldOnArm(f.armL, team, C.gold, C.gold, 0.36, 0.48);
  // The warhammer: long haft, a heavy gilded head.
  const tilt = 0.55;
  f.armR.add(cyl(0.022, 0.025, 0.6, 6), C.woodD, 'matte', { at: along(0.18, tilt), rot: shaftRot(tilt) });
  const head = along(0.46, tilt);
  f.armR.add(rbox(0.13, 0.13, 0.24, 0.025), C.steel, 'metal', { at: head, rot: [-tilt, 0, 0] });
  f.armR.add(rbox(0.14, 0.03, 0.25, 0.01), C.gold, 'gold', { at: head, rot: [-tilt, 0, 0] });
  // Banner on the back pole.
  f.flag.add(cyl(0.01, 0.01, 0.45, 5), C.woodD, 'matte', { at: [0, 0.22, 0] });
  f.flag.add(cloth(0.16, 0.2, 0.03), team, 'cloth', { at: [0.09, 0.44, 0], rot: [0, Math.PI / 2, 0] });
  f.flag.add(crownGeo(0.02, 0.03), C.gold, 'gold', { at: [0, 0.47, 0] });
  f.flagAt = [-0.1, SHOULDER_Y + 0.05, -0.16];
  return assemble(f, 2.3, 'melee');
}

export function pathfinder(team: string): THREE.Group {
  const green = '#7c9c44';
  const f = humanoid({ shirt: '#6a4a2c', over: green, pants: '#4a3a24', boots: C.leatherD, belt: C.leatherD, buckle: C.gold, sleeve: '#7a5a34', glove: C.leatherD, beard: '#5a3a22', bulk: 1.15 });
  const t = f.torso;
  heroRing(f);
  hood(t, green, 0.12);
  // Long ragged leaf-green cloak and a team sash.
  t.add(cloth(0.36, 0.52, 0.08, 0.06, 7), green, 'cloth', { at: [0, SHOULDER_Y + 0.03, -0.14] });
  t.add(cloth(0.06, 0.3, 0.02), team, 'cloth', { at: [0.02, SHOULDER_Y - 0.02, 0.135], rot: [0, 0, 0.5] });
  quiver(t);
  bow(f, 0.9, '#b07a40');
  backPennant(f, team);
  return assemble(f, 2.3, 'bow');
}

export function sage(team: string): THREE.Group {
  const purple = '#6a3a94';
  const f = humanoid({ shirt: purple, over: team, pants: purple, boots: C.leatherD, belt: C.gold, buckle: C.gold, robe: purple, sleeve: purple, beard: '#f2efe8', hair: '#f2efe8', bulk: 1.1 });
  const t = f.torso;
  heroRing(f);
  // The pointed hat with a wide brim: the Sage's silhouette.
  t.add(cyl(0.24, 0.24, 0.02, 14), purple, 'cloth', { at: [0, SHOULDER_Y + 0.19, 0] });
  t.add(cone(0.12, 0.38, 10), purple, 'cloth', { at: [0, SHOULDER_Y + 0.37, -0.03], rot: [-0.25, 0, 0] });
  t.add(cyl(0.122, 0.122, 0.03, 10), C.gold, 'gold', { at: [0, SHOULDER_Y + 0.22, 0] });
  t.add(lathe([[0.075, 0], [0.085, 0.08], [0.05, 0.2], [0.0, 0.26]], 8), '#f2efe8', 'matte', { at: [0, SHOULDER_Y - 0.15, 0.06], scale: [1, 1, 0.6] }); // long beard
  t.add(cloth(0.36, 0.06, 0.05), C.gold, 'gold', { at: [0, HIP_Y - 0.25, 0.0], scale: [1.1, 1, 1] });
  // Staff with a burning crystal.
  const tilt = 1.3;
  f.armR.add(cyl(0.018, 0.022, 0.95, 6), C.woodD, 'matte', { at: along(0.18, tilt), rot: shaftRot(tilt) });
  const top = along(0.66, tilt);
  f.armR.add(lathe([[0.02, 0], [0.06, 0.04], [0.03, 0.1]], 6), C.gold, 'gold', { at: [top[0], top[1] - 0.03, top[2]] });
  f.armR.add(new THREE.OctahedronGeometry(0.06, 0), '#ff9a2e', 'glow', { at: [top[0], top[1] + 0.1, top[2]], scale: [1, 1.6, 1] });
  backPennant(f, team, 0.3);
  return assemble(f, 2.25, 'staff');
}

// ---- neutrals ---------------------------------------------------------------------

export function brigand(team: string): THREE.Group {
  void team;
  const f = humanoid({ shirt: '#9a4a3c', over: '#8a7250', pants: '#7a6040', boots: C.leatherD, belt: C.leatherD, buckle: '#9a8a6a', hair: '#3a2a1c', beard: '#3a2a1c', bulk: 1.15 });
  f.torso.add(ball(0.093, 10, 6), '#a33a2e', 'cloth', { at: [0, SHOULDER_Y + 0.15, -0.01], scale: [1, 0.7, 1] }); // bandana
  f.torso.add(cloth(0.3, 0.3, 0.06, 0.08, 11), '#8a3a2e', 'cloth', { at: [0, SHOULDER_Y + 0.02, -0.13] });
  // Battered round shield and a cleaver.
  f.armL.add(cyl(0.16, 0.16, 0.04, 10), '#8a5a32', 'matte', { at: [-0.05, -0.2, 0.06], rot: [0, 0, Math.PI / 2], scale: [1, 1, 1] });
  f.armL.add(new THREE.TorusGeometry(0.16, 0.018, 4, 12), '#7a7f88', 'metal', { at: [-0.075, -0.2, 0.06], rot: [0, Math.PI / 2, 0] });
  sword(f.armR, 0.36, '#a9aeb4');
  return assemble(f, 1.75, 'melee');
}

export function poacher(team: string): THREE.Group {
  void team;
  const f = humanoid({ shirt: '#7a6440', over: '#8a7a50', pants: '#6a5434', boots: C.leatherD, belt: C.leatherD, sleeve: '#5a4a30', glove: C.leatherD, bulk: 1.0 });
  hood(f.torso, '#7a8a44');
  f.torso.add(cloth(0.3, 0.38, 0.06, 0.08, 13), '#7a8a44', 'cloth', { at: [0, SHOULDER_Y + 0.02, -0.13] });
  quiver(f.torso, '#5a3a20');
  bow(f, 0.6, '#8a6a40');
  return assemble(f, 1.7, 'bow');
}

export function chief(team: string): THREE.Group {
  void team;
  const f = humanoid({ shirt: '#7a5038', over: '#a8463a', pants: '#6a5038', boots: C.leatherD, belt: C.leatherD, buckle: C.gold, glove: C.leatherD, beard: '#5a4a3a', bulk: 1.35, pauldron: '#8a7a64', pauldronFinish: 'metal' });
  const t = f.torso;
  // Horned helm and a fur collar.
  t.add(lathe([[0.096, -0.04], [0.1, 0.02], [0.07, 0.08], [0, 0.1]], 10), '#8f949c', 'metal', { at: [0, SHOULDER_Y + 0.14, 0] });
  for (const x of [-1, 1]) t.add(cone(0.035, 0.18, 6), '#e8dcc0', 'matte', { at: [x * 0.14, SHOULDER_Y + 0.24, 0], rot: [0, 0, -x * 0.9] });
  t.add(new THREE.TorusGeometry(0.13, 0.04, 6, 12), '#e0d4b8', 'matte', { at: [0, SHOULDER_Y + 0.01, 0], rot: [Math.PI / 2, 0, 0] });
  t.add(cloth(0.36, 0.44, 0.07, 0.09, 17), '#7a2e26', 'cloth', { at: [0, SHOULDER_Y + 0.03, -0.15] });
  shieldOnArm(f.armL, '#7a5232', '#8a8f98', null, 0.34, 0.46);
  sword(f.armR, 0.5, '#b3b8be');
  return assemble(f, 2.0, 'melee');
}

export function brute(): THREE.Group {
  const hide = '#97a75a';
  const f = humanoid({ skin: hide, shirt: hide, pants: '#6a4a2c', boots: hide, belt: '#5a3a20', glove: hide, sleeve: hide, bulk: 1.75 });
  const t = f.torso;
  // A pot belly, moss on the shoulders, one big eye and tusks.
  t.add(ball(0.21, 12, 10), '#8f9a58', 'skin', { at: [0, HIP_Y + 0.12, 0.05] });
  t.add(blob(0.14, 21, 0.3), '#4f7a2a', 'matte', { at: [-0.18, SHOULDER_Y + 0.05, -0.04] });
  t.add(blob(0.13, 22, 0.3), '#5d8a30', 'matte', { at: [0.16, SHOULDER_Y + 0.08, -0.06] });
  t.add(ball(0.04, 8, 6), '#ffd84a', 'glow', { at: [0, SHOULDER_Y + 0.14, 0.085] });
  for (const x of [-1, 1]) t.add(cone(0.016, 0.06, 5), '#efe6d0', 'matte', { at: [x * 0.035, SHOULDER_Y + 0.08, 0.085], rot: [0.3, 0, 0] });
  for (let i = 0; i < 3; i++) t.add(cyl(0.008, 0.02, 0.05, 5), '#d26a3a', 'matte', { at: [-0.04 + i * 0.04, SHOULDER_Y + 0.22, -0.02] });
  // A log club.
  const tilt = 0.6;
  f.armR.add(cyl(0.05, 0.03, 0.6, 7), '#6a4628', 'matte', { at: along(0.2, tilt), rot: shaftRot(tilt) });
  f.armR.add(blob(0.05, 30, 0.3, 0), '#5d8a30', 'matte', { at: along(0.38, tilt) });
  return assemble(f, 2.1, 'melee');
}

export function wolf(): THREE.Group {
  return beastModel({ coat: '#8a8a92', belly: '#cfcbc2', mane: '#6f6f78', hoof: '#3a3a40', legH: 0.28, len: 0.62, girth: 0.14, head: 'wolf' }, 1.55, undefined, 'beast');
}


