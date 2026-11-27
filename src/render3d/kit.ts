// Modelling kit for the painted, classic-RTS look. Parts are built from
// primitives, painted with vertex colours and merged per moving piece (torso,
// a leg, an arm and what it holds), one mesh per finish. A unit is then a
// handful of draw calls however detailed it is, and every model of a kind
// shares one set of geometry (see cachedModel).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { withFog } from './fog';

/** Surface finishes: each is one shared material that reads its colour from the vertices. */
export type Finish = 'matte' | 'cloth' | 'skin' | 'metal' | 'gold' | 'glow';

const FINISHES: Record<Finish, { rough: number; metal: number; glow?: boolean; side?: THREE.Side }> = {
  matte: { rough: 0.8, metal: 0 },
  cloth: { rough: 0.92, metal: 0, side: THREE.DoubleSide },
  skin: { rough: 0.7, metal: 0 },
  metal: { rough: 0.34, metal: 0.62 },
  gold: { rough: 0.3, metal: 0.75 },
  glow: { rough: 0.5, metal: 0, glow: true },
};

const kitMats = new Map<Finish, THREE.MeshStandardMaterial>();
export function kitMaterial(f: Finish): THREE.MeshStandardMaterial {
  let m = kitMats.get(f);
  if (!m) {
    const o = FINISHES[f];
    m = withFog(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: o.rough,
        metalness: o.metal,
        side: o.side ?? THREE.FrontSide,
        // Glowing parts light themselves: the vertex colour drives the emissive term.
        emissive: o.glow ? 0xffffff : 0x000000,
        emissiveIntensity: o.glow ? 0.9 : 0,
      }),
    );
    if (o.glow) {
      m.onBeforeCompile = ((prev) => (shader: THREE.WebGLProgramParametersWithUniforms, r: THREE.WebGLRenderer) => {
        prev.call(m!, shader, r);
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb;');
      })(m.onBeforeCompile);
      m.customProgramCacheKey = () => 'fog-glow';
    }
    kitMats.set(f, m);
  }
  return m;
}
export function isKitMaterial(m: THREE.Material): boolean {
  for (const k of kitMats.values()) if (k === m) return true;
  return false;
}

const tmpColor = new THREE.Color();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

export type V3 = [number, number, number];
export interface Place {
  at?: V3;
  rot?: V3;
  scale?: number | V3;
}

/** Collects painted geometry for one rigid piece, then merges it per finish. */
export class Sculpt {
  private parts = new Map<Finish, THREE.BufferGeometry[]>();

  add(geo: THREE.BufferGeometry, color: string | number, finish: Finish = 'matte', place: Place = {}): this {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const s = place.scale ?? 1;
    tmpS.set(...(typeof s === 'number' ? ([s, s, s] as V3) : s));
    tmpQ.setFromEuler(tmpE.set(...(place.rot ?? [0, 0, 0])));
    tmpP.set(...(place.at ?? [0, 0, 0]));
    g.applyMatrix4(tmpM.compose(tmpP, tmpQ, tmpS));
    tmpColor.set(color).convertSRGBToLinear();
    const n = g.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      c[i * 3] = tmpColor.r;
      c[i * 3 + 1] = tmpColor.g;
      c[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const list = this.parts.get(finish) ?? [];
    list.push(g);
    this.parts.set(finish, list);
    if (g !== geo) geo.dispose();
    return this;
  }

  /** Move another piece's geometry into this one (a rider's legs onto the saddle). */
  absorb(other: Sculpt, place: Place = {}): this {
    const s = place.scale ?? 1;
    tmpS.set(...(typeof s === 'number' ? ([s, s, s] as V3) : s));
    tmpQ.setFromEuler(tmpE.set(...(place.rot ?? [0, 0, 0])));
    tmpP.set(...(place.at ?? [0, 0, 0]));
    tmpM.compose(tmpP, tmpQ, tmpS);
    for (const [f, list] of other.parts) {
      const mine = this.parts.get(f) ?? [];
      for (const g of list) mine.push(g.applyMatrix4(tmpM));
      this.parts.set(f, mine);
    }
    other.parts.clear();
    return this;
  }

  get empty(): boolean {
    return this.parts.size === 0;
  }

  /** One mesh per finish, under a group (or the single mesh itself). */
  build(name = '', shadow = true): THREE.Object3D {
    const meshes: THREE.Mesh[] = [];
    for (const [f, list] of this.parts) {
      const geo = mergeGeometries(list)!;
      for (const g of list) g.dispose();
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, kitMaterial(f));
      m.castShadow = shadow && f !== 'glow';
      m.receiveShadow = shadow;
      meshes.push(m);
    }
    this.parts.clear();
    if (meshes.length === 1 && name) {
      meshes[0].name = name;
      return meshes[0];
    }
    const g = new THREE.Group();
    g.name = name;
    g.add(...meshes);
    return g;
  }
}

/** Mark a model's geometry as shared by every copy, so removing one copy keeps it. */
export function markShared(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.userData.shared = true;
  });
}

