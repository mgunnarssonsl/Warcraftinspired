// Low-poly placeholder models built from primitives. All original; scale is
// 1 world unit = 1 tile. Models are centered on their footprint with the
// ground at y = 0 and the front (entrance) facing +Z, toward the camera.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingType } from '../sim/config';

const matCache = new Map<string, THREE.MeshStandardMaterial>();

/** Shared flat-shaded material per color. */
export function mat(color: string | number, opts: { emissive?: number; rough?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.emissive ?? ''}|${opts.rough ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: opts.rough ?? 0.85,
      metalness: 0,
      emissive: opts.emissive ?? 0x000000,
    });
    matCache.set(key, m);
  }
  return m;
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** Darken or lighten a CSS hex color. */
export function tint(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  if (f < 0) c.multiplyScalar(1 + f);
  else c.lerp(new THREE.Color(1, 1, 1), f);
  return `#${c.getHexString()}`;
}

// ---- units ---------------------------------------------------------------------

export interface WorkerParts {
  root: THREE.Group;
  body: THREE.Group; // bobs while walking
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  tool: THREE.Group; // swings while working
  pickHead: THREE.Object3D;
  axeHead: THREE.Object3D;
  hammerHead: THREE.Object3D;
  goldSack: THREE.Object3D;
  logs: THREE.Object3D[];
}

export function makeWorker(team: string): WorkerParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  // Drawn larger than the 0.3-tile collision radius so units read clearly.
  body.scale.setScalar(1.35);
  root.add(body);
  const legGeo = box(0.08, 0.22, 0.08);
  const legL = mesh(legGeo, mat('#4a3826'), -0.07, 0.11, 0);
  const legR = mesh(legGeo, mat('#4a3826'), 0.07, 0.11, 0);
  legL.geometry.translate(0, -0.11, 0);
  legL.position.y = 0.22;
  legR.position.y = 0.22;
  body.add(legL, legR);
  body.add(mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.3, 8), mat(team), 0, 0.37, 0));
  body.add(mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.05, 8), mat('#5b4126'), 0, 0.27, 0));
  body.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), mat('#e2b88c'), 0, 0.61, 0));
  body.add(mesh(new THREE.ConeGeometry(0.18, 0.09, 10), mat('#c9a35a'), 0, 0.71, 0));

  const tool = new THREE.Group();
  tool.position.set(0.19, 0.42, 0.02);
  tool.add(mesh(box(0.03, 0.36, 0.03), mat('#7a5733'), 0, 0.14, 0));
  const pickHead = mesh(box(0.24, 0.04, 0.04), mat('#9aa0a8', { rough: 0.5 }), 0, 0.31, 0);
  const axeHead = mesh(box(0.04, 0.1, 0.12), mat('#9aa0a8', { rough: 0.5 }), 0, 0.28, 0.06);
  const hammerHead = mesh(box(0.06, 0.07, 0.14), mat('#6d6f75', { rough: 0.5 }), 0, 0.31, 0);
  tool.add(pickHead, axeHead, hammerHead);
  body.add(tool);

  const goldSack = new THREE.Group();
  goldSack.add(mesh(new THREE.SphereGeometry(0.11, 8, 6), mat('#8a6a3a'), 0, 0, 0));
  goldSack.add(mesh(new THREE.IcosahedronGeometry(0.07, 0), mat('#ffd84a', { emissive: 0x4a3200, rough: 0.35 }), 0, 0.08, 0));
  goldSack.position.set(0, 0.46, -0.19);
  body.add(goldSack);
  const logs: THREE.Object3D[] = [];
  const logGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.32, 6).rotateZ(Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const l = mesh(logGeo, mat(i % 2 ? '#8a5f34' : '#a0703f'), 0, 0.4 + i * 0.075, -0.2);
    body.add(l);
    logs.push(l);
  }
  return { root, body, legL, legR, tool, pickHead, axeHead, hammerHead, goldSack, logs };
}

// ---- resources -----------------------------------------------------------------

export function makeTreeGeometries(): { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry } {
  const trunk = new THREE.CylinderGeometry(0.07, 0.1, 0.5, 5).translate(0, 0.25, 0);
  const canopy = mergeGeometries([
    new THREE.ConeGeometry(0.52, 0.9, 7).translate(0, 0.8, 0),
    new THREE.ConeGeometry(0.4, 0.75, 7).translate(0, 1.22, 0),
    new THREE.ConeGeometry(0.26, 0.55, 7).translate(0, 1.6, 0),
  ])!;
  return { trunk, canopy };
}

