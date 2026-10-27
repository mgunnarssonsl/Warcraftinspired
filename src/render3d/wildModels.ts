// Thornwild models: the forest faction's own look. Bark browns, leaf greens
// and living wood, with the team colour in leaves, sashes and banners.
// Buildings are grown, not built: trunks, mounds, standing stones and thorn
// spires. Same scale and parts as the Crown's (models.ts), so animation and
// selection treat them alike, but different silhouettes.

import * as THREE from 'three';
import type { BuildingType, UnitType } from '../sim/config';
import { box, heroBanner, heroHalo, makeWorker, mat, mesh, noTools, soldierBase, tint, type WorkerParts } from './models';

const BARK = '#6b4a2e';
const BARK_DARK = '#4a3320';
const LEAF = '#3f7a3a';
const LEAF_LIGHT = '#6aa84a';
const SKIN = '#c9a07a';

/** Tender: a small figure in a leaf hood and cloak; same tools as a Laborer. */
function makeTender(team: string): WorkerParts {
  const p = makeWorker(team);
  // Replace the straw hat with a pointed leaf hood, add a leafy collar.
  p.body.children.filter((c) => (c as THREE.Mesh).geometry instanceof THREE.ConeGeometry).forEach((c) => p.body.remove(c));
  p.body.add(mesh(new THREE.ConeGeometry(0.15, 0.24, 6), mat(LEAF), 0, 0.72, -0.02));
  p.body.add(mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.06, 6), mat(tint(team, 0.15)), 0, 0.5, 0));
  return p;
}

/** Thornguard: bark armour bristling with thorns, a round wooden shield, a thorned club. */
function makeThornguard(team: string): WorkerParts {
  const base = soldierBase(team, 1.45, BARK_DARK);
  const { body } = base;
  body.add(mesh(new THREE.SphereGeometry(0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(BARK), 0, 0.66, 0)); // bark helm
  for (const x of [-0.16, 0.16])
    for (const z of [-0.04, 0.06]) {
      const t = mesh(new THREE.ConeGeometry(0.025, 0.12, 4), mat('#d8c8a0'), x, 0.58, z); // shoulder thorns
      t.rotation.z = x > 0 ? -0.6 : 0.6;
      body.add(t);
    }
  const shield = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 10).rotateZ(Math.PI / 2), mat(team), -0.21, 0.42, 0.05);
  shield.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 8).rotateZ(Math.PI / 2), mat(BARK), -0.02, 0, 0));
  body.add(shield);
  const tool = new THREE.Group();
  tool.position.set(0.2, 0.42, 0.04);
  tool.add(mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.38, 6), mat(BARK), 0, 0.18, 0));
  for (let i = 0; i < 3; i++) tool.add(mesh(new THREE.ConeGeometry(0.02, 0.07, 4), mat('#d8c8a0'), i % 2 ? 0.05 : -0.05, 0.25 + i * 0.05, 0));
  body.add(tool);
  return { ...base, tool, ...noTools() };
}

/** Briar Slinger: a lean figure in a leaf hood with a sling of plaited vine. */
function makeSlinger(team: string): WorkerParts {
  const base = soldierBase(team, 1.35, BARK_DARK);
  const { body } = base;
  body.add(mesh(new THREE.ConeGeometry(0.14, 0.3, 6), mat(tint(team, -0.35)), 0, 0.78, -0.02)); // tall hood
  body.add(mesh(new THREE.SphereGeometry(0.07, 6, 4), mat(LEAF_LIGHT), 0.08, 0.4, -0.16)); // seed pouch
  const tool = new THREE.Group();
  tool.position.set(0.2, 0.46, 0.04);
  tool.add(mesh(box(0.012, 0.32, 0.012), mat('#5a7a34'), 0, 0.14, 0));
  tool.add(mesh(new THREE.SphereGeometry(0.04, 6, 4), mat('#8a7a5a'), 0, 0.3, 0));
  body.add(tool);
  return { ...base, tool, ...noTools(), style: 'bow' };
}

