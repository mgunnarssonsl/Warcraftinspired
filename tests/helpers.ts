import { Game } from '../src/sim/game';
import { TERRAIN, type GameState } from '../src/sim/types';

/** An open grass field with no entities, for focused rule tests. */
export function emptyGame(width = 32, height = 24): Game {
  const state: GameState = {
    seed: 1,
    tick: 0,
    nextId: 1,
    rng: 1,
    navVersion: 0,
    map: { width, height, terrain: new Array(width * height).fill(TERRAIN.grass) },
    players: [0, 1].map((id) => ({
      id,
      name: `P${id}`,
      color: '#fff',
      gold: 0,
      wood: 0,
      goldGathered: 0,
      woodGathered: 0,
      neutral: false,
    })),
    entities: {},
    projectiles: [],
  };
  return new Game(state);
}

export function run(game: Game, ticks: number): void {
  for (let i = 0; i < ticks; i++) game.step();
}

/** Step (at least once) until predicate holds; returns ticks taken or throws. */
export function runUntil(game: Game, pred: () => boolean, maxTicks: number): number {
  for (let i = 1; i <= maxTicks; i++) {
    game.step();
    if (pred()) return i;
  }
  throw new Error(`condition not met within ${maxTicks} ticks`);
}

export function setRock(game: Game, x: number, y: number): void {
  game.state.map.terrain[y * game.state.map.width + x] = TERRAIN.rock;
}

/** Rebuild derived nav after editing terrain directly. */
export function rebuild(game: Game): Game {
  return new Game(game.state);
}
