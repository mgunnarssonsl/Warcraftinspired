// Low-poly placeholder models built from primitives. All original; scale is
// 1 world unit = 1 tile. Models are centered on their footprint with the
// ground at y = 0 and the front (entrance) facing +Z, toward the camera.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingType, UnitType } from '../sim/config';
import { withFog } from './fog';

const matCache = new Map<string, THREE.MeshStandardMaterial>();

/** Shared flat-shaded material per color. */
export function mat(color: string | number, opts: { emissive?: number; rough?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.emissive ?? ''}|${opts.rough ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = withFog(
      new THREE.MeshStandardMaterial({
        color,
        flatShading: true,
        roughness: opts.rough ?? 0.85,
        metalness: 0,
        emissive: opts.emissive ?? 0x000000,
      }),
    );
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

/** Shared legs + torso + head skeleton for soldiers. */
function soldierBase(team: string, scale: number, legColor: string): Pick<WorkerParts, 'root' | 'body' | 'legL' | 'legR'> {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  root.add(body);
  const legGeo = box(0.09, 0.22, 0.09).translate(0, -0.11, 0);
  const legL = mesh(legGeo, mat(legColor), -0.075, 0.22, 0);
  const legR = mesh(legGeo, mat(legColor), 0.075, 0.22, 0);
  body.add(legL, legR);
  body.add(mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.32, 8), mat(team), 0, 0.38, 0));
  body.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), mat('#e2b88c'), 0, 0.63, 0));
  return { root, body, legL, legR };
}

function noTools(): Pick<WorkerParts, 'pickHead' | 'axeHead' | 'hammerHead' | 'goldSack' | 'logs'> {
  return { pickHead: new THREE.Object3D(), axeHead: new THREE.Object3D(), hammerHead: new THREE.Object3D(), goldSack: new THREE.Object3D(), logs: [] };
}

/** Guard: helmeted, shield on the left arm, sword in the right hand. */
function makeGuard(team: string): WorkerParts {
  const base = soldierBase(team, 1.5, '#5a5f66');
  const { body } = base;
  const steel = mat('#a3a9b2', { rough: 0.45 });
  body.add(mesh(new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, 0.66, 0));
  body.add(mesh(box(0.36, 0.07, 0.2), steel, 0, 0.53, 0)); // pauldrons
  const shield = mesh(box(0.05, 0.3, 0.24), mat(team), -0.2, 0.4, 0.05);
  shield.add(mesh(box(0.02, 0.1, 0.1), mat('#e6d9a8'), -0.03, 0, 0));
  body.add(shield);
  const tool = new THREE.Group();
  tool.position.set(0.2, 0.42, 0.04);
  tool.add(mesh(box(0.035, 0.08, 0.035), mat('#5b4126'), 0, 0.02, 0));
  tool.add(mesh(box(0.12, 0.025, 0.04), steel, 0, 0.07, 0));
  tool.add(mesh(box(0.035, 0.3, 0.015), mat('#d6dbe2', { rough: 0.3 }), 0, 0.23, 0));
  body.add(tool);
  return { ...base, tool, ...noTools() };
}

/** Archer: hooded, bow in the left hand, quiver on the back. */
function makeArcher(team: string): WorkerParts {
  const base = soldierBase(team, 1.4, '#4a3826');
  const { body } = base;
  body.add(mesh(new THREE.ConeGeometry(0.15, 0.24, 8), mat('#3e5a32'), 0, 0.76, -0.01));
  body.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), mat('#6b4a2b'), 0.06, 0.48, -0.17));
  for (let i = 0; i < 3; i++) body.add(mesh(box(0.012, 0.08, 0.012), mat('#e8e2d0'), 0.03 + i * 0.025, 0.67, -0.17));
  const tool = new THREE.Group();
  tool.position.set(-0.2, 0.42, 0.06);
  const bow = mesh(new THREE.TorusGeometry(0.22, 0.016, 4, 12, Math.PI), mat('#8a5f34'), 0, 0, 0);
  bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
  tool.add(bow);
  tool.add(mesh(box(0.004, 0.44, 0.004), mat('#e8e2d0'), 0, 0, -0.0));
  body.add(tool);
  return { ...base, tool, ...noTools() };
}