/** A four-legged mount (or animal) with optional antlers. */
function quadruped(scale: number, coat: string, opts: { antlers?: boolean; long?: number } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  root.add(body);
  const fur = mat(coat);
  const L = opts.long ?? 0.5;
  const legGeo = box(0.06, 0.3, 0.06).translate(0, -0.15, 0);
  const legL = mesh(legGeo, fur, -0.08, 0.3, L * 0.38);
  const legR = mesh(legGeo, fur, 0.08, 0.3, L * 0.38);
  const hindL = mesh(legGeo, fur, -0.08, 0.3, -L * 0.38);
  const hindR = mesh(legGeo, fur, 0.08, 0.3, -L * 0.38);
  legL.userData.partner = hindR;
  legR.userData.partner = hindL;
  body.add(legL, legR, hindL, hindR);
  body.add(mesh(box(0.22, 0.2, L), fur, 0, 0.4, 0));
  const neck = mesh(box(0.1, 0.28, 0.1), fur, 0, 0.56, L * 0.5);
  neck.rotation.x = 0.4;
  body.add(neck);
  body.add(mesh(box(0.1, 0.1, 0.2), fur, 0, 0.7, L * 0.6));
  if (opts.antlers)
    for (const x of [-1, 1]) {
      const a = mesh(box(0.025, 0.24, 0.025), mat('#e0d2b0'), x * 0.06, 0.86, L * 0.56);
      a.rotation.z = -x * 0.5;
      body.add(a);
      const tine = mesh(box(0.02, 0.1, 0.02), mat('#e0d2b0'), x * 0.12, 0.92, L * 0.62);
      tine.rotation.x = 0.6;
      body.add(tine);
    }
  return { root, body, legL, legR };
}

/** Stag Rider: a rider in a leaf cloak on a great antlered stag, spear forward. */
function makeStagRider(team: string): WorkerParts {
  const q = quadruped(1.45, '#9a6a3a', { antlers: true, long: 0.58 });
  const { body } = q;
  body.add(mesh(box(0.24, 0.1, 0.36), mat(team), 0, 0.53, -0.02)); // saddle cloth
  body.add(mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.26, 7), mat(LEAF), 0, 0.68, -0.04));
  body.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(SKIN), 0, 0.86, -0.04));
  body.add(mesh(new THREE.ConeGeometry(0.1, 0.16, 6), mat(tint(team, -0.3)), 0, 0.96, -0.04));
  const tool = new THREE.Group();
  tool.position.set(0.14, 0.7, 0);
  tool.add(mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.9, 5).rotateX(Math.PI / 2), mat(BARK), 0, 0, 0.3));
  tool.add(mesh(new THREE.ConeGeometry(0.035, 0.12, 5).rotateX(Math.PI / 2), mat('#d8c8a0'), 0, 0, 0.8));
  const pennant = mesh(box(0.012, 0.1, 0.12), mat(team), 0, 0.06, 0.6);
  tool.add(pennant);
  body.add(tool);
  return { ...q, tool, ...noTools(), flag: pennant };
}

/** Fox Scout: a small, quick orange fox with a team-coloured collar. */
function makeFox(team: string): WorkerParts {
  const q = quadruped(1.1, '#c8642a', { long: 0.42 });
  q.body.add(mesh(box(0.13, 0.05, 0.08), mat(team), 0, 0.6, 0.22)); // collar
  const tail = mesh(box(0.08, 0.08, 0.26), mat('#e8a060'), 0, 0.44, -0.3);
  tail.rotation.x = 0.4;
  q.body.add(tail);
  for (const x of [-0.04, 0.04]) q.body.add(mesh(new THREE.ConeGeometry(0.03, 0.08, 4), mat('#c8642a'), x, 0.8, 0.28));
  const tool = new THREE.Group();
  tool.position.set(0, 0.7, 0.28);
  q.body.add(tool);
  return { ...q, tool, ...noTools() };
}

/** Mender: a long green-and-white robe, a living staff topped with a glowing bud. */
function makeMender(team: string): WorkerParts {
  const base = soldierBase(team, 1.4, '#cfe0c0');
  const { body } = base;
  body.add(mesh(new THREE.ConeGeometry(0.22, 0.42, 7), mat('#dfeacf'), 0, 0.3, 0)); // robe
  body.add(mesh(box(0.05, 0.3, 0.02), mat(team), 0, 0.36, 0.17)); // sash
  body.add(mesh(new THREE.TorusGeometry(0.1, 0.025, 4, 10).rotateX(Math.PI / 2), mat(LEAF_LIGHT), 0, 0.72, 0)); // leaf circlet
  const tool = new THREE.Group();
  tool.position.set(0.2, 0.36, 0.05);
  tool.add(mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.55, 5), mat(BARK), 0, 0.17, 0));
  tool.add(mesh(new THREE.OctahedronGeometry(0.06, 0), mat('#d8ffb0', { emissive: 0x4a8a2a, rough: 0.3 }), 0, 0.48, 0));
  body.add(tool);
  return { ...base, tool, ...noTools(), style: 'staff' };
}

