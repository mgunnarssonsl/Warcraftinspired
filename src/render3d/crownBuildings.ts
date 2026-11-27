// Ironvale Crown buildings in the painted style (sheet 05): pale stone, timber
// and plaster under roofs in the team colour, gold trim and crowned banners.
// The Keep grows into a Castle and a Citadel. Neutral landmarks (Trading Post,
// Healing Fountain) are here too. Models sit on a footprint of `size` tiles,
// the entrance toward +Z.

import * as THREE from 'three';
import { Sculpt, ball, blob, cone, crownGeo, cyl, cloth, lathe, rbox, slab } from './kit';
import {
  B,
  archDoor,
  barrel,
  brazier,
  coneRoof,
  crate,
  crenels,
  crossGable,
  crownBanner,
  emblemCrown,
  fence,
  flagPole,
  footing,
  gableRoof,
  grassSkirt,
  hay,
  logPile,
  roundTower,
  stoneWall,
  timberFrame,
  windowGlow,
} from './bkit';

const done = (s: Sculpt) => s.build() as THREE.Object3D;
const group = (...o: THREE.Object3D[]) => {
  const g = new THREE.Group();
  g.add(...o);
  return g;
};

/** Keep (tier 1), Castle (2), Citadel (3): the same plan, taller and grander each tier. */
export function keep(team: string, tier = 1): THREE.Group {
  const s = new Sculpt();
  const k = 1 + (tier - 1) * 0.22;
  const W = 3.8;
  grassSkirt(s, W + 0.1, W + 0.1, 3);
  footing(s, W, W, 0.2);
  const base = 0.26;
  const wallH = 0.85 * (tier > 1 ? 1.15 : 1);
  const e = W / 2 - 0.3;
  // Curtain walls, the front split by the gate.
  stoneWall(s, 2 * e, wallH, 0.26, [0, base + wallH / 2, -e], 11);
  stoneWall(s, 0.26, wallH, 2 * e, [-e, base + wallH / 2, 0], 12);
  stoneWall(s, 0.26, wallH, 2 * e, [e, base + wallH / 2, 0], 13);
  for (const x of [-1, 1]) stoneWall(s, e - 0.42, wallH, 0.26, [x * (e / 2 + 0.21), base + wallH / 2, e], 14 + x);
  crenels(s, 2 * e, 2 * e, base + wallH, [0, 0]);
  // Gatehouse with portcullis and steps.
  stoneWall(s, 0.95, wallH + 0.35, 0.4, [0, base + (wallH + 0.35) / 2, e + 0.05], 17, B.stoneL);
  archDoor(s, [0, base, e + 0.26], 0.5, 0.62, '#3a2a1c', B.gold);
  for (let i = -2; i <= 2; i++) s.add(rbox(0.02, 0.55, 0.02, 0.004), B.iron, 'metal', { at: [i * 0.09, base + 0.3, e + 0.3] });
  for (let i = 0; i < 3; i++) s.add(rbox(0.7 - i * 0.12, 0.07, 0.18, 0.02), B.stoneL, 'matte', { at: [0, 0.2 + i * 0.07, e + 0.42 + (2 - i) * 0.12] });
  crenels(s, 0.95, 0.4, base + wallH + 0.35, [0, e + 0.05], B.stoneL);
  crownBanner(s, team, [0, base + wallH + 0.25, e + 0.27], 0.28, 0.42);
  // Corner towers.
  const tH = 1.55 * k;
  for (const [x, z] of [
    [-e, -e],
    [e, -e],
    [-e, e],
    [e, e],
  ]) {
    roundTower(s, 0.46, tH, [x, base, z]);
    crenels(s, 0.46, 0.46, base + tH - 0.02, [x, z], B.stone, true);
    coneRoof(s, 0.52, 0.85 * k, [x, base + tH + 0.12, z], team);
    windowGlow(s, [x, base + tH * 0.6, z + 0.47], 0.1, 0.16);
  }
  // Mid-wall towers on a Citadel.
  if (tier > 2)
    for (const [x, z] of [
      [-e, 0],
      [e, 0],
      [0, -e],
    ]) {
      roundTower(s, 0.34, tH * 0.9, [x, base, z]);
      coneRoof(s, 0.4, 0.7, [x, base + tH * 0.9 + 0.05, z], team);
    }
  // The keep proper: a great hall and a central tower.
  const hallH = 1.0 * k;
  stoneWall(s, 1.9, hallH, 1.5, [0, base + hallH / 2, -0.25], 21, B.stoneL);
  gableRoof(s, 1.9, 1.5, 0.75 * k, [0, base + hallH, -0.25], team);
  for (const x of [-0.55, 0, 0.55]) windowGlow(s, [x, base + hallH * 0.55, 0.51], 0.13, 0.22);
  crownBanner(s, team, [0, base + hallH - 0.08, 0.53], 0.3, 0.5);
  const cH = (1.2 + (tier - 1) * 0.55) * k;
  stoneWall(s, 0.85, cH, 0.85, [0, base + hallH + cH / 2 - 0.2, -0.45], 23);
  crenels(s, 0.85, 0.85, base + hallH + cH - 0.2, [0, -0.45]);
  windowGlow(s, [0, base + hallH + cH * 0.55 - 0.2, -0.02], 0.12, 0.2);
  coneRoof(s, 0.62, 1.0 * k, [0, base + hallH + cH - 0.08, -0.45], team, 4, false);
  s.add(crownGeo(0.14, 0.18), B.gold, 'gold', { at: [0, base + hallH + cH + 1.0 * k - 0.1, -0.45] });
  if (tier > 1)
    for (const x of [-1, 1]) {
      stoneWall(s, 0.5, cH * 0.75, 0.5, [x * 0.85, base + hallH + (cH * 0.75) / 2 - 0.25, -0.5], 25 + x);
      coneRoof(s, 0.36, 0.7, [x * 0.85, base + hallH + cH * 0.75 - 0.2, -0.5], team);
    }
  for (const [x, z] of [
    [-e, -e],
    [e, e],
  ])
    flagPole(s, team, [x, base + tH + 0.95 * k, z], 0.5);
  for (const x of [-1, 1]) crownBanner(s, team, [x * 0.95, base + wallH - 0.05, e + 0.14], 0.22, 0.4);
  return group(done(s));
}

