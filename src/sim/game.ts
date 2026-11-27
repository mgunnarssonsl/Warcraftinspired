// Game owns the serializable GameState plus derived caches (navigation grid)
// and advances the simulation one fixed tick at a time. Rendering, input and
// AI never mutate state directly; they submit Commands.

import { updateScenario } from './scenarios';
import { isCustomMap, registerMap, type MapDef } from './maps';
import { DEFAULT_RULES, isDefaultRules, rulesOf, type MatchRules } from './rules';
import { FACTION, isHealer, isWorker, type FactionId } from './factions';
import { updateRegrowth } from './regrowth';
import { updateGrowth } from './construction';
import { CONFIG, secondsToTicks, type BuildingType, type ItemId, type UnitType } from './config';
import { applyCommand, applyQueued, type Command } from './commands';
import { updateCombat, updateCombatOrder } from './combat';
import { checkOutcome } from './outcome';
import { updateCast, updateStatus } from './hero';
import { updatePrayers } from './support';
import { updateFountains, updatePickup } from './items';
import { updateBuilder, updateRepairer } from './construction';
import { updateProduction } from './production';
import { updateGatherer } from './gathering';
import { generateMap } from './mapgen';
import { updateMovement } from './movement';
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
import { len } from './dmath';
import { updateDashes, updateMount, updateSkill, updateSpecialize } from './elite';

export const PLAYER_COLORS = ['#3a7bd5', '#c0392b', '#27ae60', '#8e44ad'];
export const NEUTRAL_COLOR = '#8a5a2b';


export class Game {
  state: GameState;
  nav: NavGrid;
  private pending: Command[] = [];
  private events: GameEvent[] = [];

  vision: Vision;

  /** Told about every command as it takes effect, whoever gave it (replay recording). Not game state. */
  onApply: ((tick: number, c: Command) => void) | null = null;

  constructor(state: GameState, visible?: string[]) {
    // A custom map travels with its match (saves, replays): make it known here.
    if (state.mapDef) registerMap(state.mapDef);
    this.state = state;
    this.nav = new NavGrid(state);
    this.vision = new Vision(this, visible);
  }