export interface MineParts {
  root: THREE.Group;
  nuggets: THREE.Object3D[];
  glow: THREE.Mesh;
}

export function makeMine(): MineParts {
  const root = new THREE.Group();
  const rock = mat('#857864');
  const mound = mesh(new THREE.DodecahedronGeometry(1.45, 0), rock, 0, 0.35, -0.1);
  mound.scale.set(1, 0.72, 0.95);
  root.add(mound);
  const r2 = mesh(new THREE.IcosahedronGeometry(0.6, 0), mat('#6f6555'), -1.0, 0.25, 0.55);
  r2.scale.set(1, 0.8, 1);
  root.add(r2);
  root.add(mesh(new THREE.IcosahedronGeometry(0.45, 0), mat('#7b705e'), 1.05, 0.2, 0.6));
  const nuggets: THREE.Object3D[] = [];
  const goldMat = mat('#f2c94c', { emissive: 0x5a3c00, rough: 0.3 });
  const spots = [
    [-0.7, 0.95, -0.4], [0.2, 1.3, -0.3], [0.8, 0.95, -0.2], [-0.4, 1.1, 0.35], [0.95, 0.6, 0.4],
    [-1.05, 0.55, -0.1], [0.45, 1.05, 0.5], [-0.15, 1.35, -0.75], [0.6, 0.75, -0.95], [-0.9, 0.7, -0.75],
  ];
  for (const [x, y, z] of spots) {
    const n = mesh(new THREE.OctahedronGeometry(0.13, 0), goldMat, x, y, z);
    n.rotation.set(x * 3, z * 5, y);
    root.add(n);
    nuggets.push(n);
  }
  // Timbered entrance on the front face.
  const wood = mat('#6b4a2b');
  root.add(mesh(box(0.12, 0.85, 0.12), wood, -0.42, 0.42, 1.2));
  root.add(mesh(box(0.12, 0.85, 0.12), wood, 0.42, 0.42, 1.2));
  root.add(mesh(box(1.1, 0.12, 0.16), wood, 0, 0.88, 1.2));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.78), new THREE.MeshBasicMaterial({ color: '#1b1410' }));
  glow.position.set(0, 0.42, 1.17);
  root.add(glow);
  // Cart rails leading out.
  root.add(mesh(box(0.04, 0.03, 0.5), mat('#3d3024'), -0.2, 0.02, 1.45));
  root.add(mesh(box(0.04, 0.03, 0.5), mat('#3d3024'), 0.2, 0.02, 1.45));
  return { root, nuggets, glow };
}

// ---- buildings -----------------------------------------------------------------

export interface BuildingParts {
  root: THREE.Group;
  /** The building proper; scaled vertically while under construction. */
  model: THREE.Group;
  scaffold: THREE.Group;
}

function keep(team: string): THREE.Group {
  const g = new THREE.Group();
  const stone = mat('#8d8272');
  const wall = mat('#cbbd9f');
  const tower = mat('#b9ab8f');
  const roof = mat(team);
  const roofDark = mat(tint(team, -0.25));
  g.add(mesh(box(3.8, 0.25, 3.8), stone, 0, 0.125, 0));
  // Curtain walls between corner towers.
  for (const s of [-1, 1]) {
    g.add(mesh(box(2.6, 0.8, 0.22), wall, 0, 0.65, s * 1.5));
    g.add(mesh(box(0.22, 0.8, 2.6), wall, s * 1.5, 0.65, 0));
  }
  // Great hall
  g.add(mesh(box(2.2, 1.5, 1.8), wall, 0, 1.0, -0.1));
  const r = mesh(new THREE.ConeGeometry(1.65, 1.3, 4), roof, 0, 2.4, -0.1);
  r.rotation.y = Math.PI / 4;
  r.scale.set(1, 1, 0.85);
  g.add(r);
  // Corner towers
  for (const [x, z] of [[-1.45, -1.45], [1.45, -1.45], [-1.45, 1.45], [1.45, 1.45]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.46, 2.0, 7), tower, x, 1.0, z));
    g.add(mesh(new THREE.ConeGeometry(0.58, 0.8, 7), roofDark, x, 2.4, z));
  }
  // Gate
  g.add(mesh(box(0.7, 0.75, 0.12), mat('#3b2a1c'), 0, 0.62, 1.62));
  // Banner on the hall
  g.add(mesh(box(0.04, 0.9, 0.04), mat('#3b2a1c'), 0, 3.4, -0.1));
  g.add(mesh(box(0.5, 0.28, 0.03), roof, 0.27, 3.7, -0.1));
  return g;
}

