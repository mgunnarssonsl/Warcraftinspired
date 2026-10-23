import { describe, expect, it } from 'vitest';
import { CameraRig } from '../src/render3d/cameraRig';

function rig(): CameraRig {
  const r = new CameraRig(96, 72);
  r.resize(1280, 640);
  r.centerOn(30, 40);
  return r;
}

describe('camera rig coordinate conversion', () => {
  it('screenToGround inverts project for ground points at every zoom level', () => {
    const r = rig();
    for (const dist of [10, 21, 35, 48]) {
      r.distance = dist;
      r.apply();
      for (const [x, y] of [[30, 40], [24, 36], [37, 44], [29.3, 38.8]]) {
        const s = r.project(x, y, 0);
        const g = r.screenToGround(s.x, s.y)!;
        expect(g.x).toBeCloseTo(x, 4);
        expect(g.y).toBeCloseTo(y, 4);
      }
    }
  });

  it('looks at its target: the screen centre maps to the target point', () => {
    const r = rig();
    const g = r.screenToGround(640, 320)!;
    expect(g.x).toBeCloseTo(30, 4);
    expect(g.y).toBeCloseTo(40, 4);
  });

  it('is angled: the far (top) edge of the view covers more ground than the near edge', () => {
    const r = rig();
    const tl = r.screenToGround(0, 0)!;
    const tr = r.screenToGround(1280, 0)!;
    const bl = r.screenToGround(0, 640)!;
    const br = r.screenToGround(1280, 640)!;
    expect(tr.x - tl.x).toBeGreaterThan(br.x - bl.x);
    expect(tl.y).toBeLessThan(bl.y); // screen up = north (smaller y)
  });

  it('zooming keeps the ground point under the cursor fixed', () => {
    const r = rig();
    const before = r.screenToGround(300, 200)!;
    r.zoomAt(300, 200, 1.4);
    const after = r.screenToGround(300, 200)!;
    expect(after.x).toBeCloseTo(before.x, 3);
    expect(after.y).toBeCloseTo(before.y, 3);
  });

  it('panning right/down moves the view east/south and stays inside the map', () => {
    const r = rig();
    r.pan(200, 100);
    expect(r.tx).toBeGreaterThan(30);
    expect(r.ty).toBeGreaterThan(40);
    r.pan(1e6, 1e6);
    expect(r.tx).toBeLessThanOrEqual(96);
    expect(r.ty).toBeLessThanOrEqual(74);
  });
});
