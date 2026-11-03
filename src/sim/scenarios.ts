// Challenges: fixed scenarios with their own goal, run inside the
// simulation so they stay deterministic (replays and saves work as for any
// match). A scenario sets the match up from the usual start, then each tick
// drives what it spawns and decides the outcome itself (the usual "last one
// with buildings wins" rule is off). The rival seat stays empty: player 1
// stands for the challenge, and wins if you fail.
//
// Scenario orders to neutral units are set directly, never issued as
// commands: a replay re-runs the scenario, so recorded commands would happen
// twice.

import { CONFIG, secondsToTicks, type UnitType } from './config';
import { applyQueued } from './commands';
import { checkPlacement } from './construction';
import { dist } from './dmath';
import { FACTION, isHall } from './factions';
import type { Game } from './game';
import { initHero } from './hero';
import type { MatchRules } from './rules';
import type { BuildingType } from './config';
import type { FactionId } from './factions';

export type ScenarioId = 'holdTheLine' | 'goldRush' | 'heroTrial';
export type Medal = 'gold' | 'silver' | 'bronze';

export interface ScenarioState {
  id: ScenarioId;
  /** Waves sent so far (Hold the Line). */
  wave: number;
  /** Tick of the next scripted event. */
  next: number;
  /** Units the scenario spawned and still drives. */
  spawned: number[];
}

export interface ScenarioDef {
  id: ScenarioId;
  name: string;
  blurb: string;
  /** One line for the objectives panel. */
  goal: string;
  mapId: string;
  /** Every player faces the same map: the seed is part of the challenge. */
  seed: number;
  rules: Partial<MatchRules>;
  /** How medals are earned, for the challenge list. */
  medals: string;
  /** Lose when this many ticks have passed (null = no limit). */
  limitTicks: number | null;
}

const T = (min: number, sec = 0) => secondsToTicks(min * 60 + sec);

export const HOLD_WAVES = 10;

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  holdTheLine: {
    id: 'holdTheLine',
    name: 'Hold the Line',
    blurb: 'Brigands come for your base in ten waves, each larger than the last. Build up between them, and keep your main hall standing.',
    goal: `Survive ${HOLD_WAVES} waves of brigands. Lose your last main hall and it is over.`,
    mapId: 'vales',
    seed: 1101,
    rules: { camps: false, startGold: 1000, startWood: 500, startWorkers: 10 },
    medals: 'Gold: lose at most 8 units · Silver: at most 20 · Bronze: survive',
    limitTicks: null,
  },
  goldRush: {
    id: 'goldRush',
    name: 'Gold Rush',
    blurb: 'No enemies, no distractions: an economy race against the clock. Workers, mines and expansions are everything.',
    goal: 'Gather 5000 gold before 15:00.',
    mapId: 'river',
    seed: 1102,
    rules: { camps: false },
    medals: 'Gold: under 6:30 · Silver: under 7:30 · Bronze: under 15:00',
    limitTicks: T(15),
  },
  heroTrial: {
    id: 'heroTrial',
    name: 'Hero Trial',
    blurb: 'A hero, a small warband and no base to fall back on. Clear every camp on the map: pick your fights, level up, use what the camps drop.',
    goal: 'Clear every neutral camp before 20:00 without losing your hero.',
    mapId: 'vales',
    seed: 1103,
    rules: { startGold: 250, startWood: 0 },
    medals: 'Gold: under 8:00 · Silver: under 12:00 · Bronze: under 20:00',
    limitTicks: T(20),
  },
};

export const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[];

export function isScenario(id: unknown): id is ScenarioId {
  return typeof id === 'string' && id in SCENARIOS;
}

// ---- setup -------------------------------------------------------------------------

/** Turn a freshly created match into the scenario (player 0 plays; player 1 is emptied). */
export function setupScenario(game: Game, id: ScenarioId): void {
  const s = game.state;
  s.victoryRules = false;
  s.scenario = { id, wave: 0, next: 0, spawned: [] };
  game.player(1).name = SCENARIOS[id].name;
  for (const e of [...game.units(), ...game.buildings()]) if (e.owner === 1) game.removeEntity(e.id);
  const f = FACTION[game.player(0).faction];
  const hq = game.buildings().find((b) => b.owner === 0 && isHall(b.type))!;
  if (id === 'holdTheLine') {
    // A head start: a Barracks, a Farm and a few soldiers.
    for (const t of [f.buildings.barracks, f.buildings.farm, f.buildings.farm]) placeNear(game, t, hq);
    game.spawnUnitsNear(f.units.melee, 0, hq, 4);
    game.spawnUnitsNear(f.units.ranged, 0, hq, 2);
    s.scenario.next = T(2);
  } else if (id === 'heroTrial') {
    // No economy: the workers go home, the hero and a warband arrive.
    for (const u of game.units()) if (u.owner === 0) game.removeEntity(u.id);
    const hero = game.spawnUnitsNear(f.heroes[0], 0, hq, 1)[0];
    if (hero) initHero(game, hero, 1, 0, []);
    game.spawnUnitsNear(f.units.melee, 0, hq, 3);
    game.spawnUnitsNear(f.units.ranged, 0, hq, 2);
  }
}

/** The free spot nearest a building where `type` fits, and the building placed there (finished). */
function placeNear(game: Game, type: BuildingType, near: { x: number; y: number }): void {
  const size = CONFIG.buildings[type].size;
  for (let ring = 3; ring < 14; ring++)
    for (let dy = -ring; dy <= ring; dy++)
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const tx = Math.floor(near.x) + dx - Math.floor(size / 2);
        const ty = Math.floor(near.y) + dy - Math.floor(size / 2);
        // Leave a tile free all round, so nothing gets walled in.
        if (!checkPlacement(game, type, tx - 1, ty - 1).ok || !roomAround(game, tx, ty, size)) continue;
        game.addBuilding(type, 0, tx, ty);
        return;
      }
}