function farm(team: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(box(0.95, 0.6, 0.75), mat('#d8c8a4'), -0.35, 0.3, -0.45));
  const roof = mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 3), mat(team), -0.35, 0.78, -0.45);
  roof.rotation.z = Math.PI / 2;
  roof.scale.set(1, 1, 0.75);
  g.add(roof);
  g.add(mesh(box(0.2, 0.35, 0.05), mat('#5b4126'), -0.35, 0.18, -0.06));
  // Crop field with rows
  g.add(mesh(box(1.9, 0.04, 0.85), mat('#7a6a3a'), 0, 0.02, 0.5));
  for (let i = 0; i < 4; i++) g.add(mesh(box(1.75, 0.12, 0.09), mat('#9cb84a'), 0, 0.08, 0.2 + i * 0.2));
  // Haystack
  g.add(mesh(new THREE.ConeGeometry(0.22, 0.4, 7), mat('#d9b85a'), 0.6, 0.2, -0.5));
  return g;
}

function lumbermill(team: string): THREE.Group {
  const g = new THREE.Group();
  const wood = mat('#8a6440');
  g.add(mesh(box(2.8, 0.12, 2.8), mat('#6d5a43'), 0, 0.06, 0));
  // Back wall and open shed on posts
  g.add(mesh(box(2.3, 1.1, 0.18), wood, 0, 0.6, -0.95));
  for (const x of [-1.05, 1.05]) g.add(mesh(box(0.14, 1.0, 0.14), wood, x, 0.55, 0.45));
  const roof = mesh(box(2.6, 0.12, 1.9), mat(team), 0, 1.25, -0.25);
  roof.rotation.x = -0.25;
  g.add(roof);
  // Saw bench
  g.add(mesh(box(1.2, 0.35, 0.4), mat('#5b4126'), -0.2, 0.3, -0.25));
  const saw = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 16), mat('#b9bcc2', { rough: 0.3 }), -0.2, 0.55, -0.25);
  saw.rotation.x = Math.PI / 2;
  g.add(saw);
  // Log pile out front
  const logGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.0, 7).rotateZ(Math.PI / 2);
  for (let i = 0; i < 3; i++) g.add(mesh(logGeo, mat('#a0703f'), 0.55, 0.2, 0.75 + i * 0.25 - 0.25));
  for (let i = 0; i < 2; i++) g.add(mesh(logGeo, mat('#8a5f34'), 0.55, 0.42, 0.62 + i * 0.25 - 0.12));
  return g;
}

const BUILDERS: Record<BuildingType, (team: string) => THREE.Group> = { hq: keep, farm, lumbermill };

export function makeBuilding(type: BuildingType, team: string, size: number): BuildingParts {
  const root = new THREE.Group();
  const model = BUILDERS[type](team);
  root.add(model);
  const scaffold = new THREE.Group();
  const pole = mat('#a07a4a');
  const h = Math.max(1, size * 0.45);
  const e = size / 2 - 0.12;
  for (const [x, z] of [[-e, -e], [e, -e], [-e, e], [e, e]]) scaffold.add(mesh(box(0.08, h, 0.08), pole, x, h / 2, z));
  for (const s of [-1, 1]) {
    scaffold.add(mesh(box(size - 0.2, 0.06, 0.06), pole, 0, h * 0.6, s * e));
    scaffold.add(mesh(box(0.06, 0.06, size - 0.2), pole, s * e, h * 0.6, 0));
  }
  scaffold.add(mesh(box(size - 0.3, 0.05, size - 0.3), mat('#7d6648'), 0, 0.03, 0));
  root.add(scaffold);
  return { root, model, scaffold };
}

/** A translucent copy of a building model for placement previews. */
export function makeGhost(type: BuildingType, ghostMat: THREE.Material): THREE.Group {
  const g = BUILDERS[type]('#ffffff');
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.material = ghostMat;
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return g;
}