export function farm(team: string): THREE.Group {
  const s = new Sculpt();
  grassSkirt(s, 1.9, 1.9, 5);
  // Crop field.
  s.add(rbox(1.0, 0.06, 0.9, 0.03), '#8a6a42', 'matte', { at: [0.35, 0.03, 0.4] });
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) s.add(blob(0.07, r * 4 + c, 0.3, 0), (r + c) % 2 ? '#6fae3a' : '#8cc44a', 'matte', { at: [0.0 + c * 0.22, 0.1, 0.1 + r * 0.2] });
  fence(s, [-0.15, 0.9], [0.9, 0.9]);
  fence(s, [0.9, -0.05], [0.9, 0.9]);
  // Cottage: plaster and timber, a team roof, a stone chimney.
  s.add(rbox(1.0, 0.12, 0.8, 0.03), B.stoneD, 'matte', { at: [-0.35, 0.06, -0.4] });
  s.add(rbox(0.95, 0.55, 0.75, 0.03), B.plaster, 'matte', { at: [-0.35, 0.39, -0.4] });
  timberFrame(s, 0.9, 0.5, [-0.35, 0.4, -0.02]);
  gableRoof(s, 0.95, 0.75, 0.42, [-0.35, 0.66, -0.4], team);
  crossGable(s, 0.45, 0.5, 0.36, [-0.2, 0.66, -0.2], team);
  s.add(rbox(0.22, 0.55, 0.22, 0.03), B.stone, 'matte', { at: [-0.65, 1.0, -0.6] });
  s.add(rbox(0.12, 0.05, 0.12, 0.01), B.dark, 'matte', { at: [-0.65, 1.28, -0.6] });
  archDoor(s, [-0.2, 0.12, -0.02], 0.22, 0.34, B.door, B.timber);
  windowGlow(s, [-0.55, 0.42, -0.01], 0.12, 0.14);
  hay(s, [0.55, 0.0, -0.55], 0.2);
  hay(s, [0.2, 0.0, -0.7], 0.15);
  barrel(s, [-0.85, 0.0, 0.05], 0.1);
  return group(done(s));
}

