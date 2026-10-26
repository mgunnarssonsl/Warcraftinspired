import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeBuilding, makeUnit } from '../src/render3d/models';
import { BUILDABLE, type UnitType } from '../src/sim/config';

const TEAM = '#3a7bd5';
const PLAYER: UnitType[] = ['worker', 'guard', 'archer', 'lancer', 'cleric', 'mangonel', 'outrider', 'hero', 'ranger', 'sage'];
const HEROES: UnitType[] = ['hero', 'ranger', 'sage'];
const FOOT: UnitType[] = ['worker', 'guard', 'archer', 'cleric'];

function size(type: UnitType): THREE.Vector3 {
  const p = makeUnit(type, TEAM);
  p.root.updateMatrixWorld(true);
  // The outline of the figure itself: a hero's halo lies flat on the ground.
  const box = new THREE.Box3();
  p.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.name !== 'halo') box.expandByObject(o);
  });
  return box.getSize(new THREE.Vector3());
}

/** Every material colour used in a model. */
function colours(root: THREE.Object3D): Set<string> {
  const out = new Set<string>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m?.color) out.add(`#${m.color.getHexString()}`);
  });
  return out;
}

describe('unit silhouettes', () => {
  const s = Object.fromEntries(PLAYER.map((t) => [t, size(t)])) as Record<UnitType, THREE.Vector3>;

  it('every pair of your unit types differs in outline (width, height or length) by at least 8%', () => {
    for (let i = 0; i < PLAYER.length; i++)
      for (let j = i + 1; j < PLAYER.length; j++) {
        const [a, b] = [s[PLAYER[i]], s[PLAYER[j]]];
        const diff = Math.max(...(['x', 'y', 'z'] as const).map((k) => Math.abs(a[k] - b[k]) / Math.max(a[k], b[k])));
        expect(diff, `${PLAYER[i]} vs ${PLAYER[j]}`).toBeGreaterThanOrEqual(0.08);
      }
  });

  it('roles read from the shape: heroes stand tallest, riders are longest, siege is widest', () => {
    const tallestFoot = Math.max(...FOOT.map((t) => s[t].y));
    for (const h of HEROES) expect(s[h].y).toBeGreaterThan(tallestFoot * 1.25);
    for (const r of ['lancer', 'outrider'] as const) for (const f of FOOT) expect(s[r].z).toBeGreaterThan(s[f].z * 1.4);
    for (const t of PLAYER.filter((x) => !HEROES.includes(x) && x !== 'mangonel')) expect(s.mangonel.x).toBeGreaterThan(s[t].x);
  });

  it('every unit and building carries the team colour; heroes and riders a waving banner', () => {
    for (const t of PLAYER) expect(colours(makeUnit(t, TEAM).root), t).toContain(TEAM);
    for (const b of BUILDABLE) expect(colours(makeBuilding(b, TEAM, 3).root), b).toContain(TEAM);
    for (const t of [...HEROES, 'lancer', 'outrider'] as UnitType[]) expect(makeUnit(t, TEAM).flag, t).toBeDefined();
  });

  it('each way of attacking has its own animation', () => {
    expect(['archer', 'ranger'].map((t) => makeUnit(t as UnitType, TEAM).style)).toEqual(['bow', 'bow']);
    expect(['cleric', 'sage'].map((t) => makeUnit(t as UnitType, TEAM).style)).toEqual(['staff', 'staff']);
    expect(makeUnit('mangonel', TEAM).style).toBe('siege');
    expect(makeUnit('guard', TEAM).style ?? 'melee').toBe('melee');
  });
});