/** The Marshal: a larger armoured champion with cape, plume and a war hammer. */
function makeHero(team: string): WorkerParts {
  const base = soldierBase(team, 1.85, '#3b3f46');
  const { body } = base;
  const gold = mat('#d9b44a', { rough: 0.35, emissive: 0x2a1e00 });
  const steel = mat('#b8bec8', { rough: 0.35 });
  body.add(mesh(new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, 0.67, 0));
  body.add(mesh(new THREE.ConeGeometry(0.04, 0.22, 5), mat(team), 0, 0.86, -0.02)); // plume
  body.add(mesh(box(0.4, 0.08, 0.22), gold, 0, 0.54, 0)); // pauldrons
  const cape = mesh(box(0.3, 0.42, 0.03), mat(tint(team, -0.3)), 0, 0.36, -0.17);
  cape.rotation.x = 0.15;
  body.add(cape);
  const tool = new THREE.Group();
  tool.position.set(0.21, 0.44, 0.04);
  tool.add(mesh(box(0.035, 0.42, 0.035), mat('#5b4126'), 0, 0.16, 0));
  tool.add(mesh(box(0.16, 0.1, 0.1), steel, 0, 0.38, 0));
  tool.add(mesh(box(0.17, 0.02, 0.11), gold, 0, 0.38, 0));
  body.add(tool);
  return { ...base, tool, ...noTools() };
}

/** Pathfinder: a tall hooded ranger with a long cloak and a longbow. */
function makeRanger(team: string): WorkerParts {
  const base = soldierBase(team, 1.8, '#3b3226');
  const { body } = base;
  body.add(mesh(new THREE.ConeGeometry(0.16, 0.28, 8), mat('#2f5a2a'), 0, 0.78, -0.01)); // hood
  const cloak = mesh(box(0.32, 0.46, 0.03), mat('#2f5a2a'), 0, 0.36, -0.17);
  cloak.rotation.x = 0.12;
  body.add(cloak);
  body.add(mesh(box(0.36, 0.05, 0.2), mat('#d9b44a', { emissive: 0x2a1e00 }), 0, 0.53, 0)); // gold clasp line
  body.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.32, 6), mat('#6b4a2b'), 0.07, 0.48, -0.18));
  const tool = new THREE.Group();
  tool.position.set(-0.21, 0.42, 0.06);
  const bow = mesh(new THREE.TorusGeometry(0.3, 0.018, 4, 14, Math.PI), mat('#5b3a1e'), 0, 0, 0);
  bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
  tool.add(bow);
  tool.add(mesh(box(0.004, 0.6, 0.004), mat('#e8e2d0'), 0, 0, 0));
  body.add(tool);
  return { ...base, tool, ...noTools() };
}

/** Sage: a robed caster with a tall pointed hat and a staff of fire. */
function makeSage(team: string): WorkerParts {
  const base = soldierBase(team, 1.8, '#3a2f4a');
  const { body } = base;
  body.add(mesh(new THREE.ConeGeometry(0.24, 0.46, 8), mat('#4a3a6a'), 0, 0.3, 0)); // robe
  body.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 10), mat('#3a2e55'), 0, 0.71, 0)); // brim
  body.add(mesh(new THREE.ConeGeometry(0.11, 0.34, 8), mat('#3a2e55'), 0, 0.89, 0)); // hat
  body.add(mesh(box(0.06, 0.36, 0.02), mat(team), 0, 0.38, 0.19)); // sash
  const tool = new THREE.Group();
  tool.position.set(0.22, 0.36, 0.05);
  tool.add(mesh(box(0.03, 0.68, 0.03), mat('#5b4126'), 0, 0.2, 0));
  tool.add(mesh(new THREE.OctahedronGeometry(0.08, 0), mat('#ffb060', { emissive: 0xc04a00, rough: 0.3 }), 0, 0.58, 0));
  body.add(tool);
  return { ...base, tool, ...noTools() };
}