export function barracks(team: string): THREE.Group {
  const s = new Sculpt();
  grassSkirt(s, 2.9, 2.9, 7);
  footing(s, 2.3, 1.4, 0.14);
  stoneWall(s, 2.2, 0.5, 1.3, [0, 0.39, -0.25], 31);
  s.add(rbox(2.15, 0.6, 1.25, 0.03), B.plaster, 'matte', { at: [0, 0.94, -0.25] });
  timberFrame(s, 2.1, 0.58, [0, 0.94, 0.38]);
  gableRoof(s, 2.2, 1.3, 0.7, [0, 1.24, -0.25], team);
  crossGable(s, 0.9, 0.9, 0.62, [0, 1.24, 0.15], team);
  // Crossed swords on the gable, banners, a door.
  for (const r of [-0.7, 0.7]) s.add(slab([[-0.02, 0], [0.02, 0], [0.02, 0.45], [0, 0.5], [-0.02, 0.45]], 0.02, 0.005), '#dde3ea', 'metal', { at: [0, 1.3, 0.66], rot: [0, 0, r] });
  emblemCrown(s, [0, 1.42, 0.66], 0.07);
  archDoor(s, [0, 0.14, 0.41], 0.45, 0.62, B.door, B.stoneL);
  for (const x of [-0.75, 0.75]) crownBanner(s, team, [x, 1.15, 0.43], 0.26, 0.5);
  for (const x of [-0.45, 0.45]) windowGlow(s, [x, 0.95, 0.39], 0.12, 0.16);
  // Weapon rack and archery targets.
  s.add(rbox(0.6, 0.05, 0.05, 0.01), B.timber, 'matte', { at: [-0.9, 0.45, 0.85] });
  for (let i = 0; i < 4; i++) {
    s.add(cyl(0.012, 0.012, 0.7, 4), B.timberL, 'matte', { at: [-1.15 + i * 0.16, 0.35, 0.85], rot: [0.15, 0, 0] });
    s.add(cone(0.025, 0.08, 4), '#dde3ea', 'metal', { at: [-1.15 + i * 0.16, 0.73, 0.79] });
  }
  for (const x of [0.75, 1.1]) {
    s.add(cyl(0.18, 0.18, 0.05, 14), '#efe6d0', 'matte', { at: [x, 0.35, 0.9], rot: [Math.PI / 2 - 0.2, 0, 0] });
    s.add(cyl(0.12, 0.12, 0.055, 14), '#c8402e', 'matte', { at: [x, 0.35, 0.9], rot: [Math.PI / 2 - 0.2, 0, 0] });
    s.add(cyl(0.05, 0.05, 0.06, 10), '#efe6d0', 'matte', { at: [x, 0.35, 0.9], rot: [Math.PI / 2 - 0.2, 0, 0] });
    s.add(rbox(0.04, 0.4, 0.04, 0.01), B.timber, 'matte', { at: [x, 0.2, 0.85] });
  }
  flagPole(s, team, [1.05, 1.24, -0.25], 0.55);
  return group(done(s));
}

