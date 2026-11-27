// Static models made in Blender (buildings, mines): public/models/b_<type>[_<tier>].glb.
// Each is merged into one vertex-coloured mesh per finish (the team-coloured
// parts recoloured per owner), so a whole building is a few draw calls, and
// copies share geometry.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { kitMaterial, type Finish } from './kit';

/** Building models that exist (file names without .glb). */
export const STATIC_MODELS = [
  'b_hq',
  'b_hq_2',
  'b_hq_3',
  'b_farm',
  'b_barracks',
  'b_lumbermill',
  'b_tower',
  'b_altar',
  'b_smithy',
  'b_chapel',
  'b_workshop',
  'b_shop',
  'b_fountain',
  'b_heartwood',
  'b_heartwood_2',
  'b_heartwood_3',
  'b_grove',
  'b_saplodge',
  'b_den',
  'b_spire',
  'b_circle',
  'b_barkweaver',
  'b_moonwell',
  'b_rootpit',
  'm_tiny',
  'm_small',
  'm_start',
  'm_standard',
  'm_rich',
  'm_depleted',
];

const loaded = new Map<string, THREE.Group>();
const templates = new Map<string, THREE.Group>();

export function loadStaticModels(names: string[], done: () => void): void {
  const loader = new GLTFLoader();
  let left = names.length;
  if (!left) return done();
  for (const n of names) {
    loader.load(
      `models/${n}.glb`,
      (g) => {
        loaded.set(n, g.scene);
        if (--left === 0) done();
      },
      undefined,
      () => {
        if (--left === 0) done();
      },
    );
  }
}

export function hasStatic(name: string): boolean {
  return loaded.has(name);
}

function finishOf(name: string, team: THREE.Color): { finish: Finish; color: THREE.Color } {
  if (name === 'team') return { finish: 'cloth', color: team };
  if (name === 'team_dark') return { finish: 'cloth', color: team.clone().multiplyScalar(0.74) };
  if (name === 'team_light') return { finish: 'cloth', color: team.clone().lerp(new THREE.Color(1, 1, 1), 0.1) };
  const [f, hex] = name.split('#');
  const finish = (['metal', 'gold', 'glow', 'matte'].includes(f) ? f : 'matte') as Finish;
  return { finish, color: new THREE.Color(`#${(hex ?? 'ffffff').slice(0, 6)}`) };
}

/** Nodes kept as separate pieces (shown and hidden by the game): mine gold piles. */
const KEEP = /^nugget\d+$/;

function convert(src: THREE.Group, teamHex: string): THREE.Group {
  const team = new THREE.Color(teamHex);
  src.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(src.matrixWorld).invert();
  const groups = new Map<string, Map<Finish, THREE.BufferGeometry[]>>();
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    let k: THREE.Object3D | null = m;
    while (k && !KEEP.test(k.name)) k = k.parent;
    const byFinish = groups.get(k?.name ?? '') ?? new Map<Finish, THREE.BufferGeometry[]>();
    groups.set(k?.name ?? '', byFinish);
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const { finish, color } = finishOf(mats[0].name, team);
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, m.matrixWorld));
    const n = g.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      c[i * 3] = color.r;
      c[i * 3 + 1] = color.g;
      c[i * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const list = byFinish.get(finish) ?? [];
    list.push(g);
    byFinish.set(finish, list);
  });
  const root = new THREE.Group();
  for (const [name, byFinish] of groups) {
    const holder = name ? new THREE.Group() : root;
    holder.name = name;
    if (name) root.add(holder);
    for (const [finish, list] of byFinish) {
      const geo = mergeGeometries(list)!;
      for (const g of list) g.dispose();
      geo.computeBoundingSphere();
      geo.userData.shared = true;
      const mesh = new THREE.Mesh(geo, kitMaterial(finish));
      mesh.castShadow = finish !== 'glow';
      mesh.receiveShadow = true;
      holder.add(mesh);
    }
  }
  // Marker nodes (a mine's mouth) keep their place.
  src.traverse((o) => {
    if (o.name === 'mouth') {
      const mk = new THREE.Object3D();
      mk.name = 'mouth';
      mk.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld));
      root.add(mk);
    }
  });
  return root;
}

/** A Blender gold mine: the gold piles (by what is left) and the lantern-lit mouth. */
export function makeMineStatic(look: string): { root: THREE.Group; nuggets: THREE.Object3D[]; glow: THREE.Mesh } {
  const root = makeStatic(`m_${look}`, '#ffffff');
  const nuggets = root.children.filter((c) => KEEP.test(c.name)).sort((a, b) => a.name.localeCompare(b.name));
  const big = look === 'rich' ? 1.15 : look === 'tiny' ? 0.72 : look === 'small' ? 0.85 : 1;
  const ew = 0.78 * Math.max(0.85, big);
  const eh = 0.88 * Math.max(0.85, big);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(ew - 0.15, eh - 0.1), new THREE.MeshBasicMaterial({ color: '#1b1410' }));
  const mouth = root.getObjectByName('mouth');
  if (mouth) glow.position.copy(mouth.position).add(new THREE.Vector3(0, 0, 0.06));
  root.add(glow);
  return { root, nuggets, glow };
}

/** A copy of a static model in a team colour (shared geometry). */
export function makeStatic(name: string, team: string): THREE.Group {
  const key = `${name}|${team}`;
  let t = templates.get(key);
  if (!t) {
    t = convert(loaded.get(name)!, team);
    templates.set(key, t);
  }
  return t.clone(true);
}
