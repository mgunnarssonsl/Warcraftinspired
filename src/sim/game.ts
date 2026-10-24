// Game owns the serializable GameState plus derived caches (navigation grid)
// and advances the simulation one fixed tick at a time. Rendering, input and
// AI never mutate state directly; they submit Commands.

import { CONFIG, type BuildingType, type UnitType } from './config';
import { applyCommand, applyQueued, type Command } from './commands';
import { updateCombat, updateCombatOrder } from './combat';
import { checkOutcome } from './outcome';
import { updateCast, updateStatus } from './hero';
import { updateBuilder } from './construction';
import { updateProduction } from './production';
import { updateGatherer } from './gathering';
import { generateMap } from './mapgen';
import { planPath, updateMovement } from './movement';
import { NavGrid } from './nav';
import { Vision } from './vision';
import { emptyStats } from './types';
import type {
  Building,
  Entity,
  Footprint,
  GameEvent,
  GameState,
  MoveGoal,
  Player,
  ResourceNode,
  Unit,
} from './types';

export const PLAYER_COLORS = ['#3a7bd5', '#c0392b', '#27ae60', '#8e44ad'];
export const NEUTRAL_COLOR = '#8a5a2b';

/** Guards per camp, by the role of the mine they protect. */
const CAMPS: Partial<Record<keyof typeof CONFIG.mines, UnitType[]>> = {
  center: ['chief', 'brigand', 'poacher'],
  far: ['brigand', 'poacher'],
  // Even the natural expansion must be cleared first: no free second mine.
  natural: ['brigand', 'poacher'],
};

export class Game {
  state: GameState;
  nav: NavGrid;
  private pending: Command[] = [];
  private events: GameEvent[] = [];

  vision: Vision;

  constructor(state: GameState) {
    this.state = state;
    this.nav = new NavGrid(state);
    this.vision = new Vision(this);
  }

  /** Build the standard skirmish starting state for a seed. */
  static create(seed: number): Game {
    const layout = generateMap(seed);
    const state: GameState = {
      seed,
      tick: 0,
      nextId: 1,
      rng: seed | 0,
      navVersion: 0,
      map: { width: layout.width, height: layout.height, terrain: layout.terrain },
      players: layout.starts.map(
        (_, i): Player => ({
          id: i,
          name: i === 0 ? 'You' : 'Rival',
          color: PLAYER_COLORS[i],
          gold: CONFIG.match.startGold,
          wood: CONFIG.match.startWood,
          goldGathered: 0,
          woodGathered: 0,
          neutral: false,
          defeated: false,
          stats: emptyStats(),
          research: {},
          hero: null,
        }),
      ),
      entities: {},
      projectiles: [],
      outcome: null,
      victoryRules: true,
      explored: [],
      starts: layout.starts.map((s) => ({ x: s.hq.tx + CONFIG.buildings.hq.size / 2, y: s.hq.ty + CONFIG.buildings.hq.size / 2 })),
    };
    const game = new Game(state);
    for (const i of layout.trees) {
      const x = i % layout.width;
      const y = (i - x) / layout.width;
      game.addResource('tree', x, y, CONFIG.resources.tree.wood);
    }
    for (const m of layout.mines) game.addResource('goldmine', m.tx, m.ty, m.amount);
    layout.starts.forEach((s, p) => {
      const hq = game.addBuilding('hq', p, s.hq.tx, s.hq.ty);
      game.spawnUnitsNear('worker', p, hq, CONFIG.match.startWorkers);
    });
    // Hostile camps guard the contested mines. Mines come in mirrored pairs;
    // the second camp of each pair is the exact mirror of the first.
    const neutral = state.players.length;
    state.players.push({
      id: neutral,
      name: 'Brigands',
      color: NEUTRAL_COLOR,
      gold: 0,
      wood: 0,
      goldGathered: 0,
      woodGathered: 0,
      neutral: true,
      defeated: false,
      stats: emptyStats(),
      research: {},
      hero: null,
    });
    for (let i = 0; i < layout.mines.length; i += 2) {
      const guards = CAMPS[layout.mines[i].role];
      if (!guards) continue;
      const m = layout.mines[i];
      const size = CONFIG.resources.goldmine.size;
      const spots = game.freeTilesAround({ tx: m.tx, ty: m.ty, w: size, h: size }, guards.length);
      guards.forEach((type, k) => {
        const s = spots[k];
        if (!s) return;
        for (const [x, y] of [[s.x + 0.5, s.y + 0.5], [layout.width - s.x - 0.5, layout.height - s.y - 0.5]]) {
          const u = game.addUnit(type, neutral, x, y);
          u.home = { x, y };
        }
      });
    }
    return game;
  }

  static fromJSON(json: string): Game {
    return new Game(JSON.parse(json) as GameState);
  }