export function lumbermill(team: string): THREE.Group {
  const s = new Sculpt();
  grassSkirt(s, 2.9, 2.9, 9);
  // Open timber shed.
  for (const [x, z] of [
    [-0.9, -0.6],
    [0.9, -0.6],
    [-0.9, 0.5],
    [0.9, 0.5],
  ])
    s.add(rbox(0.12, 1.0, 0.12, 0.02), B.timber, 'matte', { at: [x, 0.5, z] });
  s.add(rbox(1.95, 0.1, 0.1, 0.02), B.timber, 'matte', { at: [0, 1.02, 0.5] });
  s.add(rbox(1.95, 0.1, 0.1, 0.02), B.timber, 'matte', { at: [0, 1.02, -0.6] });
  stoneWall(s, 1.9, 0.55, 0.15, [0, 0.33, -0.65], 41);
  gableRoof(s, 2.0, 1.3, 0.6, [0, 1.05, -0.05], team);
  // Saw bench with a big blade.
  s.add(rbox(1.0, 0.1, 0.35, 0.02), B.timberL, 'matte', { at: [0, 0.45, 0.0] });
  for (const x of [-0.4, 0.4]) s.add(rbox(0.08, 0.4, 0.3, 0.02), B.timber, 'matte', { at: [x, 0.22, 0] });
  s.add(cyl(0.26, 0.26, 0.02, 20), '#cfd5dc', 'metal', { at: [0.1, 0.55, 0], rot: [0, 0, Math.PI / 2] });
  s.add(cyl(0.05, 0.05, 0.04, 8), B.iron, 'metal', { at: [0.1, 0.55, 0], rot: [0, 0, Math.PI / 2] });
  s.add(cyl(0.07, 0.07, 0.9, 8), '#a06c3c', 'matte', { at: [-0.25, 0.57, 0.0], rot: [0, 0, Math.PI / 2] });
  logPile(s, [-0.75, 0.0, 0.95], 3, 0.7, Math.PI / 2);
  logPile(s, [0.7, 0.0, 0.95], 2, 0.6, Math.PI / 2);
  // A crane with a hook.
  s.add(rbox(0.1, 1.3, 0.1, 0.02), B.timber, 'matte', { at: [1.15, 0.65, -0.2] });
  s.add(rbox(0.7, 0.08, 0.08, 0.02), B.timber, 'matte', { at: [1.0, 1.28, -0.2] });
  s.add(cyl(0.006, 0.006, 0.35, 3), '#d8c08a', 'matte', { at: [0.72, 1.1, -0.2] });
  s.add(new THREE.TorusGeometry(0.04, 0.012, 4, 8, Math.PI * 1.5), B.iron, 'metal', { at: [0.72, 0.9, -0.2] });
  s.add(blob(0.18, 44, 0.3), B.grass, 'matte', { at: [-1.15, 0.1, -0.85], scale: [1.3, 0.8, 1.3] });
  return group(done(s));
}

export function tower(team: string): THREE.Group {
  const s = new Sculpt();
  grassSkirt(s, 1.8, 1.8, 13);
  for (let i = 0; i < 5; i++) s.add(blob(0.16, 50 + i, 0.3), i % 2 ? B.stoneD : B.stone, 'matte', { at: [Math.cos(i * 1.3) * 0.55, 0.1, Math.sin(i * 1.3) * 0.55] });
  roundTower(s, 0.48, 1.9, [0, 0, 0]);
  windowGlow(s, [0, 1.15, 0.47], 0.1, 0.18);
  archDoor(s, [0, 0.02, 0.47], 0.26, 0.42, B.door, B.stoneL);
  // A wooden lookout gallery, crenels, a team roof.
  s.add(cyl(0.62, 0.55, 0.16, 12), B.timber, 'matte', { at: [0, 1.95, 0] });
  crenels(s, 0.6, 0.6, 2.02, [0, 0], B.timberL, true);
  for (let i = 0; i < 4; i++) s.add(rbox(0.06, 0.45, 0.06, 0.01), B.timber, 'matte', { at: [Math.cos((i * Math.PI) / 2 + 0.78) * 0.5, 2.25, Math.sin((i * Math.PI) / 2 + 0.78) * 0.5] });
  coneRoof(s, 0.62, 0.85, [0, 2.45, 0], team);
  crownBanner(s, team, [0, 1.75, 0.5], 0.24, 0.45);
  flagPole(s, team, [0, 3.35, 0], 0.4);
  return group(done(s));
}