/** Timber Wolf: a low grey quadruped. */
function makeWolf(): WorkerParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(1.3);
  root.add(body);
  const fur = mat('#7a7468');
  const legGeo = box(0.06, 0.2, 0.06).translate(0, -0.1, 0);
  const legL = mesh(legGeo, fur, -0.08, 0.2, 0.15);
  const legR = mesh(legGeo, fur, 0.08, 0.2, 0.15);
  const hindL = mesh(legGeo, fur, -0.08, 0.2, -0.15);
  const hindR = mesh(legGeo, fur, 0.08, 0.2, -0.15);
  legL.userData.partner = hindR;
  legR.userData.partner = hindL;
  body.add(legL, legR, hindL, hindR);
  body.add(mesh(box(0.2, 0.16, 0.46), fur, 0, 0.27, 0));
  body.add(mesh(box(0.15, 0.14, 0.18), fur, 0, 0.34, 0.27)); // head
  body.add(mesh(box(0.08, 0.07, 0.12), mat('#5a554c'), 0, 0.31, 0.39)); // snout
  for (const x of [-0.05, 0.05]) body.add(mesh(new THREE.ConeGeometry(0.03, 0.08, 4), fur, x, 0.44, 0.24));
  const tail = mesh(box(0.05, 0.05, 0.22), fur, 0, 0.3, -0.31);
  tail.rotation.x = 0.5;
  body.add(tail);
  const tool = new THREE.Group(); // the bite: the head lunges
  tool.position.set(0, 0.34, 0.3);
  body.add(tool);
  return { root, body, legL, legR, tool, ...noTools() };
}

/** Bog Brute: a hulking, mossy club-wielder. */
function makeBrute(): WorkerParts {
  const base = soldierBase('#5d6b3a', 2.3, '#4a5230');
  const { body } = base;
  body.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), mat('#6b7a44'), 0, 0.42, 0.04)); // belly
  body.add(mesh(new THREE.SphereGeometry(0.07, 6, 4), mat('#ffd84a', { emissive: 0x3a2a00 }), 0.04, 0.66, 0.09)); // eye
  const tool = new THREE.Group();
  tool.position.set(0.23, 0.42, 0.04);
  tool.add(mesh(new THREE.CylinderGeometry(0.03, 0.07, 0.5, 6), mat('#5b3a1e'), 0, 0.2, 0));
  body.add(tool);
  return { ...base, tool, ...noTools() };
}

