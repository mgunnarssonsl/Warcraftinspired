// Figures for the painted style: a shared humanoid skeleton (torso and head,
// two legs, two arms) whose pieces are painted Sculpts, assembled under pivot
// groups so the renderer can walk, swing, draw and cast with them.
//
// Units face +Z. Body-local units: a figure stands about 0.8 tall before its
// body scale; the right arm (the one that holds the weapon or tool) is the
// "tool" pivot at the shoulder on +X.

import * as THREE from 'three';
import { Sculpt, ball, capsule, cachedModel, cloth, cyl, lathe, rbox, type Finish } from './kit';

export interface UnitParts {
  root: THREE.Group;
  body: THREE.Group; // bobs while walking
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  /** Right arm: holds the weapon or tool, swings to strike and work. */
  tool: THREE.Object3D;
  /** Left arm (shield, bow or empty hand); swings while walking. */
  armL?: THREE.Object3D;
  /** Hind legs of a mount, moving with the opposite front leg. */
  hindL?: THREE.Object3D;
  hindR?: THREE.Object3D;
  pickHead: THREE.Object3D;
  axeHead: THREE.Object3D;
  hammerHead: THREE.Object3D;
  goldSack: THREE.Object3D;
  logs: THREE.Object3D[];
  /** A bow in the left hand, kept upright whatever the arm does. */
  bow?: THREE.Object3D;
  /** A banner, pennant or plume that sways, if any. */
  flag?: THREE.Object3D;
  /** How it attacks, for its animation. */
  style?: 'melee' | 'bow' | 'staff' | 'siege' | 'throw' | 'beast';
}

export const HIP_Y = 0.3;
export const SHOULDER_Y = 0.57;
export const SHOULDER_X = 0.165;

export interface Look {
  skin?: string;
  hair?: string;
  beard?: string;
  shirt: string;
  /** Second torso colour: a tabard, apron or bodice over the shirt. */
  over?: string;
  overFinish?: Finish;
  pants: string;
  boots: string;
  belt?: string;
  buckle?: string;
  sleeve?: string;
  glove?: string;
  /** Width of the torso and limbs (1 = average; Laborers and heroes run broad). */
  bulk?: number;
  /** A long robe or skirt hiding the legs. */
  robe?: string;
  /** Pauldrons (shoulder plates). */
  pauldron?: string;
  pauldronFinish?: Finish;
  /** Breastplate. */
  plate?: string;
}

/** A figure under construction: one Sculpt per moving piece. */
export class Figure {
  torso = new Sculpt();
  legL = new Sculpt();
  legR = new Sculpt();
  armL = new Sculpt();
  armR = new Sculpt();
  flag = new Sculpt();
  /** Worker tool heads and loads: separate so they can be shown and hidden. */
  extras: Array<{ name: string; sculpt: Sculpt; parent: 'body' | 'tool' | 'armL'; at?: [number, number, number] }> = [];
  flagAt: [number, number, number] = [0, 0, 0];
  constructor(readonly look: Look) {}
}