/** Rootcrusher: a walking treant: a bark trunk on root legs, branch arms, a leafy crown. */
function makeRootcrusher(team: string): WorkerParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(1.55);
  root.add(body);
  const bark = mat(BARK);
  const legGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.32, 5).translate(0, -0.16, 0);
  const legL = mesh(legGeo, bark, -0.1, 0.32, 0);
  const legR = mesh(legGeo, bark, 0.1, 0.32, 0);
  body.add(legL, legR);
  body.add(mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.55, 7), bark, 0, 0.58, 0)); // trunk
  body.add(mesh(new THREE.IcosahedronGeometry(0.3, 0), mat(LEAF), 0, 1.0, 0)); // crown
  body.add(mesh(new THREE.IcosahedronGeometry(0.14, 0), mat(team), 0.14, 1.12, 0.1)); // team-coloured blossoms
  body.add(mesh(new THREE.SphereGeometry(0.035, 5, 4), mat('#ffe080', { emissive: 0x6a5000 }), -0.06, 0.72, 0.19)); // eyes
  body.add(mesh(new THREE.SphereGeometry(0.035, 5, 4), mat('#ffe080', { emissive: 0x6a5000 }), 0.06, 0.72, 0.19));
  body.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.36, 5), bark, -0.24, 0.6, 0.02)); // left arm
  const tool = new THREE.Group(); // the right arm, which smashes
  tool.position.set(0.24, 0.74, 0.02);
  tool.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.42, 5), bark, 0, -0.12, 0));
  tool.add(mesh(new THREE.IcosahedronGeometry(0.08, 0), mat(BARK_DARK), 0, -0.34, 0));
  body.add(tool);
  return { root, body, legL, legR, tool, ...noTools() };
}

/** Thorn Warden: a tall bark-armoured champion in an antlered helm, with a thorned maul. */
function makeWarden(team: string): WorkerParts {
  const base = soldierBase(team, 1.9, BARK_DARK);
  const { body } = base;
  body.add(mesh(box(0.48, 0.08, 0.22), mat(BARK), 0, 0.54, 0)); // bark pauldrons
  body.add(mesh(new THREE.SphereGeometry(0.13, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(BARK), 0, 0.67, 0));
  for (const x of [-1, 1]) {
    const a = mesh(box(0.025, 0.22, 0.025), mat('#e0d2b0'), x * 0.09, 0.82, 0);
    a.rotation.z = -x * 0.6;
    body.add(a);
  }
  const shield = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 10).rotateZ(Math.PI / 2), mat(team), -0.27, 0.42, 0.04);
  body.add(shield);
  const tool = new THREE.Group();
  tool.position.set(0.22, 0.44, 0.04);
  tool.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.44, 5), mat(BARK), 0, 0.17, 0));
  tool.add(mesh(new THREE.IcosahedronGeometry(0.1, 0), mat(BARK_DARK), 0, 0.4, 0));
  body.add(tool);
  const flag = heroBanner(body, team, 0.62);
  heroHalo(base.root, team);
  return { ...base, tool, ...noTools(), flag };
}

/** Huntress: lithe, hooded in leaves, with a tall recurved bow. */
function makeHuntress(team: string): WorkerParts {
  const base = soldierBase(team, 1.85, BARK_DARK);
  const { body } = base;
  body.add(mesh(new THREE.ConeGeometry(0.15, 0.3, 6), mat(LEAF), 0, 0.78, -0.02));
  const cloak = mesh(box(0.3, 0.44, 0.03), mat(LEAF), 0, 0.36, -0.17);
  cloak.rotation.x = 0.12;
  body.add(cloak);
  const tool = new THREE.Group();
  tool.position.set(-0.21, 0.42, 0.06);
  const bow = mesh(new THREE.TorusGeometry(0.3, 0.018, 4, 14, Math.PI), mat(BARK), 0, 0, 0);
  bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
  tool.add(bow);
  tool.add(mesh(box(0.004, 0.6, 0.004), mat('#e8e2d0'), 0, 0, 0));
  body.add(tool);
  const flag = heroBanner(body, team, 0.6);
  heroHalo(base.root, team);
  return { ...base, tool, ...noTools(), flag, style: 'bow' };
}