/** Lancer: a rider on a barded horse with a long lance couched forward. */
function makeLancer(team: string): WorkerParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(1.45);
  root.add(body);
  const horse = mat('#6b4a2e');
  const legGeo = box(0.07, 0.3, 0.07).translate(0, -0.15, 0);
  // Front legs swing as the "walk" legs; the hind legs follow in the other phase.
  const legL = mesh(legGeo, horse, -0.09, 0.3, 0.2);
  const legR = mesh(legGeo, horse, 0.09, 0.3, 0.2);
  const hindL = mesh(legGeo, horse, -0.09, 0.3, -0.2);
  const hindR = mesh(legGeo, horse, 0.09, 0.3, -0.2);
  body.add(legL, legR, hindL, hindR);
  // Keep the hind legs in step with the front ones.
  legL.userData.partner = hindR;
  legR.userData.partner = hindL;
  body.add(mesh(box(0.26, 0.22, 0.6), horse, 0, 0.4, 0));
  body.add(mesh(box(0.28, 0.12, 0.5), mat(team), 0, 0.36, 0)); // barding
  const neck = mesh(box(0.12, 0.3, 0.12), horse, 0, 0.56, 0.3);
  neck.rotation.x = 0.5;
  body.add(neck);
  body.add(mesh(box(0.11, 0.11, 0.24), horse, 0, 0.7, 0.42));
  body.add(mesh(box(0.05, 0.2, 0.04), mat('#2e2018'), 0, 0.42, -0.34)); // tail
  // Rider
  body.add(mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.28, 8), mat(team), 0, 0.64, -0.02));
  body.add(mesh(new THREE.SphereGeometry(0.095, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#a3a9b2', { rough: 0.45 }), 0, 0.84, -0.02));
  body.add(mesh(new THREE.SphereGeometry(0.085, 8, 6), mat('#e2b88c'), 0, 0.82, -0.02));
  const tool = new THREE.Group();
  tool.position.set(0.15, 0.66, 0);
  const lance = mesh(new THREE.ConeGeometry(0.03, 0.95, 6).rotateX(Math.PI / 2), mat('#d6c49a'), 0, 0, 0.35);
  tool.add(lance);
  tool.add(mesh(box(0.012, 0.1, 0.1), mat(team), 0, 0.06, 0.62)); // pennant
  body.add(tool);
  return { root, body, legL, legR, tool, ...noTools() };
}

/** Outrider: a lighter rider on a smaller horse, carrying a pennant pole. */
function makeOutrider(team: string): WorkerParts {
  const p = makeLancer(team);
  p.body.scale.setScalar(1.25);
  p.tool.clear();
  p.tool.add(mesh(box(0.025, 0.6, 0.025), mat('#7a5733'), 0, 0.2, 0));
  p.tool.add(mesh(box(0.012, 0.12, 0.18), mat(team), 0, 0.44, 0.09));
  return p;
}

/** Cleric: long robe and hood, a staff topped with a glowing orb. */
function makeCleric(team: string): WorkerParts {
  const base = soldierBase(team, 1.4, '#d9d2c0');
  const { body } = base;
  body.add(mesh(new THREE.ConeGeometry(0.22, 0.42, 8), mat('#ece6d6'), 0, 0.3, 0)); // robe
  body.add(mesh(box(0.05, 0.3, 0.02), mat(team), 0, 0.36, 0.17)); // stole
  body.add(mesh(new THREE.ConeGeometry(0.14, 0.2, 8), mat('#ece6d6'), 0, 0.74, -0.01)); // hood
  const tool = new THREE.Group();
  tool.position.set(0.2, 0.36, 0.05);
  tool.add(mesh(box(0.03, 0.55, 0.03), mat('#7a5733'), 0, 0.17, 0));
  tool.add(mesh(new THREE.IcosahedronGeometry(0.06, 0), mat('#b8ffd0', { emissive: 0x3aa05a, rough: 0.3 }), 0, 0.47, 0));
  body.add(tool);
  return { ...base, tool, ...noTools() };
}

/** Mangonel: a wheeled timber frame with a throwing arm (the "tool"). */
function makeMangonel(team: string): WorkerParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(1.3);
  root.add(body);
  const wood = mat('#8a6440');
  const dark = mat('#5b4126');
  const wheelGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 10).rotateZ(Math.PI / 2);
  const legL = mesh(wheelGeo, dark, -0.3, 0.16, 0.2);
  const legR = mesh(wheelGeo, dark, 0.3, 0.16, 0.2);
  body.add(legL, legR, mesh(wheelGeo, dark, -0.3, 0.16, -0.25), mesh(wheelGeo, dark, 0.3, 0.16, -0.25));
  body.add(mesh(box(0.56, 0.08, 0.7), wood, 0, 0.26, 0));
  for (const x of [-0.2, 0.2]) body.add(mesh(box(0.06, 0.45, 0.06), wood, x, 0.5, -0.05));
  body.add(mesh(box(0.46, 0.06, 0.06), wood, 0, 0.7, -0.05));
  body.add(mesh(box(0.3, 0.06, 0.2), mat(team), 0, 0.32, 0.25)); // team-colored shield board
  const tool = new THREE.Group();
  tool.position.set(0, 0.62, -0.05);
  tool.add(mesh(box(0.06, 0.06, 0.75), wood, 0, 0, 0.1));
  tool.add(mesh(new THREE.SphereGeometry(0.1, 6, 4), mat('#7a7468'), 0, 0.06, -0.26)); // stone in the cup
  body.add(tool);
  return { root, body, legL, legR, tool, ...noTools() };
}

