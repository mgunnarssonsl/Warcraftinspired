// Three.js view of the simulation. Reads game state each frame (never mutates
// it), keeps one view object per entity, animates units from their orders,
// and answers picking queries for the input layer.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ClientState } from '../input/client';
import { CONFIG, secondsToTicks, type BuildingType } from '../sim/config';
import type { PlacementCheck } from '../sim/construction';
import type { Game } from '../sim/game';
import { hash2 } from '../sim/rng';
import type { Building, Entity, Footprint, GameEvent, ResourceNode, Unit } from '../sim/types';
import { TERRAIN } from '../sim/types';
import { CameraRig } from './cameraRig';
import { FogTexture, withFog } from './fog';
import { paintGround } from './groundTexture';
import {
  makeBuilding,
  makeGhost,
  makeMine,
  makeTreeGeometries,
  makeArrowGeometry,
  makeBoltGeometry,
  makeBoulderGeometry,
  makeHammerGeometry,
  makeUnit,
  type BuildingParts,
  type MineParts,
  type WorkerParts,
} from './models';

interface Marker {
  mesh: THREE.Mesh;
  t0: number;
}
interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t0: number;
  life: number;
  color: THREE.Color;
}

const RING_COLORS = {
  own: '#5dff6a',
  enemy: '#ff5a4a',
  neutral: '#ffe36a',
  hover: '#ffffff',
};
const MAX_PARTICLES = 160;