export function altar(team: string): THREE.Group {
  const s = new Sculpt();
  grassSkirt(s, 2.9, 2.9, 15);
  for (let i = 0; i < 3; i++) s.add(rbox(2.6 - i * 0.35, 0.1, 2.4 - i * 0.35, 0.03), i % 2 ? B.stoneL : B.stone, 'matte', { at: [0, 0.05 + i * 0.1, -0.05 - i * 0.05] });
  // Columns and arches.
  for (const x of [-0.95, 0.95]) {
    for (const z of [-0.8, 0.35]) {
      s.add(lathe([[0.12, 0], [0.1, 0.1], [0.09, 1.2], [0.13, 1.3]], 10), B.stoneL, 'matte', { at: [x, 0.3, z] });
    }
    s.add(rbox(0.32, 0.16, 1.45, 0.03), B.stone, 'matte', { at: [x, 1.68, -0.22] });
    crownBanner(s, team, [x, 1.55, 0.47], 0.22, 0.5);
  }
  // The statue of a crowned hero raising a hammer.
  s.add(rbox(0.5, 0.35, 0.5, 0.03), B.stone, 'matte', { at: [0, 0.48, -0.3] });
  const st = '#cfc6b4';
  s.add(rbox(0.26, 0.32, 0.18, 0.04), st, 'matte', { at: [0, 0.82, -0.3] });
  s.add(lathe([[0.15, 0], [0.17, 0.15], [0.13, 0.3]], 10), st, 'matte', { at: [0, 0.98, -0.3] });
  s.add(ball(0.08, 10, 8), st, 'matte', { at: [0, 1.36, -0.3] });
  s.add(crownGeo(0.07, 0.07), B.gold, 'gold', { at: [0, 1.42, -0.3] });
  s.add(cyl(0.035, 0.035, 0.42, 6), st, 'matte', { at: [0.2, 1.42, -0.3], rot: [0, 0, -0.35] });
  s.add(rbox(0.12, 0.12, 0.2, 0.02), st, 'matte', { at: [0.27, 1.62, -0.3] });
  s.add(cloth(0.3, 0.38, 0.05), '#b7ae9c', 'cloth', { at: [0, 1.25, -0.42] });
  // Braziers and steps.
  for (const x of [-0.6, 0.6]) brazier(s, [x, 0.3, 0.75]);
  for (let i = 0; i < 2; i++) s.add(rbox(0.8, 0.08, 0.2, 0.02), B.stoneL, 'matte', { at: [0, 0.04 + i * 0.08, 1.15 - i * 0.18] });
  return group(done(s));
}

export function smithy(team: string): THREE.Group {
  const s = new Sculpt();
  grassSkirt(s, 2.9, 2.9, 17);
  footing(s, 1.8, 1.3, 0.12);
  stoneWall(s, 1.7, 0.4, 1.2, [-0.15, 0.32, -0.25], 61);
  s.add(rbox(1.65, 0.55, 1.15, 0.03), B.plaster, 'matte', { at: [-0.15, 0.8, -0.25] });
  timberFrame(s, 1.6, 0.52, [-0.15, 0.8, 0.33]);
  gableRoof(s, 1.7, 1.2, 0.6, [-0.15, 1.07, -0.25], team);
  crossGable(s, 0.7, 0.75, 0.5, [-0.35, 1.07, 0.02], team);
  crownBanner(s, team, [-0.85, 1.0, 0.36], 0.24, 0.45);
  archDoor(s, [-0.35, 0.12, 0.36], 0.36, 0.55, B.door, B.stoneL);
  // The forge: a stone chimney with a glowing mouth.
  stoneWall(s, 0.7, 1.7, 0.7, [0.75, 0.85, -0.3], 63, B.stoneD);
  s.add(rbox(0.36, 0.3, 0.06, 0.04), '#ff8a2a', 'glow', { at: [0.75, 0.38, 0.06] });
  s.add(rbox(0.46, 0.4, 0.04, 0.04), B.stoneL, 'matte', { at: [0.75, 0.38, 0.04] });
  s.add(rbox(0.4, 0.12, 0.4, 0.02), B.dark, 'matte', { at: [0.75, 1.75, -0.3] });
  // Anvil, barrels, tools.
  s.add(rbox(0.2, 0.18, 0.12, 0.02), B.timber, 'matte', { at: [0.45, 0.09, 0.75] });
  s.add(slab([[-0.2, 0], [0.12, 0], [0.2, 0.04], [0.12, 0.08], [-0.15, 0.08]], 0.1, 0.01), '#5e646c', 'metal', { at: [0.45, 0.18, 0.75] });
  barrel(s, [1.05, 0.0, 0.65], 0.11);
  barrel(s, [-1.0, 0.0, 0.75], 0.11);
  crate(s, [-0.75, 0.0, 0.9], 0.2, 0.4);
  return group(done(s));
}