/** Hammer projectile for Stormhammer, pointing along +Z. */
export function makeHammerGeometry(): THREE.BufferGeometry {
  return mergeGeometries([new THREE.BoxGeometry(0.06, 0.06, 0.4), new THREE.BoxGeometry(0.22, 0.16, 0.16).translate(0, 0, 0.2)])!;
}

export function makeUnit(type: UnitType, team: string): WorkerParts {
  if (type === 'hero') return makeHero(team);
  if (type === 'lancer') return makeLancer(team);
  if (type === 'outrider') return makeOutrider(team);
  if (type === 'ranger') return makeRanger(team);
  if (type === 'sage') return makeSage(team);
  if (type === 'wolf') return makeWolf();
  if (type === 'brute') return makeBrute();
  if (type === 'cleric') return makeCleric(team);
  if (type === 'mangonel') return makeMangonel(team);
  // Camp creeps reuse the soldier silhouettes in their own drab colours.
  if (type === 'guard' || type === 'brigand' || type === 'chief') return makeGuard(team);
  if (type === 'archer' || type === 'poacher') return makeArcher(team);
  return makeWorker(team);
}

/** Siege boulder and a Cleric's glowing bolt. */
export function makeBoulderGeometry(): THREE.BufferGeometry {
  return new THREE.IcosahedronGeometry(0.17, 0);
}

export function makeBoltGeometry(): THREE.BufferGeometry {
  return new THREE.OctahedronGeometry(0.1, 0);
}

/** Arrow mesh for projectiles, pointing along +Z. */
export function makeArrowGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    new THREE.CylinderGeometry(0.015, 0.015, 0.55, 4).rotateX(Math.PI / 2),
    new THREE.ConeGeometry(0.04, 0.12, 4).rotateX(Math.PI / 2).translate(0, 0, 0.32),
  ])!;
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

/** A gold mine; a rich one (more miners at once) grows big glowing crystals. */
export function makeMine(rich = false): MineParts {
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
  if (rich) {
    const crystal = mat('#ffe27a', { emissive: 0x8a6400, rough: 0.2 });
    for (const [x, y, z, s] of [[-0.55, 1.35, -0.2, 0.32], [0.45, 1.45, -0.45, 0.26], [0.05, 1.6, 0.05, 0.36], [0.9, 1.1, 0.1, 0.22]]) {
      const c = mesh(new THREE.OctahedronGeometry(s, 0), crystal, x, y, z);
      c.scale.y = 1.8;
      c.rotation.set(x, z * 3, 0.3);
      root.add(c);
    }
  }
  // Timbered entrance on the front face.
  const wood = mat('#6b4a2b');
  root.add(mesh(box(0.12, 0.85, 0.12), wood, -0.42, 0.42, 1.2));
  root.add(mesh(box(0.12, 0.85, 0.12), wood, 0.42, 0.42, 1.2));
  root.add(mesh(box(1.1, 0.12, 0.16), wood, 0, 0.88, 1.2));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.78), withFog(new THREE.MeshBasicMaterial({ color: '#1b1410' })));
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

