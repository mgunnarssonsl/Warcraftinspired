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

import { CONFIG, isHeroType, secondsToTicks, type AbilityId, type ArmyMix, type BuildingType, type ItemId, type ResearchId, type UnitType } from '../sim/config';
import { isEnemy } from '../sim/combat';
import type { Game } from '../sim/game';
import { distToRect } from '../sim/movement';
import { abilitiesOf, castProblem } from '../sim/hero';
import { buyProblem, freeSlot } from '../sim/items';
import { hasCompleted, heroProblem, missingRequirement, trainableAt, trainCost } from '../sim/production';
import { researched, researchPending, researchProblem } from '../sim/tech';
import type { Building, Entity, ResourceNode, Unit } from '../sim/types';
import { findSite } from './placement';
import { flareProblem } from '../sim/commands';

export type Difficulty = keyof typeof CONFIG.ai.profiles;
type Widen<T> = T extends number ? number : T extends boolean ? boolean : T;
/** Strategy tweaks on top of a difficulty profile (used by balance playtests). */
export type ProfileOverrides = Partial<Profile>;
type Profile = { -readonly [K in keyof (typeof CONFIG.ai.profiles)['hard']]: Widen<(typeof CONFIG.ai.profiles)['hard'][K]> };

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

type ArmyUnit = keyof ArmyMix;
const ARMY_UNITS: readonly UnitType[] = ['guard', 'archer', 'lancer', 'cleric', 'mangonel'];
/** Buildings that train soldiers. */
const PRODUCTION = new Set<BuildingType>(['barracks', 'chapel', 'workshop']);