export function chapel(team: string): THREE.Group {
  const s = new Sculpt();
  grassSkirt(s, 2.9, 2.9, 19);
  footing(s, 1.6, 2.2, 0.14);
  // Nave along Z, roof ridge along Z.
  stoneWall(s, 1.3, 0.95, 1.8, [0, 0.62, -0.15], 71, B.stoneL);
  const roof = new Sculpt();
  gableRoof(roof, 1.8, 1.3, 0.75, [0, 0, 0], team);
  s.absorb(roof, { at: [0, 1.09, -0.15], rot: [0, Math.PI / 2, 0] });
  for (const z of [-0.6, 0.1]) for (const x of [-1, 1]) windowGlow(s, [x * 0.66, 0.75, z], 0.12, 0.34, (x * Math.PI) / 2, true, B.stone);
  // Recolour the side windows green: a second pass of glow quads.
  for (const z of [-0.6, 0.1]) for (const x of [-1, 1]) s.add(rbox(0.1, 0.3, 0.06, 0.01), '#8cf06a', 'glow', { at: [x * 0.675, 0.75, z], rot: [0, (x * Math.PI) / 2, 0] });
  // Bell tower over the door.
  stoneWall(s, 0.55, 1.6, 0.55, [0, 0.95, 0.65], 73);
  s.add(rbox(0.3, 0.32, 0.6, 0.02), B.dark, 'matte', { at: [0, 1.5, 0.65] });
  s.add(lathe([[0.03, 0], [0.1, 0.05], [0.11, 0.18], [0.0, 0.22]], 8), B.gold, 'gold', { at: [0, 1.38, 0.65] });
  coneRoof(s, 0.38, 0.7, [0, 1.78, 0.65], team, 4, false);
  s.add(cyl(0.02, 0.02, 0.35, 5), B.gold, 'gold', { at: [0, 2.6, 0.65] });
  s.add(rbox(0.18, 0.03, 0.03, 0.01), B.gold, 'gold', { at: [0, 2.68, 0.65] });
  archDoor(s, [0, 0.14, 0.93], 0.3, 0.5, B.door, B.stone);
  s.add(cyl(0.12, 0.12, 0.05, 12), '#8cf06a', 'glow', { at: [0, 1.2, 0.94], rot: [Math.PI / 2, 0, 0] });
  s.add(new THREE.TorusGeometry(0.12, 0.025, 4, 12), B.stone, 'matte', { at: [0, 1.2, 0.95] });
  for (let i = 0; i < 2; i++) s.add(rbox(0.6, 0.08, 0.16, 0.02), B.stoneL, 'matte', { at: [0, 0.04 + i * 0.07, 1.18 - i * 0.14] });
  crownBanner(s, team, [0.66, 1.0, 0.25], 0.2, 0.42, Math.PI / 2);
  return group(done(s));
}