function barracks(team: string): THREE.Group {
  const g = new THREE.Group();
  const stone = mat('#9a8e7a');
  const timber = mat('#7a5733');
  g.add(mesh(box(2.8, 0.15, 2.8), mat('#7d715f'), 0, 0.075, 0));
  // Long hall
  g.add(mesh(box(2.4, 1.1, 1.6), stone, 0, 0.7, -0.4));
  const roof = mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.5, 3), mat(team), 0, 1.5, -0.4);
  roof.rotation.z = Math.PI / 2;
  roof.scale.set(1, 1, 0.85);
  g.add(roof);
  g.add(mesh(box(0.6, 0.7, 0.1), mat('#3b2a1c'), 0, 0.5, 0.42));
  // Timber frame accents
  for (const x of [-1.1, -0.4, 0.4, 1.1]) g.add(mesh(box(0.08, 1.1, 0.06), timber, x, 0.7, 0.42));
  // Training yard: weapon rack and a straw target
  g.add(mesh(box(1.0, 0.08, 0.08), timber, -0.6, 0.55, 1.05));
  for (const x of [-1.0, -0.2]) g.add(mesh(box(0.06, 0.55, 0.06), timber, x, 0.28, 1.05));
  for (let i = 0; i < 4; i++) g.add(mesh(box(0.03, 0.5, 0.03), mat('#c0c5cc', { rough: 0.4 }), -0.95 + i * 0.22, 0.45, 1.0));
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5), timber, 0.8, 0.35, 1.0));
  const target = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 12), mat('#d9b85a'), 0.8, 0.7, 1.0);
  target.rotation.x = Math.PI / 2;
  g.add(target);
  // Banner pole
  g.add(mesh(box(0.05, 1.4, 0.05), timber, 1.15, 0.85, 0.75));
  g.add(mesh(box(0.03, 0.45, 0.32), mat(team), 1.15, 1.3, 0.92));
  return g;
}

function tower(team: string): THREE.Group {
  const g = new THREE.Group();
  const stone = mat('#a69a86');
  g.add(mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.3, 8), mat('#7d715f'), 0, 0.15, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.58, 0.7, 2.4, 8), stone, 0, 1.4, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.25, 8), mat('#b8ad98'), 0, 2.7, 0));
  // Crenellations
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(mesh(box(0.2, 0.22, 0.14), stone, Math.cos(a) * 0.66, 2.92, Math.sin(a) * 0.66));
  }
  const roof = mesh(new THREE.ConeGeometry(0.62, 0.9, 8), mat(team), 0, 3.35, 0);
  g.add(roof);
  g.add(mesh(box(0.18, 0.28, 0.06), mat('#2a1d12'), 0, 1.9, 0.62)); // arrow slit
  g.add(mesh(box(0.34, 0.5, 0.06), mat('#3b2a1c'), 0, 0.55, 0.68)); // door
  return g;
}

/** A fortified Keep: the Keep plus a tall central donjon. */
function castle(team: string): THREE.Group {
  const g = keep(team);
  const stone = mat('#bfb196');
  g.add(mesh(new THREE.CylinderGeometry(0.55, 0.65, 1.6, 8), stone, 0, 3.0, -0.1));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(mesh(box(0.16, 0.2, 0.12), stone, Math.cos(a) * 0.58, 3.9, -0.1 + Math.sin(a) * 0.58));
  }
  g.add(mesh(new THREE.ConeGeometry(0.62, 0.9, 8), mat(team), 0, 4.45, -0.1));
  return g;
}

function altar(team: string): THREE.Group {
  const g = new THREE.Group();
  const stone = mat('#a69c8c');
  g.add(mesh(new THREE.CylinderGeometry(1.35, 1.45, 0.25, 8), mat('#8a8070'), 0, 0.12, 0));
  g.add(mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.2, 8), stone, 0, 0.35, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.5, 6), stone, Math.cos(a) * 0.95, 1.2, Math.sin(a) * 0.95));
  }
  const ring = mesh(new THREE.TorusGeometry(0.95, 0.08, 4, 6), mat(team), 0, 1.98, 0);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  // Statue of a champion with raised hammer
  g.add(mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.5, 6), stone, 0, 0.7, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 6), mat('#c9c0ae'), 0, 1.2, 0));
  g.add(mesh(new THREE.SphereGeometry(0.13, 8, 6), mat('#c9c0ae'), 0, 1.55, 0));
  g.add(mesh(box(0.05, 0.6, 0.05), mat('#c9c0ae'), 0.18, 1.7, 0));
  g.add(mesh(box(0.2, 0.12, 0.12), mat('#e8d27a', { emissive: 0x3a2a00 }), 0.18, 2.0, 0));
  return g;
}

