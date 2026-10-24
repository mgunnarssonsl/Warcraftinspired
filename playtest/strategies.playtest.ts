// Balance playtest (not part of `npm test`; run with `npm run playtest`).
// Computer players with different openings play a round robin on several
// maps from both seats, and the table shows who wins and how long games last.
// The point is to spot an opening or unit mix that consistently dominates.

import { it } from 'vitest';
import { ComputerPlayer, type ProfileOverrides } from '../src/ai/computer';
import { Game } from '../src/sim/game';

const STRATEGIES: Record<string, ProfileOverrides> = {
  standard: {},
  rush: { workerTarget: 10, barracksAtWorkers: 6, extraBarracksAtWorkers: 7, maxBarracks: 2, firstAttackSeconds: 200, waveSize: 5, waveGrowth: 2, expandSeconds: 99999, upgrades: false, castleSeconds: null, creeps: false, towers: 0, assessStrength: false },
  eco: { workerTarget: 16, expandSeconds: 240, firstAttackSeconds: 600, waveSize: 10, towers: 0 },
  turtle: { towers: 4, firstAttackSeconds: 720, waveSize: 12 },
  mass: { towers: 0, upgrades: false, castleSeconds: null, creeps: false, extraBarracksAtWorkers: 9 },
  archers: { archerShare: 0.9 },
  guards: { archerShare: 0 },
};
const SEEDS = [3, 4];
const MAX_MINUTES = 30;

it('strategy round robin', () => {
  const names = Object.keys(STRATEGIES);
  const tally = Object.fromEntries(names.map((n) => [n, { won: 0, lost: 0, none: 0, minutes: 0, games: 0 }]));
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++)
      for (const seed of SEEDS)
        for (const [a, b] of [[names[i], names[j]], [names[j], names[i]]]) {
          const g = Game.create(seed);
          const ais = [new ComputerPlayer(0, 'hard', STRATEGIES[a]), new ComputerPlayer(1, 'hard', STRATEGIES[b])];
          for (let t = 0; t < 20 * 60 * MAX_MINUTES && !g.state.outcome; t++) {
            g.step();
            for (const ai of ais) ai.update(g);
          }
          const o = g.state.outcome;
          const minutes = (o ? o.tick : g.state.tick) / 1200;
          const winner = o?.winner === 0 ? a : o?.winner === 1 ? b : null;
          for (const n of [a, b]) {
            tally[n].games++;
            tally[n].minutes += minutes;
            if (!winner) tally[n].none++;
            else if (n === winner) tally[n].won++;
            else tally[n].lost++;
          }
          console.log(`seed ${seed}: ${a} vs ${b} -> ${winner ?? 'no result'} at ${minutes.toFixed(1)} min`);
        }
  console.table(
    Object.fromEntries(names.map((n) => [n, { won: tally[n].won, lost: tally[n].lost, 'no result': tally[n].none, 'avg minutes': +(tally[n].minutes / tally[n].games).toFixed(1) }])),
  );
}, 4 * 3600_000);
