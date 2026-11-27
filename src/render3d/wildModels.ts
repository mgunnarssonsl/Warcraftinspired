// Thornwild models: the forest faction's own look. Bark browns, leaf greens
// and living wood, with the team colour in leaves, sashes and banners.
// Buildings are grown, not built: trunks, mounds, standing stones and thorn
// spires. Same scale and parts as the Crown's (models.ts), so animation and
// selection treat them alike, but different silhouettes.

import * as THREE from 'three';
import type { BuildingType } from '../sim/config';
import { box, mat, mesh, tint } from './models';

const BARK = '#6b4a2e';
const BARK_DARK = '#4a3320';
const LEAF = '#3f7a3a';
const LEAF_LIGHT = '#6aa84a';

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