function smithy(team: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(box(2.7, 0.12, 2.7), mat('#6d5a43'), 0, 0.06, 0));
  g.add(mesh(box(1.9, 1.0, 1.5), mat('#9a8e7a'), -0.2, 0.6, -0.4));
  const roof = mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.0, 3), mat(team), -0.2, 1.3, -0.4);
  roof.rotation.z = Math.PI / 2;
  roof.scale.set(1, 1, 0.8);
  g.add(roof);
  // Chimney with a glowing forge mouth
  g.add(mesh(box(0.4, 1.6, 0.4), mat('#7a6e5e'), 0.75, 1.1, -0.8));
  g.add(mesh(box(0.5, 0.35, 0.05), mat('#ff8a2a', { emissive: 0xc04a00 }), 0.2, 0.45, 0.36));
  // Anvil out front
  g.add(mesh(box(0.2, 0.25, 0.15), mat('#4a4a50'), 0.7, 0.18, 0.75));
  g.add(mesh(box(0.42, 0.1, 0.18), mat('#5a5a62', { rough: 0.4 }), 0.7, 0.35, 0.75));
  g.add(mesh(box(0.6, 0.06, 0.06), mat('#7a5733'), -0.6, 0.25, 0.95));
  return g;
}

/** Citadel: the Castle ringed by four banner towers. */
function citadel(team: string): THREE.Group {
  const g = castle(team);
  const stone = mat('#a99c84');
  for (const [x, z] of [[-1.75, -1.75], [1.75, -1.75], [-1.75, 1.75], [1.75, 1.75]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.3, 0.34, 2.8, 7), stone, x, 1.4, z));
    g.add(mesh(new THREE.ConeGeometry(0.42, 0.7, 7), mat(team), x, 3.15, z));
    g.add(mesh(box(0.03, 0.6, 0.03), mat('#3b2a1c'), x, 3.7, z));
    g.add(mesh(box(0.32, 0.2, 0.02), mat('#e8d27a', { emissive: 0x3a2a00 }), x + 0.17, 3.9, z));
  }
  return g;
}

function chapel(team: string): THREE.Group {
  const g = new THREE.Group();
  const stone = mat('#e3dccb');
  g.add(mesh(box(2.7, 0.12, 2.7), mat('#8d8272'), 0, 0.06, 0));
  g.add(mesh(box(1.4, 1.2, 2.2), stone, 0, 0.72, -0.1));
  // A gabled roof running front to back: a three-sided prism, ridge up.
  g.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.3, 3).rotateX(-Math.PI / 2), mat(team), 0, 1.68, -0.1));
  // Steeple over the door, with a glowing window and a finial.
  g.add(mesh(box(0.6, 1.9, 0.6), stone, 0, 1.0, 0.95));
  g.add(mesh(new THREE.ConeGeometry(0.48, 1.0, 4), mat(tint(team, -0.25)), 0, 2.45, 0.95));
  g.add(mesh(box(0.22, 0.34, 0.04), mat('#b8ffd0', { emissive: 0x3aa05a }), 0, 1.45, 1.26));
  g.add(mesh(box(0.34, 0.5, 0.05), mat('#4a3626'), 0, 0.37, 1.26));
  g.add(mesh(new THREE.OctahedronGeometry(0.1, 0), mat('#e8d27a', { emissive: 0x3a2a00 }), 0, 3.05, 0.95));
  return g;
}