  toJSON(): string {
    return JSON.stringify(this.state);
  }

  // ---- entity access -------------------------------------------------------

  get(id: number): Entity | undefined {
    return this.state.entities[id];
  }

  unit(id: number): Unit | undefined {
    const e = this.state.entities[id];
    return e && e.kind === 'unit' ? e : undefined;
  }

  resource(id: number): ResourceNode | undefined {
    const e = this.state.entities[id];
    return e && e.kind === 'resource' ? e : undefined;
  }

  building(id: number): Building | undefined {
    const e = this.state.entities[id];
    return e && e.kind === 'building' ? e : undefined;
  }

  // Per-kind lists in ascending id order, cached until an entity is added or
  // removed. Callers must treat them as read-only; a rebuild makes new arrays,
  // so iterating a list while entities die is safe.
  private lists: { units: Unit[]; buildings: Building[]; resources: ResourceNode[] } | null = null;

  private kindLists() {
    if (!this.lists) {
      const units: Unit[] = [];
      const buildings: Building[] = [];
      const resources: ResourceNode[] = [];
      for (const e of Object.values(this.state.entities)) {
        if (e.kind === 'unit') units.push(e);
        else if (e.kind === 'building') buildings.push(e);
        else resources.push(e);
      }
      this.lists = { units, buildings, resources };
    }
    return this.lists;
  }

  units(): readonly Unit[] {
    return this.kindLists().units;
  }

  buildings(): readonly Building[] {
    return this.kindLists().buildings;
  }

  resources(): readonly ResourceNode[] {
    return this.kindLists().resources;
  }

  player(id: number): Player {
    return this.state.players[id];
  }

  /** Living units plus population reserved by items currently training. */
  popUsed(player: number): number {
    let n = 0;
    for (const e of Object.values(this.state.entities)) {
      if (e.owner !== player) continue;
      if (e.kind === 'unit') n += CONFIG.units[e.type].pop;
      else if (e.kind === 'building') for (const q of e.queue) if (q.started && q.unit) n += CONFIG.units[q.unit].pop;
    }
    return n;
  }

  popCap(player: number): number {
    let n = 0;
    for (const b of this.buildings())
      if (b.owner === player && b.progress >= 1) n += CONFIG.buildings[b.type].popProvided;
    return Math.min(n, CONFIG.match.maxPop);
  }

  idleWorkers(player: number): Unit[] {
    return this.units().filter((u) => u.owner === player && u.type === 'worker' && u.order === null);
  }

  // ---- entity creation / removal ------------------------------------------

  private newId(): number {
    return this.state.nextId++;
  }

  addResource(type: ResourceNode['type'], tx: number, ty: number, amount: number): ResourceNode {
    const size = type === 'goldmine' ? CONFIG.resources.goldmine.size : 1;
    const node: ResourceNode = {
      id: this.newId(),
      kind: 'resource',
      type,
      owner: -1,
      tx,
      ty,
      w: size,
      h: size,
      x: tx + size / 2,
      y: ty + size / 2,
      amount,
      maxAmount: amount,
    };
    this.state.entities[node.id] = node;
    this.lists = null;
    this.nav.addFootprint(node.id, node);
    this.state.navVersion = this.nav.version;
    return node;
  }

  /** Add a building; progress < 1 places an unfinished foundation. */
  addBuilding(type: BuildingType, owner: number, tx: number, ty: number, progress = 1): Building {
    const def = CONFIG.buildings[type];
    const b: Building = {
      id: this.newId(),
      kind: 'building',
      type,
      owner,
      tx,
      ty,
      w: def.size,
      h: def.size,
      x: tx + def.size / 2,
      y: ty + def.size / 2,
      hp: progress >= 1 ? def.hp : Math.max(1, Math.round(def.hp * CONFIG.construction.startHpFraction)),
      maxHp: def.hp,
      progress,
      queue: [],
      rally: null,
      cooldown: 0,
      targetId: -1,
      seenBy: 1 << owner,
      tier: 1,
    };
    this.state.entities[b.id] = b;
    this.lists = null;
    this.nav.addFootprint(b.id, b);
    this.state.navVersion = this.nav.version;
    return b;
  }

  addUnit(type: UnitType, owner: number, x: number, y: number): Unit {
    const def = CONFIG.units[type];
    const u: Unit = {
      id: this.newId(),
      kind: 'unit',
      type,
      owner,
      x,
      y,
      px: x,
      py: y,
      hp: def.hp,
      maxHp: def.hp,
      radius: def.radius,
      facing: Math.PI / 2,
      order: null,
      orderQueue: [],
      move: null,
      carry: { res: null, amount: 0 },
      hidden: false,
      cooldown: 0,
      swing: 0,
      swingTarget: -1,
      home: null,
      hero: null,
      stun: 0,
      buffs: [],
    };
    this.state.entities[u.id] = u;
    this.lists = null;
    return u;
  }