export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  private sun: THREE.DirectionalLight;
  private units = new Map<number, WorkerParts>();
  private buildings = new Map<number, BuildingParts & { type: BuildingType; tier: number }>();
  private mines = new Map<number, MineParts>();
  private trunks!: THREE.InstancedMesh;
  private canopies!: THREE.InstancedMesh;
  private treeIndex = new Map<number, number>();
  private treeIds: number[] = [];
  private treeShown: number[] = [];
  private shakes = new Map<number, number>();
  private ringGeo = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
  private ringMats = new Map<string, THREE.MeshBasicMaterial>();
  private rings: THREE.Mesh[] = [];
  private markers: Marker[] = [];
  private flashes = new Map<number, number>();
  private particles: Particle[] = [];
  private particleMesh: THREE.InstancedMesh;
  private arrows: THREE.InstancedMesh;
  private hammers: THREE.InstancedMesh;
  private bolts: THREE.InstancedMesh;
  private boulders: THREE.InstancedMesh;
  /** Where each boulder was first seen, for its arc. */
  private boulderFrom = new Map<number, { x: number; y: number }>();
  /** Views of units/buildings that just died, animated out before removal. */
  private dying: Array<{ root: THREE.Object3D; t0: number; building: boolean }> = [];
  private ghosts = new Map<BuildingType, THREE.Group>();
  private ghostOk = new THREE.MeshStandardMaterial({ color: '#7dff8a', emissive: '#1f6a28', transparent: true, opacity: 0.6, depthWrite: false });
  private ghostBad = new THREE.MeshStandardMaterial({ color: '#ff5a4a', emissive: '#6a1f1f', transparent: true, opacity: 0.6, depthWrite: false });
  private previewTiles: THREE.InstancedMesh;
  private pickables: THREE.Object3D[] = [];
  private fog: FogTexture;
  /** Whose eyes the view uses, and whether fog is lifted (end of match, debug). */
  private viewer = 0;
  private reveal = false;
  private rallyFlag = new THREE.Group();
  private rallyCloth: THREE.Mesh;
  private debugTiles: THREE.InstancedMesh | null = null;
  private debugVersion = -1;
  private debugPaths = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false }),
  );
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private e = new THREE.Euler();

  constructor(
    canvas: HTMLCanvasElement,
    private game: Game,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const { width: W, height: H } = game.state.map;
    this.rig = new CameraRig(W, H);
    this.scene.background = new THREE.Color('#a9c2d6');
    this.scene.fog = new THREE.Fog('#a9c2d6', 70, 150);

    this.scene.add(new THREE.HemisphereLight('#dfeeff', '#4d5a3c', 1.4));
    this.sun = new THREE.DirectionalLight('#fff0d8', 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -34;
    sc.right = 34;
    sc.top = 34;
    sc.bottom = -34;
    sc.near = 1;
    sc.far = 140;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.fog = new FogTexture(W, H);
    this.buildTerrain();
    this.buildTrees();

    this.particleMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.06),
      new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      MAX_PARTICLES,
    );
    this.particleMesh.frustumCulled = false;
    this.particleMesh.count = 0;
    this.scene.add(this.particleMesh);

    this.arrows = new THREE.InstancedMesh(makeArrowGeometry(), new THREE.MeshStandardMaterial({ color: '#5b4126' }), 200);
    this.arrows.frustumCulled = false;
    this.arrows.count = 0;
    this.scene.add(this.arrows);
    this.hammers = new THREE.InstancedMesh(
      makeHammerGeometry(),
      new THREE.MeshStandardMaterial({ color: '#d9e4ff', emissive: '#4a6aff', emissiveIntensity: 0.8 }),
      20,
    );
    this.hammers.frustumCulled = false;
    this.hammers.count = 0;
    this.scene.add(this.hammers);
    this.bolts = new THREE.InstancedMesh(
      makeBoltGeometry(),
      new THREE.MeshStandardMaterial({ color: '#d8ffe4', emissive: '#3aff7a', emissiveIntensity: 0.9 }),
      60,
    );
    this.boulders = new THREE.InstancedMesh(makeBoulderGeometry(), new THREE.MeshStandardMaterial({ color: '#7a7468', flatShading: true }), 60);
    for (const m of [this.bolts, this.boulders]) {
      m.frustumCulled = false;
      m.count = 0;
      this.scene.add(m);
    }

    this.rallyFlag.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 5).translate(0, 0.65, 0), new THREE.MeshStandardMaterial({ color: '#5b4126' })));
    this.rallyCloth = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.28, 0.03).translate(0.24, 1.12, 0), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
    this.rallyFlag.add(this.rallyCloth);
    this.rallyFlag.visible = false;
    this.scene.add(this.rallyFlag);

    this.previewTiles = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2),
      // Drawn over everything so blocked tiles stay visible under tall buildings.
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false, depthTest: false }),
      25,
    );
    this.previewTiles.frustumCulled = false;
    this.previewTiles.count = 0;
    this.previewTiles.renderOrder = 10;
    this.scene.add(this.previewTiles);
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.rig.resize(w, h);
  }

  // ---- static world ------------------------------------------------------------

  private buildTerrain(): void {
    const { width: W, height: H, terrain } = this.game.state.map;
    const tex = new THREE.CanvasTexture(paintGround(this.game.state.map, this.game.state.seed));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2).translate(W / 2, 0, H / 2),
      withFog(new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })),
    );
    ground.receiveShadow = true;
    this.scene.add(ground);
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 4, H * 4).rotateX(-Math.PI / 2).translate(W / 2, -0.02, H / 2),
      withFog(new THREE.MeshStandardMaterial({ color: '#2f4424', roughness: 1 })),
    );
    outer.receiveShadow = true;
    this.scene.add(outer);

    // Water surface over lake tiles.
    const quads: THREE.BufferGeometry[] = [];
    const rockSpots: Array<[number, number]> = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const t = terrain[y * W + x];
        if (t === TERRAIN.water) quads.push(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(x + 0.5, 0.05, y + 0.5));
        else if (t === TERRAIN.rock) rockSpots.push([x, y]);
      }
    if (quads.length) {
      const geo = mergeGeometries(quads)!;
      const water = new THREE.Mesh(
        geo,
        withFog(new THREE.MeshStandardMaterial({ color: '#3d78a8', transparent: true, opacity: 0.72, roughness: 0.12, metalness: 0.1 })),
      );
      water.receiveShadow = true;
      this.scene.add(water);
    }

    // Cliff ridges as clusters of low-poly boulders.
    const rocks = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.62, 0),
      withFog(new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.95 })),
      rockSpots.length * 2,
    );
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    let n = 0;
    const col = new THREE.Color();
    const seed = this.game.state.seed;
    for (const [x, y] of rockSpots) {
      for (let k = 0; k < 2; k++) {
        const r = hash2(x * 3 + k, y, seed + 21);
        if (k === 1 && r < 0.45) continue;
        const sx = k === 0 ? 1.05 + r * 0.25 : 0.55 + r * 0.3;
        const sy = k === 0 ? 1.0 + r * 1.1 : 0.7 + r * 0.6;
        this.p.set(x + 0.5 + (r - 0.5) * 0.3 * (k + 1), sy * 0.35, y + 0.5 + (hash2(x, y, seed + 9) - 0.5) * 0.3 * (k + 1));
        this.q.setFromEuler(this.e.set(r * 0.4, r * 6.28, hash2(y, x, seed) * 0.4));
        this.s.set(sx, sy, sx * (0.9 + r * 0.2));
        rocks.setMatrixAt(n, this.m4.compose(this.p, this.q, this.s));
        col.set(['#8a8174', '#7a7266', '#958b7c', '#6f685e'][Math.floor(r * 4)]);
        rocks.setColorAt(n, col);
        n++;
      }
    }
    rocks.count = n;
    this.scene.add(rocks);
  }

  private buildTrees(): void {
    const trees = this.game.resources().filter((r) => r.type === 'tree');
    const { trunk, canopy } = makeTreeGeometries();
    this.trunks = new THREE.InstancedMesh(trunk, withFog(new THREE.MeshStandardMaterial({ color: '#6b4a2b', flatShading: true })), trees.length);
    this.canopies = new THREE.InstancedMesh(
      canopy,
      withFog(new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.9 })),
      trees.length,
    );
    for (const m of [this.trunks, this.canopies]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
      this.pickables.push(m);
    }
    const greens = ['#2f6b3a', '#3a7a40', '#28603a', '#447f45'].map((c) => new THREE.Color(c));
    trees.forEach((t, i) => {
      this.treeIndex.set(t.id, i);
      this.treeIds.push(t.id);
      this.treeShown.push(-1);
      this.canopies.setColorAt(i, greens[Math.floor(hash2(t.tx, t.ty, 31) * greens.length)]);
    });
    this.updateTrees(0);
  }

  private updateTrees(now: number): void {
    let dirty = false;
    for (let i = 0; i < this.treeIds.length; i++) {
      const id = this.treeIds[i];
      const t = this.game.resource(id);
      const shake = this.shakes.get(id);
      const shaking = shake !== undefined && now - shake < 0.3;
      const amount = t ? t.amount : 0;
      if (amount === this.treeShown[i] && !shaking) continue;
      this.treeShown[i] = shaking ? -2 : amount;
      dirty = true;
      if (!t) {
        this.m4.makeScale(0, 0, 0);
      } else {
        const v = hash2(t.tx, t.ty, 77);
        const sc = (0.85 + v * 0.35) * (0.7 + 0.3 * (t.amount / t.maxAmount));
        const lean = shaking ? Math.sin((now - shake!) * 50) * 0.06 : 0;
        this.q.setFromEuler(this.e.set(lean, v * 6.28, lean * 0.5));
        this.p.set(t.x + (v - 0.5) * 0.2, 0, t.y + (hash2(t.ty, t.tx, 5) - 0.5) * 0.2);
        this.s.set(sc, sc * (0.9 + v * 0.25), sc);
        this.m4.compose(this.p, this.q, this.s);
      }
      this.trunks.setMatrixAt(i, this.m4);
      this.canopies.setMatrixAt(i, this.m4);
    }
    if (dirty) {
      this.trunks.instanceMatrix.needsUpdate = true;
      this.canopies.instanceMatrix.needsUpdate = true;
      this.trunks.computeBoundingSphere();
      this.canopies.computeBoundingSphere();
    }
  }

  // ---- feedback ----------------------------------------------------------------

  handleEvents(events: GameEvent[], now: number): void {
    const nav = this.game.nav;
    for (const e of events) {
      if (e.type === 'chop') {
        const id = nav.entityAt[Math.floor(e.y) * nav.w + Math.floor(e.x)];
        if (id) this.shakes.set(id, now);
        this.burst(e.x, 0.9, e.y, 2, '#c8a070', 1.2, now);
      } else if (e.type === 'treeFelled') {
        this.burst(e.x, 0.8, e.y, 10, '#2e6b3a', 2.2, now);
      } else if (e.type === 'mineDepleted') {
        this.burst(e.x, 0.6, e.y, 24, '#8a7c68', 3, now);
      } else if (e.type === 'hit') {
        const t = this.game.get(e.id);
        const unit = !t || t.kind === 'unit';
        this.burst(e.x, unit ? 0.6 : 1.0, e.y, unit ? 4 : 3, unit ? '#d8423a' : '#9a8e7a', 1.4, now);
      } else if (e.type === 'death') {
        this.burst(e.x, 0.5, e.y, 10, '#8a2a22', 1.8, now);
      } else if (e.type === 'buildingDestroyed') {
        this.burst(e.x, 1.0, e.y, 40, '#8d8272', 3.5, now);
        this.burst(e.x, 1.4, e.y, 16, '#3a3028', 2.5, now);
      } else if (e.type === 'levelUp') {
        this.burst(e.x, 1.2, e.y, 30, '#ffd84a', 2.4, now);
      } else if (e.type === 'cast' && e.ability === 'cry') {
        this.burst(e.x, 0.6, e.y, 36, '#ff9a3a', 4.5, now);
      } else if (e.type === 'heal') {
        this.burst(e.x, 0.9, e.y, 6, '#7dff8a', 0.8, now);
      } else if (e.type === 'impact') {
        this.burst(e.x, 0.3, e.y, 18, '#8a7c68', 2.6, now);
        this.burst(e.x, 0.3, e.y, 6, '#ffb060', 1.6, now);
      } else if (e.type === 'cast' && e.ability === 'mend') {
        this.burst(e.x, 0.8, e.y, 20, '#7dff8a', 1.6, now);
      } else if (e.type === 'buildingComplete') {
        this.burst(e.x, 1.2, e.y, 14, '#ffe9a8', 2.5, now);
      } else if (e.type === 'deliver') {
        this.burst(e.x, 0.6, e.y + 1, 3, e.res === 'gold' ? '#ffd84a' : '#d9b07a', 1.2, now);
      }
    }
  }

  private burst(x: number, h: number, y: number, n: number, color: string, speed: number, now: number): void {
    if (!this.tileVisible(x, y)) return; // no tell-tale sparks inside the fog
    const c = new THREE.Color(color);
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({ x, y: h, z: y, vx: Math.cos(a) * v, vy: 1 + Math.random() * 1.5, vz: Math.sin(a) * v, t0: now, life: 0.7, color: c });
    }
  }

  addMarker(x: number, y: number, now: number, color: string = RING_COLORS.own): void {
    const m = new THREE.Mesh(this.ringGeo, this.ringMat(color, 0.9).clone());
    m.position.set(x, 0.04, y);
    this.scene.add(m);
    this.markers.push({ mesh: m, t0: now });
  }

  flashEntity(id: number, now: number): void {
    this.flashes.set(id, now);
  }

  private ringMat(color: string, opacity: number): THREE.MeshBasicMaterial {
    const key = `${color}|${opacity}`;
    let m = this.ringMats.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
      this.ringMats.set(key, m);
    }
    return m;
  }

  // ---- placement preview -------------------------------------------------------

  setPreview(type: BuildingType | null, f: Footprint | null, check: PlacementCheck | null, affordable: boolean): void {
    for (const [t, g] of this.ghosts) g.visible = t === type && !!f;
    if (!type || !f || !check) {
      this.previewTiles.count = 0;
      return;
    }
    let g = this.ghosts.get(type);
    if (!g) {
      g = makeGhost(type, this.ghostOk);
      this.ghosts.set(type, g);
      this.scene.add(g);
    }
    g.visible = true;
    g.position.set(f.tx + f.w / 2, 0.01, f.ty + f.h / 2);
    const ok = check.ok && affordable;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = ok ? this.ghostOk : this.ghostBad;
    });
    const good = new THREE.Color('#5dff6a');
    const bad = new THREE.Color('#ff3b30');
    let i = 0;
    for (let y = 0; y < f.h; y++)
      for (let x = 0; x < f.w; x++, i++) {
        this.m4.makeTranslation(f.tx + x + 0.5, 0.06, f.ty + y + 0.5);
        this.previewTiles.setMatrixAt(i, this.m4);
        this.previewTiles.setColorAt(i, check.tiles[i] ? good : bad);
      }
    this.previewTiles.count = i;
    this.previewTiles.instanceMatrix.needsUpdate = true;
    if (this.previewTiles.instanceColor) this.previewTiles.instanceColor.needsUpdate = true;
  }

  // ---- per-frame sync ------------------------------------------------------------

  /** Is this entity visible to the viewer (fog of war)? */
  perceived(e: Entity): boolean {
    if (this.reveal || e.owner === this.viewer || e.kind === 'resource') return true;
    return e.kind === 'unit' ? this.game.vision.canSee(this.viewer, e) : this.game.vision.knows(this.viewer, e);
  }

  private tileVisible(x: number, y: number): boolean {
    return this.reveal || this.game.vision.isVisible(this.viewer, Math.floor(x), Math.floor(y));
  }

  render(client: ClientState, alpha: number, now: number): void {
    this.viewer = client.player;
    this.reveal = client.revealAll;
    this.fog.update(this.reveal ? null : this.game.vision.grid(this.viewer), this.game.state.explored[this.viewer] ?? null);
    const game = this.game;
    const seen = new Set<number>();
    for (const e of Object.values(game.state.entities)) {
      if (e.kind === 'unit') {
        seen.add(e.id);
        this.syncUnit(e, alpha, now);
      } else if (e.kind === 'building') {
        seen.add(e.id);
        this.syncBuilding(e);
      } else if (e.type === 'goldmine') {
        seen.add(e.id);
        this.syncMine(e, now);
      }
    }
    for (const [id, v] of this.units) {
      if (seen.has(id)) continue;
      // Keep the body around briefly so deaths read clearly.
      if (v.root.visible) this.dying.push({ root: v.root, t0: now, building: false });
      else this.scene.remove(v.root);
      this.units.delete(id);
    }
    for (const [id, v] of this.buildings) {
      if (seen.has(id)) continue;
      this.pickables = this.pickables.filter((p) => p !== v.root);
      this.dying.push({ root: v.root, t0: now, building: true });
      this.buildings.delete(id);
    }
    this.updateDying(now);
    this.updateArrows(alpha, now);
    for (const [id, v] of this.mines) if (!seen.has(id)) (this.removePickable(v.root), this.mines.delete(id));
    this.updateTrees(now);
    this.updateRings(client, alpha, now);
    this.updateMarkers(now);
    this.updateParticles(now);
    this.updateDebug(client);
    this.updateRally(client, now);

    // Keep the shadow frustum centred on what the camera sees.
    const r = this.rig;
    this.sun.target.position.set(r.tx, 0, r.ty - 4);
    this.sun.position.set(r.tx - 22, 40, r.ty + 14);
    this.renderer.render(this.scene, r.camera);
  }

  /** Show the rally flag of the selected own production building. */
  private updateRally(client: ClientState, now: number): void {
    const b = client.selected.length === 1 ? this.game.building(client.selected[0]) : undefined;
    const r = b && b.owner === client.player ? b.rally : null;
    this.rallyFlag.visible = !!r;
    if (!r || !b) return;
    this.rallyFlag.position.set(r.x, 0, r.y);
    (this.rallyCloth.material as THREE.MeshStandardMaterial).color.set(this.game.player(b.owner).color);
    this.rallyCloth.rotation.y = Math.sin(now * 3) * 0.25;
  }

  private updateDebug(client: ClientState): void {
    const nav = this.game.nav;
    if (client.debug && this.debugVersion !== nav.version) {
      if (this.debugTiles) this.scene.remove(this.debugTiles);
      const blocked: number[] = [];
      for (let i = 0; i < nav.w * nav.h; i++) if (nav.occ[i]) blocked.push(i);
      const m = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#ff3030', transparent: true, opacity: 0.3, depthWrite: false }),
        blocked.length,
      );
      blocked.forEach((i, k) => m.setMatrixAt(k, this.m4.makeTranslation((i % nav.w) + 0.5, 0.08, Math.floor(i / nav.w) + 0.5)));
      m.renderOrder = 3;
      this.debugTiles = m;
      this.scene.add(m);
      this.debugVersion = nav.version;
    }
    if (this.debugTiles) this.debugTiles.visible = client.debug;
    const pts: number[] = [];
    if (client.debug) {
      for (const id of client.selected) {
        const u = this.game.unit(id);
        if (!u?.move) continue;
        let prev = { x: u.x, y: u.y };
        for (const p of u.move.path) {
          pts.push(prev.x, 0.15, prev.y, p.x, 0.15, p.y);
          prev = p;
        }
      }
    }
    this.debugPaths.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.debugPaths.renderOrder = 4;
    if (!this.debugPaths.parent) this.scene.add(this.debugPaths);
  }

  private updateDying(now: number): void {
    this.dying = this.dying.filter((d) => {
      const t = now - d.t0;
      if (d.building) {
        // Collapse: sink and squash over a second.
        d.root.scale.y = Math.max(0.05, 1 - t);
        d.root.position.y = -t * 0.4;
        if (t > 1.2) this.scene.remove(d.root);
        return t <= 1.2;
      }
      // Topple, then sink into the ground.
      d.root.rotation.z = Math.min(1, t / 0.35) * (Math.PI / 2) * 0.9;
      d.root.position.y = t > 0.9 ? -(t - 0.9) * 0.5 : 0;
      if (t > 1.8) this.scene.remove(d.root);
      return t <= 1.8;
    });
  }

  private updateArrows(alpha: number, now: number): void {
    const ps = this.game.state.projectiles;
    let a = 0;
    let h = 0;
    let bo = 0;
    let st = 0;
    const live = new Set<number>();
    for (const p of ps) {
      if (p.kind === 'boulder') {
        live.add(p.id);
        if (!this.boulderFrom.has(p.id)) this.boulderFrom.set(p.id, { x: p.px, y: p.py });
      }
      if (!this.tileVisible(p.x, p.y)) continue;
      const x = p.px + (p.x - p.px) * alpha;
      const y = p.py + (p.y - p.py) * alpha;
      const heading = Math.atan2(p.x - p.px, p.y - p.py);
      if (p.kind === 'boulder') {
        if (st >= 60) continue;
        // A lobbed arc from launch point to landing spot.
        const from = this.boulderFrom.get(p.id)!;
        const total = Math.max(0.01, Math.hypot(p.tx - from.x, p.ty - from.y));
        const f = Math.min(1, Math.hypot(x - from.x, y - from.y) / total);
        this.p.set(x, 0.9 + Math.sin(f * Math.PI) * total * 0.35 - f * 0.8, y);
        this.q.setFromEuler(this.e.set(now * 5, now * 3, 0));
        this.s.set(1, 1, 1);
        this.boulders.setMatrixAt(st++, this.m4.compose(this.p, this.q, this.s));
      } else if (p.kind === 'bolt') {
        if (bo >= 60) continue;
        this.p.set(x, 0.9, y);
        this.q.setFromEuler(this.e.set(now * 9, now * 7, 0));
        this.s.set(1, 1, 1);
        this.bolts.setMatrixAt(bo++, this.m4.compose(this.p, this.q, this.s));
      } else if (p.kind === 'hammer') {
        if (h >= 20) continue;
        this.p.set(x, 1.0, y);
        this.q.setFromEuler(this.e.set(now * 18, heading, 0, 'YXZ')); // tumbling
        this.s.set(1, 1, 1);
        this.hammers.setMatrixAt(h++, this.m4.compose(this.p, this.q, this.s));
      } else {
        if (a >= 200) continue;
        this.p.set(x, 0.85, y);
        this.q.setFromEuler(this.e.set(0, heading, 0));
        this.s.set(1, 1, 1);
        this.arrows.setMatrixAt(a++, this.m4.compose(this.p, this.q, this.s));
      }
    }
    this.arrows.count = a;
    this.arrows.instanceMatrix.needsUpdate = true;
    this.hammers.count = h;
    this.hammers.instanceMatrix.needsUpdate = true;
    this.bolts.count = bo;
    this.bolts.instanceMatrix.needsUpdate = true;
    this.boulders.count = st;
    this.boulders.instanceMatrix.needsUpdate = true;
    for (const id of this.boulderFrom.keys()) if (!live.has(id)) this.boulderFrom.delete(id);
  }

  private removePickable(o: THREE.Object3D): void {
    this.scene.remove(o);
    this.pickables = this.pickables.filter((p) => p !== o);
  }

  private syncUnit(u: Unit, alpha: number, now: number): void {
    let v = this.units.get(u.id);
    if (!v) {
      v = makeUnit(u.type, this.game.player(u.owner).color);
      v.root.userData.entityId = u.id;
      this.units.set(u.id, v);
      this.scene.add(v.root);
    }
    v.root.visible = !u.hidden && this.perceived(u);
    if (!v.root.visible) return;
    const x = u.px + (u.x - u.px) * alpha;
    const y = u.py + (u.y - u.py) * alpha;
    v.root.position.set(x, 0, y);
    const want = Math.atan2(Math.cos(u.facing), Math.sin(u.facing));
    let d = want - v.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    v.root.rotation.y += d * 0.35;

    const o = u.order;
    const moving = u.move?.state === 'moving' && (u.x !== u.px || u.y !== u.py);
    const working = (o?.type === 'gather' && o.phase === 'working') || (o?.type === 'build' && o.phase === 'building');
    const windup = secondsToTicks(CONFIG.units[u.type].attack.windup);
    const ph = now * 11 + u.id;
    v.body.position.y = moving ? Math.abs(Math.sin(ph)) * 0.04 : 0;
    if (u.type === 'mangonel') {
      // Wheels roll rather than stride.
      if (moving) v.legL.rotation.x = v.legR.rotation.x = v.legL.rotation.x - 0.12;
    } else {
      v.legL.rotation.x = moving ? Math.sin(ph) * 0.6 : 0;
      v.legR.rotation.x = moving ? -Math.sin(ph) * 0.6 : 0;
    }
    // Four-legged mounts: hind legs move with the opposite front leg.
    (v.legL.userData.partner as THREE.Object3D | undefined)?.rotation.set(v.legR.rotation.x, 0, 0);
    (v.legR.userData.partner as THREE.Object3D | undefined)?.rotation.set(v.legL.rotation.x, 0, 0);
    const mode = o?.type === 'build' ? 'hammer' : o?.type === 'gather' && o.res === 'gold' ? 'pick' : 'axe';
    v.pickHead.visible = mode === 'pick';
    v.axeHead.visible = mode === 'axe';
    v.hammerHead.visible = mode === 'hammer';
    if (u.swing > 0) {
      // Attack: raise the weapon through the wind-up, strike as it lands.
      const p = 1 - (u.swing - alpha) / windup;
      v.tool.rotation.x = p < 0.75 ? 0.35 - (p / 0.75) * 2.1 : -1.75 + ((p - 0.75) / 0.25) * 2.3;
    } else if (u.cooldown > 0 && attacking(u)) {
      v.tool.rotation.x = 0.55; // follow-through
    } else {
      v.tool.rotation.x = working ? -1.7 + (0.5 + 0.5 * Math.sin(now * 10 + u.id)) * 2.0 : 0.35;
    }
    v.goldSack.visible = u.carry.res === 'gold' && u.carry.amount > 0;
    const logs = u.carry.res === 'wood' ? Math.ceil((u.carry.amount / CONFIG.units.worker.carryWood) * 3) : 0;
    v.logs.forEach((l, i) => (l.visible = i < logs));
  }

  private syncBuilding(b: Building): void {
    let v = this.buildings.get(b.id);
    if (!v || v.type !== b.type || v.tier !== b.tier) {
      if (v) this.removePickable(v.root); // e.g. a Keep fortified into a Castle
      const parts = makeBuilding(b.type, this.game.player(b.owner).color, b.w, b.tier);
      v = { ...parts, type: b.type, tier: b.tier };
      v.root.position.set(b.x, 0, b.y);
      v.root.userData.entityId = b.id;
      this.buildings.set(b.id, v);
      this.scene.add(v.root);
      this.pickables.push(v.root);
    }
    v.root.visible = this.perceived(b);
    const done = b.progress >= 1;
    v.scaffold.visible = !done;
    v.model.scale.y = done ? 1 : 0.08 + 0.92 * b.progress;
  }

  private syncMine(m: ResourceNode, now: number): void {
    let v = this.mines.get(m.id);
    if (!v) {
      v = makeMine();
      v.root.position.set(m.x, 0, m.y);
      v.root.userData.entityId = m.id;
      this.mines.set(m.id, v);
      this.scene.add(v.root);
      this.pickables.push(v.root);
    }
    const frac = m.amount / m.maxAmount;
    const show = Math.ceil(frac * v.nuggets.length);
    v.nuggets.forEach((n, i) => (n.visible = i < show));
    let inside = 0;
    for (const u of this.game.units()) if (u.hidden && u.order?.type === 'gather' && u.order.nodeId === m.id) inside++;
    const glow = v.glow.material as THREE.MeshBasicMaterial;
    if (inside > 0) glow.color.setHSL(0.09, 0.9, 0.35 + 0.12 * Math.sin(now * 9 + m.id));
    else glow.color.set('#1b1410');
  }

  private updateRings(client: ClientState, alpha: number, now: number): void {
    const wanted: Array<{ x: number; y: number; r: number; color: string; opacity: number }> = [];
    const ringFor = (e: Entity, color: string, opacity: number, pad = 1) => {
      if (e.kind === 'unit') {
        if (e.hidden) return;
        const x = e.px + (e.x - e.px) * alpha;
        const y = e.py + (e.y - e.py) * alpha;
        wanted.push({ x, y, r: 0.45 * pad, color, opacity });
      } else {
        const r = e.kind === 'resource' && e.type === 'tree' ? 0.55 : (e.w / 2) * 1.2;
        wanted.push({ x: e.x, y: e.y, r: r * pad, color, opacity });
      }
    };
    for (const id of client.selected) {
      const e = this.game.get(id);
      if (!e) continue;
      const color = e.kind === 'resource' ? RING_COLORS.neutral : e.owner === client.player ? RING_COLORS.own : RING_COLORS.enemy;
      ringFor(e, color, 0.95);
    }
    // Battle Cry: an orange glow under every inspired unit.
    for (const u of this.game.units()) if (u.buffs.length && this.perceived(u)) ringFor(u, '#ff9a3a', 0.6, 1.25);
    if (client.hoverId && !client.selected.includes(client.hoverId)) {
      const e = this.game.get(client.hoverId);
      if (e) ringFor(e, RING_COLORS.hover, 0.45);
    }
    for (const [id, t] of this.flashes) {
      const e = this.game.get(id);
      if (!e || now - t > 0.7) {
        this.flashes.delete(id);
        continue;
      }
      if (Math.floor((now - t) * 8) % 2 === 0) ringFor(e, RING_COLORS.neutral, 0.9, 1.15);
    }
    while (this.rings.length < wanted.length) {
      const m = new THREE.Mesh(this.ringGeo, this.ringMat('#ffffff', 1));
      m.renderOrder = 1;
      this.scene.add(m);
      this.rings.push(m);
    }
    this.rings.forEach((m, i) => {
      const w = wanted[i];
      m.visible = !!w;
      if (!w) return;
      m.position.set(w.x, 0.04, w.y);
      m.scale.setScalar(w.r);
      m.material = this.ringMat(w.color, w.opacity);
    });
  }

  private updateMarkers(now: number): void {
    this.markers = this.markers.filter((m) => {
      const t = (now - m.t0) / 0.6;
      if (t >= 1) {
        this.scene.remove(m.mesh);
        (m.mesh.material as THREE.Material).dispose();
        return false;
      }
      m.mesh.scale.setScalar(0.6 * (1 - t * 0.6));
      (m.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      return true;
    });
  }

  private updateParticles(now: number): void {
    this.particles = this.particles.filter((p) => now - p.t0 < p.life);
    let i = 0;
    for (const p of this.particles) {
      const t = now - p.t0;
      this.m4.makeTranslation(p.x + p.vx * t, Math.max(0.03, p.y + p.vy * t - 4.9 * t * t), p.z + p.vz * t);
      this.particleMesh.setMatrixAt(i, this.m4);
      this.particleMesh.setColorAt(i, p.color);
      i++;
    }
    this.particleMesh.count = i;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
  }

  // ---- picking -----------------------------------------------------------------

  /** Entity under a screen point: units by projected body, then structures by ray. */
  pick(sx: number, sy: number): Entity | undefined {
    const rig = this.rig;
    let best: Unit | undefined;
    let bestD = Infinity;
    for (const u of this.game.units()) {
      if (u.hidden || !this.perceived(u)) continue;
      const c = rig.project(u.x, u.y, 0.5);
      if (!c.visible) continue;
      const edge = rig.project(u.x, u.y, 1.0);
      const r = Math.max(10, Math.abs(c.y - edge.y) * 0.9);
      const d = Math.hypot(c.x - sx, c.y - sy);
      if (d < r && d < bestD) {
        best = u;
        bestD = d;
      }
    }
    if (best) return best;
    const hits = rig.raycaster(sx, sy).intersectObjects(this.pickables, true);
    for (const h of hits) {
      if (h.object === this.trunks || h.object === this.canopies) {
        const id = h.instanceId !== undefined ? this.treeIds[h.instanceId] : 0;
        const t = id ? this.game.get(id) : undefined;
        if (t) return t;
        continue;
      }
      for (let o: THREE.Object3D | null = h.object; o; o = o.parent) {
        const id = o.userData.entityId as number | undefined;
        if (id !== undefined) {
          const e = this.game.get(id);
          if (e && this.perceived(e)) return e;
          break;
        }
      }
    }
    const g = rig.screenToGround(sx, sy);
    if (g) {
      const nav = this.game.nav;
      const tx = Math.floor(g.x);
      const ty = Math.floor(g.y);
      if (nav.inBounds(tx, ty)) {
        const id = nav.entityAt[ty * nav.w + tx];
        const e = id ? this.game.get(id) : undefined;
        if (e && this.perceived(e)) return e;
      }
    }
    return undefined;
  }
}

function attacking(u: Unit): boolean {
  const t = u.order?.type;
  return t === 'attack' || t === 'attackMove' || t === 'hold';
}