function workshop(team: string): THREE.Group {
  const g = new THREE.Group();
  const wood = mat('#8a6440');
  g.add(mesh(box(2.7, 0.12, 2.7), mat('#6d5a43'), 0, 0.06, 0));
  // Open timber shed
  for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 0.4], [1.1, 0.4]]) g.add(mesh(box(0.14, 1.3, 0.14), wood, x, 0.71, z));
  const roof = mesh(box(2.6, 0.1, 1.9), mat(team), 0, 1.4, -0.35);
  roof.rotation.x = -0.18;
  g.add(roof);
  g.add(mesh(box(2.3, 0.9, 0.1), mat('#9a8e7a'), 0, 0.55, -1.15)); // back wall
  // A big wheel and a stack of beams out front
  const wheel = mesh(new THREE.TorusGeometry(0.35, 0.06, 4, 10), mat('#5b4126'), 0.7, 0.42, 0.9);
  wheel.rotation.y = Math.PI / 2;
  g.add(wheel);
  for (let i = 0; i < 3; i++) g.add(mesh(box(1.0, 0.1, 0.12), wood, -0.55, 0.17 + i * 0.1, 0.85 + (i % 2) * 0.05));
  g.add(mesh(box(0.25, 0.25, 0.25), mat('#7a7468'), -0.1, 0.25, -0.3));
  return g;
}

/** Trading Post: a striped market stall with crates and a hanging sign. */
function shop(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat('#8a6440');
  g.add(mesh(box(2.7, 0.1, 2.7), mat('#7d6648'), 0, 0.05, 0));
  for (const [x, z] of [[-1.05, -0.8], [1.05, -0.8], [-1.05, 0.8], [1.05, 0.8]]) g.add(mesh(box(0.1, 1.4, 0.1), wood, x, 0.75, z));
  for (let i = 0; i < 5; i++) {
    const stripe = mesh(box(0.46, 0.06, 1.9), mat(i % 2 ? '#e8d9b0' : '#b8442e'), -0.92 + i * 0.46, 1.48, 0);
    stripe.rotation.x = -0.15;
    g.add(stripe);
  }
  g.add(mesh(box(2.0, 0.5, 0.5), wood, 0, 0.3, 0.55)); // counter
  g.add(mesh(box(0.4, 0.4, 0.4), mat('#a0703f'), -0.6, 0.25, -0.45));
  g.add(mesh(box(0.3, 0.3, 0.3), mat('#8a5f34'), 0.55, 0.2, -0.5));
  g.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), mat('#ffd84a', { emissive: 0x4a3200, rough: 0.35 }), 0.2, 0.65, 0.55));
  g.add(mesh(box(0.6, 0.3, 0.04), mat('#5b4126'), 0, 1.15, 0.95)); // sign
  g.add(mesh(new THREE.OctahedronGeometry(0.09, 0), mat('#ffd84a', { emissive: 0x4a3200 }), 0, 1.15, 0.98));
  return g;
}

/** Healing Fountain: a stone basin with a glowing spring. */
function fountain(): THREE.Group {
  const g = new THREE.Group();
  const stone = mat('#a69c8c');
  g.add(mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.35, 10), stone, 0, 0.17, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.05, 10), mat('#5ec8e8', { emissive: 0x1a5a70, rough: 0.2 }), 0, 0.33, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.9, 6), stone, 0, 0.6, 0));
  g.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), mat('#9af0ff', { emissive: 0x2a8aa0, rough: 0.2 }), 0, 1.15, 0));
  return g;
}

const BUILDERS: Record<BuildingType, (team: string) => THREE.Group> = { hq: keep, farm, lumbermill, barracks, tower, altar, smithy, chapel, workshop, shop, fountain };

/** An item on the ground: a small chest with a glowing gem, colored by tier. */
export function makeGroundItem(tier: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(box(0.34, 0.22, 0.24), mat('#7a5733'), 0, 0.11, 0));
  g.add(mesh(box(0.36, 0.06, 0.26), mat('#d9b44a', { emissive: 0x2a1e00 }), 0, 0.24, 0));
  g.add(mesh(new THREE.OctahedronGeometry(0.1, 0), mat(tier > 1 ? '#c49aff' : '#7dffb0', { emissive: tier > 1 ? 0x5a2aa0 : 0x1a8a4a }), 0, 0.46, 0));
  return g;
}

export function makeBuilding(type: BuildingType, team: string, size: number, tier = 1): BuildingParts {
  const root = new THREE.Group();
  const model = type === 'hq' && tier > 2 ? citadel(team) : type === 'hq' && tier > 1 ? castle(team) : BUILDERS[type](team);
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
