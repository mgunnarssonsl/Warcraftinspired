// Unit models made in Blender (scripts/models, public/models/<type>.glb).
//
// Each model is a tree of pivots (hips, chest, upper arms, forearms, thighs,
// shins...) with rigid parts under them and animation clips (idle, walk,
// attack, and work or cast for some). On load, every pivot's parts are merged
// per finish into one vertex-coloured mesh using the shared kit materials, so
// a detailed model is still only a few draw calls; materials named "team" and
// "team_dark" take the owner's colour. Copies share geometry.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { UnitType } from '../sim/config';
import { kitMaterial, type Finish } from './kit';
import { UNIT_SIZE, type UnitParts } from './rig';

/** Models that exist, and how tall each stands (in tiles, before UNIT_SIZE). */
export const GLTF_UNITS: Partial<Record<UnitType, number>> = {
  worker: 1.62,
  guard: 1.75,
  archer: 1.68,
  cleric: 1.68,
  lancer: 1.62,
  outrider: 1.58,
  mangonel: 1.5,
  hero: 1.95,
  ranger: 1.9,
  sage: 1.9,
  tender: 1.62,
  thornguard: 1.75,
  slinger: 1.66,
  fox: 2.3,
  stagrider: 1.6,
  mender: 1.68,
  rootcrusher: 2.05,
  warden: 2.0,
  huntress: 1.92,
  speaker: 1.92,
  brigand: 1.72,
  poacher: 1.66,
  chief: 2.0,
  brute: 2.1,
  wolf: 1.05,
  musketeer: 1.72,
  warbear: 2.05,
  sentinel: 1.8,
  bearwarden: 1.78,
  bearrider: 1.95,
  naturewolf: 1.75,
  barksentinel: 1.75,
  wolfkeeper: 1.72,
  wolfrider: 1.62,
  shifter: 1.78,
  panther: 1.85,
};

interface Loaded {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}
const loaded = new Map<UnitType, Loaded>();
const templates = new Map<string, THREE.Group>();

/** Load every model; `done` runs once they are all in (or failed: those keep the old models). */
export function loadUnitModels(done: () => void): void {
  const loader = new GLTFLoader();
  const types = Object.keys(GLTF_UNITS) as UnitType[];
  let left = types.length;
  if (!left) return done();
  for (const t of types) {
    loader.load(
      `models/${t}.glb`,
      (g) => {
        loaded.set(t, { scene: g.scene, clips: g.animations });
        if (--left === 0) done();
      },
      undefined,
      () => {
        if (--left === 0) done();
      },
    );
  }
}

export function hasGltfUnit(t: UnitType): boolean {
  return loaded.has(t);
}


/** The finish and colour a Blender material name stands for. */
function finishOf(name: string, team: THREE.Color, teamDark: THREE.Color): { finish: Finish; color: THREE.Color } {
  if (name === 'team') return { finish: 'cloth', color: team };
  if (name === 'team_dark') return { finish: 'cloth', color: teamDark };
  const [f, hex] = name.split('#');
  const finish = (['metal', 'gold', 'glow', 'matte'].includes(f) ? f : 'matte') as Finish;
  return { finish, color: new THREE.Color(`#${(hex ?? 'ffffff').slice(0, 6)}`) };
}

/**
 * One skinned mesh per finish for the whole model: every part is tied fully
 * to the pivot it hangs from, so joints still bend while the unit costs only
 * a few draw calls.
 */
function convert(src: THREE.Group, teamHex: string): THREE.Group {
  const root = src.clone(true);
  const team = new THREE.Color(teamHex);
  const teamDark = team.clone().multiplyScalar(0.62);
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  // Every pivot becomes a bone.
  const bones: THREE.Object3D[] = [];
  const boneIndex = new Map<THREE.Object3D, number>();
  const pivotOf = (m: THREE.Mesh) => {
    let p = m.parent!;
    if (isPartGroup(p) && p.parent) p = p.parent;
    return p;
  };
  for (const m of meshes) {
    const p = pivotOf(m);
    if (!boneIndex.has(p)) {
      boneIndex.set(p, bones.length);
      bones.push(p);
    }
  }
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byFinish = new Map<Finish, THREE.BufferGeometry[]>();
  for (const m of meshes) {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const { finish, color } = finishOf(mats[0].name, team, teamDark);
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    // Into the model's space, in the rest pose.
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, m.matrixWorld));
    const n = g.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const bi = boneIndex.get(pivotOf(m))!;
    for (let i = 0; i < n; i++) {
      c[i * 3] = color.r;
      c[i * 3 + 1] = color.g;
      c[i * 3 + 2] = color.b;
      si[i * 4] = bi;
      sw[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    const list = byFinish.get(finish) ?? [];
    list.push(g);
    byFinish.set(finish, list);
  }
  for (const m of meshes) m.removeFromParent();
  const empties: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o !== root && isPartGroup(o) && o.children.length === 0) empties.push(o);
  });
  for (const e of empties) e.removeFromParent();
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones as THREE.Bone[]);
  for (const [finish, list] of byFinish) {
    const geo = mergeGeometries(list)!;
    for (const g of list) g.dispose();
    geo.computeBoundingSphere();
    // Room for the poses: limbs swing out of the rest-pose bounds.
    geo.boundingSphere!.radius *= 1.6;
    geo.userData.shared = true;
    const mesh = new THREE.SkinnedMesh(geo, skinnedMaterial(finish));
    mesh.castShadow = finish !== 'glow';
    mesh.receiveShadow = true;
    mesh.userData.part = true;
    root.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
  }
  return root;
}