/** Grove Speaker: a robed elder with a crown of leaves and a branching staff. */
function makeSpeaker(team: string): WorkerParts {
  const base = soldierBase(team, 1.8, '#4a5a3a');
  const { body } = base;
  body.add(mesh(new THREE.ConeGeometry(0.25, 0.48, 7), mat('#5a6a40'), 0, 0.3, 0)); // robe
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leaf = mesh(new THREE.ConeGeometry(0.04, 0.14, 4), mat(i % 2 ? LEAF_LIGHT : team), Math.cos(a) * 0.1, 0.78, Math.sin(a) * 0.1);
    body.add(leaf);
  }
  const tool = new THREE.Group();
  tool.position.set(0.22, 0.36, 0.05);
  tool.add(mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.7, 5), mat(BARK), 0, 0.2, 0));
  for (const x of [-1, 1]) {
    const br = mesh(box(0.02, 0.16, 0.02), mat(BARK), x * 0.05, 0.58, 0);
    br.rotation.z = -x * 0.6;
    tool.add(br);
  }
  tool.add(mesh(new THREE.IcosahedronGeometry(0.06, 0), mat('#b8ff8a', { emissive: 0x3a7a1a }), 0, 0.6, 0));
  body.add(tool);
  const flag = heroBanner(body, team, 0.5);
  heroHalo(base.root, team);
  return { ...base, tool, ...noTools(), flag, style: 'staff' };
}

export const WILD_UNITS: Partial<Record<UnitType, (team: string) => WorkerParts>> = {
  tender: makeTender,
  thornguard: makeThornguard,
  slinger: makeSlinger,
  fox: makeFox,
  stagrider: makeStagRider,
  mender: makeMender,
  rootcrusher: makeRootcrusher,
  warden: makeWarden,
  huntress: makeHuntress,
  speaker: makeSpeaker,
};

// ---- buildings -------------------------------------------------------------------

/** A low-poly tree (trunk and stacked crowns), for buildings that are trees. */
function tree(g: THREE.Group, x: number, z: number, h: number, crown: string): void {
  g.add(mesh(new THREE.CylinderGeometry(h * 0.08, h * 0.12, h * 0.55, 6), mat(BARK), x, h * 0.27, z));
  g.add(mesh(new THREE.IcosahedronGeometry(h * 0.32, 0), mat(crown), x, h * 0.7, z));
  g.add(mesh(new THREE.IcosahedronGeometry(h * 0.22, 0), mat(crown), x + h * 0.12, h * 0.9, z - h * 0.05));
}

/** A small team-coloured pennant on a pole. */
function pennant(g: THREE.Group, team: string, x: number, y: number, z: number): void {
  g.add(mesh(box(0.04, 0.7, 0.04), mat(BARK_DARK), x, y + 0.35, z));
  g.add(mesh(box(0.36, 0.22, 0.03), mat(team), x + 0.2, y + 0.6, z));
}

function heartwood(team: string, tier = 1): THREE.Group {
  const g = new THREE.Group();
  const s = 1 + (tier - 1) * 0.15;
  g.add(mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.18, 10), mat('#5a4a32'), 0, 0.09, 0)); // root mound
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = mesh(new THREE.CylinderGeometry(0.08, 0.16, 1.2, 5), mat(BARK), Math.cos(a) * 1.15, 0.2, Math.sin(a) * 1.15);
    r.rotation.z = Math.cos(a) * 1.1;
    r.rotation.x = -Math.sin(a) * 1.1;
    g.add(r);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.75 * s, 1.0 * s, 2.4 * s, 9), mat(BARK), 0, 1.2 * s, 0)); // great trunk
  g.add(mesh(box(0.6, 0.8, 0.1), mat('#2a1c10'), 0, 0.45, 0.96 * s)); // hollow door
  g.add(mesh(new THREE.IcosahedronGeometry(1.5 * s, 1), mat(LEAF), 0, 3.0 * s, 0));
  g.add(mesh(new THREE.IcosahedronGeometry(0.9 * s, 0), mat(tint(team, 0.1)), 0.7, 3.5 * s, 0.4)); // blossom crown
  g.add(mesh(box(0.5, 0.3, 0.06), mat(team), 0, 1.15, 0.98 * s)); // team-coloured lintel over the door
  if (tier > 2) g.add(mesh(new THREE.IcosahedronGeometry(0.7, 0), mat(LEAF_LIGHT), -0.8, 3.6 * s, -0.3));
  return g;
}

function grove(team: string): THREE.Group {
  const g = new THREE.Group();
  for (const [x, z, h] of [[-0.55, -0.5, 1.3], [0.55, -0.45, 1.1], [0.4, 0.5, 1.2]] as const) tree(g, x, z, h, LEAF);
  g.add(mesh(new THREE.ConeGeometry(0.42, 0.6, 6), mat(team), -0.4, 0.3, 0.45)); // leaf-roofed hut
  g.add(mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.3, 6), mat('#8a6a42'), -0.4, 0.15, 0.45));
  return g;
}