export function workshop(team: string): THREE.Group {
  const s = new Sculpt();
  grassSkirt(s, 2.9, 2.9, 21);
  for (const [x, z] of [
    [-1.1, -0.7],
    [1.1, -0.7],
    [-1.1, 0.55],
    [1.1, 0.55],
    [0, -0.7],
  ])
    s.add(rbox(0.12, 1.05, 0.12, 0.02), B.timber, 'matte', { at: [x, 0.52, z] });
  for (const z of [0.55, -0.7]) s.add(rbox(2.35, 0.1, 0.1, 0.02), B.timber, 'matte', { at: [0, 1.05, z] });
  for (const x of [-0.55, 0.55]) s.add(rbox(0.06, 0.06, 1.3, 0.01), B.timber, 'matte', { at: [x, 0.8, -0.07], rot: [0, 0, 0.6] });
  gableRoof(s, 2.4, 1.35, 0.6, [0, 1.08, -0.07], team);
  crownBanner(s, team, [0, 0.98, 0.6], 0.26, 0.42);
  flagPole(s, team, [1.1, 1.15, 0.55], 0.5);
  // A catapult under construction.
  for (const x of [-1, 1]) s.add(rbox(0.07, 0.07, 0.8, 0.02), B.timberL, 'matte', { at: [x * 0.25, 0.2, -0.1] });
  s.add(rbox(0.07, 0.7, 0.07, 0.02), B.timberL, 'matte', { at: [0, 0.5, -0.25], rot: [0.5, 0, 0] });
  for (const x of [-0.35, 0.35]) s.add(cyl(0.15, 0.15, 0.05, 12), B.timber, 'matte', { at: [x, 0.15, 0.15], rot: [0, 0, Math.PI / 2] });
  // A spare wheel, crates, a bundle of bolts.
  s.add(cyl(0.2, 0.2, 0.05, 12), B.timber, 'matte', { at: [-1.0, 0.25, 0.95], rot: [0.3, 0, Math.PI / 2] });
  s.add(new THREE.TorusGeometry(0.2, 0.02, 3, 14), B.iron, 'metal', { at: [-1.0, 0.25, 0.95], rot: [0, Math.PI / 2 + 0.3, 0] });
  crate(s, [0.8, 0.0, 0.9], 0.24);
  crate(s, [1.05, 0.0, 0.7], 0.2, 0.5);
  for (let i = 0; i < 5; i++) s.add(cyl(0.01, 0.01, 0.5, 3), B.timberL, 'matte', { at: [0.35 + i * 0.03, 0.08, 0.95], rot: [Math.PI / 2, 0, 0] });
  return group(done(s));
}

// ---- neutral landmarks -----------------------------------------------------------

