// Computer opponent. It acts only by issuing the same Commands a human can,
// pays the same costs and obeys the same rules. Its profile combines a
// difficulty (how well it plays) with a strategic style (what it plans); see
// profile.ts. The only advantage it can ever have is the optional, labelled
// income bonus chosen before the match (Player.incomeBonus, a sim rule).
//
// Information: under the same fog of war as the human. It knows enemy units
// it can currently see, enemy buildings as it last saw them (vision memory,
// the same the human gets), neutral camps it has spotted, and the public
// start locations. All of it goes through `visible()`, `campsSeen` and
// `game.vision.remembered`.
//
// Its loop, every think interval:
//   observe  - update what it knows, and its posture from that intel
//   economy  - Laborers to replace losses; idle and stray Laborers back to work
//   build    - Farms ahead of demand, production, tech and expansions, one
//              plan at a time; a lost Keep is rebuilt first
//   army     - soldiers by its (adapting) mix, gathered at a staging point
//   military - defend in proportion to the threat; raids, camp clearing and
//              attack waves that regroup, reinforce and fall back when beaten
//
// It keeps a journal of its main decisions; the end screen shows it, so a
// player can see what the computer was doing and why.

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
import { buildingRole, FACTION, isWorker, unitFaction, unitRole, type BuildingRole, type Faction, type UnitRole } from '../sim/factions';
import { rulesOf } from '../sim/rules';
import { composeProfile, type Difficulty, type Profile, type ProfileOverrides, type StyleId } from './profile';
import { len } from '../sim/dmath';

export type { Difficulty, ProfileOverrides, StyleId } from './profile';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => len(a.x - b.x, a.y - b.y);

type ArmyUnit = keyof ArmyMix;
/**
 * It thinks in roles, named after the Crown's units and buildings: its army
 * mix says "guard" and means whatever melee soldier its faction trains, and
 * it reads an enemy of either faction the same way.
 */
const ARMY_ROLE: Record<ArmyUnit, UnitRole> = { guard: 'melee', archer: 'ranged', lancer: 'cavalry', cleric: 'support', mangonel: 'siege' };
/** The army-mix key for a unit type of either faction (null: not a soldier). */
function armyKey(t: UnitType): ArmyUnit | null {
  const r = unitRole(t);
  return (Object.keys(ARMY_ROLE) as ArmyUnit[]).find((k) => ARMY_ROLE[k] === r) ?? null;
}
const isScout = (t: UnitType) => unitRole(t) === 'scout';
const isRole = (t: BuildingType, r: BuildingRole) => buildingRole(t) === r;
/** Buildings that train soldiers. */
const PRODUCTION = new Set<BuildingRole>(['barracks', 'chapel', 'workshop']);
/** A Crown hero's counterpart in the other faction (same slot: fighter, ranged, caster). */
function heroSlot(t: UnitType): number {
  const f = unitFaction(t);
  return f ? FACTION[f].heroes.indexOf(t) : 0;
}

/** How it reads the enemy from what it has scouted. */
export type Posture = 'steady' | 'threatened' | 'greedy';