  /** Place units on free tiles around a footprint, nearest first. */
  spawnUnitsNear(type: UnitType, owner: number, f: Footprint, count: number): Unit[] {
    const spots = this.freeTilesAround(f, count);
    return spots.map((s) => this.addUnit(type, owner, s.x + 0.5, s.y + 0.5));
  }

  /** Free passable tiles in rings around a footprint, skipping occupied ones. */
  freeTilesAround(f: Footprint, count: number): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    const taken = new Set<number>();
    for (const u of this.units()) taken.add(Math.floor(u.y) * this.nav.w + Math.floor(u.x));
    for (let ring = 1; ring < 12 && out.length < count; ring++) {
      // Walk the ring clockwise starting below the footprint (toward the viewer).
      const cand: Array<{ x: number; y: number }> = [];
      for (let x = f.tx - ring; x < f.tx + f.w + ring; x++) cand.push({ x, y: f.ty + f.h - 1 + ring });
      for (let y = f.ty + f.h - 1 + ring; y >= f.ty - ring; y--) cand.push({ x: f.tx + f.w - 1 + ring, y });
      for (let x = f.tx + f.w - 1 + ring; x >= f.tx - ring; x--) cand.push({ x, y: f.ty - ring });
      for (let y = f.ty - ring; y <= f.ty + f.h - 1 + ring; y++) cand.push({ x: f.tx - ring, y });
      for (const c of cand) {
        const key = c.y * this.nav.w + c.x;
        if (out.length >= count) break;
        if (!this.nav.passable(c.x, c.y) || taken.has(key)) continue;
        taken.add(key);
        out.push(c);
      }
    }
    return out;
  }

  removeEntity(id: number): void {
    const e = this.state.entities[id];
    if (!e) return;
    if (e.kind !== 'unit') {
      this.nav.removeFootprint(e);
      this.state.navVersion = this.nav.version;
    }
    delete this.state.entities[id];
    this.lists = null;
  }

  // ---- commands, events, stepping -----------------------------------------

  /** Queue a command; it is applied at the start of the next tick. */
  issue(cmd: Command): void {
    this.pending.push(cmd);
  }

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  /** Events since the last drain (for renderer/UI feedback; not game state). */
  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  step(): void {
    if (this.state.tick % CONFIG.vision.updateTicks === 0) this.vision.recompute();
    const cmds = this.pending;
    this.pending = [];
    for (const c of cmds) applyCommand(this, c);
    updateProduction(this);

    const units = this.units();
    for (const u of units) {
      u.px = u.x;
      u.py = u.y;
    }
    updateStatus(this, units);
    for (const u of units) {
      if (!this.state.entities[u.id]) continue;
      if (u.stun > 0) {
        // Stunned: no orders progress this tick (they resume afterwards).
        u.stun--;
        continue;
      }
      // The current order finished: start the next Shift-queued one.
      while (u.order === null && u.orderQueue.length) applyQueued(this, u, u.orderQueue.shift()!);
      if (u.order?.type === 'cast') {
        updateCast(this, u, u.order);
      } else if (u.order?.type === 'move') {
        if (!u.move) this.moveTo(u, { kind: 'point', x: u.order.x, y: u.order.y });
        else if (u.move.state !== 'moving') {
          u.order = null;
          u.move = null;
        }
      } else if (u.order?.type === 'gather') {
        updateGatherer(this, u, u.order);
      } else if (u.order?.type === 'build') {
        updateBuilder(this, u, u.order);
      } else {
        // Idle units (auto-acquire) and attack / attack-move / hold orders.
        updateCombatOrder(this, u);
      }
    }
    const alive = units.filter((u) => this.state.entities[u.id]);
    updateMovement(this, alive);
    updateCombat(this, alive);
    checkOutcome(this);
    this.state.tick++;
  }

  /** Start (or keep) moving toward a goal. Re-plans only if the goal changed. */
  moveTo(u: Unit, goal: MoveGoal): void {
    if (u.move && sameGoal(u.move.goal, goal) && u.move.state === 'moving') return;
    u.move = {
      goal,
      path: [],
      state: 'moving',
      checkX: u.x,
      checkY: u.y,
      checkTick: this.state.tick,
      repaths: 0,
      navVersion: -1,
    };
    planPath(this, u);
  }
}

function sameGoal(a: MoveGoal, b: MoveGoal): boolean {
  if (a.kind === 'point' && b.kind === 'point') return a.x === b.x && a.y === b.y;
  if (a.kind === 'rect' && b.kind === 'rect') return a.tx === b.tx && a.ty === b.ty && a.w === b.w && a.h === b.h;
  return false;
}
