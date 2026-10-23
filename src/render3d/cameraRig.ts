// Elevated, angled RTS camera. It orbits a ground target at a fixed heading
// (looking "north", toward -Z) and tilts slightly flatter as it zooms in.
//
// Coordinate convention shared by the whole 3D client:
//   simulation (x, y) in tiles  <->  world (X = x, Y = height, Z = y)

import * as THREE from 'three';

const MIN_DIST = 10;
const MAX_DIST = 48;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** Ground point the camera looks at (simulation coordinates). */
  tx = 0;
  ty = 0;
  distance = 21;
  viewW = 800;
  viewH = 600;
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private v = new THREE.Vector3();

  constructor(
    private mapW: number,
    private mapH: number,
  ) {
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 400);
    this.apply();
  }

  /** Pitch from horizontal: ~50° zoomed in, ~62° zoomed out. */
  get pitch(): number {
    const t = (this.distance - MIN_DIST) / (MAX_DIST - MIN_DIST);
    return THREE.MathUtils.degToRad(50 + 12 * t);
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.apply();
  }

  apply(): void {
    this.clamp();
    const p = this.pitch;
    const cam = this.camera;
    cam.position.set(this.tx, Math.sin(p) * this.distance, this.ty + Math.cos(p) * this.distance);
    cam.lookAt(this.tx, 0, this.ty);
    cam.updateMatrixWorld();
  }

  private clamp(): void {
    this.tx = THREE.MathUtils.clamp(this.tx, 0, this.mapW);
    this.ty = THREE.MathUtils.clamp(this.ty, 2, this.mapH + 2);
    this.distance = THREE.MathUtils.clamp(this.distance, MIN_DIST, MAX_DIST);
  }

  centerOn(x: number, y: number): void {
    this.tx = x;
    this.ty = y;
    this.apply();
  }

  /** Ground distance covered by one screen pixel near the view center. */
  private unitsPerPixel(): number {
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    return (2 * this.distance * Math.tan(fov / 2)) / this.viewH;
  }

  /** Pan by a screen-space delta in pixels. */
  pan(dxPx: number, dyPx: number): void {
    const k = this.unitsPerPixel();
    this.tx += dxPx * k;
    // Screen "down" maps to +Z, stretched by the tilt.
    this.ty += (dyPx * k) / Math.sin(this.pitch);
    this.apply();
  }

  /** Zoom, keeping the ground point under the cursor fixed where possible. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToGround(sx, sy);
    this.distance /= factor;
    this.apply();
    const after = this.screenToGround(sx, sy);
    if (before && after) {
      this.tx += before.x - after.x;
      this.ty += before.y - after.y;
      this.apply();
    }
  }

  /** Normalized device coordinates for a screen pixel. */
  ndc(sx: number, sy: number): THREE.Vector2 {
    return new THREE.Vector2((sx / this.viewW) * 2 - 1, -(sy / this.viewH) * 2 + 1);
  }

  raycaster(sx: number, sy: number): THREE.Raycaster {
    this.ray.setFromCamera(this.ndc(sx, sy), this.camera);
    return this.ray;
  }

  /** Screen pixel -> simulation ground point (null if the ray misses the ground). */
  screenToGround(sx: number, sy: number): { x: number; y: number } | null {
    const hit = this.raycaster(sx, sy).ray.intersectPlane(this.ground, this.v);
    return hit ? { x: hit.x, y: hit.z } : null;
  }

  /** Simulation point at height h -> screen pixel. */
  project(x: number, y: number, h = 0): { x: number; y: number; visible: boolean } {
    this.v.set(x, h, y).project(this.camera);
    return {
      x: ((this.v.x + 1) / 2) * this.viewW,
      y: ((1 - this.v.y) / 2) * this.viewH,
      visible: this.v.z > -1 && this.v.z < 1,
    };
  }
}