/** Distance from point p to the segment a–b. */
function segmentDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return len(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export class ComputerPlayer {
  readonly profile: Profile;
  private readonly thinkTicks: number;
  /** Main decisions, in order: shown on the end screen. */
  readonly journal: Array<{ tick: number; text: string }> = [];
  posture: Posture = 'steady';
  /** Current wave threshold; grows after every wave. */
  private waveSize: number;
  private wave: number[] = [];
  private waveLaunched = 0;
  /** What the wave is: an attack, a camp-clearing party or a raid on Laborers. */
  private waveKind: 'attack' | 'creep' | 'raid' = 'attack';
  /** Gathering before the march (regrouping difficulties only). */
  private waveGathering = false;
  private waveStart = 0;
  private waveTarget: { x: number; y: number } | null = null;
  private lastDefend = -1e9;
  private lastWaveOrder = -1e9;
  private lastRaid = -1e9;
  private lastFocus = -1e9;
  private lastIdleCheck = -1e9;
  /** First tick of the current threat at its base (reaction delay). */
  private threatSince = -1;

  constructor(
    readonly player: number,
    readonly difficulty: Difficulty,
    readonly style: StyleId = 'balanced',
    readonly overrides: ProfileOverrides = {},
  ) {
    this.profile = composeProfile(difficulty, style, overrides);
    this.thinkTicks = secondsToTicks(this.profile.thinkSeconds);
    this.waveSize = this.profile.waveSize;
  }

  /**
   * Everything it knows and plans, as plain JSON data (part of a save). Its
   * profile is rebuilt from difficulty, style and overrides; every other
   * field is kept, so a loaded match continues exactly as it would have.
   */
  snapshot(): AiSnapshot {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this)) if (!NOT_SAVED.has(k)) fields[k] = v;
    return {
      player: this.player,
      difficulty: this.difficulty,
      style: this.style,
      overrides: this.overrides,
      fields: JSON.parse(JSON.stringify(fields, encodeCollections)) as Record<string, unknown>,
    };
  }

  static restore(snap: AiSnapshot): ComputerPlayer {
    const ai = new ComputerPlayer(snap.player, snap.difficulty, snap.style, snap.overrides);
    const fields = JSON.parse(JSON.stringify(snap.fields), decodeCollections) as Record<string, unknown>;
    for (const [k, v] of Object.entries(fields)) if (!NOT_SAVED.has(k)) (ai as unknown as Record<string, unknown>)[k] = v;
    return ai;
  }

  update(game: Game): void {
    // Every computer thinks on the same ticks: staggering them would give one
    // seat a head start in every exchange.
    if (game.state.tick % this.thinkTicks !== 0) return;
    const me = game.player(this.player);
    if (!me || me.defeated || game.state.outcome) return;
    this.think(game);
  }

  /** Its own faction's tables. */
  private fac(game: Game): Faction {
    return FACTION[game.player(this.player).faction];
  }

  private note(game: Game, text: string): void {
    // The journal names its own faction's things.
    const F = this.fac(game);
    if (F !== FACTION.crown) {
      const name = (t: { name: string }) => t.name;
      text = text
        .replace(/Laborers/g, `${name(CONFIG.units[F.units.worker])}s`)
        .replace(/Laborer/g, name(CONFIG.units[F.units.worker]))
        .replace(/Keeps/g, `${name(CONFIG.buildings[F.buildings.hq])}s`)
        .replace(/Keep/g, name(CONFIG.buildings[F.buildings.hq]));
    }
    const last = this.journal[this.journal.length - 1];
    if (last?.text === text) return;
    this.journal.push({ tick: game.state.tick, text });
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
  /** Enemy soldiers seen in the opening (ids), for reading early pressure. */
  private earlySoldiers = new Set<number>();

  /** Neutral guards it has spotted: places not to send a lone builder. */
  private campsSeen: Array<{ x: number; y: number }> = [];

  /** This think's view of the enemy (see visible()). */
  private seen: Array<Unit | Building> = [];

  /** Enemy units it sees now, and enemy buildings in view. */
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
      if (u.kind !== 'unit' || game.player(u.owner).neutral || isWorker(u.type) || isScout(u.type)) continue;
      this.armySeen.set(u.id, { type: u.type, hp: u.hp, x: u.x, y: u.y, tick: now });
      // Soldiers on its side of the map early on mean an attack is coming.
      const mine = game.state.starts[this.player];
      const near = game.state.starts.every((st, p) => p === this.player || dist(u, mine) < dist(u, st));
      if (now < secondsToTicks(CONFIG.ai.earlyPressureSeconds) && near) this.earlySoldiers.add(u.id);
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

  /** Enemy buildings it knows of (as last seen), neutral objectives excluded. */
  private knownEnemyBuildings(game: Game) {
    return game.vision.remembered(this.player).filter((m) => !game.player(m.owner).neutral);
  }

  /**
   * Its read of the opponent, from scouting only: soldiers early means
   * pressure is coming (stay home, add a tower, delay the expansion); a
   * player behind towers is not coming (expand and tech now).
   */
  private observe(game: Game): void {
    if (!this.profile.readsIntel) return;
    const seconds = game.state.tick / 20;
    const known = this.knownEnemyBuildings(game);
    const towers = known.filter((m) => isRole(m.type, 'tower')).length;
    const barracks = known.filter((m) => isRole(m.type, 'barracks')).length;
    let next: Posture = this.posture;
    if ((this.earlySoldiers.size >= CONFIG.ai.earlyPressureSoldiers && seconds < 480) || (barracks >= 2 && seconds < 360)) next = 'threatened';
    else if (towers >= CONFIG.ai.turtleTowers) next = 'greedy';
    else if (seconds >= 480) next = 'steady';
    if (next === this.posture) return;
    this.posture = next;
    if (next === 'threatened') this.note(game, barracks >= 2 && this.earlySoldiers.size < CONFIG.ai.earlyPressureSoldiers ? 'Scouted two Barracks: expecting an early attack, so it holds the army home and adds a tower.' : 'Saw enemy soldiers on its side of the map early: expecting pressure, so it holds the army home, adds a tower and delays expanding.');
    else if (next === 'greedy') this.note(game, `Scouted ${towers} enemy towers: a defensive opponent, so it expands and fortifies sooner.`);
    else this.note(game, 'No longer worried about an early attack.');
  }

  private think(game: Game): void {
    const P = this.player;
    this.seen = this.visible(game);
    this.observe(game);
    const units = game.units().filter((u) => u.owner === P);
    const workers = units.filter((u) => isWorker(u.type));
    // Scouts are not soldiers: they scout and stay out of waves.
    const army = units.filter((u) => !isWorker(u.type) && !isScout(u.type));
    this.scoutRoutes(game, units.filter((u) => isScout(u.type)));
    this.scoutWithWorker(game, workers);
    const buildings = game.buildings().filter((b) => b.owner === P);
    const keeps = buildings.filter((b) => isRole(b.type, 'hq') && b.progress >= 1);
    const F = this.fac(game);
    const hall = CONFIG.buildings[F.buildings.hq];
    const role = this.planBuilding(game, workers, buildings);
    const plan = role ? F.buildings[role] : null;
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
    // Repair may use the money kept for a new Keep: mending the old one is cheaper.
    const repairReserve = { ...reserve };
    // Its last Keep is going down: keep enough to raise a new one.
    const allKeeps = buildings.filter((b) => isRole(b.type, 'hq'));
    if (this.profile.saveForKeep && role !== 'hq' && allKeeps.length === 1 && allKeeps[0].progress >= 1 && allKeeps[0].hp < allKeeps[0].maxHp * 0.5) {
      if (game.player(P).gold < hall.cost.gold) this.note(game, 'Its last Keep is falling: saving gold to rebuild.');
      reserve.gold += hall.cost.gold;
      reserve.wood += hall.cost.wood;
      committed.gold += hall.cost.gold;
      committed.wood += hall.cost.wood;
    }

    this.economy(game, workers, keeps, reserve);
    if (plan) this.build(game, plan, workers, buildings, keeps, committed);
    this.resumeAbandoned(game, workers, buildings);
    this.repairDamage(game, workers, buildings, repairReserve);
    this.trainArmy(game, army, buildings, keeps, reserve);
    this.military(game, army, workers, buildings, keeps, game.player(P).gold - reserve.gold);
  }

  // ---- economy ------------------------------------------------------------

  private minesNear(game: Game, k: Building): ResourceNode[] {
    return game
      .resources()
      .filter((r) => r.type === 'goldmine' && distToRect(r.x, r.y, k) < 12)
      .sort((a, b) => dist(a, k) - dist(b, k));
  }

  /** Laborers it puts on a mine: more on a mine that holds more miners at once. */
  private mineCrew(m: ResourceNode): number {
    return CONFIG.ai.goldWorkersPerMine + 2 * (m.miners - CONFIG.resources.goldmine.maxMiners);
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

  /** Laborers sent away from a raid, who stay put until the danger is gone. */
  private evacuated = new Set<number>();
  /** The Laborer out scouting, if any. */
  private scoutWorker = -1;
  private scoutedWithWorker = false;
  private peakWorkers = 0;
  private expansionNoted = 1;
  private recoveryNoted = false;

  private economy(game: Game, workers: Unit[], keeps: Building[], reserve: { gold: number }): void {
    const P = this.player;
    const me = game.player(P);
    const now = game.state.tick;
    const queued = keeps.reduce((n, k) => n + k.queue.filter((q) => !!q.unit && isWorker(q.unit)).length, 0);
    // Enough to fill every mine beside a Keep plus a modest wood crew (wood is
    // needed far less than gold), capped by the difficulty's target per Keep.
    const goldSlots = keeps.reduce((n, k) => {
      const m = this.minesNear(game, k)[0];
      return n + (m ? this.mineCrew(m) : 0);
    }, 0);
    const woodCrew = me.wood > CONFIG.ai.woodSurplus ? 2 : 5;
    const wanted = Math.min(goldSlots + woodCrew, this.profile.workerTarget * Math.max(1, keeps.length));
    // After heavy losses, Laborers come before everything else: an economy
    // rebuilt now pays for the army later.
    const recovering = workers.length < Math.max(6, wanted * 0.6);
    this.peakWorkers = Math.max(this.peakWorkers, workers.length);
    if (workers.length < this.peakWorkers * 0.6 && !this.recoveryNoted && keeps.length) {
      this.recoveryNoted = true;
      this.note(game, `Lost Laborers (${workers.length} of ${this.peakWorkers} left): rebuilding the economy before the army.`);
    }
    if (workers.length >= this.peakWorkers * 0.9) this.recoveryNoted = false;
    for (const k of keeps) {
      if (workers.length + queued >= wanted) break;
      if (k.queue.length > 0) continue;
      const spare = recovering ? me.gold : me.gold - reserve.gold;
      const worker = this.fac(game).units.worker;
      if (spare >= CONFIG.units[worker].cost.gold) game.issue({ type: 'train', player: P, buildingId: k.id, unit: worker });
      const mine = this.minesNear(game, k)[0];
      if (mine && k.rally?.targetId !== mine.id)
        game.issue({ type: 'setRally', player: P, buildingId: k.id, x: mine.x, y: mine.y, targetId: mine.id });
    }

    // How attentive it is: an easy computer notices idle Laborers only now and then.
    if (now - this.lastIdleCheck < secondsToTicks(this.profile.idleCheckSeconds)) return;
    this.lastIdleCheck = now;
    const homeMines = new Set(keeps.flatMap((k) => this.minesNear(game, k).map((m) => m.id)));
    const drops = game.buildings().filter((b) => b.owner === P && b.progress >= 1 && (isRole(b.type, 'hq') || isRole(b.type, 'lumbermill')));
    // Count gold workers per mine; move extras to wood, fill gaps from idle.
    const onMine = new Map<number, Unit[]>();
    const stray: Unit[] = [];
    for (const w of workers) {
      const o = w.order;
      if (o?.type !== 'gather' || w.id === this.scoutWorker) continue;
      if (o.res === 'gold') {
        // A mine with no Keep beside it (the Keep fell) means a long haul: rehome.
        if (!homeMines.has(o.nodeId) && keeps.length && !w.hidden) stray.push(w);
        else onMine.set(o.nodeId, [...(onMine.get(o.nodeId) ?? []), w]);
      } else {
        // Woodcutters far from any drop-off waste their day walking.
        const tree = game.resource(o.nodeId);
        if (tree && drops.length && !drops.some((d) => distToRect(tree.x, tree.y, d) < 16) && w.carry.amount === 0) stray.push(w);
      }
    }
    const toWood: Unit[] = [];
    for (const [id, list] of onMine) {
      const m = game.resource(id);
      const cap = m ? this.mineCrew(m) : CONFIG.ai.goldWorkersPerMine;
      if (list.length > cap) toWood.push(...list.slice(cap).filter((w) => !w.hidden && w.carry.amount === 0));
    }
    const idle = workers.filter((w) => w.order === null && w.id !== this.scoutWorker && !this.evacuated.has(w.id));
    for (const w of [...idle, ...stray]) {
      let target: ResourceNode | undefined;
      for (const k of keeps) {
        for (const m of this.minesNear(game, k)) {
          const n = onMine.get(m.id)?.length ?? 0;
          if (n < this.mineCrew(m)) {
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
      const mill = game.buildings().find((b) => b.owner === P && isRole(b.type, 'lumbermill') && b.progress >= 1);
      const tree = this.nearestTree(game, mill ?? k ?? w);
      if (tree) game.issue({ type: 'gather', player: P, units: [w.id], nodeId: tree.id });
    }
  }

  /**
   * In the opening, a Laborer walks over to look at the enemy base (the
   * start locations are public, what is built there is not), then goes back
   * to work. What it sees feeds the posture.
   */
  private scoutWithWorker(game: Game, workers: Unit[]): void {
    const at = this.profile.scoutWorkerSeconds;
    if (at === null) return;
    const P = this.player;
    const foe = game.state.starts.find((_, p) => p !== P && !game.player(p).neutral && !game.player(p).defeated);
    if (!foe) return;
    const w = this.scoutWorker >= 0 ? game.unit(this.scoutWorker) : undefined;
    if (this.scoutWorker >= 0 && !w) {
      this.scoutWorker = -1;
      return;
    }
    if (w) {
      const sawBase = this.knownEnemyBuildings(game).some((m) => isRole(m.type, 'hq'));
      if (sawBase || w.hp < w.maxHp * 0.6 || (w.order === null && dist(w, foe) < 8)) {
        const home = game.state.starts[P];
        const mine = game.resources().filter((r) => r.type === 'goldmine').sort((a, b) => dist(a, home) - dist(b, home))[0];
        if (mine) game.issue({ type: 'gather', player: P, units: [w.id], nodeId: mine.id });
        else game.issue({ type: 'stop', player: P, units: [w.id] });
        const known = this.knownEnemyBuildings(game);
        this.note(game, `Laborer scouted the enemy base: ${known.length} buildings, ${known.filter((m) => isRole(m.type, 'barracks')).length} Barracks.`);
        this.scoutWorker = -1;
      }
      return;
    }
    if (this.scoutedWithWorker || game.state.tick < secondsToTicks(at)) return;
    const pick = workers.find((u) => u.order?.type === 'gather' && u.order.res === 'gold' && !u.hidden && u.carry.amount === 0);
    if (!pick) return;
    this.scoutedWithWorker = true;
    this.scoutWorker = pick.id;
    game.issue({ type: 'move', player: P, units: [pick.id], x: foe.x, y: foe.y });
  }

  // ---- construction ---------------------------------------------------------

  /** Wants another Keep now (timing, intel and the state of its home mine). */
  private wantsExpansion(game: Game, buildings: Building[]): boolean {
    const P = this.player;
    const keeps = buildings.filter((b) => isRole(b.type, 'hq'));
    if (keeps.length >= this.profile.maxKeeps) return false;
    const seconds = game.state.tick / 20;
    const me = game.player(P);
    const homeMineLow = this.homeMineLow(game, buildings);
    if (homeMineLow) return true;
    if (this.posture === 'threatened') return false;
    // A third Keep only once the second is running, and well after the first expansion.
    if (keeps.length >= 2 && (keeps.some((k) => k.progress < 1) || seconds < this.profile.expandSeconds + 240)) return false;
    const starved = me.wood > CONFIG.ai.woodSurplus && seconds > 180;
    const greedy = this.posture === 'greedy' && seconds > 240;
    // The better economic call: take the next mine as soon as it is safe.
    const safe =
      this.profile.expandWhenSafe &&
      keeps.length === 1 &&
      seconds >= CONFIG.ai.safeExpandSeconds &&
      this.threatSince < 0 &&
      game.units().filter((u) => u.owner === P && !isWorker(u.type) && !isScout(u.type)).length >= CONFIG.ai.safeExpandArmy;
    return seconds >= this.profile.expandSeconds || starved || greedy || safe;
  }

  /** The next building it wants, by role. */
  private planBuilding(game: Game, workers: Unit[], buildings: Building[]): BuildingRole | null {
    if (!workers.length) return null;
    const P = this.player;
    const F = this.fac(game);
    const count = (r: BuildingRole) => buildings.filter((b) => isRole(b.type, r)).length;
    // A planted building needs no builder, but it still paces the plan: it
    // holds a slot until it is half grown (a Crown builder is tied up longer).
    const unfinished = buildings.filter((b) => b.progress < (b.grows ? 0.5 : 1)).length + workers.filter((w) => w.order?.type === 'build' && w.order.siteId < 0).length;
    if (count('hq') === 0) {
      // Lost the base: rebuild before anything else.
      if (!workers.some((w) => w.order?.type === 'build' && isRole(w.order.buildingType, 'hq'))) this.note(game, 'Lost its last Keep: rebuilding one before anything else.');
      return 'hq';
    }
    if (unfinished >= this.profile.builders) return null;
    const pending = buildings.reduce((n, b) => n + b.queue.filter((q) => !q.started).reduce((s, q) => s + (q.unit ? CONFIG.units[q.unit].pop : 0), 0), 0);
    const spare = game.popCap(P) - game.popUsed(P) - pending;
    const farmsBuilding = buildings.some((b) => isRole(b.type, 'farm') && b.progress < 1) || workers.some((w) => w.order?.type === 'build' && isRole(w.order.buildingType, 'farm'));
    const buffer = CONFIG.ai.popBuffer + 2 * count('barracks');
    if (spare < buffer && game.popCap(P) < rulesOf(game.state).maxPop && !farmsBuilding) return 'farm';
    // A hero-first style raises its Hall before the Barracks.
    if (this.profile.heroesEarly && count('altar') === 0 && workers.length >= this.profile.barracksAtWorkers) return 'altar';
    if (count('barracks') === 0 && workers.length >= this.profile.barracksAtWorkers) return 'barracks';
    if (count('barracks') > 0 && count('lumbermill') === 0) return 'lumbermill';
    if (count('barracks') > 0 && count('altar') === 0) return 'altar';
    // An expansion-first style saves for its second Keep before any tower,
    // unless it is under threat.
    const expandNow = () => this.wantsExpansion(game, buildings) && this.expansionMine(game, buildings);
    const towersWait = this.profile.expandsFirst && this.posture !== 'threatened' && count('hq') < 2;
    const towers = this.profile.towers + (this.posture === 'threatened' ? 1 : 0);
    if (!towersWait && count('tower') < towers && hasCompleted(game, P, F.buildings.barracks)) return 'tower';
    if (this.profile.upgrades && count('smithy') === 0 && hasCompleted(game, P, F.buildings.lumbermill)) return 'smithy';
    // Tier II production, for the units its mix calls for.
    if (researched(game, P, F.tiers[0])) {
      if (count('chapel') === 0 && this.profile.mix.cleric > 0) return 'chapel';
      if (count('workshop') === 0 && this.profile.mix.mangonel > 0) return 'workshop';
    }
    const me = game.player(P);
    if (count('barracks') < this.profile.maxBarracks && workers.length >= this.profile.extraBarracksAtWorkers && me.gold >= 300) return 'barracks';
    if (expandNow()) return 'hq';
    return null;
  }

  private homeMineLow(game: Game, buildings: Building[]): boolean {
    const k = buildings.find((b) => isRole(b.type, 'hq'));
    if (!k) return false;
    const m = this.minesNear(game, k)[0];
    return !m || m.amount < 1500;
  }

  /** Enemy forces it knows of near a spot: in view now, or seen there recently. */
  private dangerAt(p: { x: number; y: number }, radius: number): boolean {
    if (this.seen.some((e) => e.kind === 'unit' && dist(e, p) < radius)) return true;
    for (const m of this.armySeen.values()) if (dist(m, p) < radius) return true;
    return false;
  }

  /** The best unguarded mine without a Keep beside it, reward weighed against distance. */
  private expansionMine(game: Game, buildings: Building[], allowGuarded = false): ResourceNode | undefined {
    const home = buildings.find((b) => isRole(b.type, 'hq')) ?? buildings[0];
    if (!home) return undefined;
    const keeps = [
      ...game.buildings().filter((b) => isRole(b.type, 'hq') && b.owner === this.player),
      ...game.vision.remembered(this.player).filter((m) => isRole(m.type, 'hq')),
    ];
    // Reward against distance: a rich mine is worth a longer walk, a small one less.
    const cost = (m: ResourceNode) => dist(m, home) - CONFIG.ai.richMineBonus * (m.miners - CONFIG.resources.goldmine.maxMiners) - (m.amount >= CONFIG.mineKinds.standard.gold ? CONFIG.ai.fullMineBonus : 0);
    return game
      .resources()
      .filter((m) => m.type === 'goldmine' && m.amount > 2000)
      .filter((m) => !keeps.some((b) => distToRect(m.x, m.y, b) < 12))
      .filter((m) => allowGuarded || !this.campsSeen.some((c) => dist(c, m) < 9)) // guarded: clear it first
      .filter((m) => !this.dangerAt(m, this.profile.readsIntel ? 14 : 9))
      .sort((a, b) => cost(a) - cost(b))[0];
  }

  private siteFor(game: Game, type: BuildingType, buildings: Building[], keeps: Building[]) {
    const P = this.player;
    const home = keeps[0] ?? buildings[0];
    const role = buildingRole(type);
    if (role === 'hq') {
      if (!buildings.some((b) => isRole(b.type, 'hq'))) {
        // Rebuilding: the mine nearest to what it has left, if no enemy is there.
        const anchor = buildings[0] ?? game.units().find((u) => u.owner === P);
        if (!anchor) return null;
        const mine = game
          .resources()
          .filter((r) => r.type === 'goldmine' && r.amount > 500 && !this.dangerAt(r, 10))
          .sort((a, b) => dist(a, anchor) - dist(b, anchor))[0];
        return mine ? findSite(game, P, type, mine.x, mine.y) : null;
      }
      const m = this.expansionMine(game, buildings) ?? (home ? this.minesNear(game, home)[0] : undefined);
      return m ? findSite(game, P, type, m.x, m.y) : null;
    }
    if (!home) return null;
    if (role === 'lumbermill') {
      const tree = this.nearestTree(game, home);
      return tree ? findSite(game, P, type, tree.x + Math.sign(home.x - tree.x) * 2, tree.y + Math.sign(home.y - tree.y) * 2) : null;
    }
    if (role === 'tower') {
      // The first tower covers the approach; later ones the mines, where
      // raids hit Laborers.
      const built = buildings.filter((b) => isRole(b.type, 'tower')).length;
      const mines = keeps.flatMap((k) => this.minesNear(game, k).slice(0, 1).map((m) => ({ k, m })));
      const spot = built > 0 ? mines[(built - 1) % Math.max(1, mines.length)] : undefined;
      if (spot) return findSite(game, P, type, (spot.k.x + spot.m.x * 2) / 3, (spot.k.y + spot.m.y * 2) / 3);
    }
    if (role === 'tower' || role === 'barracks' || role === 'altar' || role === 'smithy' || role === 'workshop') {
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
    const candidates = workers.filter((w) => w.order?.type !== 'build' && !w.hidden && w.id !== this.scoutWorker);
    const woodies = candidates.filter((w) => w.order?.type === 'gather' && w.order.res === 'wood');
    const pool = woodies.length ? woodies : candidates;
    if (!pool.length) return;
    const builder = pool.reduce((a, b) => (dist(b, centre) < dist(a, centre) ? b : a));
    game.issue({ type: 'build', player: this.player, units: [builder.id], buildingType: type, tx: site.tx, ty: site.ty });
    if (isRole(type, 'hq') && keeps.length && this.expansionNoted < keeps.length + 1) {
      this.expansionNoted = keeps.length + 1;
      const m = game.resources().find((r) => r.type === 'goldmine' && distToRect(r.x, r.y, site) < 12);
      this.note(game, `Expanding to ${m && m.miners > CONFIG.resources.goldmine.maxMiners ? 'a rich mine' : 'a new mine'} (Keep ${keeps.length + 1}).`);
    }
  }

  /** Foundations whose builder died or was pulled away get a new builder. */
  private resumeAbandoned(game: Game, workers: Unit[], buildings: Building[]): void {
    for (const b of buildings) {
      if (b.progress >= 1 || b.grows) continue;
      if (workers.some((w) => w.order?.type === 'build' && w.order.siteId === b.id)) continue;
      // Don't send Laborers back into a fight at the site.
      if (this.dangerAt(b, 8)) continue;
      const free = workers.filter((w) => w.order?.type !== 'build' && !w.hidden && w.id !== this.scoutWorker);
      if (!free.length) return;
      const w = free.reduce((a, c) => (dist(c, b) < dist(a, b) ? c : a));
      game.issue({ type: 'resumeBuild', player: this.player, units: [w.id], buildingId: b.id });
    }
  }

  /**
   * Once the enemy has gone, one worker (a woodcutter if it can) mends each
   * badly damaged building, while there is money to spare for it.
   */
  private repairDamage(game: Game, workers: Unit[], buildings: Building[], reserve: { gold: number; wood: number }): void {
    if (!this.profile.repairs) return;
    const me = game.player(this.player);
    // Repair is paid as it goes: never out of money set aside (a new Keep, a planned building).
    if (me.gold < reserve.gold || me.wood < reserve.wood) {
      const repairing = workers.filter((w) => w.order?.type === 'repair').map((w) => w.id);
      if (repairing.length) game.issue({ type: 'stop', player: this.player, units: repairing });
      return;
    }
    if (me.gold - reserve.gold < CONFIG.ai.repairGold) return;
    const damaged = buildings.filter(
      (b) =>
        b.progress >= 1 &&
        b.hp < b.maxHp * CONFIG.ai.repairBelow &&
        !this.dangerAt(b, 10) &&
        !workers.some((w) => w.order?.type === 'repair' && w.order.targetId === b.id),
    );
    const b = damaged.sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0];
    if (!b) return;
    const free = workers.filter((w) => w.order?.type === 'gather' && !w.hidden && w.carry.amount === 0 && w.id !== this.scoutWorker);
    const pool = free.filter((w) => w.order?.type === 'gather' && w.order.res === 'wood');
    const from = pool.length ? pool : free;
    if (!from.length) return;
    const w = from.reduce((a, c) => (dist(c, b) < dist(a, b) ? c : a));
    game.issue({ type: 'repair', player: this.player, units: [w.id], buildingId: b.id });
    this.note(game, `Repairing its ${CONFIG.buildings[b.type].name}.`);
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
    const altar = buildings.find((b) => isRole(b.type, 'altar') && b.progress >= 1);
    if (altar) {
      for (const type of this.profile.heroes.map((h) => this.fac(game).heroes[heroSlot(h)])) {
        if (heroProblem(game, P, type)) continue;
        const c = trainCost(game, P, type);
        if (me.gold - reserve.gold < c.gold || me.wood - reserve.wood < c.wood) break;
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
    const rax = buildings.find((b) => isRole(b.type, 'barracks') && b.progress >= 1 && b.queue.length < 2);
    const scouts = game.units().filter((u) => u.owner === P && isScout(u.type)).length + buildings.reduce((n, b) => n + b.queue.filter((q) => !!q.unit && isScout(q.unit)).length, 0);
    const scout = this.fac(game).units.scout;
    if (rax && scouts < this.profile.scouts && this.scoutsTrained < CONFIG.ai.maxScouts && me.gold - reserve.gold >= CONFIG.units[scout].cost.gold) {
      game.issue({ type: 'train', player: P, buildingId: rax.id, unit: scout });
      this.scoutsTrained++;
    }
    const mix = this.wantedMix(game);
    const total = Object.values(mix).reduce((a, b) => a + b, 0) || 1;
    const counts = new Map<ArmyUnit, number>();
    const tally = (t: UnitType) => {
      const k = armyKey(t);
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    };
    for (const u of army) tally(u.type);
    for (const b of buildings) for (const q of b.queue) if (q.unit) tally(q.unit);
    const size = army.length + 1;
    // How far each soldier type is below its share of the wanted mix.
    const deficit = (t: ArmyUnit) => mix[t] / total - (counts.get(t) ?? 0) / size;
    for (const b of buildings) {
      const role = buildingRole(b.type);
      if (b.progress < 1 || !role || !PRODUCTION.has(role)) continue;
      if (home && !b.rally) {
        const s = this.staging(game, home);
        game.issue({ type: 'setRally', player: P, buildingId: b.id, x: s.x, y: s.y, targetId: -1 });
      }
      if (b.queue.length >= 2) continue;
      const options = trainableAt(b.type).filter((t) => {
        const k = armyKey(t);
        return k && mix[k] > 0 && !missingRequirement(game, P, t);
      });
      if (!options.length) continue;
      const unit = options.reduce((a, c) => (deficit(armyKey(c)!) > deficit(armyKey(a)!) ? c : a));
      // The Barracks always keeps training; specialist buildings only fill their share.
      if (role !== 'barracks' && deficit(armyKey(unit)!) <= 0) continue;
      const c = CONFIG.units[unit].cost;
      if (me.gold - reserve.gold >= c.gold && me.wood - reserve.wood >= c.wood) {
        game.issue({ type: 'train', player: P, buildingId: b.id, unit });
        tally(unit);
      }
    }
  }

  private adaptedNoted = false;

  /**
   * The composition it wants now: its profile's mix, shifted toward counters
   * of the enemy soldiers it has seen (and still remembers).
   */
  wantedMix(game: Game): Record<ArmyUnit, number> {
    const mix = { ...this.profile.mix };
    // Banked wood is wasted wood: lean on the units that use it.
    if (this.profile.usesSurplus && game.player(this.player).wood > CONFIG.ai.woodSurplus)
      for (const t of Object.keys(mix) as ArmyUnit[]) if (CONFIG.units[this.fac(game).units[ARMY_ROLE[t]]].cost.wood >= 30) mix[t] *= 1.6;
    if (!this.profile.adapt) return mix;
    // Counted by role, so a Thornguard reads as a Guard would.
    const seen = new Map<ArmyUnit, number>();
    const types = new Map<UnitType, number>();
    for (const m of this.armySeen.values()) {
      const k = armyKey(m.type);
      if (k) seen.set(k, (seen.get(k) ?? 0) + 1);
      types.set(m.type, (types.get(m.type) ?? 0) + 1);
    }
    const n = [...types.values()].reduce((a, b) => a + b, 0);
    if (n < CONFIG.ai.adaptAfterSeen) return mix;
    const share = (t: ArmyUnit) => (seen.get(t) ?? 0) / n;
    const k = CONFIG.ai.adaptStrength;
    // Lancers run down archers, casters and siege; Guards stop Lancers;
    // Archers shred light units; Clerics' magic burns heavy armor.
    mix.lancer += k * (share('archer') + share('cleric') + share('mangonel'));
    mix.guard += k * share('lancer');
    mix.archer += k * share('cleric');
    mix.cleric += (k / 2) * share('guard');
    if (!researched(game, this.player, this.fac(game).tiers[0])) mix.guard += k * share('archer') * 0.5; // no Lancers yet
    if (!this.adaptedNoted) {
      this.adaptedNoted = true;
      const main = [...types.entries()].sort((a, b) => b[1] - a[1])[0][0];
      this.note(game, `Adapting its army to what it has seen (mostly ${CONFIG.units[main].name}s).`);
    }
    return mix;
  }

  /** Upgrades in a fixed order, when the economy can spare it. */
  private research(game: Game, buildings: Building[], reserve: { gold: number; wood: number }): void {
    if (!this.profile.upgrades) return;
    const P = this.player;
    const me = game.player(P);
    const seconds = game.state.tick / 20;
    const up = this.fac(game).upgrades;
    const [tier2, tier3] = this.fac(game).tiers;
    const order: ResearchId[] = [up.weapons[0], up.armor[0], up.carryWood];
    // Mule Carts ties up the Keep, which also trains Laborers: not in the opening.
    if (up.carryGold && seconds >= CONFIG.ai.cartsSeconds) order.push(up.carryGold);
    // Facing a turtle, it fortifies a fifth sooner.
    const woodBanked = this.profile.usesSurplus && me.wood > CONFIG.ai.woodSurplus * 1.5;
    const soon = this.posture === 'greedy' || woodBanked ? 0.8 : 1;
    if (this.profile.castleSeconds !== null && seconds >= this.profile.castleSeconds * soon) {
      order.push(tier2, up.weapons[1], up.armor[1]);
      if (this.profile.mix.archer > 0) order.push(up.range);
    }
    if (this.profile.citadelSeconds !== null && seconds >= this.profile.citadelSeconds * soon) {
      order.push(tier3, up.weapons[2], up.armor[2]);
      if (this.profile.mix.cleric > 0) order.push(up.heal);
    }
    for (const id of order) {
      const def = CONFIG.research[id];
      if (researched(game, P, id) || researchPending(game, P, id)) continue;
      const b = buildings.find((x) => x.type === def.at && x.progress >= 1 && x.queue.length === 0);
      if (!b || researchProblem(game, P, b, id)) continue;
      if (me.gold - reserve.gold - CONFIG.ai.researchBuffer < def.cost.gold || me.wood - reserve.wood < def.cost.wood) return;
      game.issue({ type: 'research', player: P, buildingId: b.id, research: id });
      if (id === tier2) this.note(game, id === 'castle' ? 'Fortifying to a Castle for tier II units and upgrades.' : `Raising its main hall to tier II (${def.name}) for new units and upgrades.`);
      if (id === tier3) this.note(game, id === 'citadel' ? 'Fortifying to a Citadel.' : `Raising its main hall to tier III (${def.name}).`);
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
  private heroErrands(game: Game, army: Unit[], enemies: Array<Unit | Building>, keeps: Building[], spare: number): void {
    const P = this.player;
    const heroes = army.filter((u) => u.hero && !this.healing.has(u.id));
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
      const wish = this.shoppingList(h).find((it) => !buyProblem(game, P, shop.id, h.id, it) && CONFIG.items[it].price <= spare);
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
    if (spare < CONFIG.ai.shopGold || this.wave.length) return;
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
    // By hero slot: casters want mana, ranged heroes damage, fighters armor.
    const slot = heroSlot(h.type);
    const wants: ItemId[] = slot === 2 ? ['charm', 'mail', 'blade'] : slot === 1 ? ['blade', 'charm', 'mail'] : ['mail', 'blade', 'charm'];
    const list = wants.filter((it) => !has.has(it));
    if (!has.has('draught')) list.push('draught');
    return list;
  }

  /** Heroes pulled out of a fight to heal (ids), until healthy again. */
  private healing = new Set<number>();

  /**
   * A badly hurt hero with nothing left to drink walks out of the fight to
   * the nearest Healing Fountain (or home), and rejoins once healed.
   */
  private heroRecovery(game: Game, army: Unit[], keeps: Building[]): void {
    if (!this.profile.heroRetreat) return;
    const P = this.player;
    for (const id of this.healing) {
      const h = game.unit(id);
      if (!h || h.hp >= h.maxHp * CONFIG.ai.heroBackShare) this.healing.delete(id);
    }
    for (const h of army) {
      if (!h.hero || this.healing.has(h.id) || h.hp >= h.maxHp * CONFIG.ai.heroRetreatShare) continue;
      if (h.hero.items.includes('draught') || h.hero.items.includes('scroll')) continue;
      const fountains = game.buildings().filter((b) => b.type === 'fountain');
      const home = keeps[0] ? this.staging(game, keeps[0]) : null;
      const spots = [...fountains.map((f) => ({ x: f.x, y: f.y + f.h / 2 + 1 })), ...(home ? [home] : [])].filter((p) => !this.dangerAt(p, 8));
      const to = spots.sort((a, b) => dist(a, h) - dist(b, h))[0];
      if (!to) continue;
      this.healing.add(h.id);
      this.wave = this.wave.filter((x) => x !== h.id);
      if (this.shopping?.hero === h.id) this.shopping = null;
      game.issue({ type: 'move', player: P, units: [h.id], x: to.x, y: to.y });
      this.note(game, `Pulled its ${CONFIG.units[h.type].name} out of the fight to heal.`);
    }
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
      const threat = foes.find((f) => f.hero) ?? foes.filter((f) => !isWorker(f.type)).sort((a, b) => b.hp - a.hp)[0];
      for (const ability of abilitiesOf(h.type)) {
        const def = CONFIG.hero.abilities[ability];
        if (def.effect === 'reveal') {
          // Scout the enemy base before a wave goes in blind.
          const known = this.knownEnemyBuildings(game).length > 0;
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

  /**
   * Focus fire: soldiers in a fight switch to an enemy hero or a badly hurt
   * enemy within their reach, then carry on to where they were going.
   */
  private focusFire(game: Game, army: Unit[], enemies: Array<Unit | Building>): void {
    const now = game.state.tick;
    if (!this.profile.focusFire || now - this.lastFocus < secondsToTicks(2)) return;
    this.lastFocus = now;
    const P = this.player;
    const foes = enemies.filter((e): e is Unit => e.kind === 'unit' && !game.player(e.owner).neutral);
    if (!foes.length) return;
    const byTarget = new Map<number, number[]>();
    for (const u of army) {
      if (u.hero || this.healing.has(u.id)) continue;
      // Switching mid-swing throws the swing away.
      if (CONFIG.ai.focusKeepSwing && u.swing > 0) continue;
      const o = u.order;
      if (o?.type !== 'attack' && o?.type !== 'attackMove') continue;
      const reach = CONFIG.units[u.type].attack.range + u.radius + CONFIG.ai.focusSlack;
      const inReach = foes.filter((f) => dist(f, u) - f.radius <= reach);
      const pick =
        inReach.find((f) => f.hero && f.hp < f.maxHp * CONFIG.ai.focusHeroShare) ??
        inReach.filter((f) => f.hp < f.maxHp * 0.35).sort((a, b) => a.hp - b.hp)[0];
      const current = o.targetId;
      if (!pick || pick.id === current) continue;
      byTarget.set(pick.id, [...(byTarget.get(pick.id) ?? []), u.id]);
    }
    const to = this.waveTarget;
    for (const [targetId, ids] of byTarget) {
      game.issue({ type: 'attack', player: P, units: ids, targetId });
      if (to && ids.every((id) => this.wave.includes(id))) game.issue({ type: 'attackMove', player: P, units: ids, x: to.x, y: to.y, queued: true });
    }
  }

  // ---- military ---------------------------------------------------------------

  private military(game: Game, army: Unit[], workers: Unit[], buildings: Building[], keeps: Building[], spare: number): void {
    const P = this.player;
    const now = game.state.tick;
    const enemies = this.seen;
    let threats = enemies.filter(
      (e): e is Unit => e.kind === 'unit' && !isScout(e.type) && buildings.some((b) => distToRect(e.x, e.y, b) < CONFIG.ai.defendRadius),
    );
    // A lone Laborer walking through is a scout, not an attack: towers and
    // nearby soldiers deal with it on their own.
    if (threats.every((t) => isWorker(t.type)) && threats.length < 2) threats = [];
    this.wave = this.wave.filter((id) => game.unit(id));
    this.heroRecovery(game, army, keeps);
    const fit = army.filter((u) => !this.healing.has(u.id));
    const home = fit.filter((u) => !this.wave.includes(u.id));
    this.heroTactics(game, army, enemies);
    this.heroErrands(game, army, enemies, keeps, spare);
    this.focusFire(game, fit, enemies);

    if (threats.length) {
      if (this.threatSince < 0) this.threatSince = now;
      // How quickly it notices: the difficulty's reaction time.
      if (now - this.threatSince < secondsToTicks(this.profile.reactSeconds)) return;
      this.defend(game, threats, fit, home, workers, keeps);
      return;
    }
    this.threatSince = -1;

    // Laborers drafted for defence go back to work once the threat is gone;
    // ones sent away from a raid are free to go back too.
    const drafted = workers.filter((w) => w.order?.type === 'attack');
    if (drafted.length) game.issue({ type: 'stop', player: P, units: drafted.map((w) => w.id) });
    if (this.evacuated.size) this.evacuated.clear();

    const seconds = now / 20;
    const broke = !buildings.some((b) => isRole(b.type, 'hq')) && game.player(P).gold < CONFIG.buildings[this.fac(game).buildings.hq].cost.gold;
    if (!this.wave.length) {
      // A threatened computer holds the army home a little longer.
      const needed = this.waveSize + (this.posture === 'threatened' ? 2 : 0);
      const raidReady = this.profile.raids && seconds >= this.profile.firstAttackSeconds * 0.75 && now - this.lastRaid > secondsToTicks(90);
      // An enemy with more bases than this one is spread thin: hit it sooner.
      const greedy = this.profile.readsIntel && this.knownEnemyHalls(game) > keeps.length;
      const attackAt = this.profile.firstAttackSeconds * (greedy ? CONFIG.ai.greedAttackTiming : 1);
      if (seconds >= attackAt && home.length >= needed && this.favourable(game, home, enemies)) {
        this.launch(game, home, 'attack');
      } else if (raidReady && home.length >= CONFIG.ai.raidSize && this.raidTarget(game)) {
        // The fastest few go for the enemy's Laborers while the rest stay home.
        const party = [...home].filter((u) => !u.hero).sort((a, b) => CONFIG.units[b.type].speed - CONFIG.units[a.type].speed).slice(0, CONFIG.ai.raidSize);
        if (party.length >= CONFIG.ai.raidSize - 1) this.launch(game, party, 'raid');
      } else if (broke && home.length >= 3 && this.creepTarget(game, keeps, buildings)) {
        // No Keep and no money for one: camp bounty is the way back.
        this.creepAt = this.creepTarget(game, keeps, buildings);
        this.note(game, 'Too poor to rebuild its Keep: clearing a camp for the bounty.');
        this.launch(game, home, 'creep');
      } else if (this.profile.creeps && home.some((u) => u.hero) && home.length >= this.profile.creepParty && this.creepTarget(game, keeps, buildings)) {
        // Between attacks: take the army and hero to clear a camp for experience.
        this.creepAt = this.creepTarget(game, keeps, buildings);
        this.launch(game, home, 'creep');
      } else if (keeps[0]) {
        // Keep the home army gathered at the staging point.
        const s = this.staging(game, keeps[0]);
        const stray = home.filter((u) => u.order === null && dist(u, s) > 4);
        if (stray.length) game.issue({ type: 'move', player: P, units: stray.map((u) => u.id), x: s.x, y: s.y });
        return;
      }
    }
    if (!this.wave.length) return;
    this.runWave(game, home, keeps);
  }

  /** Answer an attack on its buildings in proportion to it. */
  private defend(game: Game, threats: Unit[], army: Unit[], home: Unit[], workers: Unit[], keeps: Building[]): void {
    const P = this.player;
    const now = game.state.tick;
    if (now - this.lastDefend < secondsToTicks(3)) return;
    this.lastDefend = now;
    const c = centroid(threats);
    const danger = this.strength(threats);
    // Recall the wave when the base faces a real attack: judged by strength,
    // or (without judgement) by headcount.
    // A judging computer counts the towers standing near the threat, and never
    // recalls a wave over a couple of stragglers.
    const g = CONFIG.units.guard;
    const towers = game.buildings().filter((b) => b.owner === P && isRole(b.type, 'tower') && b.progress >= 1 && dist(b, c) < 10).length;
    const held = this.strength(home) + towers * CONFIG.ai.towerAsGuards * g.hp * (g.attack.damage / g.attack.cooldown);
    const soldiers = threats.filter((t) => !isWorker(t.type));
    const serious = this.profile.judgeFights ? soldiers.length >= 2 && danger > held * 0.8 : threats.length >= 3;
    if (serious && this.wave.length) {
      this.note(game, 'Recalled its army to defend the base.');
      this.endWave(false);
    }
    // Enough defenders, nearest first, to outmatch the attackers; a
    // judging computer leaves the rest at their posts.
    const pool = (serious ? army : home).filter((u) => !this.healing.has(u.id)).sort((a, b) => dist(a, c) - dist(b, c));
    let defenders = pool;
    if (this.profile.judgeFights) {
      defenders = [];
      let s = 0;
      for (const u of pool) {
        if (s >= danger * 1.5 && defenders.length >= 2) break;
        defenders.push(u);
        s += this.strength([u]);
      }
    }
    const idleDefenders = defenders.filter((u) => u.order?.type !== 'attack');
    if (idleDefenders.length) game.issue({ type: 'attackMove', player: P, units: idleDefenders.map((u) => u.id), x: c.x, y: c.y });
    const near = defenders.filter((u) => dist(u, c) < 12);
    const hopeless = this.strength(near) < danger;
    // Laborers in the way of an army they can't fight leave for another Keep.
    if (this.profile.pullWorkers && hopeless && soldiers.length >= 2) {
      const nearest = keeps.reduce<Building | undefined>((a, k) => (!a || dist(k, c) < dist(a, c) ? k : a), undefined);
      const refuge = keeps.filter((k) => k !== nearest && dist(k, c) > 20).sort((a, b) => dist(a, c) - dist(b, c))[0];
      const mine = refuge ? this.minesNear(game, refuge)[0] : undefined;
      const exposed = workers.filter((w) => !w.hidden && dist(w, c) < 10 && !this.evacuated.has(w.id));
      if (mine && exposed.length) {
        for (const w of exposed) this.evacuated.add(w.id);
        game.issue({ type: 'gather', player: P, units: exposed.map((w) => w.id), nodeId: mine.id });
        this.note(game, `Moved ${exposed.length === 1 ? 'a Laborer' : `${exposed.length} Laborers`} away from an attack to its other Keep.`);
        return;
      }
    }
    // With no soldiers nearby, Laborers next to a small raid fight back (not on Easy).
    if (!near.length && this.difficulty !== 'easy' && soldiers.length <= 3) {
      const militia = workers.filter((w) => !w.hidden && dist(w, c) < 8).slice(0, 2 * threats.length);
      const target = threats.reduce((a, b) => (dist(b, c) < dist(a, c) ? b : a));
      if (militia.length) game.issue({ type: 'attack', player: P, units: militia.map((w) => w.id), targetId: target.id });
    }
  }

  private launch(game: Game, units: Unit[], kind: 'attack' | 'creep' | 'raid'): void {
    this.wave = units.map((u) => u.id);
    this.waveLaunched = this.wave.length;
    this.waveKind = kind;
    this.waveStart = game.state.tick;
    this.waveTarget = null;
    this.lastWaveOrder = -1e9;
    this.waveGathering = this.profile.regroup && kind === 'attack';
    if (kind !== 'creep') this.creepAt = null;
    if (kind === 'raid') {
      this.lastRaid = game.state.tick;
      this.note(game, `Sent ${units.length} soldiers to raid the enemy's workers.`);
    } else if (kind === 'attack') {
      this.note(game, `Attacking with ${units.length} units.`);
    }
  }

  /** The enemy mine to raid: next to a Keep it knows of, or at the enemy start. */
  /** Enemy main halls it knows of. */
  private knownEnemyHalls(game: Game): number {
    return this.knownEnemyBuildings(game).filter((m) => isRole(m.type, 'hq')).length;
  }

  private raidTarget(game: Game): { x: number; y: number } | null {
    const keeps = this.knownEnemyBuildings(game).filter((m) => isRole(m.type, 'hq'));
    const anchors = keeps.length ? keeps : game.state.starts.filter((_, p) => p !== this.player && !game.player(p).neutral && !game.player(p).defeated);
    // The newest base is usually the least defended.
    const anchor = anchors[anchors.length - 1];
    if (!anchor) return null;
    const mine = game.resources().filter((r) => r.type === 'goldmine').sort((a, b) => dist(a, anchor) - dist(b, anchor))[0];
    return mine && dist(mine, anchor) < 14 ? { x: mine.x, y: mine.y } : { x: anchor.x, y: anchor.y };
  }

  private runWave(game: Game, home: Unit[], keeps: Building[]): void {
    const P = this.player;
    const now = game.state.tick;
    const enemies = this.seen;
    const waveUnits = this.wave.map((id) => game.unit(id)!).filter(Boolean);
    const goHome = (grow: boolean, why?: string) => {
      const s = keeps[0] ? this.staging(game, keeps[0]) : null;
      if (s) game.issue({ type: 'move', player: P, units: this.wave, x: s.x, y: s.y });
      if (why) this.note(game, why);
      this.endWave(grow);
    };
    const c = centroid(waveUnits);
    if (this.wave.length <= Math.floor(this.waveLaunched * this.profile.retreatShare)) return goHome(this.waveKind === 'attack', this.waveKind === 'creep' ? undefined : 'Its wave was mostly lost: falling back.');
    // Judging the fight in front of it: back off from a clearly stronger force.
    if (this.profile.judgeFights && this.waveKind !== 'creep') {
      const facing = enemies.filter((e): e is Unit => e.kind === 'unit' && !game.player(e.owner).neutral && dist(e, c) < 12);
      const towers = enemies.filter((e): e is Building => e.kind === 'building' && isRole(e.type, 'tower') && e.progress >= 1 && dist(e, c) < 12);
      const theirs = this.strength(facing) + towers.length * this.strength(waveUnits.slice(0, 1)) * 1.5;
      // Turning tail in the middle of a fight gets an army cut down from
      // behind: once engaged it only runs from a hopeless fight; before
      // contact it backs off from any clearly stronger force.
      const engaged = facing.some((e) => waveUnits.some((u) => dist(u, e) < CONFIG.ai.engagedRange));
      const odds = engaged ? CONFIG.ai.hopelessOdds : CONFIG.ai.retreatOdds;
      if (theirs > this.strength(waveUnits) * odds) return goHome(this.waveKind === 'attack', engaged ? 'Losing a fight badly: pulling out.' : 'Spotted a stronger force: falling back before contact.');
    }
    if (this.waveKind === 'raid') {
      if (now - this.waveStart > secondsToTicks(CONFIG.ai.raidSeconds)) return goHome(false, 'Raid over: back home.');
      const workersThere = enemies.filter((e): e is Unit => e.kind === 'unit' && isWorker(e.type) && dist(e, c) < 10);
      if (now - this.lastWaveOrder < secondsToTicks(2)) return;
      this.lastWaveOrder = now;
      // Laborers first: that is the point of a raid.
      if (workersThere.length) {
        const prey = workersThere.reduce((a, b) => (dist(b, c) < dist(a, c) ? b : a));
        game.issue({ type: 'attack', player: P, units: this.wave, targetId: prey.id });
        return;
      }
      const t = this.raidTarget(game);
      if (t) game.issue({ type: 'attackMove', player: P, units: this.wave, x: t.x, y: t.y });
      return;
    }
    if (this.waveKind === 'creep' && this.creepAt) {
      const at = this.creepAt;
      const arrived = waveUnits.some((u) => dist(u, at) < 5);
      const guards = enemies.some((e) => e.kind === 'unit' && game.player(e.owner).neutral && dist(e, at) < 9);
      if (arrived && !guards) {
        this.cleared.add(`${at.x},${at.y}`);
        this.campsSeen = this.campsSeen.filter((cp) => dist(cp, at) > 8);
        this.note(game, 'Cleared a neutral camp.');
        return goHome(false);
      }
      if (now - this.lastWaveOrder < secondsToTicks(4)) return;
      const idle = waveUnits.filter((u) => u.order === null || u.order.type === 'move');
      if (idle.length) game.issue({ type: 'attackMove', player: P, units: idle.map((u) => u.id), x: at.x, y: at.y });
      this.lastWaveOrder = now;
      return;
    }
    // Regroup: the wave gathers at the staging point, then marches together.
    if (this.waveGathering) {
      const s = keeps[0] ? this.staging(game, keeps[0]) : c;
      const gathered = waveUnits.filter((u) => dist(u, s) < 6).length;
      if (gathered >= waveUnits.length * CONFIG.ai.regroupShare || now - this.waveStart > secondsToTicks(CONFIG.ai.regroupSeconds)) {
        this.waveGathering = false;
      } else {
        const away = waveUnits.filter((u) => dist(u, s) >= 6 && (u.order === null || u.order.type === 'move'));
        if (away.length && now - this.lastWaveOrder >= secondsToTicks(3)) {
          this.lastWaveOrder = now;
          game.issue({ type: 'move', player: P, units: away.map((u) => u.id), x: s.x, y: s.y });
        }
        return;
      }
    }
    // Reinforce: soldiers trained since the wave left go after it in a group.
    if (this.profile.reinforce) {
      const fresh = home.filter((u) => !u.hero && u.order === null);
      if (fresh.length >= CONFIG.ai.reinforceGroup && dist(c, fresh[0]) > 10) {
        this.wave.push(...fresh.map((u) => u.id));
        game.issue({ type: 'attackMove', player: P, units: fresh.map((u) => u.id), x: c.x, y: c.y });
      }
    }
    if (now - this.lastWaveOrder < secondsToTicks(4)) return;
    const idleWave = waveUnits.filter((u) => u.orderQueue.length === 0 && (u.order === null || u.order.type === 'move'));
    if (!idleWave.length) return;
    const t = this.attackTarget(game, c);
    if (!t) return;
    this.waveTarget = t;
    // Searching blind: light up the spot first.
    if (!this.knownEnemyBuildings(game).length) this.flare(game, keeps, t);
    this.lastWaveOrder = now;
    // March around known camps rather than through them: detour waypoints
    // first (Shift-queued, as a player would), then on to the target.
    const ids = idleWave.map((u) => u.id);
    const route = [...this.detours(game, c, t), t];
    route.forEach((p, i) => game.issue({ type: 'attackMove', player: P, units: ids, x: p.x, y: p.y, queued: i > 0 }));
  }

  /**
   * Where a wave goes: the enemy building it knows of that is cheapest to
   * reach and least defended (remembered towers nearby count against it; an
   * outlying Keep counts for it). With none known, it searches: enemy start
   * locations first, then mine sites, skipping places already checked.
   */
  private attackTarget(game: Game, from: { x: number; y: number }): { x: number; y: number } | null {
    const known = this.knownEnemyBuildings(game);
    if (known.length) {
      const towersNear = (p: { x: number; y: number }) => known.filter((m) => isRole(m.type, 'tower') && dist(m, p) < 9).length;
      const starts = game.state.starts;
      const outlying = (m: { x: number; y: number; type: BuildingType }) => isRole(m.type, 'hq') && starts.every((s) => dist(s, m) > 6);
      const score = (m: (typeof known)[number]) =>
        dist(m, from) + (this.profile.readsIntel ? 12 * towersNear(m) - (outlying(m) ? CONFIG.ai.outlyingBonus : 0) : 0);
      return known.reduce((a, b) => (score(b) < score(a) ? b : a));
    }
    const waveUnits = this.wave.map((id) => game.unit(id)).filter((u): u is Unit => !!u);
    for (const u of waveUnits) for (const p of this.searchSpots(game)) if (dist(u, p) < 5) this.searched.add(`${p.x},${p.y}`);
    let spots = this.searchSpots(game).filter((p) => !this.searched.has(`${p.x},${p.y}`));
    if (!spots.length) {
      this.searched.clear();
      spots = this.searchSpots(game);
    }
    // Enemy start locations are public: head there before combing mines.
    const starts = spots.filter((p) => game.state.starts.some((st) => st.x === p.x && st.y === p.y));
    const options = starts.length ? starts : spots;
    if (!options.length) return null;
    return options.reduce((a, b) => (dist(b, from) < dist(a, from) ? b : a));
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
      if (isWorker(u.type)) continue;
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
    if (this.profile.countsDefences) {
      // Attacking into a base means its towers too, and a defender close to
      // its healing, its production and its Laborers.
      const g = CONFIG.units.guard;
      const towers = this.knownEnemyBuildings(game).filter((m) => isRole(m.type, 'tower') && m.done).length;
      theirs = (theirs + towers * CONFIG.ai.towerAsGuards * g.hp * (g.attack.damage / g.attack.cooldown)) * CONFIG.ai.defenderEdge;
    }
    return this.strength(home) >= theirs * CONFIG.ai.attackAdvantage;
  }

  private endWave(grow = true): void {
    this.wave = [];
    this.creepAt = null;
    this.waveTarget = null;
    this.waveGathering = false;
    if (grow) this.waveSize += this.profile.waveGrowth;
  }

  /**
   * Camp to clear: when it wants to expand and the mine it would take is
   * guarded, that camp first; otherwise camps it has spotted on its own half
   * (lairs included), then mines it has not checked yet.
   */
  private creepTarget(game: Game, keeps: Building[], buildings: Building[]): { x: number; y: number } | null {
    const home = keeps[0] ?? buildings[0];
    if (!home) return null;
    const mine = game.state.starts[this.player];
    const enemyStarts = game.state.starts.filter((_, p) => p !== this.player);
    const ownHalf = (p: { x: number; y: number }) => enemyStarts.every((e) => dist(p, mine) < dist(p, e));
    const open = (c: { x: number; y: number }) => !this.cleared.has(`${c.x},${c.y}`);
    if (this.wantsExpansion(game, buildings)) {
      const wanted = this.expansionMine(game, buildings, true);
      const guard = wanted && this.campsSeen.find((c) => dist(c, wanted) < 9 && open(c));
      if (guard) return { x: guard.x, y: guard.y };
    }
    const keepsKnown = [
      ...game.buildings().filter((b) => isRole(b.type, 'hq') && b.owner === this.player),
      ...game.vision.remembered(this.player).filter((m) => isRole(m.type, 'hq')),
    ];
    // Without a Keep, any camp will do: the bounty is the way back.
    const anywhere = !buildings.some((b) => isRole(b.type, 'hq'));
    const camps = this.campsSeen.filter((c) => (anywhere || ownHalf(c)) && open(c)).sort((a, b) => dist(a, home) - dist(b, home));
    if (camps[0]) return { x: camps[0].x, y: camps[0].y };
    const options = game
      .resources()
      .filter((m) => m.type === 'goldmine' && open(m))
      .filter((m) => !keepsKnown.some((k) => distToRect(m.x, m.y, k) < 12))
      .filter((m) => anywhere || ownHalf(m))
      .sort((a, b) => dist(a, home) - dist(b, home));
    return options[0] ? { x: options[0].x, y: options[0].y } : null;
  }
}

/** A computer player's saved state (see ComputerPlayer.snapshot). */
export interface AiSnapshot {
  player: number;
  difficulty: Difficulty;
  style: StyleId;
  overrides: ProfileOverrides;
  fields: Record<string, unknown>;
}

/** Rebuilt on load (profile, timing) or recomputed every think (seen). */
const NOT_SAVED = new Set(['player', 'difficulty', 'style', 'overrides', 'profile', 'thinkTicks', 'seen']);

/** Maps and Sets are not JSON: tag them on the way out... */
function encodeCollections(_key: string, v: unknown): unknown {
  if (v instanceof Map) return { $map: [...v.entries()] };
  if (v instanceof Set) return { $set: [...v.values()] };
  return v;
}

/** ...and rebuild them on the way in. */
function decodeCollections(_key: string, v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as { $map?: Array<[unknown, unknown]>; $set?: unknown[] };
    if (o.$map) return new Map(o.$map);
    if (o.$set) return new Set(o.$set);
  }
  return v;
}

function centroid(es: Entity[]): { x: number; y: number } {
  return { x: es.reduce((s, e) => s + e.x, 0) / es.length, y: es.reduce((s, e) => s + e.y, 0) / es.length };
}
