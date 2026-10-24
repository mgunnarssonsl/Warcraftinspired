// Computer opponent. It acts only by issuing the same Commands a human can,
// pays the same costs and obeys the same rules; difficulty changes only its
// decision timing and priorities (CONFIG.ai.profiles).
//
// Information: under the same fog of war as the human. It knows enemy units
// it can currently see, enemy buildings it has seen, neutral camps it has
// spotted (remembered), and the public start locations. All of it goes
// through `visible()` and `campsSeen`.
//
// Its loop, every think interval:
//   economy  - keep Keeps training Laborers, ~5 per mine on gold, the rest on wood
//   build    - Farms ahead of demand, then Barracks, Lumber Mill, Tower,
//              more Barracks, and an expansion Keep, one plan at a time
//   army     - Guards and Archers from every Barracks, gathered at a staging point
//   military - defend anything near its buildings; launch attack waves that
//              grow each time; fall back when a wave is mostly lost

import { CONFIG, secondsToTicks, type AbilityId, type BuildingType, type ResearchId, type UnitType } from '../sim/config';
import { isEnemy } from '../sim/combat';
import type { Game } from '../sim/game';
import { distToRect } from '../sim/movement';
import { castProblem } from '../sim/hero';
import { hasCompleted, trainCost } from '../sim/production';
import { researched, researchPending, researchProblem } from '../sim/tech';
import type { Building, Entity, ResourceNode, Unit } from '../sim/types';
import { findSite } from './placement';

