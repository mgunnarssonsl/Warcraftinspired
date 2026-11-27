// Low-poly placeholder models built from primitives. All original; scale is
// 1 world unit = 1 tile. Models are centered on their footprint with the
// ground at y = 0 and the front (entrance) facing +Z, toward the camera.

import * as CB from './crownBuildings';
import * as FX from './fx';
import { hasGltfUnit, makeGltfUnit } from './gltfUnits';
import { hasStatic, makeStatic } from './gltfStatic';
import * as WB from './wildBuildings';
import { buildingFaction } from '../sim/factions';
import { Sculpt, blob, cachedModel, capsule, lathe, leafFan, rand, rbox } from './kit';
import * as CU from './crownUnits';
import * as WU from './wildUnits';
import { cachedUnit, type UnitParts } from './rig';
import * as THREE from 'three';
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
    m.userData.cacheKey = key;
    matCache.set(key, m);
  }
  return m;
}

/** Is this one of the cached materials every model shares (never disposed)? */
export function isSharedMaterial(m: THREE.Material): boolean {
  return matCache.get(`${(m as THREE.MeshStandardMaterial).userData.cacheKey}`) === m;
}

export function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** Darken or lighten a CSS hex color. */
export function tint(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  if (f < 0) c.multiplyScalar(1 + f);
  else c.lerp(new THREE.Color(1, 1, 1), f);
  return `#${c.getHexString()}`;
}

// ---- units ---------------------------------------------------------------------

export type WorkerParts = UnitParts;

const UNIT_BUILDERS: Record<UnitType, (team: string) => THREE.Group> = {
  worker: (t) => CU.laborer(t),
  guard: CU.guard,
  archer: CU.archer,
  lancer: CU.lancer,
  cleric: CU.cleric,
  mangonel: CU.mangonel,
  outrider: CU.outrider,
  hero: CU.marshal,
  ranger: CU.pathfinder,
  sage: CU.sage,
  brigand: CU.brigand,
  poacher: CU.poacher,
  chief: CU.chief,
  brute: () => CU.brute(),
  wolf: () => CU.wolf(),
  tender: WU.tender,
  thornguard: WU.thornguard,
  slinger: WU.slinger,
  fox: WU.fox,
  stagrider: WU.stagrider,
  mender: WU.mender,
  rootcrusher: WU.rootcrusher,
  warden: WU.thornWarden,
  huntress: WU.huntress,
  speaker: WU.groveSpeaker,
  // Stand-ins while the Blender models load.
  musketeer: CU.archer,
  warbear: () => CU.brute(),
  sentinel: CU.guard,
  bearwarden: CU.guard,
  bearrider: CU.lancer,
  naturewolf: () => CU.wolf(),
  barksentinel: WU.thornguard,
  wolfkeeper: WU.thornguard,
  wolfrider: WU.stagrider,
  shifter: WU.thornguard,
  panther: () => CU.wolf(),
};

/** A unit model: built once per type and team colour, then cloned (shared geometry). */
export function makeUnit(type: UnitType, team: string): WorkerParts {
  if (hasGltfUnit(type)) return makeGltfUnit(type, team);
  return cachedUnit(`${type}|${team}`, () => UNIT_BUILDERS[type](team));
}

/** Projectiles (pointing along +Z), painted: see fx.ts. */
export const makeHammerGeometry = FX.hammerGeometry;
export const makeBoulderGeometry = FX.boulderGeometry;
export const makeBoltGeometry = FX.boltGeometry;
export const makeArrowGeometry = FX.arrowGeometry;

// ---- buildings -----------------------------------------------------------------

export interface BuildingParts {
  root: THREE.Group;
  /** The building proper; rises (Crown) or grows (Thornwild) while under construction. */
  model: THREE.Group;
  /** The construction site: footing and scaffolding, or a planted seed. */
  scaffold: THREE.Object3D;
  /** Fallen stones and charred beams, or withered leaves: shown when badly damaged. */
  damage: THREE.Object3D;
}

const BUILDING_MODELS: Record<BuildingType, (team: string, tier: number) => THREE.Group> = {
  ...(CB.CROWN_BUILDINGS as Record<string, (team: string, tier: number) => THREE.Group>),
  ...(WB.WILD_BUILDINGS_NEW as Record<string, (team: string, tier: number) => THREE.Group>),
} as Record<BuildingType, (team: string, tier: number) => THREE.Group>;

