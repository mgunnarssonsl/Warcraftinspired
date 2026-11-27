// Three.js view of the simulation. Reads game state each frame (never mutates
// it), keeps one view object per entity, animates units from their orders,
// and answers picking queries for the input layer.

import { teamColor } from '../ui/view';
import * as THREE from 'three';
import type { ClientState } from '../input/client';
import { CONFIG, isHeroType, secondsToTicks, type BuildingType } from '../sim/config';
import { unitRole } from '../sim/factions';
import type { PlacementCheck } from '../sim/construction';
import type { Game } from '../sim/game';
import { hash2 } from '../sim/rng';
import type { Building, Entity, Footprint, GameEvent, GroundItem, ResourceNode, Unit } from '../sim/types';
import { TERRAIN } from '../sim/types';
import { CameraRig } from './cameraRig';
import { FogTexture, withFog } from './fog';
import { isKitMaterial } from './kit';
import { paintGround } from './groundTexture';
import {
  makeBuilding,
  makeGhost,
  makeMine,
  makeTreeGeometries,
  makeArrowGeometry,
  makeGroundItem,
  makeBoltGeometry,
  makeBoulderGeometry,
  makeHammerGeometry,
  makeUnit,
  type BuildingParts,
  type MineParts,
  type WorkerParts,
  isSharedMaterial,
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
/** Soft smoke puffs (damaged and working buildings), kept few so they never hide the fight. */
const MAX_SMOKE = 90;

interface Puff {
  x: number;
  y: number;
  z: number;
  t0: number;
  life: number;
  size: number;
  color: THREE.Color;
}

export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  private sun: THREE.DirectionalLight;
  private units = new Map<number, WorkerParts>();
  private items = new Map<number, THREE.Group>();
  private memoryGhosts = new Map<number, { root: THREE.Group; tier: number; done: boolean }>();
  private buildings = new Map<number, BuildingParts & { type: BuildingType; tier: number }>();
  private mines = new Map<number, MineParts>();
  private trunks!: THREE.InstancedMesh;
  private canopies!: THREE.InstancedMesh;
  private treeIndex = new Map<number, number>();
  private treeIds: number[] = [];
  private treeShown: number[] = [];
  private shakes = new Map<number, number>();
  private ringGeo = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
  /** Soft team-colour disc under every player unit, so sides read at a glance. */
  private discGeo = (() => {
    const g = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
    g.userData.shared = true;
    return g;
  })();
  private discMats = new Map<string, THREE.MeshBasicMaterial>();
  private ringMats = new Map<string, THREE.MeshBasicMaterial>();
  private rings: THREE.Mesh[] = [];
  private markers: Marker[] = [];
  private flashes = new Map<number, number>();
  private particles: Particle[] = [];
  private particleMesh: THREE.InstancedMesh;
  private smokeMesh: THREE.InstancedMesh;
  private puffs: Puff[] = [];
  /** When each unit was last hit (a short flinch). */
  private flinches = new Map<number, number>();
  /** Next time a burning or working building may puff, by building id. */
  private nextPuff = new Map<number, number>();
  private nextDust = 0;
  /** Rubble left where buildings fell, fading away. */
  private rubble: Array<{ root: THREE.Group; t0: number }> = [];
  /** Effects detail (Settings > Graphics): reduced halves particles and drops ambient smoke. */
  effects: 'full' | 'reduced' = 'full';
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
  private c = new THREE.Color();
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
    // Smoke draws translucent and without depth writes, under the selection
    // rings and the 2D overlay, so it never covers health bars or orders.
    this.smokeMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.22, 0),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.32, depthWrite: false }),
      MAX_SMOKE,
    );
    this.smokeMesh.frustumCulled = false;
    this.smokeMesh.count = 0;
    this.smokeMesh.renderOrder = -1;
    this.scene.add(this.smokeMesh);

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

  /** Graphics settings: shadows and rendering resolution. */
  applyGraphics(g: { shadows: boolean; resolution: number }): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * g.resolution);
    if (this.renderer.shadowMap.enabled !== g.shadows) {
      this.renderer.shadowMap.enabled = g.shadows;
      this.sun.castShadow = g.shadows;
      // Lit materials compile with or without shadow code: rebuild them.
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
        else if (m) m.needsUpdate = true;
      });
    }
    const size = this.renderer.getSize(new THREE.Vector2());
    this.renderer.setSize(size.x, size.y, false);
  }

  /** Team colours changed (colour-blind setting): rebuild units and buildings in the new colours. */
  recolor(): void {
    for (const v of this.units.values()) this.removePickable(v.root);
    for (const v of this.buildings.values()) this.removePickable(v.root);
    for (const g of this.memoryGhosts.values()) this.drop(g.root);
    this.units.clear();
    this.buildings.clear();
    this.memoryGhosts.clear();
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

    // Water: one sheet over the whole map, cut out by a blurred mask of the
    // water tiles, so shores are rounded instead of stepped tile squares.
    const rockSpots: Array<[number, number]> = [];
    const PX = 8;
    const mask = document.createElement('canvas');
    mask.width = W * PX;
    mask.height = H * PX;
    const mctx = mask.getContext('2d')!;
    mctx.fillStyle = '#000';
    mctx.fillRect(0, 0, mask.width, mask.height);
    mctx.fillStyle = '#fff';
    let anyWater = false;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const t = terrain[y * W + x];
        if (t === TERRAIN.water) {
          anyWater = true;
          mctx.beginPath();
          mctx.arc((x + 0.5) * PX, (y + 0.5) * PX, PX * 0.78, 0, Math.PI * 2);
          mctx.fill();
        } else if (t === TERRAIN.rock) rockSpots.push([x, y]);
      }
    if (anyWater) {
      const soft = document.createElement('canvas');
      soft.width = mask.width;
      soft.height = mask.height;
      const sctx = soft.getContext('2d')!;
      sctx.filter = `blur(${PX * 0.22}px)`;
      sctx.drawImage(mask, 0, 0);
      const alpha = new THREE.CanvasTexture(soft);
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2).translate(W / 2, 0.05, H / 2),
        withFog(new THREE.MeshStandardMaterial({ color: '#3d78a8', alphaMap: alpha, transparent: true, opacity: 0.78, roughness: 0.12, metalness: 0.1, depthWrite: false })),
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
        if (t?.kind === 'unit') this.flinches.set(t.id, now);
        this.burst(e.x, unit ? 0.6 : 1.0, e.y, unit ? 4 : 3, unit ? '#d8423a' : '#9a8e7a', 1.4, now);
      } else if (e.type === 'death') {
        this.burst(e.x, 0.5, e.y, 10, '#8a2a22', 1.8, now);
      } else if (e.type === 'buildingDestroyed') {
        this.burst(e.x, 1.0, e.y, 40, '#8d8272', 3.5, now);
        this.burst(e.x, 1.4, e.y, 16, '#3a3028', 2.5, now);
        this.addRubble(e.x, e.y, CONFIG.buildings[e.building].size, now);
      } else if (e.type === 'levelUp') {
        this.burst(e.x, 1.2, e.y, 30, '#ffd84a', 2.4, now);
      } else if (e.type === 'cast') {
        // By what the ability does, so every hero's spells show.
        const def = CONFIG.hero.abilities[e.ability];
        const fx = def.effect;
        if (fx === 'rally') this.burst(e.x, 0.6, e.y, 36, '#ff9a3a', 4.5, now);
        else if (fx === 'area' || fx === 'burn') {
          const color = fx === 'burn' ? '#ff7a2a' : '#c8a070';
          for (let i = 0; i < 6; i++) this.burst(e.x + Math.cos(i) * def.radius * 0.6, 0.3, e.y + Math.sin(i) * def.radius * 0.6, 6, color, 1.8, now);
          this.addMarker(e.x, e.y, now, color);
        } else if (fx === 'reveal') this.addMarker(e.x, e.y, now, '#ffe9a8');
        else if (fx === 'slow' || fx === 'mark' || fx === 'ward') this.burst(e.x, 0.8, e.y, 12, BUFF_COLORS[fx], 1.4, now);
        else if (fx === 'heal') this.burst(e.x, 0.8, e.y, 20, '#7dff8a', 1.6, now);
        else if (fx === 'bolt' && !def.projectileSpeed) this.burst(e.x, 0.5, e.y, 16, '#6ab04a', 1.4, now); // roots burst up at once
      } else if (e.type === 'flare') {
        // A flare is seen by whoever lit it (and anyone already watching that spot).
        if (e.player === this.viewer || this.tileVisible(e.x, e.y)) {
          this.addMarker(e.x, e.y, now, '#ffb040');
          this.burst(e.x, 3.5, e.y, 30, '#ffd070', 2.2, now);
        }
      } else if (e.type === 'teleport') {
        this.burst(e.fromX, 0.6, e.fromY, 20, '#b8d8ff', 2.4, now);
        this.burst(e.x, 0.6, e.y, 20, '#b8d8ff', 2.4, now);
      } else if (e.type === 'itemPicked' || e.type === 'itemUsed') {
        this.burst(e.x, 0.6, e.y, 10, '#7dffb0', 1.4, now);
      } else if (e.type === 'campCleared') {
        this.burst(e.x, 1.0, e.y, 24, '#ffd84a', 2.6, now);
      } else if (e.type === 'heal') {
        this.burst(e.x, 0.9, e.y, 6, '#7dff8a', 0.8, now);
      } else if (e.type === 'impact') {
        this.burst(e.x, 0.3, e.y, 18, '#8a7c68', 2.6, now);
        this.burst(e.x, 0.3, e.y, 6, '#ffb060', 1.6, now);
      } else if (e.type === 'buildingComplete') {
        this.burst(e.x, 1.2, e.y, 14, '#ffe9a8', 2.5, now);
      } else if (e.type === 'deliver') {
        this.burst(e.x, 0.6, e.y + 1, 3, e.res === 'gold' ? '#ffd84a' : '#d9b07a', 1.2, now);
      }
    }
  }

  private burst(x: number, h: number, y: number, n: number, color: string, speed: number, now: number): void {
    if (!this.tileVisible(x, y)) return; // no tell-tale sparks inside the fog
    if (this.effects === 'reduced') n = Math.ceil(n / 2);
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

  /**
   * Is this entity visible to the viewer right now (fog of war)? Enemy
   * buildings out of view are shown as remembered ghosts instead (syncGhosts),
   * so nothing about them updates until they are seen again.
   */
  perceived(e: Entity): boolean {
    if (this.reveal || e.owner === this.viewer || e.kind === 'resource') return true;
    if (e.kind === 'building' && this.game.state.players[e.owner]?.neutral) return true; // public map objectives
    return this.game.vision.canSee(this.viewer, e);
  }

  /** Ghosts of enemy buildings as last seen, drawn where the viewer cannot see now. */
  private syncGhosts(): void {
    const live = new Set<number>();
    if (!this.reveal) {
      for (const m of this.game.vision.remembered(this.viewer)) {
        const b = this.game.building(m.id);
        if (b && this.perceived(b)) continue;
        live.add(m.id);
        let g = this.memoryGhosts.get(m.id);
        if (!g || g.tier !== m.tier || g.done !== m.done) {
          if (g) this.drop(g.root);
          const parts = makeBuilding(m.type, teamColor(this.game, m.owner), m.w, m.tier);
          parts.root.position.set(m.x, 0, m.y);
          parts.scaffold.visible = !m.done;
          parts.model.scale.y = m.done ? 1 : 0.5;
          g = { root: parts.root, tier: m.tier, done: m.done };
          this.memoryGhosts.set(m.id, g);
          this.scene.add(g.root);
        }
      }
    }
    for (const [id, g] of this.memoryGhosts) {
      if (live.has(id)) continue;
      this.drop(g.root);
      this.memoryGhosts.delete(id);
    }
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
      else this.drop(v.root);
      this.units.delete(id);
      this.flinches.delete(id);
    }
    for (const [id, v] of this.buildings) {
      if (seen.has(id)) continue;
      this.pickables = this.pickables.filter((p) => p !== v.root);
      this.dying.push({ root: v.root, t0: now, building: true });
      this.buildings.delete(id);
      this.nextPuff.delete(id);
    }
    this.syncItems(now);
    this.syncGhosts();
    this.updateDying(now);
    this.updateArrows(alpha, now);
    for (const [id, v] of this.mines) if (!seen.has(id)) (this.removePickable(v.root), this.mines.delete(id));
    this.updateTrees(now);
    this.updateRings(client, alpha, now);
    this.updateMarkers(now);
    this.buildingStates(now);
    this.updateParticles(now);
    this.updateSmoke(now);
    this.updateRubble(now);
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
    (this.rallyCloth.material as THREE.MeshStandardMaterial).color.set(teamColor(this.game, b.owner));
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
        if (t > 1.2) this.drop(d.root);
        return t <= 1.2;
      }
      // Topple, then sink into the ground.
      d.root.rotation.z = Math.min(1, t / 0.35) * (Math.PI / 2) * 0.9;
      d.root.position.y = t > 0.9 ? -(t - 0.9) * 0.5 : 0;
      if (t > 1.8) this.drop(d.root);
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
    this.pickables = this.pickables.filter((p) => p !== o);
    this.drop(o);
  }

  /**
   * Take a view out of the scene and free its GPU buffers: every model
   * builds its own geometry, so a match that trains and loses hundreds of
   * units would otherwise keep all of them in memory. Cached materials
   * (shared by all models) and the shared ring stay.
   */
  private drop(root: THREE.Object3D): void {
    this.scene.remove(root);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.geometry !== this.ringGeo && !m.geometry.userData.shared) m.geometry.dispose();
      for (const mt of Array.isArray(m.material) ? m.material : [m.material]) if (!isSharedMaterial(mt) && !isKitMaterial(mt) && ![...this.discMats.values()].includes(mt as THREE.MeshBasicMaterial)) mt.dispose();
    });
  }

  /** Items on the ground: shown where the viewer can see, gems bobbing. */
  private syncItems(now: number): void {
    const live = new Set<number>();
    for (const it of this.game.state.items) {
      live.add(it.id);
      let v = this.items.get(it.id);
      if (!v) {
        v = makeGroundItem(CONFIG.items[it.type].tier);
        v.position.set(it.x, 0, it.y);
        this.scene.add(v);
        this.items.set(it.id, v);
      }
      v.visible = this.tileVisible(it.x, it.y);
      v.children[2].position.y = 0.46 + Math.sin(now * 3 + it.id) * 0.05;
      v.children[2].rotation.y = now * 1.5;
    }
    for (const [id, v] of this.items) {
      if (live.has(id)) continue;
      this.drop(v);
      this.items.delete(id);
    }
  }

  /** The ground item under a screen point, if the viewer can see it. */
  pickItem(sx: number, sy: number): GroundItem | undefined {
    let best: GroundItem | undefined;
    let bestD = 18;
    for (const it of this.game.state.items) {
      if (!this.tileVisible(it.x, it.y)) continue;
      const c = this.rig.project(it.x, it.y, 0.3);
      if (!c.visible) continue;
      const d = Math.hypot(c.x - sx, c.y - sy);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  private syncUnit(u: Unit, alpha: number, now: number): void {
    let v = this.units.get(u.id);
    if (!v) {
      const team = teamColor(this.game, u.owner);
      v = makeUnit(u.type, team);
      v.root.userData.entityId = u.id;
      if (!this.game.state.players[u.owner]?.neutral) {
        let m = this.discMats.get(team);
        if (!m) {
          m = withFog(new THREE.MeshBasicMaterial({ color: team, transparent: true, opacity: 0.32, depthWrite: false }));
          this.discMats.set(team, m);
        }
        const disc = new THREE.Mesh(this.discGeo, m);
        const r = CONFIG.units[u.type].radius * (isHeroType(u.type) ? 1.5 : 1.3) + 0.05;
        disc.scale.set(r, 1, r);
        disc.position.y = 0.012;
        disc.renderOrder = -2;
        v.root.add(disc);
      }
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
    const working = (o?.type === 'gather' && o.phase === 'working') || (o?.type === 'build' && o.phase === 'building') || (o?.type === 'repair' && o.phase === 'repairing');
    const windup = secondsToTicks(CONFIG.units[u.type].attack.windup);
    const role = unitRole(u.type);
    const mounted = role === 'cavalry' || role === 'scout' || u.type === 'wolf' || u.type === 'fox';
    const ph = now * (mounted ? 13 : 11) + u.id;
    const stride = Math.sin(ph);
    v.body.position.y = moving ? Math.abs(stride) * (mounted ? 0.07 : 0.04) : 0;
    // Lean into the stride; riders rock with the gallop; a slow breath at rest.
    v.body.rotation.x = moving ? (mounted ? 0.05 + stride * 0.06 : 0.08) : 0;
    v.body.scale.y = (v.body.userData.s0 ??= v.body.scale.y) * (moving ? 1 : 1 + Math.sin(now * 2.2 + u.id) * 0.012);
    // Flinch: a quick jolt back when struck.
    const hitAt = this.flinches.get(u.id);
    if (hitAt !== undefined) {
      const k = (now - hitAt) / 0.18;
      if (k >= 1) this.flinches.delete(u.id);
      else {
        v.body.rotation.x -= 0.22 * (1 - k);
        v.body.position.z = -0.06 * (1 - k);
      }
    } else v.body.position.z = 0;
    // Banners, pennants and plumes sway, faster on the move.
    if (v.flag) v.flag.rotation.y = Math.sin(now * (moving ? 9 : 3) + u.id) * 0.35;
    if (v.style === 'siege') {
      // Wheels roll rather than stride.
      if (moving) v.legL.rotation.x = v.legR.rotation.x = v.legL.rotation.x - 0.12;
    } else {
      v.legL.rotation.x = moving ? stride * 0.6 : 0;
      v.legR.rotation.x = moving ? -stride * 0.6 : 0;
      if (v.hindL) v.hindL.rotation.x = v.legR.rotation.x;
      if (v.hindR) v.hindR.rotation.x = v.legL.rotation.x;
    }
    const mode = o?.type === 'build' || o?.type === 'repair' ? 'hammer' : o?.type === 'gather' && o.res === 'gold' ? 'pick' : 'axe';
    v.pickHead.visible = mode === 'pick';
    v.axeHead.visible = mode === 'axe';
    v.hammerHead.visible = mode === 'hammer';
    v.tool.position.z = v.tool.userData.z0 ??= v.tool.position.z;
    // Arms swing against the legs; at rest they hang with a little life.
    const swingArm = moving && !mounted ? stride * 0.5 : 0;
    const restArm = Math.sin(now * 2.2 + u.id) * 0.04;
    if (v.armL) v.armL.rotation.x = moving && !mounted ? -swingArm : 0.04 + restArm;
    const lunge = (k: number) => {
      v!.body.position.z = k;
      v!.body.rotation.x -= k * 1.2;
    };
    if (u.swing > 0) {
      const p = Math.max(0, Math.min(1, 1 - (u.swing - alpha) / windup));
      if (v.style === 'bow') {
        // Raise the bow level and draw the string back, loosing at the end.
        const k = Math.min(1, p * 2);
        if (v.armL) v.armL.rotation.x = -1.45 * k;
        v.tool.rotation.x = -1.45 * k;
        v.tool.position.z = (v.tool.userData.z0 as number) - 0.1 * p;
      } else if (v.style === 'staff') {
        // Lift the staff high, then thrust it toward the target.
        v.tool.rotation.x = p < 0.8 ? -(p / 0.8) * 2.7 : -2.7 + ((p - 0.8) / 0.2) * 1.4;
      } else if (v.style === 'throw') {
        // Whirl the sling, then release forward.
        v.tool.rotation.x = p < 0.85 ? -2.4 - Math.sin(p * 20) * 0.6 : -2.4 + ((p - 0.85) / 0.15) * 1.6;
      } else if (v.style === 'siege') {
        // The arm cranks down, then whips over the top.
        v.tool.rotation.x = p < 0.85 ? -0.25 - (p / 0.85) * 0.2 : -0.45 + ((p - 0.85) / 0.15) * 2.05;
      } else if (v.style === 'beast') {
        lunge(p < 0.7 ? -0.04 * (p / 0.7) : -0.04 + ((p - 0.7) / 0.3) * 0.16);
      } else {
        // Melee: raise the weapon overhead, strike down as the blow lands; the shield braces.
        v.tool.rotation.x = p < 0.75 ? -(p / 0.75) * 3.0 : -3.0 + ((p - 0.75) / 0.25) * 2.6;
        if (v.armL) v.armL.rotation.x = -0.55;
      }
    } else if (u.cooldown > 0 && attacking(u)) {
      // Follow-through, then settle.
      v.tool.rotation.x = v.style === 'siege' ? 1.4 : v.style === 'bow' ? -0.8 : v.style === 'staff' ? -1.1 : -0.35;
      if (v.armL && (v.style === 'bow' || v.style === 'melee')) v.armL.rotation.x = v.style === 'bow' ? -0.8 : -0.45;
    } else if (working) {
      // Laborers and Tenders: lift and strike in a steady rhythm.
      const k = 0.5 + 0.5 * Math.sin(now * 10 + u.id);
      v.tool.rotation.x = -2.6 + k * k * 2.2;
    } else {
      v.tool.rotation.x = v.style === 'siege' ? -0.25 : moving && !mounted ? swingArm : mounted ? -0.15 : 0.04 - restArm;
    }
    if (v.bow) v.bow.rotation.x = -(v.armL?.rotation.x ?? 0);
    v.goldSack.visible = u.carry.res === 'gold' && u.carry.amount > 0;
    const logs = u.carry.res === 'wood' ? Math.ceil((u.carry.amount / CONFIG.units.worker.carryWood) * 3) : 0;
    v.logs.forEach((l, i) => (l.visible = i < logs));
  }

  private syncBuilding(b: Building): void {
    let v = this.buildings.get(b.id);
    if (!v || v.type !== b.type || v.tier !== b.tier) {
      if (v) this.removePickable(v.root); // e.g. a Keep fortified into a Castle
      const parts = makeBuilding(b.type, teamColor(this.game, b.owner), b.w, b.tier);
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

  /**
   * Building states you can read at a glance: smoke when damaged, flames when
   * badly damaged, a chimney plume while it trains or researches. Only for
   * buildings in sight; a few puffs at most.
   */
  private buildingStates(now: number): void {
    for (const b of this.game.buildings()) {
      if (b.progress < 1 || this.game.state.players[b.owner]?.neutral || !this.tileVisible(b.x, b.y)) continue;
      const hp = b.hp / b.maxHp;
      const working = b.queue.length > 0 && b.queue[0].started;
      if (hp >= 0.6 && (!working || this.effects === 'reduced')) continue;
      const due = this.nextPuff.get(b.id) ?? 0;
      if (now < due) continue;
      const top = b.w * 0.75 + 0.4;
      if (hp < 0.6) {
        const dark = hp < 0.3;
        this.puff(b.x + (Math.random() - 0.5) * b.w * 0.5, top, b.y + (Math.random() - 0.5) * b.h * 0.4, dark ? '#2e2a26' : '#5a544c', 2.2, now);
        if (dark) this.burst(b.x + (Math.random() - 0.5) * b.w * 0.4, top * 0.7, b.y, 2, '#ff8a3a', 0.6, now);
        this.nextPuff.set(b.id, now + (dark ? 0.25 : 0.45));
      } else {
        this.puff(b.x + b.w * 0.25, top + 0.3, b.y - b.h * 0.25, '#d8d2c4', 1.6, now);
        this.nextPuff.set(b.id, now + 0.9);
      }
    }
    // Dust where Laborers hammer at a site, and at mines being worked.
    if (now >= this.nextDust) {
      this.nextDust = now + (this.effects === 'reduced' ? 0.9 : 0.45);
      for (const u of this.game.units()) {
        const o = u.order;
        if (o?.type === 'build' && o.phase === 'building' && this.tileVisible(u.x, u.y)) {
          const dx = Math.cos(u.facing) * 0.45;
          const dy = Math.sin(u.facing) * 0.45;
          this.burst(u.x + dx, 0.2, u.y + dy, 2, '#b8a07a', 0.6, now);
        }
      }
    }
  }

  private puff(x: number, h: number, y: number, color: string, life: number, now: number): void {
    if (this.puffs.length >= MAX_SMOKE) return;
    this.puffs.push({ x, y: h, z: y, t0: now, life, size: 0.7 + Math.random() * 0.5, color: new THREE.Color(color) });
  }

  private updateSmoke(now: number): void {
    this.puffs = this.puffs.filter((p) => now - p.t0 < p.life);
    let i = 0;
    for (const p of this.puffs) {
      const t = (now - p.t0) / p.life;
      const sc = p.size * (0.6 + t * 1.4) * (1 - t * 0.5);
      this.m4.makeScale(sc, sc, sc).setPosition(p.x + t * 0.4, p.y + t * 1.6, p.z - t * 0.2);
      this.smokeMesh.setMatrixAt(i, this.m4);
      // Fade out by darkening toward the ground colour (instances share one opacity).
      this.smokeMesh.setColorAt(i, this.c.copy(p.color).multiplyScalar(1 - t * 0.6));
      i++;
    }
    this.smokeMesh.count = i;
    this.smokeMesh.instanceMatrix.needsUpdate = true;
    if (this.smokeMesh.instanceColor) this.smokeMesh.instanceColor.needsUpdate = true;
  }

  /** A low heap of stones where a building fell; it fades over half a minute. */
  private addRubble(x: number, y: number, size: number, now: number): void {
    if (!this.tileVisible(x, y)) return;
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: '#7a7064', flatShading: true, roughness: 1, transparent: true, opacity: 1 });
    const n = Math.round(size * 4);
    for (let i = 0; i < n; i++) {
      const r = 0.12 + Math.random() * 0.22;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), stone);
      m.position.set(x + (Math.random() - 0.5) * size * 0.8, r * 0.5, y + (Math.random() - 0.5) * size * 0.8);
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      m.receiveShadow = true;
      g.add(m);
    }
    this.scene.add(g);
    this.rubble.push({ root: g, t0: now });
  }

  private updateRubble(now: number): void {
    this.rubble = this.rubble.filter((r) => {
      const t = now - r.t0;
      const mat = (r.root.children[0] as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial | undefined;
      if (mat && t > 24) mat.opacity = Math.max(0, 1 - (t - 24) / 6);
      if (t > 30) this.drop(r.root);
      return t <= 30;
    });
  }

  private syncMine(m: ResourceNode, now: number): void {
    let v = this.mines.get(m.id);
    if (!v) {
      v = makeMine(m.miners > CONFIG.resources.goldmine.maxMiners);
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
    // Buffs and debuffs glow under the unit: Battle Cry orange, Mark red,
    // Slow blue, Arcane Ward cyan.
    for (const u of this.game.units()) {
      if (!u.buffs.length || !this.perceived(u)) continue;
      for (const b of u.buffs) ringFor(u, BUFF_COLORS[b.kind], 0.6, b.kind === 'cry' ? 1.25 : 1.45);
    }
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

const BUFF_COLORS: Record<'cry' | 'mark' | 'slow' | 'ward', string> = { cry: '#ff9a3a', mark: '#ff3a3a', slow: '#6a8cff', ward: '#5ef0ff' };

function attacking(u: Unit): boolean {
  const t = u.order?.type;
  return t === 'attack' || t === 'attackMove' || t === 'hold';
}
