// Balance playtest (not part of `npm test`; run with `npm run playtest`).
// Computer players with different openings play a round robin on several
// maps from both seats, and the table shows who wins and how long games last.
// The point is to spot an opening or unit mix that consistently dominates.

import { afterAll, describe, it } from 'vitest';

declare const process: { env: Record<string, string | undefined> };
import { ComputerPlayer, type Difficulty, type ProfileOverrides, type StyleId } from '../src/ai/computer';
import { Game } from '../src/sim/game';
import { MAPS } from '../src/sim/maps';

// Each strategy is a style (src/sim/config.ts, CONFIG.ai.styles) plus
// optional overrides for experiments.
const STRATEGIES: Record<string, { style: StyleId; o?: ProfileOverrides }> = {
  balanced: { style: 'balanced' },
  raider: { style: 'raider' },
  expander: { style: 'expander' },
  warden: { style: 'warden' },
  warlord: { style: 'warlord' },
  // Experiments
  rush: { style: 'balanced', o: { workerTarget: 10, barracksAtWorkers: 6, extraBarracksAtWorkers: 7, maxBarracks: 2, firstAttackSeconds: 200, waveSize: 5, waveGrowth: 2, expandSeconds: 99999, upgrades: false, castleSeconds: null, creeps: false, towers: 0, assessStrength: false } },
  nohero: { style: 'balanced', o: { heroes: [], creeps: false, shops: false } },
  nocreep: { style: 'balanced', o: { creeps: false, shops: false } },
};
const SEEDS = [3, 4, 5, 6];
// Difficulty of both sides, or two ("hard,easy") for a ladder check.
const LEVELS = (process.env.LEVELS ?? 'hard').split(',') as Difficulty[];
const MAP_IDS = process.env.MAPS?.split(',') ?? MAPS.map((m) => m.id);
const MAX_MINUTES = 30;

const names = (process.env.STRATEGIES?.split(',') ?? ['balanced', 'raider', 'expander', 'warden', 'warlord']).filter((n) => n in STRATEGIES);
const tally = Object.fromEntries(names.map((n) => [n, { won: 0, lost: 0, none: 0, minutes: 0, games: 0 }]));
const seats = { first: 0, second: 0 };
const perMap = Object.fromEntries(MAP_IDS.map((m) => [m, Object.fromEntries(names.map((n) => [n, 0]))]));

describe('strategy round robin', () => {
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++)
      for (const mapId of MAP_IDS)
        for (const seed of SEEDS)
          for (const [a, b] of [[names[i], names[j]], [names[j], names[i]]]) {
            it(`${mapId} seed ${seed}: ${a} vs ${b}`, async () => {
              await new Promise((r) => setTimeout(r, 0)); // let the test runner breathe between long games
              const g = Game.create(seed, mapId);
              const [la, lb] = [LEVELS[0], LEVELS[1] ?? LEVELS[0]];
              const ais = [new ComputerPlayer(0, a === names[i] ? la : lb, STRATEGIES[a].style, STRATEGIES[a].o), new ComputerPlayer(1, b === names[i] ? la : lb, STRATEGIES[b].style, STRATEGIES[b].o)];
              for (let t = 0; t < 20 * 60 * MAX_MINUTES && !g.state.outcome; t++) {
                g.step();
                for (const ai of ais) ai.update(g);
              }
              const o = g.state.outcome;
              const minutes = (o ? o.tick : g.state.tick) / 1200;
              const winner = o?.winner === 0 ? a : o?.winner === 1 ? b : null;
              if (o?.winner === 0) seats.first++;
              if (o?.winner === 1) seats.second++;
              if (winner) perMap[mapId][winner]++;
              for (const n of [a, b]) {
                tally[n].games++;
                tally[n].minutes += minutes;
                if (!winner) tally[n].none++;
                else if (n === winner) tally[n].won++;
                else tally[n].lost++;
              }
              console.log(`${mapId} seed ${seed}: ${a} vs ${b} -> ${winner ?? 'no result'} at ${minutes.toFixed(1)} min`);
            });
          }

  afterAll(() => {
    console.table(
      Object.fromEntries(names.map((n) => [n, { won: tally[n].won, lost: tally[n].lost, 'no result': tally[n].none, 'avg minutes': +(tally[n].minutes / tally[n].games).toFixed(1) }])),
    );
    console.log('Wins per map:');
    console.table(perMap);
    // Both seat orders are played for every pairing, so a fair game splits these evenly.
    console.log(`Seat check: player 1 won ${seats.first}, player 2 won ${seats.second}`);
  });
});