const templates = new Map<string, THREE.Object3D>();
/**
 * Build a model once per key and hand out clones that share its geometry and
 * materials. The template's geometry is never disposed.
 */
export function cachedModel(key: string, build: () => THREE.Object3D): THREE.Object3D {
  let t = templates.get(key);
  if (!t) {
    t = build();
    markShared(t);
    templates.set(key, t);
  }
  return t.clone(true);
}

// ---- shapes -----------------------------------------------------------------

export const rand = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
};

/** A turned profile: [radius, height] pairs from bottom to top. */
export function lathe(profile: Array<[number, number]>, segs = 10): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)),
    segs,
  );
}

export const capsule = (r: number, len: number, segs = 6) => new THREE.CapsuleGeometry(r, len, 2, segs);
export const ball = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
export const cyl = (rt: number, rb: number, h: number, segs = 8) => new THREE.CylinderGeometry(rt, rb, h, segs);
export const cone = (r: number, h: number, segs = 8) => new THREE.ConeGeometry(r, h, segs);
export const cube = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** A rounded box: the chunky, bevelled blocks of the painted style. */
export function rbox(w: number, h: number, d: number, r = 0.04): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const x = w / 2 - r;
  const y = h / 2 - r;
  s.moveTo(-x, -h / 2);
  s.lineTo(x, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -y);
  s.lineTo(w / 2, y);
  s.quadraticCurveTo(w / 2, h / 2, x, h / 2);
  s.lineTo(-x, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, y);
  s.lineTo(-w / 2, -y);
  s.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelSize: r * 0.8, bevelThickness: r, bevelSegments: 2, curveSegments: 3 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  return g;
}

/** A lumpy rock or foliage clump: an icosphere pushed about by seeded noise. */
export function blob(r: number, seed: number, rough = 0.25, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const rnd = rand(seed * 7919 + 13);
  const offs = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = offs.get(key);
    if (k === undefined) {
      k = 1 + (rnd() - 0.5) * 2 * rough;
      offs.set(key, k);
    }
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A flat outline extruded with a bevel (shields, blades, emblems, leaves). */
export function slab(points: Array<[number, number]>, depth: number, bevel = 0.015, curve = false): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  if (curve) s.splineThru(points.slice(1).map(([x, y]) => new THREE.Vector2(x, y)));
  else for (const [x, y] of points.slice(1)) s.lineTo(x, y);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** A kite shield outline (point down), facing +Z. */
export function kiteShield(w: number, h: number, depth = 0.05): THREE.BufferGeometry {
  return slab(
    [
      [0, -h / 2],
      [w * 0.42, -h * 0.05],
      [w / 2, h * 0.38],
      [w * 0.3, h / 2],
      [-w * 0.3, h / 2],
      [-w / 2, h * 0.38],
      [-w * 0.42, -h * 0.05],
      [0, -h / 2],
    ],
    depth,
    0.02,
    true,
  );
}

/** A small crown: a gold band with points. */
export function crownGeo(r: number, h: number): THREE.BufferGeometry {
  const parts = [cyl(r, r * 0.95, h * 0.45, 10).translate(0, h * 0.22, 0)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(cone(r * 0.22, h * 0.6, 4).translate(Math.sin(a) * r * 0.9, h * 0.7, Math.cos(a) * r * 0.9));
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()))!;
}

/** A hanging cloth (cape, tabard, banner): a bent strip, ragged at the hem if asked. */
export function cloth(w: number, h: number, bend = 0.12, ragged = 0, seed = 1): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, 6, 4);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const rnd = rand(seed);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const t = (h / 2 - y) / h; // 0 at the top, 1 at the hem
    const z = -Math.cos((x / w) * Math.PI) * bend - t * bend * 0.8;
    const hem = y < -h / 2 + 0.001 && ragged ? rnd() * ragged : 0;
    p.setXYZ(i, x * (1 + t * 0.25), y + hem, z);
  }
  g.translate(0, -h / 2, 0);
  g.computeVertexNormals();
  return g;
}

/** Leaves fanned out: a clump of flat leaf shapes (Thornwild capes, shoulder plates). */
export function leafFan(n: number, len: number, width: number, spread: number, seed = 1): THREE.BufferGeometry {
  const leaf = slab(
    [
      [0, 0],
      [width / 2, len * 0.35],
      [width * 0.35, len * 0.75],
      [0, len],
      [-width * 0.35, len * 0.75],
      [-width / 2, len * 0.35],
      [0, 0],
    ],
    0.01,
    0,
    true,
  );
  const rnd = rand(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (n === 1 ? 0 : i / (n - 1) - 0.5) * spread;
    const g = leaf.clone();
    g.rotateX(-0.3 - rnd() * 0.2);
    g.rotateZ(a + (rnd() - 0.5) * 0.15);
    parts.push(g.toNonIndexed());
  }
  leaf.dispose();
  return mergeGeometries(parts)!;
}