export type Difficulty = keyof typeof CONFIG.ai.profiles;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export class ComputerPlayer {
  private readonly profile;
  private readonly thinkTicks: number;
  /** Current wave threshold; grows after every wave. */
  private waveSize: number;
  private wave: number[] = [];
  private waveLaunched = 0;
  private lastDefend = -1e9;
  private lastWaveOrder = -1e9;

  constructor(
    readonly player: number,
    readonly difficulty: Difficulty,
  ) {
    this.profile = CONFIG.ai.profiles[difficulty];
    this.thinkTicks = secondsToTicks(this.profile.thinkSeconds);
    this.waveSize = this.profile.waveSize;
  }

  update(game: Game): void {
    // Stagger players so two computers do not think on the same tick.
    if ((game.state.tick + this.player * 7) % this.thinkTicks !== 0) return;
    const me = game.player(this.player);
    if (!me || me.defeated || game.state.outcome) return;
    this.think(game);
  }

  /** Camp-clearing target of the current wave, if it is a creeping party. */
  private creepAt: { x: number; y: number } | null = null;
  private cleared = new Set<string>();

  /** Search points a wave has already visited without finding anything. */
  private searched = new Set<string>();

  private searchSpots(game: Game): Array<{ x: number; y: number }> {
    const spots: Array<{ x: number; y: number }> = [];
    game.state.starts.forEach((s, p) => {
      if (p !== this.player && !game.player(p).neutral && !game.player(p).defeated) spots.push(s);
    });
    for (const m of game.resources()) if (m.type === 'goldmine') spots.push({ x: m.x, y: m.y });
    return spots;
  }

  /** Neutral guards it has spotted: places not to send a lone builder. */
  private campsSeen: Array<{ x: number; y: number }> = [];

  /** Enemy units it sees now, and enemy buildings it has seen. */
  private visible(game: Game): Array<Unit | Building> {
    const out: Array<Unit | Building> = [];
    const v = game.vision;
    for (const u of game.units()) if (isEnemy(game, this.player, u.owner) && !u.hidden && v.canSee(this.player, u)) out.push(u);
    for (const b of game.buildings()) if (isEnemy(game, this.player, b.owner) && v.knows(this.player, b)) out.push(b);
    for (const u of out) {
      if (u.kind !== 'unit' || !game.player(u.owner).neutral || !u.home) continue;
      if (!this.campsSeen.some((c) => dist(c, u.home!) < 4)) this.campsSeen.push({ ...u.home });
    }
    return out;
  }

  private think(game: Game): void {
    const P = this.player;
    const units = game.units().filter((u) => u.owner === P);
    const workers = units.filter((u) => u.type === 'worker');
    const army = units.filter((u) => u.type !== 'worker');
    const buildings = game.buildings().filter((b) => b.owner === P);
    const keeps = buildings.filter((b) => b.type === 'hq' && b.progress >= 1);
    const plan = this.planBuilding(game, workers, buildings);
    // Money promised to builders still walking to their sites (paid on arrival)
    // must not be spent elsewhere meanwhile, or the builder arrives broke.
    const reserve = { gold: 0, wood: 0 };
    for (const w of workers) {
      const o = w.order;
      if (o?.type !== 'build' || o.siteId >= 0) continue;
      reserve.gold += CONFIG.buildings[o.buildingType].cost.gold;
      reserve.wood += CONFIG.buildings[o.buildingType].cost.wood;
    }
    const committed = { ...reserve };
    if (plan) {
      reserve.gold += CONFIG.buildings[plan].cost.gold;
      reserve.wood += CONFIG.buildings[plan].cost.wood;
    }

    this.economy(game, workers, keeps, reserve);
    if (plan) this.build(game, plan, workers, buildings, keeps, committed);
    this.resumeAbandoned(game, workers, buildings);
    this.trainArmy(game, army, buildings, keeps, reserve);
    this.military(game, army, workers, buildings, keeps);
  }

  // ---- economy ------------------------------------------------------------

  private minesNear(game: Game, k: Building): ResourceNode[] {
    return game
      .resources()
      .filter((r) => r.type === 'goldmine' && distToRect(r.x, r.y, k) < 12)
      .sort((a, b) => dist(a, k) - dist(b, k));
  }

  private nearestTree(game: Game, p: { x: number; y: number }): ResourceNode | undefined {
    let best: ResourceNode | undefined;
    let bestD = Infinity;
    for (const r of game.resources()) {
      if (r.type !== 'tree') continue;
      const d = dist(r, p);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  }

  private economy(game: Game, workers: Unit[], keeps: Building[], reserve: { gold: number }): void {
    const P = this.player;
    const me = game.player(P);
    // Laborers: always rebuild a minimal economy; otherwise respect the build reserve.
    const queued = keeps.reduce((n, k) => n + k.queue.filter((q) => q.unit === 'worker').length, 0);
    // Enough to fill every mine beside a Keep plus a modest wood crew (wood is
    // needed far less than gold), capped by the difficulty's target per Keep.
    const goldSlots = keeps.reduce((n, k) => n + Math.min(1, this.minesNear(game, k).length) * CONFIG.ai.goldWorkersPerMine, 0);
    const woodCrew = me.wood > CONFIG.ai.woodSurplus ? 2 : 5;
    const wanted = Math.min(goldSlots + woodCrew, this.profile.workerTarget * Math.max(1, keeps.length));
    for (const k of keeps) {
      if (workers.length + queued >= wanted) break;
      if (k.queue.length > 0) continue;
      const spare = workers.length < 6 ? me.gold : me.gold - reserve.gold;
      if (spare >= CONFIG.units.worker.cost.gold) game.issue({ type: 'train', player: P, buildingId: k.id, unit: 'worker' });
      const mine = this.minesNear(game, k)[0];
      if (mine && k.rally?.targetId !== mine.id)
        game.issue({ type: 'setRally', player: P, buildingId: k.id, x: mine.x, y: mine.y, targetId: mine.id });
    }

    // Count gold workers per mine; move extras to wood, fill gaps from idle.
    const onMine = new Map<number, Unit[]>();
    for (const w of workers) {
      const o = w.order;
      if (o?.type === 'gather' && o.res === 'gold') onMine.set(o.nodeId, [...(onMine.get(o.nodeId) ?? []), w]);
    }
    const cap = CONFIG.ai.goldWorkersPerMine;
    const toWood: Unit[] = [];
    for (const list of onMine.values()) if (list.length > cap) toWood.push(...list.slice(cap).filter((w) => !w.hidden && w.carry.amount === 0));
    const idle = workers.filter((w) => w.order === null);
    for (const w of idle) {
      let target: ResourceNode | undefined;
      for (const k of keeps) {
        for (const m of this.minesNear(game, k)) {
          const n = onMine.get(m.id)?.length ?? 0;
          if (n < cap) {
            target = m;
            onMine.set(m.id, [...(onMine.get(m.id) ?? []), w]);
            break;
          }
        }
        if (target) break;
      }
      if (target) game.issue({ type: 'gather', player: P, units: [w.id], nodeId: target.id });
      else toWood.push(w);
    }
    for (const w of toWood) {
      const k = keeps.reduce<Building | undefined>((a, b) => (!a || dist(b, w) < dist(a, w) ? b : a), undefined);
      const mill = game.buildings().find((b) => b.owner === P && b.type === 'lumbermill' && b.progress >= 1);
      const tree = this.nearestTree(game, mill ?? k ?? w);
      if (tree) game.issue({ type: 'gather', player: P, units: [w.id], nodeId: tree.id });
    }
  }

  // ---- construction ---------------------------------------------------------

  private planBuilding(game: Game, workers: Unit[], buildings: Building[]): BuildingType | null {
    if (!workers.length) return null;
    const P = this.player;
    const count = (t: BuildingType) => buildings.filter((b) => b.type === t).length;
    const unfinished = buildings.filter((b) => b.progress < 1).length + workers.filter((w) => w.order?.type === 'build' && w.order.siteId < 0).length;
    if (count('hq') === 0) return 'hq'; // lost the base: rebuild before anything else
    if (unfinished >= this.profile.builders) return null;
    const pending = buildings.reduce((n, b) => n + b.queue.filter((q) => !q.started).reduce((s, q) => s + (q.unit ? CONFIG.units[q.unit].pop : 0), 0), 0);
    const spare = game.popCap(P) - game.popUsed(P) - pending;
    const farmsBuilding = buildings.some((b) => b.type === 'farm' && b.progress < 1) || workers.some((w) => w.order?.type === 'build' && w.order.buildingType === 'farm');
    const buffer = CONFIG.ai.popBuffer + 2 * count('barracks');
    if (spare < buffer && game.popCap(P) < CONFIG.match.maxPop && !farmsBuilding) return 'farm';
    if (count('barracks') === 0 && workers.length >= this.profile.barracksAtWorkers) return 'barracks';
    if (count('barracks') > 0 && count('lumbermill') === 0) return 'lumbermill';
    if (count('barracks') > 0 && count('altar') === 0) return 'altar';
    if (count('tower') < this.profile.towers && hasCompleted(game, P, 'barracks')) return 'tower';
    if (this.profile.upgrades && count('smithy') === 0 && hasCompleted(game, P, 'lumbermill')) return 'smithy';
    const me = game.player(P);
    if (count('barracks') < this.profile.maxBarracks && workers.length >= 11 && me.gold >= 300) return 'barracks';
    const seconds = game.state.tick / 20;
    const starved = me.wood > CONFIG.ai.woodSurplus && seconds > 180;
    const homeMineLow = this.homeMineLow(game, buildings);
    if (count('hq') < 2 && (seconds >= this.profile.expandSeconds || homeMineLow || starved) && this.expansionMine(game, buildings)) return 'hq';
    return null;
  }

  private homeMineLow(game: Game, buildings: Building[]): boolean {
    const k = buildings.find((b) => b.type === 'hq');
    if (!k) return false;
    const m = this.minesNear(game, k)[0];
    return !m || m.amount < 1500;
  }

  /** Closest unguarded mine without a Keep beside it. */
  private expansionMine(game: Game, buildings: Building[]): ResourceNode | undefined {
    const home = buildings.find((b) => b.type === 'hq') ?? buildings[0];
    if (!home) return undefined;
    const hostiles = [...this.visible(game).filter((e) => e.kind === 'unit'), ...this.campsSeen];
    return game
      .resources()
      .filter((m) => m.type === 'goldmine' && m.amount > 2000)
      .filter((m) => !game.buildings().some((b) => b.type === 'hq' && distToRect(m.x, m.y, b) < 12))
      .filter((m) => !hostiles.some((h) => dist(h, m) < 9)) // guarded: leave it
      .sort((a, b) => dist(a, home) - dist(b, home))[0];
  }

  private siteFor(game: Game, type: BuildingType, buildings: Building[], keeps: Building[]) {
    const P = this.player;
    const home = keeps[0] ?? buildings[0];
    if (type === 'hq') {
      const m = this.expansionMine(game, buildings) ?? (home ? this.minesNear(game, home)[0] : undefined);
      return m ? findSite(game, P, 'hq', m.x, m.y) : null;
    }
    if (!home) return null;
    if (type === 'lumbermill') {
      const tree = this.nearestTree(game, home);
      return tree ? findSite(game, P, type, tree.x + Math.sign(home.x - tree.x) * 2, tree.y + Math.sign(home.y - tree.y) * 2) : null;
    }
    if (type === 'tower' || type === 'barracks' || type === 'altar' || type === 'smithy') {
      const s = this.staging(game, home);
      return findSite(game, P, type, (s.x + home.x) / 2, (s.y + home.y) / 2);
    }
    // Farms tuck in behind the Keep, away from the map centre.
    const c = this.mapCentre(game);
    return findSite(game, P, type, home.x + Math.sign(home.x - c.x) * 4, home.y + Math.sign(home.y - c.y) * 4);
  }

  private build(
    game: Game,
    type: BuildingType,
    workers: Unit[],
    buildings: Building[],
    keeps: Building[],
    committed: { gold: number; wood: number },
  ): void {
    const me = game.player(this.player);
    const cost = CONFIG.buildings[type].cost;
    if (me.gold - committed.gold < cost.gold || me.wood - committed.wood < cost.wood) return;
    const site = this.siteFor(game, type, buildings, keeps);
    if (!site) return;
    const centre = { x: site.tx + site.w / 2, y: site.ty + site.h / 2 };
    const candidates = workers.filter((w) => w.order?.type !== 'build' && !w.hidden);
    const woodies = candidates.filter((w) => w.order?.type === 'gather' && w.order.res === 'wood');
    const pool = woodies.length ? woodies : candidates;
    if (!pool.length) return;
    const builder = pool.reduce((a, b) => (dist(b, centre) < dist(a, centre) ? b : a));
    game.issue({ type: 'build', player: this.player, units: [builder.id], buildingType: type, tx: site.tx, ty: site.ty });
  }

  /** Foundations whose builder died or was pulled away get a new builder. */
  private resumeAbandoned(game: Game, workers: Unit[], buildings: Building[]): void {
    for (const b of buildings) {
      if (b.progress >= 1) continue;
      if (workers.some((w) => w.order?.type === 'build' && w.order.siteId === b.id)) continue;
      const free = workers.filter((w) => w.order?.type !== 'build' && !w.hidden);
      if (!free.length) return;
      const w = free.reduce((a, c) => (dist(c, b) < dist(a, b) ? c : a));
      game.issue({ type: 'resumeBuild', player: this.player, units: [w.id], buildingId: b.id });
    }
  }

  // ---- army -------------------------------------------------------------------

  private mapCentre(game: Game) {
    return { x: game.state.map.width / 2, y: game.state.map.height / 2 };
  }

  /** Gathering point in front of the base, toward the map centre. */
  private staging(game: Game, home: Building) {
    const c = this.mapCentre(game);
    const d = Math.max(1, dist(home, c));
    return { x: home.x + ((c.x - home.x) / d) * 7, y: home.y + ((c.y - home.y) / d) * 7 };
  }

  private trainArmy(game: Game, army: Unit[], buildings: Building[], keeps: Building[], reserve: { gold: number; wood: number }): void {
    const P = this.player;
    const me = game.player(P);
    const home = keeps[0];
    // The hero comes first: train it, or revive it when it falls.
    const altar = buildings.find((b) => b.type === 'altar' && b.progress >= 1);
    const rec = me.hero;
    if (altar && (!rec || !rec.alive) && !buildings.some((b) => b.queue.some((q) => q.unit === 'hero'))) {
      const c = trainCost(game, P, 'hero');
      if (me.gold >= c.gold && me.wood >= c.wood) {
        if (home && !altar.rally) {
          const s = this.staging(game, home);
          game.issue({ type: 'setRally', player: P, buildingId: altar.id, x: s.x, y: s.y, targetId: -1 });
        }
        game.issue({ type: 'train', player: P, buildingId: altar.id, unit: 'hero' });
        return;
      }
    }
    this.research(game, buildings, reserve);
    const archers = army.filter((u) => u.type === 'archer').length;
    for (const b of buildings) {
      if (b.type !== 'barracks' || b.progress < 1) continue;
      if (home && !b.rally) {
        const s = this.staging(game, home);
        game.issue({ type: 'setRally', player: P, buildingId: b.id, x: s.x, y: s.y, targetId: -1 });
      }
      if (b.queue.length >= 2) continue;
      const wantArcher = hasCompleted(game, P, 'lumbermill') && archers < (army.length + 1) * this.profile.archerShare;
      const unit: UnitType = wantArcher ? 'archer' : 'guard';
      const c = CONFIG.units[unit].cost;
      if (me.gold - reserve.gold >= c.gold && me.wood - reserve.wood >= c.wood)
        game.issue({ type: 'train', player: P, buildingId: b.id, unit });
    }
  }

  /** Upgrades in a fixed order, when the economy can spare it. */
  private research(game: Game, buildings: Building[], reserve: { gold: number; wood: number }): void {
    if (!this.profile.upgrades) return;
    const P = this.player;
    const me = game.player(P);
    const seconds = game.state.tick / 20;
    const order: ResearchId[] = ['weapons1', 'armor1', 'saws'];
    if (this.profile.castleSeconds !== null && seconds >= this.profile.castleSeconds) order.push('castle', 'weapons2', 'armor2');
    for (const id of order) {
      const def = CONFIG.research[id];
      if (researched(game, P, id) || researchPending(game, P, id)) continue;
      const b = buildings.find((x) => x.type === def.at && x.progress >= 1 && x.queue.length === 0);
      if (!b || researchProblem(game, P, b, id)) continue;
      if (me.gold - reserve.gold - CONFIG.ai.researchBuffer < def.cost.gold || me.wood - reserve.wood < def.cost.wood) return;
      game.issue({ type: 'research', player: P, buildingId: b.id, research: id });
      return; // one new research per think
    }
  }

  /** Hero ability use: heal the hurt, stun the dangerous, rally in a fight. */
  private heroTactics(game: Game, army: Unit[], enemies: Array<Unit | Building>): void {
    const h = army.find((u) => u.hero);
    if (!h || h.stun > 0 || h.order?.type === 'cast') return;
    const P = this.player;
    const foes = enemies.filter((e): e is Unit => e.kind === 'unit' && dist(e, h) < 9);
    const allies = army.filter((u) => dist(u, h) < 8);
    const hurt = allies.filter((u) => u.hp < u.maxHp * 0.5).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    const tryCast = (ability: AbilityId, targetId: number) => {
      if (castProblem(game, h, ability, targetId)) return false;
      game.issue({ type: 'cast', player: P, units: [h.id], ability, targetId });
      return true;
    };
    if (hurt && foes.length && tryCast('mend', hurt.id)) return;
    if (!foes.length) return;
    // Stun the enemy hero if present, else the healthiest fighter in reach.
    const target = foes.find((f) => f.hero) ?? foes.filter((f) => f.type !== 'worker').sort((a, b) => b.hp - a.hp)[0];
    if (target && tryCast('hammer', target.id)) return;
    if (allies.length >= 3) tryCast('cry', -1);
  }

  // ---- military ---------------------------------------------------------------

  private military(game: Game, army: Unit[], workers: Unit[], buildings: Building[], keeps: Building[]): void {
    const P = this.player;
    const now = game.state.tick;
    const enemies = this.visible(game);
    const threats = enemies.filter(
      (e): e is Unit => e.kind === 'unit' && buildings.some((b) => distToRect(e.x, e.y, b) < CONFIG.ai.defendRadius),
    );
    this.wave = this.wave.filter((id) => game.unit(id));
    const home = army.filter((u) => !this.wave.includes(u.id));
    this.heroTactics(game, army, enemies);

    if (threats.length) {
      if (now - this.lastDefend >= secondsToTicks(3)) {
        this.lastDefend = now;
        const c = centroid(threats);
        // Recall the wave if the base faces a real attack.
        const defenders = threats.length >= 3 ? army : home;
        if (threats.length >= 3 && this.wave.length) this.endWave();
        const idleDefenders = defenders.filter((u) => u.order?.type !== 'attack');
        if (idleDefenders.length) game.issue({ type: 'attackMove', player: P, units: idleDefenders.map((u) => u.id), x: c.x, y: c.y });
        // With no soldiers nearby, Laborers next to the threat fight back (not on Easy).
        const near = defenders.filter((u) => dist(u, c) < 12);
        if (!near.length && this.difficulty !== 'easy') {
          const militia = workers.filter((w) => !w.hidden && dist(w, c) < 8).slice(0, 2 * threats.length);
          const target = threats.reduce((a, b) => (dist(b, c) < dist(a, c) ? b : a));
          if (militia.length) game.issue({ type: 'attack', player: P, units: militia.map((w) => w.id), targetId: target.id });
        }
      }
      return;
    }

    // Laborers drafted for defence go back to work once the threat is gone.
    const drafted = workers.filter((w) => w.order?.type === 'attack');
    if (drafted.length) game.issue({ type: 'stop', player: P, units: drafted.map((w) => w.id) });

    const seconds = now / 20;
    if (!this.wave.length) {
      if (seconds >= this.profile.firstAttackSeconds && home.length >= this.waveSize && this.favourable(game, home, enemies)) {
        this.wave = home.map((u) => u.id);
        this.waveLaunched = this.wave.length;
        this.lastWaveOrder = -1e9;
        this.creepAt = null;
      } else if (this.profile.creeps && home.some((u) => u.hero) && home.length >= CONFIG.ai.creepParty && this.creepTarget(game, keeps)) {
        // Between attacks: take the army and hero to clear a camp for experience.
        this.creepAt = this.creepTarget(game, keeps);
        this.wave = home.map((u) => u.id);
        this.waveLaunched = this.wave.length;
        this.lastWaveOrder = -1e9;
      } else if (keeps[0]) {
        // Keep the home army gathered at the staging point.
        const s = this.staging(game, keeps[0]);
        const stray = home.filter((u) => u.order === null && dist(u, s) > 4);
        if (stray.length) game.issue({ type: 'move', player: P, units: stray.map((u) => u.id), x: s.x, y: s.y });
        return;
      }
    }
    if (!this.wave.length) return;

    const waveUnits = this.wave.map((id) => game.unit(id)!).filter(Boolean);
    const goHome = (grow: boolean) => {
      const s = keeps[0] ? this.staging(game, keeps[0]) : null;
      if (s) game.issue({ type: 'move', player: P, units: this.wave, x: s.x, y: s.y });
      this.endWave(grow);
    };
    if (this.wave.length <= Math.floor(this.waveLaunched * CONFIG.ai.retreatShare)) return goHome(!this.creepAt);
    if (this.creepAt) {
      const at = this.creepAt;
      const arrived = waveUnits.some((u) => dist(u, at) < 5);
      const guards = enemies.some((e) => e.kind === 'unit' && game.player(e.owner).neutral && dist(e, at) < 9);
      if (arrived && !guards) {
        this.cleared.add(`${at.x},${at.y}`);
        this.campsSeen = this.campsSeen.filter((c) => dist(c, at) > 8);
        return goHome(false);
      }
      if (now - this.lastWaveOrder < secondsToTicks(4)) return;
      const idle = waveUnits.filter((u) => u.order === null || u.order.type === 'move');
      if (idle.length) game.issue({ type: 'attackMove', player: P, units: idle.map((u) => u.id), x: at.x, y: at.y });
      this.lastWaveOrder = now;
      return;
    }
    if (now - this.lastWaveOrder < secondsToTicks(4)) return;
    const idleWave = waveUnits.filter((u) => u.order === null || u.order.type === 'move');
    if (!idleWave.length) return;
    const c = centroid(waveUnits);
    const targets: Array<{ x: number; y: number }> = enemies.filter((e) => e.kind === 'building' && !game.player(e.owner).neutral);
    // No known enemy building: search. Start locations first, then mine
    // sites (where expansions go), skipping places a wave already checked.
    if (!targets.length) {
      for (const u of waveUnits) for (const p of this.searchSpots(game)) if (dist(u, p) < 5) this.searched.add(`${p.x},${p.y}`);
      let spots = this.searchSpots(game).filter((p) => !this.searched.has(`${p.x},${p.y}`));
      if (!spots.length) {
        this.searched.clear();
        spots = this.searchSpots(game);
      }
      targets.push(...spots);
    }
    if (!targets.length) return;
    const t = targets.reduce((a, b) => (dist(b, c) < dist(a, c) ? b : a));
    this.lastWaveOrder = now;
    game.issue({ type: 'attackMove', player: P, units: idleWave.map((u) => u.id), x: t.x, y: t.y });
  }

  /** Army strength: hit points times damage per second, summed. */
  private strength(units: Unit[]): number {
    let s = 0;
    for (const u of units) {
      if (u.type === 'worker') continue;
      const a = CONFIG.units[u.type].attack;
      s += u.hp * (a.damage / a.cooldown);
    }
    return s;
  }

  private favourable(game: Game, home: Unit[], enemies: Array<Unit | Building>): boolean {
    if (!this.profile.assessStrength || home.length >= CONFIG.ai.attackAnyway) return true;
    const theirs = enemies.filter((e): e is Unit => e.kind === 'unit' && !game.player(e.owner).neutral);
    return this.strength(home) >= this.strength(theirs) * CONFIG.ai.attackAdvantage;
  }

  private endWave(grow = true): void {
    this.wave = [];
    this.creepAt = null;
    if (grow) this.waveSize += this.profile.waveGrowth;
  }

  /** Nearest uncleared mine on its own half of the map, away from any known Keep. */
  private creepTarget(game: Game, keeps: Building[]): { x: number; y: number } | null {
    const home = keeps[0];
    if (!home) return null;
    const mine = game.state.starts[this.player];
    const enemyStarts = game.state.starts.filter((_, p) => p !== this.player);
    const keepsKnown = game.buildings().filter((b) => b.type === 'hq' && (b.owner === this.player || game.vision.knows(this.player, b)));
    const options = game
      .resources()
      .filter((m) => m.type === 'goldmine' && !this.cleared.has(`${m.x},${m.y}`))
      .filter((m) => !keepsKnown.some((k) => distToRect(m.x, m.y, k) < 12))
      .filter((m) => enemyStarts.every((e) => dist(m, mine) < dist(m, e)))
      .sort((a, b) => dist(a, home) - dist(b, home));
    return options[0] ? { x: options[0].x, y: options[0].y } : null;
  }
}

function centroid(es: Entity[]): { x: number; y: number } {
  return { x: es.reduce((s, e) => s + e.x, 0) / es.length, y: es.reduce((s, e) => s + e.y, 0) / es.length };
}