/** Distance from point p to the segment a–b. */
function segmentDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export class ComputerPlayer {
  private readonly profile: Profile;
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
    overrides: ProfileOverrides = {},
  ) {
    this.profile = { ...CONFIG.ai.profiles[difficulty], ...overrides };
    this.thinkTicks = secondsToTicks(this.profile.thinkSeconds);
    this.waveSize = this.profile.waveSize;
  }

  update(game: Game): void {
    // Every computer thinks on the same ticks: staggering them would give one
    // seat a head start in every exchange.
    if (game.state.tick % this.thinkTicks !== 0) return;
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

  /** Enemy soldiers seen recently: last known type, health and place. */
  private armySeen = new Map<number, { type: UnitType; hp: number; x: number; y: number; tick: number }>();

  /** Neutral guards it has spotted: places not to send a lone builder. */
  private campsSeen: Array<{ x: number; y: number }> = [];

  /** Enemy units it sees now, and enemy buildings it has seen. */
  private visible(game: Game): Array<Unit | Building> {
    const out: Array<Unit | Building> = [];
    const v = game.vision;
    for (const u of game.units()) if (isEnemy(game, this.player, u.owner) && !u.hidden && v.canSee(this.player, u)) out.push(u);
    // Buildings in view right now; ones seen earlier are in vision memory
    // (as last seen), which is what waves aim at.
    for (const b of game.buildings()) if (isEnemy(game, this.player, b.owner) && v.canSee(this.player, b)) out.push(b);
    for (const u of out) {
      if (u.kind !== 'unit' || !game.player(u.owner).neutral || !u.home) continue;
      if (!this.campsSeen.some((c) => dist(c, u.home!) < 4)) this.campsSeen.push({ ...u.home });
    }
    // Remember enemy soldiers it has seen, as a player remembers a scouted
    // army; forget one when the memory expires, or when it died in plain view.
    const now = game.state.tick;
    for (const u of out) {
      if (u.kind !== 'unit' || game.player(u.owner).neutral || u.type === 'worker') continue;
      this.armySeen.set(u.id, { type: u.type, hp: u.hp, x: u.x, y: u.y, tick: now });
    }
    for (const [id, m] of this.armySeen) {
      const expired = now - m.tick > secondsToTicks(CONFIG.ai.armyMemorySeconds);
      const gone = !game.get(id) && v.isVisible(this.player, Math.floor(m.x), Math.floor(m.y));
      if (expired || gone) this.armySeen.delete(id);
    }
    // A camp spot in plain view with no guards left has been cleared (by anyone).
    this.campsSeen = this.campsSeen.filter(
      (c) =>
        !v.isVisible(this.player, Math.floor(c.x), Math.floor(c.y)) ||
        out.some((u) => u.kind === 'unit' && game.player(u.owner).neutral && dist(u, c) < 5),
    );
    return out;
  }

  private think(game: Game): void {
    const P = this.player;
    const units = game.units().filter((u) => u.owner === P);
    const workers = units.filter((u) => u.type === 'worker');
    // Scouts are not soldiers: they scout and stay out of waves.
    const army = units.filter((u) => u.type !== 'worker' && u.type !== 'outrider');
    this.scoutRoutes(game, units.filter((u) => u.type === 'outrider'));
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
    // Tier II production, for the units its mix calls for.
    if (researched(game, P, 'castle')) {
      if (count('chapel') === 0 && this.profile.mix.cleric > 0) return 'chapel';
      if (count('workshop') === 0 && this.profile.mix.mangonel > 0) return 'workshop';
    }
    const me = game.player(P);
    if (count('barracks') < this.profile.maxBarracks && workers.length >= this.profile.extraBarracksAtWorkers && me.gold >= 300) return 'barracks';
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
    const keeps = [
      ...game.buildings().filter((b) => b.type === 'hq' && b.owner === this.player),
      ...game.vision.remembered(this.player).filter((m) => m.type === 'hq'),
    ];
    // Reward against distance: a rich mine is worth a longer walk, a small one less.
    const cost = (m: ResourceNode) => dist(m, home) - CONFIG.ai.richMineBonus * (m.miners - CONFIG.resources.goldmine.maxMiners) - (m.amount >= CONFIG.mineKinds.standard.gold ? CONFIG.ai.fullMineBonus : 0);
    return game
      .resources()
      .filter((m) => m.type === 'goldmine' && m.amount > 2000)
      .filter((m) => !keeps.some((b) => distToRect(m.x, m.y, b) < 12))
      .filter((m) => !hostiles.some((h) => dist(h, m) < 9)) // guarded: leave it
      .sort((a, b) => cost(a) - cost(b))[0];
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
    if (type === 'tower' || type === 'barracks' || type === 'altar' || type === 'smithy' || type === 'workshop') {
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
    // Heroes come first: train its chosen heroes (a second once fortified),
    // and revive any that fall.
    const altar = buildings.find((b) => b.type === 'altar' && b.progress >= 1);
    if (altar) {
      for (const type of this.profile.heroes) {
        if (heroProblem(game, P, type)) continue;
        const c = trainCost(game, P, type);
        if (me.gold < c.gold || me.wood < c.wood) break;
        if (home && !altar.rally) {
          const s = this.staging(game, home);
          game.issue({ type: 'setRally', player: P, buildingId: altar.id, x: s.x, y: s.y, targetId: -1 });
        }
        game.issue({ type: 'train', player: P, buildingId: altar.id, unit: type });
        return;
      }
    }
    this.research(game, buildings, reserve);
    // Keep a scout or two out once there is a Barracks.
    const rax = buildings.find((b) => b.type === 'barracks' && b.progress >= 1 && b.queue.length < 2);
    const scouts = game.units().filter((u) => u.owner === P && u.type === 'outrider').length + buildings.reduce((n, b) => n + b.queue.filter((q) => q.unit === 'outrider').length, 0);
    if (rax && scouts < this.profile.scouts && this.scoutsTrained < CONFIG.ai.maxScouts && me.gold - reserve.gold >= CONFIG.units.outrider.cost.gold) {
      game.issue({ type: 'train', player: P, buildingId: rax.id, unit: 'outrider' });
      this.scoutsTrained++;
    }
    const mix = this.wantedMix(game);
    const total = Object.values(mix).reduce((a, b) => a + b, 0) || 1;
    const counts = new Map<UnitType, number>();
    for (const u of army) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
    for (const b of buildings) for (const q of b.queue) if (q.unit) counts.set(q.unit, (counts.get(q.unit) ?? 0) + 1);
    const size = army.length + 1;
    // How far each soldier type is below its share of the wanted mix.
    const deficit = (t: ArmyUnit) => mix[t] / total - (counts.get(t) ?? 0) / size;
    for (const b of buildings) {
      if (b.progress < 1 || !PRODUCTION.has(b.type)) continue;
      if (home && !b.rally) {
        const s = this.staging(game, home);
        game.issue({ type: 'setRally', player: P, buildingId: b.id, x: s.x, y: s.y, targetId: -1 });
      }
      if (b.queue.length >= 2) continue;
      const options = (trainableAt(b.type) as ArmyUnit[]).filter((t) => ARMY_UNITS.includes(t) && mix[t] > 0 && !missingRequirement(game, P, t));
      if (!options.length) continue;
      const unit = options.reduce((a, c) => (deficit(c) > deficit(a) ? c : a));
      // The Barracks always keeps training; specialist buildings only fill their share.
      if (b.type !== 'barracks' && deficit(unit) <= 0) continue;
      const c = CONFIG.units[unit].cost;
      if (me.gold - reserve.gold >= c.gold && me.wood - reserve.wood >= c.wood) {
        game.issue({ type: 'train', player: P, buildingId: b.id, unit });
        counts.set(unit, (counts.get(unit) ?? 0) + 1);
      }
    }
  }

  /**
   * The composition it wants now: its profile's mix, shifted toward counters
   * of the enemy soldiers it has seen (and still remembers).
   */
  wantedMix(game: Game): Record<ArmyUnit, number> {
    const mix = { ...this.profile.mix };
    if (!this.profile.adapt) return mix;
    const seen = new Map<UnitType, number>();
    for (const m of this.armySeen.values()) seen.set(m.type, (seen.get(m.type) ?? 0) + 1);
    const n = [...seen.values()].reduce((a, b) => a + b, 0);
    if (n < CONFIG.ai.adaptAfterSeen) return mix;
    const share = (t: UnitType) => (seen.get(t) ?? 0) / n;
    const k = CONFIG.ai.adaptStrength;
    // Lancers run down archers, casters and siege; Guards stop Lancers;
    // Archers shred light units; Clerics' magic burns heavy armor.
    mix.lancer += k * (share('archer') + share('cleric') + share('mangonel'));
    mix.guard += k * share('lancer');
    mix.archer += k * share('cleric');
    mix.cleric += (k / 2) * share('guard');
    if (!researched(game, this.player, 'castle')) mix.guard += k * share('archer') * 0.5; // no Lancers yet
    return mix;
  }

  /** Upgrades in a fixed order, when the economy can spare it. */
  private research(game: Game, buildings: Building[], reserve: { gold: number; wood: number }): void {
    if (!this.profile.upgrades) return;
    const P = this.player;
    const me = game.player(P);
    const seconds = game.state.tick / 20;
    const order: ResearchId[] = ['weapons1', 'armor1', 'saws'];
    // Mule Carts ties up the Keep, which also trains Laborers: not in the opening.
    if (seconds >= CONFIG.ai.cartsSeconds) order.push('carts');
    if (this.profile.castleSeconds !== null && seconds >= this.profile.castleSeconds) {
      order.push('castle', 'weapons2', 'armor2');
      if (this.profile.mix.archer > 0) order.push('longbows');
    }
    if (this.profile.citadelSeconds !== null && seconds >= this.profile.citadelSeconds) {
      order.push('citadel', 'weapons3', 'armor3');
      if (this.profile.mix.cleric > 0) order.push('healing2');
    }
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

  private scoutsTrained = 0;
  private lastFlare = -1e9;

  /** Light up a spot with a Signal Flare from one of its Keeps, if it can. */
  private flare(game: Game, keeps: Building[], at: { x: number; y: number }): void {
    const now = game.state.tick;
    if (!this.profile.flares || now - this.lastFlare < secondsToTicks(CONFIG.flare.cooldown)) return;
    const keep = keeps.find((k) => !flareProblem(game, this.player, k.id));
    if (!keep || game.player(this.player).gold < CONFIG.flare.gold + CONFIG.ai.researchBuffer) return;
    this.lastFlare = now;
    game.issue({ type: 'flare', player: this.player, buildingId: keep.id, x: at.x, y: at.y });
  }

  /** Next stop on each Outrider's route. */
  private scoutStop = new Map<number, number>();

  /**
   * Outriders tour the enemy start and every expansion, nearest to the
   * enemy first, skipping camps it knows about; an idle scout heads on.
   */
  private scoutRoutes(game: Game, scouts: Unit[]): void {
    if (!scouts.length) return;
    const P = this.player;
    const foe = game.state.starts.find((_, p) => p !== P && !game.player(p).neutral);
    if (!foe) return;
    const stops = [foe, ...game.resources().filter((m) => m.type === 'goldmine').map((m) => ({ x: m.x, y: m.y }))]
      .filter((s) => !this.campsSeen.some((c) => dist(c, s) < 7))
      .sort((a, b) => dist(a, foe) - dist(b, foe));
    for (const s of scouts) {
      if (s.order !== null) continue;
      const i = this.scoutStop.get(s.id) ?? 0;
      const stop = stops[i % stops.length];
      this.scoutStop.set(s.id, i + 1);
      game.issue({ type: 'move', player: P, units: [s.id], x: stop.x, y: stop.y });
    }
  }

  /** A hero sent shopping, and the Trading Post it is heading for. */
  private shopping: { hero: number; shop: number } | null = null;

  /**
   * Between fights, heroes pick up items lying near them (camp drops), and
   * with spare gold one walks to the nearest Trading Post to buy.
   */
  private heroErrands(game: Game, army: Unit[], enemies: Array<Unit | Building>, keeps: Building[]): void {
    const P = this.player;
    const me = game.player(P);
    const heroes = army.filter((u) => u.hero);
    for (const h of heroes) {
      if (h.order?.type === 'pickup' || freeSlot(h) < 0) continue;
      if (enemies.some((e) => e.kind === 'unit' && dist(e, h) < 9)) continue;
      const item = game.state.items
        .filter((i) => dist(i, h) < 14 && game.vision.isVisible(P, Math.floor(i.x), Math.floor(i.y)))
        .sort((a, b) => dist(a, h) - dist(b, h))[0];
      if (item) game.issue({ type: 'pickup', player: P, units: [h.id], itemId: item.id });
    }
    if (!this.profile.shops) return;
    if (this.shopping) {
      const h = game.unit(this.shopping.hero);
      const shop = game.building(this.shopping.shop);
      if (!h || !shop || this.wave.includes(h.id)) {
        this.shopping = null;
        return;
      }
      const wish = this.shoppingList(h).find((it) => !buyProblem(game, P, shop.id, h.id, it));
      if (wish) {
        game.issue({ type: 'buyItem', player: P, shopId: shop.id, heroId: h.id, item: wish });
        return;
      }
      if (distToRect(h.x, h.y, shop) > CONFIG.shop.range) {
        if (h.order === null) this.walkTo(game, h, shop);
        return;
      }
      // Done (or broke): back to the staging point.
      this.shopping = null;
      if (keeps[0]) {
        const s = this.staging(game, keeps[0]);
        game.issue({ type: 'move', player: P, units: [h.id], x: s.x, y: s.y });
      }
      return;
    }
    if (me.gold < CONFIG.ai.shopGold || this.wave.length) return;
    const h = heroes.find((u) => freeSlot(u) >= 0 && u.order === null && !enemies.some((e) => e.kind === 'unit' && dist(e, u) < 12));
    if (!h) return;
    const shops = game.buildings().filter((b) => b.type === 'shop');
    if (!shops.length) return;
    // The Posts are equally far from both bases, so "nearest" often ties.
    // Break ties by side (left of the line toward the enemy), which mirrors
    // between seats; list order would send both players to the same Post.
    const side = (b: Building) => {
      const me = game.state.starts[P];
      const foe = game.state.starts.find((_, p) => p !== P && !game.player(p).neutral);
      return me && foe ? Math.sign((foe.x - me.x) * (b.y - me.y) - (foe.y - me.y) * (b.x - me.x)) : 0;
    };
    const shop = shops.reduce((a, b) => {
      const d = dist(b, h) - dist(a, h);
      return d < -0.5 || (Math.abs(d) <= 0.5 && side(b) > side(a)) ? b : a;
    });
    this.shopping = { hero: h.id, shop: shop.id };
    this.walkTo(game, h, shop);
  }

  /** Walk up to a building, stopping on the side facing the walker. */
  private walkTo(game: Game, u: Unit, b: Building): void {
    const d = Math.max(0.01, dist(u, b));
    const r = b.w / 2 + 1.5;
    game.issue({ type: 'move', player: this.player, units: [u.id], x: b.x + ((u.x - b.x) / d) * r, y: b.y + ((u.y - b.y) / d) * r });
  }

  /** What a hero would buy, best first: a permanent item it lacks, then a draught. */
  private shoppingList(h: Unit): ItemId[] {
    const has = new Set(h.hero!.items);
    const wants: ItemId[] = h.type === 'sage' ? ['charm', 'mail', 'blade'] : h.type === 'ranger' ? ['blade', 'charm', 'mail'] : ['mail', 'blade', 'charm'];
    const list = wants.filter((it) => !has.has(it));
    if (!has.has('draught')) list.push('draught');
    return list;
  }

  /**
   * Heroes in a fight, by what each ability does: heal or ward the most hurt
   * ally, disable or mark the most dangerous enemy (their hero first), drop
   * area damage where enemies bunch up, rally when the army is around. Items:
   * a Healing Draught when badly hurt, a Scroll of Return when about to die,
   * a Mana Tonic when dry.
   */
  private heroTactics(game: Game, army: Unit[], enemies: Array<Unit | Building>): void {
    const P = this.player;
    for (const h of army) {
      if (!h.hero || h.stun > 0 || h.order?.type === 'cast' || !isHeroType(h.type)) continue;
      const foes = enemies.filter((e): e is Unit => e.kind === 'unit' && dist(e, h) < 9);
      const allies = army.filter((u) => dist(u, h) < 8);
      const slot = (it: ItemId) => h.hero!.items.indexOf(it);
      if (foes.length && h.hp < h.maxHp * 0.35 && slot('draught') >= 0) {
        game.issue({ type: 'useItem', player: P, units: [h.id], slot: slot('draught') });
        continue;
      }
      // About to die with no potion: read the Scroll of Return and live.
      if (foes.length && h.hp < h.maxHp * 0.2 && slot('scroll') >= 0) {
        game.issue({ type: 'useItem', player: P, units: [h.id], slot: slot('scroll') });
        continue;
      }
      if (h.hero.mana < 40 && slot('tonic') >= 0) game.issue({ type: 'useItem', player: P, units: [h.id], slot: slot('tonic') });
      const tryCast = (ability: AbilityId, targetId: number, x = 0, y = 0) => {
        if (castProblem(game, h, ability, targetId, x, y)) return false;
        game.issue({ type: 'cast', player: P, units: [h.id], ability, targetId, x, y });
        return true;
      };
      const hurt = allies.filter((u) => u.hp < u.maxHp * 0.5).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      const threat = foes.find((f) => f.hero) ?? foes.filter((f) => f.type !== 'worker').sort((a, b) => b.hp - a.hp)[0];
      for (const ability of abilitiesOf(h.type)) {
        const def = CONFIG.hero.abilities[ability];
        if (ability === 'farsight') {
          // Scout the enemy base before a wave goes in blind.
          const known = game.vision.remembered(P).some((m) => !game.player(m.owner).neutral);
          const start = game.state.starts.find((_, p) => p !== P && !game.player(p).neutral && !game.player(p).defeated);
          if (!known && this.wave.length && start && tryCast(ability, -1, start.x, start.y)) break;
          continue;
        }
        if (!foes.length) continue;
        if (def.target === 'ally') {
          if (hurt && tryCast(ability, hurt.id)) break;
        } else if (def.target === 'enemy') {
          if (threat && tryCast(ability, threat.id)) break;
        } else if (def.target === 'point') {
          // Centre on the enemy with the most other enemies around it.
          const best = foes.reduce<{ u: Unit; n: number } | null>((acc, f) => {
            const n = foes.filter((g) => dist(g, f) <= def.radius).length;
            return !acc || n > acc.n ? { u: f, n } : acc;
          }, null);
          if (best && best.n >= 2 && tryCast(ability, -1, best.u.x, best.u.y)) break;
        } else if (allies.length >= 3 && tryCast(ability, -1)) break;
      }
    }
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
    this.heroErrands(game, army, enemies, keeps);

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
    const idleWave = waveUnits.filter((u) => u.orderQueue.length === 0 && (u.order === null || u.order.type === 'move'));
    if (!idleWave.length) return;
    const c = centroid(waveUnits);
    const targets: Array<{ x: number; y: number }> = game.vision.remembered(P).filter((m) => !game.player(m.owner).neutral);
    // No known enemy building: search. Start locations first, then mine
    // sites (where expansions go), skipping places a wave already checked.
    if (!targets.length) {
      for (const u of waveUnits) for (const p of this.searchSpots(game)) if (dist(u, p) < 5) this.searched.add(`${p.x},${p.y}`);
      let spots = this.searchSpots(game).filter((p) => !this.searched.has(`${p.x},${p.y}`));
      if (!spots.length) {
        this.searched.clear();
        spots = this.searchSpots(game);
      }
      // Enemy start locations are public: head there before combing mines.
      const starts = spots.filter((p) => game.state.starts.some((st) => st.x === p.x && st.y === p.y));
      targets.push(...(starts.length ? starts : spots));
    }
    if (!targets.length) return;
    const t = targets.reduce((a, b) => (dist(b, c) < dist(a, c) ? b : a));
    // Searching blind: light up the spot first.
    if (!game.vision.remembered(P).some((m) => !game.player(m.owner).neutral)) this.flare(game, keeps, t);
    this.lastWaveOrder = now;
    // March around known camps rather than through them: detour waypoints
    // first (Shift-queued, as a player would), then on to the target.
    const ids = idleWave.map((u) => u.id);
    const route = [...this.detours(game, c, t), t];
    route.forEach((p, i) => game.issue({ type: 'attackMove', player: P, units: ids, x: p.x, y: p.y, queued: i > 0 }));
  }

  /**
   * Waypoints that keep a march from `from` to `to` clear of the neutral camps
   * it knows about (camps at the destination itself are the point, not detours).
   */
  private detours(game: Game, from: { x: number; y: number }, to: { x: number; y: number }): Array<{ x: number; y: number }> {
    const clear = CONFIG.ai.campClearance;
    const out: Array<{ x: number; y: number }> = [];
    let a = from;
    for (let n = 0; n < 3; n++) {
      const blocking = this.campsSeen
        .filter((cp) => dist(cp, to) > clear && dist(cp, a) > clear && segmentDistance(cp, a, to) < clear)
        .sort((p, q) => dist(p, a) - dist(q, a))[0];
      if (!blocking) break;
      // Step sideways off the line, on whichever side is open ground.
      const len = dist(a, to) || 1;
      const nx = -(to.y - a.y) / len;
      const ny = (to.x - a.x) / len;
      const sides = [1, -1]
        .map((k) => ({ x: blocking.x + nx * k * (clear + 2), y: blocking.y + ny * k * (clear + 2) }))
        .filter((p) => game.nav.canStand(p.x, p.y, 0.5) && game.nav.component(Math.floor(p.x), Math.floor(p.y)) === game.nav.component(Math.floor(a.x), Math.floor(a.y)))
        .sort((p, q) => dist(a, p) + dist(p, to) - (dist(a, q) + dist(q, to)));
      if (!sides.length) break;
      out.push(sides[0]);
      a = sides[0];
    }
    return out;
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
    // What it sees now plus what it remembers seeing (no hidden information).
    const seen = enemies.filter((e): e is Unit => e.kind === 'unit' && !game.player(e.owner).neutral);
    let theirs = this.strength(seen);
    for (const [id, m] of this.armySeen) {
      if (seen.some((u) => u.id === id)) continue;
      const a = CONFIG.units[m.type].attack;
      theirs += m.hp * (a.damage / a.cooldown);
    }
    return this.strength(home) >= theirs * CONFIG.ai.attackAdvantage;
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
    const keepsKnown = [
      ...game.buildings().filter((b) => b.type === 'hq' && b.owner === this.player),
      ...game.vision.remembered(this.player).filter((m) => m.type === 'hq'),
    ];
    const ownHalf = (p: { x: number; y: number }) => enemyStarts.every((e) => dist(p, mine) < dist(p, e));
    // Camps it has actually spotted (lairs included) first, then mines it has
    // not checked yet.
    const camps = this.campsSeen.filter((c) => ownHalf(c) && !this.cleared.has(`${c.x},${c.y}`)).sort((a, b) => dist(a, home) - dist(b, home));
    if (camps[0]) return { x: camps[0].x, y: camps[0].y };
    const options = game
      .resources()
      .filter((m) => m.type === 'goldmine' && !this.cleared.has(`${m.x},${m.y}`))
      .filter((m) => !keepsKnown.some((k) => distToRect(m.x, m.y, k) < 12))
      .filter(ownHalf)
      .sort((a, b) => dist(a, home) - dist(b, home));
    return options[0] ? { x: options[0].x, y: options[0].y } : null;
  }
}

function centroid(es: Entity[]): { x: number; y: number } {
  return { x: es.reduce((s, e) => s + e.x, 0) / es.length, y: es.reduce((s, e) => s + e.y, 0) / es.length };
}
