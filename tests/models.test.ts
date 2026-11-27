import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONFIG, type UnitType } from '../src/sim/config';
import { GLTF_UNITS } from '../src/render3d/gltfUnits';

/** The JSON chunk of a .glb file. */
function gltfJson(path: string): { animations?: Array<{ name: string }>; nodes?: Array<{ name?: string }>; materials?: Array<{ name?: string }> } {
  const buf = readFileSync(path);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

describe('Blender unit models', () => {
  const types = Object.keys(CONFIG.units) as UnitType[];

  it('every unit type has a model, with idle, walk and attack clips', () => {
    for (const t of types) {
      expect(GLTF_UNITS[t], t).toBeGreaterThan(0);
      const j = gltfJson(`public/models/${t}.glb`);
      const clips = (j.animations ?? []).map((a) => a.name);
      for (const c of ['idle', 'walk', 'attack']) expect(clips, `${t} ${c}`).toContain(c);
    }
  });

  it('Laborers and Tenders can work, and show the tool and load for the job', () => {
    for (const t of ['worker', 'tender'] as UnitType[]) {
      const j = gltfJson(`public/models/${t}.glb`);
      expect((j.animations ?? []).map((a) => a.name)).toContain('work');
      const names = (j.nodes ?? []).map((n) => n.name);
      for (const n of ['pick', 'axe', 'hammer', 'sack', 'log0', 'log1', 'log2']) expect(names, `${t} ${n}`).toContain(n);
    }
  });

  it('every player unit carries the team colour', () => {
    for (const t of types.filter((x) => !['brigand', 'poacher', 'chief', 'brute', 'wolf'].includes(x))) {
      const mats = (gltfJson(`public/models/${t}.glb`).materials ?? []).map((m) => m.name);
      expect(mats.some((m) => m?.startsWith('team')), t).toBe(true);
    }
  });
});