/** The construction site for a footprint: Crown scaffolding or a Thornwild planting. */
function siteModel(size: number, wild: boolean): THREE.Object3D {
  const s = new Sculpt();
  const e = size / 2 - 0.12;
  if (!wild) {
    // Footing stones, timber scaffolding with planks and a ladder.
    s.add(rbox(size - 0.15, 0.1, size - 0.15, 0.03), '#b0a48e', 'matte', { at: [0, 0.05, 0] });
    for (let i = 0; i < size * 2; i++) s.add(rbox(0.4, 0.12, 0.3, 0.03), i % 2 ? '#c9bea8' : '#a39780', 'matte', { at: [-e + 0.2 + ((i * 0.47) % (2 * e - 0.4)), 0.14, (i % 2 ? 1 : -1) * (e - 0.15)] });
    const h = Math.max(1.1, size * 0.5);
    for (const [x, z] of [
      [-e, -e],
      [e, -e],
      [-e, e],
      [e, e],
    ])
      s.add(rbox(0.08, h, 0.08, 0.015), '#a07a4a', 'matte', { at: [x, h / 2, z] });
    for (const y of [h * 0.45, h * 0.9])
      for (const side of [-1, 1]) {
        s.add(rbox(size - 0.15, 0.05, 0.16, 0.01), '#b88c58', 'matte', { at: [0, y, side * e] });
        s.add(rbox(0.06, 0.06, size - 0.2, 0.01), '#a07a4a', 'matte', { at: [side * e, y, 0] });
      }
    for (const side of [-1, 1]) s.add(rbox(0.05, 0.05, size * 1.2, 0.01), '#8a6438', 'matte', { at: [side * e, h * 0.5, 0], rot: [Math.atan2(h, size) * side, 0, 0] });
    for (const x of [-0.12, 0.12]) s.add(rbox(0.04, h, 0.04, 0.01), '#8a6438', 'matte', { at: [e - 0.3 + x, h / 2, e + 0.1], rot: [0.12, 0, 0] });
    for (let i = 1; i < 5; i++) s.add(rbox(0.26, 0.03, 0.03, 0.005), '#8a6438', 'matte', { at: [e - 0.3, (h * i) / 5, e + 0.1 - (h * i) / 5 * 0.12] });
  } else {
    // A planted seed in a ring of roots, sprouting.
    s.add(new THREE.CylinderGeometry(size * 0.42, size * 0.46, 0.1, 14), '#7a6040', 'matte', { at: [0, 0.05, 0] });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      s.add(capsule(0.07, size * 0.3, 5), i % 2 ? '#a0703f' : '#74502c', 'matte', { at: [Math.cos(a) * size * 0.32, 0.12, Math.sin(a) * size * 0.32], rot: [Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3] });
      s.add(leafFan(2, 0.14, 0.08, 1.2, i), '#8fc244', 'cloth', { at: [Math.cos(a + 0.4) * size * 0.2, 0.12, Math.sin(a + 0.4) * size * 0.2], rot: [Math.PI, a, 0] });
    }
    s.add(lathe([[0.02, 0], [0.16, 0.12], [0.12, 0.28], [0, 0.36]], 8), '#ffb43a', 'glow', { at: [0, 0.1, 0] });
  }
  const o = s.build();
  o.name = 'scaffold';
  return o;
}

/** Wreckage shown on a badly damaged building. */
function damageModel(size: number, wild: boolean): THREE.Object3D {
  const s = new Sculpt();
  const r = rand(size * 17 + (wild ? 5 : 0));
  const e = size / 2;
  for (let i = 0; i < size * 4; i++) {
    const side = Math.floor(r() * 4);
    const t = (r() - 0.5) * size * 0.9;
    const x = side < 2 ? t : (side === 2 ? -1 : 1) * (e - 0.1);
    const z = side < 2 ? (side === 0 ? -1 : 1) * (e - 0.1) : t;
    if (wild) s.add(blob(0.12 + r() * 0.1, i, 0.35, 0), r() < 0.5 ? '#9a7a3a' : '#7a5a2a', 'matte', { at: [x, 0.06, z], scale: [1.3, 0.45, 1.3] });
    else s.add(blob(0.09 + r() * 0.1, i, 0.3, 0), r() < 0.5 ? '#9a9080' : '#7a7266', 'matte', { at: [x, 0.08, z] });
    if (i % 3 === 0) s.add(rbox(0.5 + r() * 0.3, 0.06, 0.08, 0.01), wild ? '#5a3a20' : '#3a2a1c', 'matte', { at: [x * 0.9, 0.1, z * 0.9], rot: [0, r() * 3, 0.2] });
  }
  if (wild) for (let i = 0; i < 4; i++) s.add(capsule(0.03, 0.5, 4), '#6a4a2a', 'matte', { at: [(r() - 0.5) * size * 0.6, 0.35, e * 0.7], rot: [0.3, 0, (r() - 0.5) * 1.5] });
  const o = s.build();
  o.name = 'damage';
  return o;
}

/** An item on the ground: a loot chest, its gem coloured by tier. */
export const makeGroundItem = FX.chestModel;

export function makeBuilding(type: BuildingType, team: string, size: number, tier = 1): BuildingParts {
  const wild = buildingFaction(type) === 'wild';
  const root = new THREE.Group();
  const blend = staticName(type, tier);
  const model = blend ? makeStatic(blend, team) : (cachedModel(`b|${type}|${team}|${tier}`, () => BUILDING_MODELS[type](team, tier)) as THREE.Group);
  root.add(model);
  const scaffold = cachedModel(`site|${size}|${wild}`, () => siteModel(size, wild));
  const damage = cachedModel(`dmg|${size}|${wild}`, () => damageModel(size, wild));
  damage.visible = false;
  root.add(scaffold, damage);
  return { root, model, scaffold, damage };
}

/** The Blender model for a building at a tier, if there is one (loaded). */
function staticName(type: BuildingType, tier: number): string | null {
  const name = `b_${type}${tier > 1 ? `_${tier}` : ''}`;
  if (hasStatic(name)) return name;
  return hasStatic(`b_${type}`) ? `b_${type}` : null;
}

/** A translucent copy of a building model for placement previews. */
export function makeGhost(type: BuildingType, ghostMat: THREE.Material): THREE.Group {
  const blend = staticName(type, 1);
  const g = blend ? makeStatic(blend, '#ffffff') : BUILDING_MODELS[type]('#ffffff', 1);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.material = ghostMat;
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return g;
}