  /** Build the skirmish starting state for a map and seed. */
  static create(seed: number, mapId?: string, factions: FactionId[] = [], customRules?: MatchRules): Game {
    const layout = generateMap(seed, mapId);
    const rules = customRules ?? DEFAULT_RULES;
    const state: GameState = {
      seed,
      mapId: layout.def.id,
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
          gold: rules.startGold,
          wood: rules.startWood,
          goldGathered: 0,
          woodGathered: 0,
          neutral: false,
          defeated: false,
          stats: emptyStats(),
          research: {},
          heroes: [],
          flareReady: 0,
          incomeBonus: 0,
          incomeOwed: 0,
          faction: factions[i] ?? 'crown',
        }),
      ),
      entities: {},
      projectiles: [],
      outcome: null,
      victoryRules: true,
      ...(isCustomMap(layout.def.id) ? { mapDef: JSON.parse(JSON.stringify(layout.def)) as MapDef } : {}),
      ...(customRules && !isDefaultRules(customRules) ? { rules: customRules } : {}),
      explored: [],
      starts: layout.starts.map((s) => ({ x: s.hq.tx + CONFIG.buildings.hq.size / 2, y: s.hq.ty + CONFIG.buildings.hq.size / 2 })),
      items: [],
      camps: [],
      reveals: [],
      memory: [],
      history: [],
    };
    const game = new Game(state);
    for (const i of layout.trees) {
      const x = i % layout.width;
      const y = (i - x) / layout.width;
      game.addResource('tree', x, y, CONFIG.resources.tree.wood);
    }
    for (const m of layout.mines) {
      const kind = CONFIG.mineKinds[m.kind];
      game.addResource('goldmine', m.tx, m.ty, kind.gold, kind.miners);
    }
    layout.starts.forEach((s, p) => {
      const f = FACTION[game.player(p).faction];
      const hq = game.addBuilding(f.buildings.hq, p, s.hq.tx, s.hq.ty);
      game.spawnUnitsNear(f.units.worker, p, hq, rules.startWorkers);
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
      heroes: [],
      flareReady: 0,
      incomeBonus: 0,
      incomeOwed: 0,
      faction: 'crown',
    });
    // Camps guard mines, and lairs guard treasure. Each camp of a mirrored
    // pair has the same guards and drops the same item.
    const dropsUsed: Record<number, number> = {};
    const pickDrop = (tier: 1 | 2 | 3) => {
      const pool = CONFIG.campDrops[tier] as readonly ItemId[];
      const n = (dropsUsed[tier] = (dropsUsed[tier] ?? 0) + 1);
      return pool[(n - 1 + (seed >>> 0)) % pool.length];
    };
    const addCampPair = (level: number, x: number, y: number, guards: readonly UnitType[], around: Footprint, drop: ItemId) => {
      const spots = game.freeTilesAround(around, guards.length);
      const first = state.camps.length;
      state.camps.push({ level, x, y, drop, cleared: false, seenClear: 0 }, { level, x: layout.width - x, y: layout.height - y, drop, cleared: false, seenClear: 0 });
      guards.forEach((type, k) => {
        const s = spots[k];
        if (!s) return;
        [[s.x + 0.5, s.y + 0.5], [layout.width - s.x - 0.5, layout.height - s.y - 0.5]].forEach(([gx, gy], side) => {
          const u = game.addUnit(type, neutral, gx, gy);
          u.home = { x: gx, y: gy };
          u.camp = first + side;
        });
      });
    };
    const size = CONFIG.resources.goldmine.size;
    for (let i = 0; i < (rules.camps ? layout.mines.length : 0); i += 2) {
      const m = layout.mines[i];
      if (!m.camp) continue;
      const level = m.camp as 1 | 2 | 3;
      addCampPair(level, m.tx + size / 2, m.ty + size / 2, CONFIG.campLevels[level], { tx: m.tx, ty: m.ty, w: size, h: size }, pickDrop(level));
    }
    for (let i = 0; i < (rules.camps ? layout.lairs.length : 0); i += 2) {
      const l = layout.lairs[i];
      // A lair's treasure is one tier better than its guards' level.
      const tier = Math.min(3, l.level + 1) as 2 | 3;
      addCampPair(l.level, l.x, l.y, CONFIG.lairGuards[l.level], { tx: Math.floor(l.x), ty: Math.floor(l.y), w: 1, h: 1 }, pickDrop(tier));
    }
    if (layout.objectives.length) {
      // Map-authored objectives; public map knowledge, like the mines.
      for (const o of layout.objectives) game.addBuilding(o.type, neutral, o.tx, o.ty).seenBy = (1 << state.players.length) - 1;
    } else game.placeObjectives(neutral);
    // Custom rule: the map is known from the start (terrain, mines, camps' places).
    if (rules.fog !== 'normal') {
      game.vision.recompute();
      for (const exp of state.explored) exp.fill(1);
      game.vision.recompute();
    }
    return game;
  }

  /**
   * Trading Posts and Healing Fountains: mirrored pairs on the line of points
   * equally far from both starts, so neither side is closer to any of them.
   */
  private placeObjectives(owner: number): void {
    const { width: W, height: H } = this.state.map;
    const [a, b] = this.state.starts;
    if (!a || !b) return;
    const span = len(b.x - a.x, b.y - a.y) || 1;
    const dir = { x: -(b.y - a.y) / span, y: (b.x - a.x) / span };
    const home = this.nav.component(Math.floor(a.x), Math.floor(a.y + 3));
    for (const [type, offset] of [['shop', 15], ['fountain', 8]] as const) {
      const size = CONFIG.buildings[type].size;
      const px = W / 2 + dir.x * offset;
      const py = H / 2 + dir.y * offset;
      const site = this.findOpenSite(size, px, py, home);
      if (!site) continue;
      // Public map knowledge, like the mines: every player knows where they are.
      for (const b of [this.addBuilding(type, owner, site.tx, site.ty), this.addBuilding(type, owner, W - site.tx - size, H - site.ty - size)])
        b.seenBy = (1 << this.state.players.length) - 1;
    }
  }

  /** Nearest footprint around (x, y) with a free border, whose mirror is free too. */
  private findOpenSite(size: number, x: number, y: number, component: number): { tx: number; ty: number } | null {
    const { width: W, height: H } = this.state.map;
    const free = (tx: number, ty: number) => {
      for (let j = ty - 1; j <= ty + size; j++) for (let i = tx - 1; i <= tx + size; i++) if (!this.nav.passable(i, j) || this.nav.entityAt[j * this.nav.w + i]) return false;
      return true;
    };
    const cx = Math.round(x - size / 2);
    const cy = Math.round(y - size / 2);
    for (let r = 0; r < 14; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = cx + dx;
          const ty = cy + dy;
          if (!this.nav.inBounds(tx - 1, ty - 1) || !this.nav.inBounds(tx + size, ty + size)) continue;
          if (!free(tx, ty) || !free(W - tx - size, H - ty - size)) continue;
          if (this.nav.component(tx - 1, ty - 1) !== component) continue;
          // Keep clear of mines and the camps guarding them: shopping should
          // not mean fighting a camp.
          const cx2 = tx + size / 2;
          const cy2 = ty + size / 2;
          if (this.resources().some((m) => m.type === 'goldmine' && Math.min(len(m.x - cx2, m.y - cy2), len(m.x - (W - cx2), m.y - (H - cy2))) < 9)) continue;
          return { tx, ty };
        }
    return null;
  }

  static fromJSON(json: string): Game {
    return new Game(JSON.parse(json) as GameState);
  }

  /** Rebuild a game from saved state, with commands issued but not yet applied. */
  static restore(state: GameState, pending: Command[] = [], visible?: string[]): Game {
    const g = new Game(state, visible);
    g.pending = pending.map((c) => ({ ...c }));
    return g;
  }

  /** Commands issued since the last step (part of a save). */
  pendingCommands(): Command[] {
    return this.pending.map((c) => ({ ...c }));
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
    return Math.min(n, rulesOf(this.state).maxPop);
  }

  idleWorkers(player: number): Unit[] {
    return this.units().filter((u) => u.owner === player && isWorker(u.type) && u.order === null);
  }

  // ---- entity creation / removal ------------------------------------------

  private newId(): number {
    return this.state.nextId++;
  }

  addResource(type: ResourceNode['type'], tx: number, ty: number, amount: number, miners: number = CONFIG.resources.goldmine.maxMiners): ResourceNode {
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
      miners,
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
      grows: false,
      hurt: -1e9,
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
      camp: -1,
      mana: isHealer(type) ? CONFIG.cleric.mana : 0,
      prayerReady: 0,
      hurt: -1e9,
      xp: 0,
      nxp: 0,
      ready: {},
      stance: false,
      dash: null,
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
    const { width: W, height: H } = this.state.map;
    const flip = f.tx + f.w / 2 + (f.ty + f.h / 2) > (W + H) / 2;
    for (let ring = 1; ring < 12 && out.length < count; ring++) {
      // Walk the ring clockwise starting below the footprint (toward the viewer).
      const cand: Array<{ x: number; y: number }> = [];
      for (let x = f.tx - ring; x < f.tx + f.w + ring; x++) cand.push({ x, y: f.ty + f.h - 1 + ring });
      for (let y = f.ty + f.h - 1 + ring; y >= f.ty - ring; y--) cand.push({ x: f.tx + f.w - 1 + ring, y });
      for (let x = f.tx + f.w - 1 + ring; x >= f.tx - ring; x--) cand.push({ x, y: f.ty - ring });
      for (let y = f.ty - ring; y <= f.ty + f.h - 1 + ring; y++) cand.push({ x: f.tx - ring, y });
      // Maps are point-symmetric: in the rotated half, walk the ring rotated
      // too, so both seats get mirror-image spawn spots.
      if (flip) for (const c of cand) {
        c.x = 2 * f.tx + f.w - 1 - c.x;
        c.y = 2 * f.ty + f.h - 1 - c.y;
      }
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
    for (const c of cmds) {
      this.onApply?.(this.state.tick, c);
      applyCommand(this, c);
    }
    updateProduction(this);

    const units = this.units();
    for (const u of units) {
      u.px = u.x;
      u.py = u.y;
    }
    updateStatus(this, units);
    updatePrayers(this, units);
    updateFountains(this);
    updateRegrowth(this);
    updateGrowth(this);
    for (const u of units) {
      if (!this.state.entities[u.id]) continue;
      if (u.stun > 0) {
        // Stunned: no orders progress this tick (they resume afterwards).
        u.stun--;
        continue;
      }
      // Mid-charge: the dash carries it (see updateDashes); orders wait.
      if (u.dash) continue;
      // The current order finished: start the next Shift-queued one.
      while (u.order === null && u.orderQueue.length) applyQueued(this, u, u.orderQueue.shift()!);
      if (u.order?.type === 'skill') {
        updateSkill(this, u, u.order);
      } else if (u.order?.type === 'mount') {
        updateMount(this, u, u.order);
      } else if (u.order?.type === 'specialize') {
        updateSpecialize(this, u, u.order);
      } else if (u.order?.type === 'cast') {
        updateCast(this, u, u.order);
      } else if (u.order?.type === 'pickup') {
        updatePickup(this, u, u.order);
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
      } else if (u.order?.type === 'repair') {
        updateRepairer(this, u, u.order);
      } else {
        // Idle units (auto-acquire) and attack / attack-move / hold orders.
        updateCombatOrder(this, u);
      }
    }
    const alive = units.filter((u) => this.state.entities[u.id]);
    updateDashes(this, alive);
    updateMovement(this, alive);
    updateCombat(this, alive);
    if (this.state.scenario) updateScenario(this);
    checkOutcome(this);
    if (this.state.tick % secondsToTicks(CONFIG.match.historySeconds) === 0) this.sampleHistory();
    this.state.tick++;
  }

  /** Record each player's economy and army for the match summary. */
  private sampleHistory(): void {
    const players = this.state.players.map((p) => {
      let workers = 0;
      let army = 0;
      let value = 0;
      for (const u of this.units()) {
        if (u.owner !== p.id) continue;
        if (isWorker(u.type)) workers++;
        else {
          army++;
          const c = CONFIG.units[u.type].cost;
          value += c.gold + c.wood;
        }
      }
      return { gold: p.goldGathered, wood: p.woodGathered, workers, army, value, kills: p.stats.kills, lost: p.stats.unitsLost };
    });
    this.state.history.push({ tick: this.state.tick, players });
  }

  /** Start (or keep) moving toward a goal. Re-plans only if the goal changed. */
  /** Did the unit's last attempt to reach this goal fail? */
  moveFailed(u: Unit, goal: MoveGoal): boolean {
    return u.move?.state === 'failed' && sameGoal(u.move.goal, goal);
  }

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
    // Planned in the movement step (see updateMovement), within the tick's search budget.
  }
}

function sameGoal(a: MoveGoal, b: MoveGoal): boolean {
  if (a.kind === 'point' && b.kind === 'point') return a.x === b.x && a.y === b.y;
  if (a.kind === 'rect' && b.kind === 'rect') return a.tx === b.tx && a.ty === b.ty && a.w === b.w && a.h === b.h;
  return false;
}