/** Build the standard body into a figure: legs, torso, head, arms. */
export function humanoid(look: Look): Figure {
  const f = new Figure(look);
  const b = look.bulk ?? 1;
  const skin = look.skin ?? '#eab98e';
  // Legs (hip-local, hanging down from y = 0).
  for (const [s, side] of [
    [f.legL, -1],
    [f.legR, 1],
  ] as const) {
    s.add(capsule(0.058 * b, 0.12), look.pants, 'cloth', { at: [0, -0.08, 0] });
    s.add(capsule(0.05 * b, 0.1), look.pants, 'cloth', { at: [0, -0.19, 0] });
    s.add(lathe([[0.062 * b, 0], [0.07 * b, 0.05], [0.06 * b, 0.1]], 8), look.boots, 'matte', { at: [0, -0.27, 0] });
    s.add(rbox(0.1 * b, 0.05, 0.16, 0.02), look.boots, 'matte', { at: [0, -0.275, 0.025] });
    void side;
  }
  // Torso: hips, chest, belt, neck, head.
  const t = f.torso;
  if (look.robe) {
    t.add(lathe([[0.2 * b, 0.0], [0.17 * b, 0.12], [0.14 * b, 0.3], [0.13 * b, 0.4]], 12), look.robe, 'cloth', { at: [0, 0.02, 0] });
  }
  t.add(lathe([[0.1 * b, 0], [0.12 * b, 0.04], [0.125 * b, 0.1]], 10), look.pants, 'cloth', { at: [0, HIP_Y - 0.03, 0] });
  t.add(lathe([[0.12 * b, 0], [0.135 * b, 0.08], [0.15 * b, 0.17], [0.12 * b, 0.22], [0.06, 0.25]], 10), look.shirt, 'cloth', { at: [0, HIP_Y + 0.06, 0] });
  if (look.over) {
    // A tabard or apron: front and back panels.
    t.add(cloth(0.2 * b, 0.36, 0.035), look.over, look.overFinish ?? 'cloth', { at: [0, SHOULDER_Y - 0.03, 0.142 * b], rot: [0, Math.PI, 0] });
    t.add(cloth(0.2 * b, 0.32, 0.035), look.over, look.overFinish ?? 'cloth', { at: [0, SHOULDER_Y - 0.03, -0.142 * b] });
  }
  if (look.plate) t.add(lathe([[0.13 * b, 0], [0.155 * b, 0.07], [0.15 * b, 0.14], [0.1 * b, 0.18]], 10), look.plate, 'metal', { at: [0, HIP_Y + 0.14, -0.004], scale: [1, 1, 0.88] });
  t.add(cyl(0.128 * b, 0.128 * b, 0.04, 10), look.belt ?? '#5b3a20', 'matte', { at: [0, HIP_Y + 0.07, 0] });
  if (look.buckle) t.add(rbox(0.05, 0.04, 0.02, 0.006), look.buckle, 'gold', { at: [0, HIP_Y + 0.07, 0.13 * b] });
  t.add(cyl(0.04, 0.045, 0.05, 8), skin, 'skin', { at: [0, SHOULDER_Y + 0.03, 0] });
  // A big, readable head.
  t.add(ball(0.088, 12, 10), skin, 'skin', { at: [0, SHOULDER_Y + 0.12, 0.005] });
  t.add(ball(0.018, 6, 4), skin, 'skin', { at: [0, SHOULDER_Y + 0.115, 0.09] }); // nose
  if (look.hair) t.add(ball(0.091, 12, 8), look.hair, 'matte', { at: [0, SHOULDER_Y + 0.135, -0.012], scale: [1, 0.85, 1] });
  if (look.beard) t.add(lathe([[0.06, 0], [0.07, 0.03], [0.05, 0.07], [0.0, 0.08]], 8), look.beard, 'matte', { at: [0, SHOULDER_Y + 0.025, 0.05], rot: [0.35, 0, 0], scale: [1, 1, 0.7] });
  if (look.pauldron)
    for (const x of [-1, 1]) t.add(ball(0.075 * b, 10, 6, ), look.pauldron, look.pauldronFinish ?? 'metal', { at: [x * (SHOULDER_X + 0.01), SHOULDER_Y + 0.0, 0], scale: [1.15, 0.7, 1.05] });
  // Arms (shoulder-local, hanging down from y = 0), the hand at y ~ -0.27.
  for (const s of [f.armL, f.armR]) {
    s.add(ball(0.055 * b, 8, 6), look.sleeve ?? look.shirt, 'cloth');
    s.add(capsule(0.045 * b, 0.1), look.sleeve ?? look.shirt, 'cloth', { at: [0, -0.08, 0] });
    s.add(capsule(0.04 * b, 0.09), look.glove ?? skin, look.glove ? 'matte' : 'skin', { at: [0, -0.19, 0.01] });
    s.add(ball(0.045 * b, 8, 6), look.glove ?? skin, look.glove ? 'matte' : 'skin', { at: [0, -0.27, 0.015] });
  }
  return f;
}

/** Turn a figure into the posable model: pivots for each piece under a scaled body. */
export function assemble(f: Figure, scale: number, style: UnitParts['style'] = 'melee'): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  body.scale.setScalar(scale);
  root.add(body);
  body.add(f.torso.build('torso'));
  const pivot = (name: string, s: Sculpt, at: [number, number, number]) => {
    const p = new THREE.Group();
    p.name = name;
    p.position.set(...at);
    if (!s.empty) p.add(s.build());
    body.add(p);
    return p;
  };
  pivot('legL', f.legL, [-0.075 * (f.look.bulk ?? 1), HIP_Y, 0]);
  pivot('legR', f.legR, [0.075 * (f.look.bulk ?? 1), HIP_Y, 0]);
  const sx = SHOULDER_X * (f.look.bulk ?? 1);
  const armL = pivot('armL', f.armL, [-sx, SHOULDER_Y - 0.02, 0]);
  const tool = pivot('tool', f.armR, [sx, SHOULDER_Y - 0.02, 0]);
  if (!f.flag.empty) pivot('flag', f.flag, f.flagAt);
  for (const e of f.extras) {
    const o = e.sculpt.build(e.name);
    o.name = e.name;
    if (e.at) o.position.set(...e.at);
    (e.parent === 'tool' ? tool : e.parent === 'armL' ? armL : body).add(o);
  }
  root.userData.style = style;
  return root;
}

/** Clone a cached model and find its posable parts by name. */
export function partsOf(root: THREE.Group): UnitParts {
  const find = (n: string) => root.getObjectByName(n);
  const none = () => new THREE.Object3D();
  const logs: THREE.Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const l = find(`log${i}`);
    if (l) logs.push(l);
  }
  return {
    root,
    body: find('body') as THREE.Group,
    legL: find('legL') ?? none(),
    legR: find('legR') ?? none(),
    tool: find('tool') ?? none(),
    armL: find('armL'),
    hindL: find('hindL'),
    hindR: find('hindR'),
    pickHead: find('pick') ?? none(),
    axeHead: find('axe') ?? none(),
    hammerHead: find('hammer') ?? none(),
    goldSack: find('sack') ?? none(),
    logs,
    flag: find('flag'),
    bow: find('bow'),
    style: root.userData.style,
  };
}

export function cachedUnit(key: string, build: () => THREE.Group): UnitParts {
  return partsOf(cachedModel(key, build) as THREE.Group);
}