function saplodge(team: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(box(1.6, 0.7, 1.2), mat('#8a6440'), 0, 0.35, -0.3));
  const roof = mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.7, 3), mat(LEAF), 0, 0.92, -0.3);
  roof.rotation.z = Math.PI / 2;
  roof.scale.set(1, 1, 0.8);
  g.add(roof);
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.36, 8), mat('#b07830'), -0.7 + i * 0.4, 0.18, 0.75)); // sap casks
  pennant(g, team, 0.9, 0.7, -0.3);
  return g;
}

function den(team: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(1.35, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#4a6a2a'), 0, 0, 0)); // thicket dome
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const t = mesh(new THREE.ConeGeometry(0.06, 0.5, 4), mat('#d8c8a0'), Math.cos(a) * 1.1, 0.6, Math.sin(a) * 1.1);
    t.rotation.z = Math.cos(a) * 0.8;
    t.rotation.x = -Math.sin(a) * 0.8;
    g.add(t);
  }
  g.add(mesh(box(0.7, 0.75, 0.2), mat('#22170c'), 0, 0.38, 1.18)); // entrance
  pennant(g, team, 0, 1.25, 0);
  return g;
}

function spire(team: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.6, 0.75, 0.25, 7), mat('#5a4a32'), 0, 0.12, 0));
  const t = mesh(new THREE.ConeGeometry(0.5, 2.6, 6), mat(BARK), 0, 1.5, 0);
  t.rotation.y = 0.4;
  g.add(t);
  for (let i = 0; i < 6; i++) g.add(mesh(new THREE.ConeGeometry(0.05, 0.4, 4), mat('#d8c8a0'), Math.cos(i) * 0.35, 0.6 + i * 0.28, Math.sin(i) * 0.35));
  g.add(mesh(new THREE.IcosahedronGeometry(0.22, 0), mat(team), 0, 2.85, 0));
  return g;
}

function circle(team: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.35, 1.4, 0.08, 12), mat('#5a6a3a'), 0, 0.04, 0));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const st = mesh(box(0.3, 1.1 + (i % 2) * 0.3, 0.22), mat('#8a8578'), Math.cos(a) * 1.1, 0.55, Math.sin(a) * 1.1);
    st.rotation.y = -a;
    g.add(st);
  }
  tree(g, 0, 0, 1.8, LEAF);
  g.add(mesh(new THREE.IcosahedronGeometry(0.3, 0), mat(team), 0.25, 1.75, 0.1));
  return g;
}

function barkweaver(team: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.9, 1.0, 1.0, 7), mat('#8a6440'), 0, 0.5, -0.2));
  g.add(mesh(new THREE.ConeGeometry(1.15, 0.9, 7), mat(LEAF), 0, 1.45, -0.2));
  for (let i = 0; i < 3; i++) g.add(mesh(box(0.12, 0.8, 0.5), mat(i % 2 ? BARK : '#a07a4a'), 0.85 + i * 0.16, 0.4, 0.7)); // bark slabs drying
  g.add(mesh(box(0.9, 0.12, 0.5), mat('#6a4a2a'), -0.5, 0.45, 0.75)); // bench
  pennant(g, team, -1.0, 0.3, -0.9);
  return g;
}

function moonwell(team: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.45, 12), mat('#9a948a'), 0, 0.22, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.05, 16), mat('#7ad8ff', { emissive: 0x1a6a9a, rough: 0.2 }), 0, 0.46, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    g.add(mesh(box(0.18, 1.0, 0.18), mat('#8a8578'), Math.cos(a) * 1.25, 0.5, Math.sin(a) * 1.25));
  }
  g.add(mesh(new THREE.TorusGeometry(0.5, 0.05, 4, 16).rotateX(Math.PI / 2), mat(team), 0, 0.5, 0));
  return g;
}

function rootpit(team: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.3, 1.1, 0.3, 10), mat('#4a3a26'), 0, 0.15, 0));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = mesh(new THREE.CylinderGeometry(0.06, 0.12, 1.5, 5), mat(BARK), Math.cos(a) * 0.9, 0.6, Math.sin(a) * 0.9);
    r.rotation.z = Math.cos(a) * -0.5;
    r.rotation.x = Math.sin(a) * 0.5;
    g.add(r);
  }
  pennant(g, team, 1.0, 0.3, 1.0);
  return g;
}

export const WILD_BUILDINGS: Partial<Record<BuildingType, (team: string, tier?: number) => THREE.Group>> = {
  heartwood,
  grove,
  saplodge,
  den,
  spire,
  circle,
  barkweaver,
  moonwell,
  rootpit,
};