export function shop(): THREE.Group {
  const s = new Sculpt();
  grassSkirt(s, 2.9, 2.9, 23);
  s.add(rbox(2.4, 0.08, 2.1, 0.03), '#c8b898', 'matte', { at: [0, 0.04, 0] });
  for (const [x, z] of [
    [-1.0, -0.6],
    [1.0, -0.6],
    [-1.0, 0.55],
    [1.0, 0.55],
  ])
    s.add(rbox(0.1, 1.2, 0.1, 0.02), B.timber, 'matte', { at: [x, 0.6, z] });
  // Striped awning sloping toward the front.
  for (let i = 0; i < 8; i++)
    s.add(rbox(0.27, 0.04, 1.45, 0.01), i % 2 ? '#f3ead4' : '#c23a32', 'cloth', { at: [-0.945 + i * 0.27, 1.25, -0.03], rot: [0.3, 0, 0] });
  for (let i = 0; i < 8; i++) s.add(slab([[-0.13, 0], [0.13, 0], [0, -0.14]], 0.01, 0), i % 2 ? '#f3ead4' : '#c23a32', 'cloth', { at: [-0.945 + i * 0.27, 1.04, 0.66] });
  // Counter with goods, a back wall, lanterns.
  s.add(rbox(1.7, 0.45, 0.35, 0.03), B.timberL, 'matte', { at: [0, 0.3, 0.35] });
  s.add(rbox(1.75, 0.05, 0.4, 0.01), '#8a2a28', 'cloth', { at: [0, 0.55, 0.35] });
  for (let i = 0; i < 5; i++) s.add(cyl(0.06, 0.06, 0.03 + (i % 3) * 0.02, 10), '#ffd34a', 'gold', { at: [-0.6 + i * 0.3, 0.6, 0.35] });
  s.add(rbox(1.9, 0.9, 0.1, 0.03), '#8a5a32', 'matte', { at: [0, 0.5, -0.62] });
  crate(s, [-0.6, 0.0, -0.3], 0.26);
  crate(s, [0.55, 0.0, -0.3], 0.22, 0.4);
  barrel(s, [1.2, 0.0, 0.85], 0.12);
  for (const x of [-1.0, 1.0]) {
    s.add(rbox(0.1, 0.14, 0.1, 0.02), B.timber, 'matte', { at: [x, 1.0, 0.65] });
    s.add(rbox(0.07, 0.1, 0.07, 0.01), B.glow, 'glow', { at: [x, 1.0, 0.65] });
  }
  // The coin sign.
  s.add(rbox(0.45, 0.04, 0.04, 0.01), B.timber, 'matte', { at: [1.2, 1.35, 0.55] });
  s.add(cyl(0.17, 0.17, 0.04, 14), '#5a3a22', 'matte', { at: [1.35, 1.12, 0.55], rot: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 3; i++) s.add(cyl(0.05, 0.05, 0.02, 10), '#ffd34a', 'gold', { at: [1.31 + i * 0.03, 1.08 + i * 0.03, 0.58], rot: [Math.PI / 2, 0, 0] });
  return group(done(s));
}

export function fountain(): THREE.Group {
  const s = new Sculpt();
  grassSkirt(s, 1.9, 1.9, 25);
  s.add(cyl(0.95, 1.0, 0.12, 20), B.stoneL, 'matte', { at: [0, 0.06, 0] });
  s.add(lathe([[0.82, 0], [0.85, 0.3], [0.72, 0.32], [0.7, 0.12]], 20), B.stone, 'matte', { at: [0, 0.1, 0] });
  s.add(cyl(0.72, 0.72, 0.04, 20), '#3ad6c8', 'glow', { at: [0, 0.32, 0] });
  // Central basin and spout.
  s.add(lathe([[0.1, 0], [0.08, 0.4], [0.35, 0.5], [0.3, 0.58]], 12), B.stoneL, 'matte', { at: [0, 0.3, 0] });
  s.add(cyl(0.3, 0.3, 0.03, 12), '#5ae8da', 'glow', { at: [0, 0.86, 0] });
  s.add(cone(0.08, 0.35, 8), '#9afff2', 'glow', { at: [0, 1.05, 0] });
  // The arch behind with an emerald.
  for (const x of [-1, 1]) s.add(rbox(0.16, 1.3, 0.16, 0.03), B.stoneL, 'matte', { at: [x * 0.55, 0.75, -0.55] });
  s.add(new THREE.TorusGeometry(0.55, 0.08, 4, 14, Math.PI), B.stoneL, 'matte', { at: [0, 1.4, -0.55] });
  s.add(new THREE.OctahedronGeometry(0.1, 0), '#3affb0', 'glow', { at: [0, 1.95, -0.55], scale: [1, 1.4, 0.6] });
  for (let i = 0; i < 4; i++) s.add(blob(0.12, 80 + i, 0.3), B.grass, 'matte', { at: [Math.cos(i * 1.7) * 0.9, 0.12, Math.sin(i * 1.7) * 0.9 - 0.2] });
  return group(done(s));
}

export const CROWN_BUILDINGS = { hq: keep, farm, barracks, lumbermill, tower, altar, smithy, chapel, workshop, shop, fountain } as const;


