// Elite units in real AI matches (not part of `npm test`; run with
// `npm run playtest -- playtest/elite.playtest.ts`). Counts, per faction,
// the elite units trained, specializations, mounts and skill uses, and who
// won: the computer should use every new mechanic, and neither faction
// should run away with it.

import { afterAll, describe, it } from 'vitest';
import { ComputerPlayer, type Difficulty } from '../src/ai/computer';
import type { FactionId } from '../src/sim/factions';
import { Game } from '../src/sim/game';
import type { GameEvent } from '../src/sim/types';

declare const process: { env: Record<string, string | undefined> };

const SEEDS = (process.env.SEEDS ?? '3,4').split(',').map(Number);
const MAX_MINUTES = Number(process.env.MINUTES ?? 30);
const level = (process.env.LEVEL ?? 'hard') as Difficulty;
const maps = process.env.MAPS?.split(',') ?? ['vales'];
const total: Record<string, Record<string, number>> = { crown: {}, wild: {} };

describe('elite units in AI matches', () => {
  for (const mapId of maps)
    for (const seed of SEEDS)
      for (const wildSeat of [0, 1]) {
        it(`${mapId} seed ${seed}, Thornwild in seat ${wildSeat + 1}`, async () => {
          await new Promise((r) => setTimeout(r, 0));
          const factions: FactionId[] = wildSeat === 0 ? ['wild', 'crown'] : ['crown', 'wild'];
          const g = Game.create(seed, mapId, factions);
          const ais = [0, 1].map((p) => new ComputerPlayer(p, level, 'balanced'));
          const count = (f: FactionId, k: string, n = 1) => (total[f][k] = (total[f][k] ?? 0) + n);
          for (let t = 0; t < 20 * 60 * MAX_MINUTES && !g.state.outcome; t++) {
            g.step();
            for (const ai of ais) ai.update(g);
            for (const e of g.drainEvents() as GameEvent[]) {
              const p = 'player' in e ? (e as { player: number }).player : -1;
              const f = factions[p];
              if (!f) continue;
              if (e.type === 'unitTrained') {
                const u = g.unit(e.id);
                if (u && ['musketeer', 'shifter', 'warbear', 'naturewolf'].includes(u.type)) count(f, `trained ${u.type}`);
              } else if (e.type === 'specialized') count(f, `became ${e.into}`);
              else if (e.type === 'mounted') count(f, 'mounted');
              else if (e.type === 'rankUp') count(f, e.rank === 1 ? 'veterans' : 'eligible');
              else if (e.type === 'skill' && e.phase !== 'cancel' && (e.phase === 'fire' || e.skill === 'shift')) count(f, `skill ${e.skill} ${e.phase}`);
            }
          }
          const w = g.state.outcome?.winner;
          const winner = w === undefined || w === null ? 'none' : factions[w];
          count(winner === 'none' ? 'crown' : winner, winner === 'none' ? 'draws' : 'wins');
          console.log(`${mapId} s${seed} wild@${wildSeat + 1} -> ${winner} at ${(g.state.tick / 1200).toFixed(1)} min`);
        });
      }
  afterAll(() => console.table(total));
});