function roomAround(game: Game, tx: number, ty: number, size: number): boolean {
  for (let y = ty - 1; y <= ty + size; y++) for (let x = tx - 1; x <= tx + size; x++) if (!game.nav.passable(x, y)) return false;
  return true;
}

// ---- running ----------------------------------------------------------------------------

/** One wave of brigands: bigger each time, with tougher guards from the middle waves on. */
export function waveUnits(n: number): UnitType[] {
  const out: UnitType[] = [];
  const count = 4 + 2 * n;
  for (let i = 0; i < count; i++) out.push(i % 3 === 2 ? 'poacher' : i % 4 === 3 ? 'wolf' : 'brigand');
  if (n >= 2) out.push('chief');
  if (n >= 4) out.push('brute');
  if (n >= 6) out.push('chief', 'brute');
  if (n >= 8) out.push('brute');
  if (n === HOLD_WAVES) out.push('brute', 'brute', 'chief');
  return out;
}

export function scenarioOver(game: Game, won: boolean): void {
  if (game.state.outcome) return;
  const winner = won ? 0 : 1;
  if (!won) game.player(0).defeated = true;
  else game.player(1).defeated = true;
  game.emit({ type: 'playerDefeated', player: won ? 1 : 0, reason: 'eliminated' });
  game.state.outcome = { winner, tick: game.state.tick };
  game.emit({ type: 'matchOver', winner });
}

/** Every tick: the scenario's script and its win and loss checks. */
export function updateScenario(game: Game): void {
  const sc = game.state.scenario;
  if (!sc || game.state.outcome) return;
  const def = SCENARIOS[sc.id];
  const tick = game.state.tick;
  const halls = game.buildings().filter((b) => b.owner === 0 && isHall(b.type));
  if (sc.id !== 'heroTrial' && !halls.length) return scenarioOver(game, false);
  if (def.limitTicks !== null && tick >= def.limitTicks) return scenarioOver(game, false);

  if (sc.id === 'holdTheLine') {
    sc.spawned = sc.spawned.filter((id) => game.unit(id));
    if (sc.wave < HOLD_WAVES && tick >= sc.next) {
      sc.wave++;
      sc.next = tick + T(1, 30);
      const neutral = game.state.players.find((p) => p.neutral)!.id;
      const from = game.state.starts[1];
      for (const type of waveUnits(sc.wave)) {
        const [spot] = game.freeTilesAround({ tx: Math.floor(from.x) - 2, ty: Math.floor(from.y) - 2, w: 4, h: 4 }, 1);
        if (!spot) continue;
        const u = game.addUnit(type, neutral, spot.x + 0.5, spot.y + 0.5);
        sc.spawned.push(u.id);
      }
      game.emit({ type: 'waveIncoming', wave: sc.wave, of: HOLD_WAVES });
    }
    // Every second, raiders with nothing to do head for the nearest building of yours.
    if (tick % 20 === 0) {
      for (const id of sc.spawned) {
        const u = game.unit(id)!;
        if (u.order && u.order.type !== 'move') continue;
        const target = game.buildings().filter((b) => b.owner === 0).sort((a, b) => dist(a, u) - dist(b, u))[0];
        if (target) applyQueued(game, u, { type: 'attackMove', x: target.x, y: target.y });
      }
    }
    if (sc.wave >= HOLD_WAVES && sc.spawned.length === 0) scenarioOver(game, true);
  } else if (sc.id === 'goldRush') {
    if (game.player(0).goldGathered >= 5000) scenarioOver(game, true);
  } else if (sc.id === 'heroTrial') {
    const hero = game.state.players[0].heroes[0];
    if (!hero || !hero.alive) return scenarioOver(game, false);
    if (game.state.camps.length > 0 && game.state.camps.every((c) => c.cleared)) scenarioOver(game, true);
  }
}

/** How the player is doing, for the objectives panel. */
export function scenarioProgress(game: Game): string {
  const sc = game.state.scenario;
  if (!sc) return '';
  const t = game.state.tick;
  if (sc.id === 'holdTheLine') {
    if (sc.wave >= HOLD_WAVES) return `Last wave: ${sc.spawned.length} raiders left · units lost ${game.player(0).stats.unitsLost}`;
    const s = Math.max(0, Math.ceil((sc.next - t) / 20));
    return `Wave ${sc.wave} of ${HOLD_WAVES} · next in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · ${sc.spawned.length} raiders on the field · units lost ${game.player(0).stats.unitsLost}`;
  }
  if (sc.id === 'goldRush') return `Gold gathered ${game.player(0).goldGathered} / 5000`;
  const left = game.state.camps.filter((c) => !c.cleared).length;
  return `Camps left ${left} of ${game.state.camps.length}`;
}

/** The medal a won challenge earns. */
export function scenarioMedal(game: Game): Medal | null {
  const sc = game.state.scenario;
  const o = game.state.outcome;
  if (!sc || !o || o.winner !== 0) return null;
  if (sc.id === 'holdTheLine') return game.player(0).stats.unitsLost <= 8 ? 'gold' : game.player(0).stats.unitsLost <= 20 ? 'silver' : 'bronze';
  const t = o.tick;
  if (sc.id === 'goldRush') return t < T(6, 30) ? 'gold' : t < T(7, 30) ? 'silver' : 'bronze';
  return t < T(8) ? 'gold' : t < T(12) ? 'silver' : 'bronze';
}

export type { FactionId };