/** The kit materials, as used by skinned meshes (same look; cached per finish). */
const skinnedMats = new Map<Finish, THREE.Material>();
function skinnedMaterial(f: Finish): THREE.Material {
  let m = skinnedMats.get(f);
  if (!m) {
    m = kitMaterial(f);
    skinnedMats.set(f, m);
  }
  return m;
}

/** A glTF node that only holds a multi-material mesh's parts. */
function isPartGroup(o: THREE.Object3D): boolean {
  // GLTFLoader turns a mesh with several materials into a group of meshes named after it.
  return o.type === 'Group' && !!o.children.length && o.children.every((c) => (c as THREE.Mesh).isMesh && c.name.startsWith(o.name));
}

export interface GltfUnitParts extends UnitParts {
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<'idle' | 'walk' | 'attack' | 'work' | 'cast' | 'reload', THREE.AnimationAction>>;
  current?: THREE.AnimationAction;
  /** When the last blow landed (seconds), to play the follow-through. */
  struckAt: number;
}

/** A copy of a Blender unit, posable and animated. */
export function makeGltfUnit(type: UnitType, team: string): GltfUnitParts {
  const src = loaded.get(type)!;
  const key = `${type}|${team}`;
  let tpl = templates.get(key);
  if (!tpl) {
    tpl = convert(src.scene, team);
    templates.set(key, tpl);
  }
  const model = cloneSkinned(tpl) as THREE.Group;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  body.scale.setScalar((GLTF_UNITS[type] ?? 1.5) * UNIT_SIZE);
  body.add(model);
  root.add(body);
  const mixer = new THREE.AnimationMixer(model);
  const actions: GltfUnitParts['actions'] = {};
  for (const clip of src.clips) {
    const a = mixer.clipAction(clip);
    a.enabled = true;
    actions[clip.name as keyof GltfUnitParts['actions']] = a;
  }
  const none = () => new THREE.Object3D();
  const find = (n: string) => model.getObjectByName(n);
  return {
    root,
    body,
    legL: none(),
    legR: none(),
    tool: none(),
    pickHead: find('pick') ?? none(),
    axeHead: find('axe') ?? none(),
    hammerHead: find('hammer') ?? none(),
    goldSack: find('sack') ?? none(),
    logs: [0, 1, 2].map((i) => find(`log${i}`)).filter((o): o is THREE.Object3D => !!o),
    mixer,
    actions,
    struckAt: -10,
  };
}

/**
 * Pose a Blender unit from what it is doing: the clip and the time in it.
 * `swing` is the wind-up progress (0-1) while a blow is coming; the blow lands
 * at 70% of the attack clip.
 */
export function poseGltfUnit(v: GltfUnitParts, state: 'idle' | 'walk' | 'attack' | 'work' | 'cast' | 'reload', now: number, swing: number | null, walkRate: number): void {
  const a = v.actions[state] ?? v.actions.idle;
  if (!a) return;
  if (v.current !== a) {
    v.current?.stop();
    a.play();
    v.current = a;
  }
  const dur = a.getClip().duration;
  let t: number;
  if (state === 'attack') {
    if (swing !== null) {
      t = swing * 0.7 * dur;
      if (swing >= 0.99) v.struckAt = now;
    } else t = Math.min(dur * 0.999, 0.7 * dur + (now - v.struckAt));
  } else if (state === 'walk') t = (now * walkRate) % dur;
  else t = now % dur;
  a.time = t;
  v.mixer.update(0);
}
