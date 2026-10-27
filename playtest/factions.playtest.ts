// Faction balance (not part of `npm test`; run with
// `npm run playtest -- playtest/factions.playtest.ts`). Crown against
// Thornwild at the same difficulty and style, from both seats and on every
// map: neither faction should win much more than half.

import { afterAll, describe, it } from 'vitest';
import { ComputerPlayer, type Difficulty } from '../src/ai/computer';
import type { StyleId } from '../src/ai/profile';
import type { FactionId } from '../src/sim/factions';
import { Game } from '../src/sim/game';
import { MAPS } from '../src/sim/maps';

declare const process: { env: Record<string, string | undefined> };

const SEEDS = (process.env.SEEDS ?? '3,4,5').split(',').map(Number);
const MAX_MINUTES = 30;
const levels = (process.env.LEVELS?.split(',') ?? ['normal', 'hard']) as Difficulty[];
const styles = (process.env.STYLES?.split(',') ?? ['balanced']) as StyleId[];
const maps = process.env.MAPS?.split(',') ?? MAPS.map((m) => m.id);
const tally = new Map<string, { crown: number; wild: number; none: number; minutes: number }>();

describe('faction balance', () => {
  for (const level of levels)
    for (const style of styles)
      for (const mapId of maps)
        for (const seed of SEEDS)
          for (const wildSeat of [0, 1]) {
            it(`${level} ${style}, ${mapId} seed ${seed}, Thornwild in seat ${wildSeat + 1}`, async () => {
              await new Promise((r) => setTimeout(r, 0));
              const factions: FactionId[] = wildSeat === 0 ? ['wild', 'crown'] : ['crown', 'wild'];
              const g = Game.create(seed, mapId, factions);
              const ais = [0, 1].map((p) => new ComputerPlayer(p, level, style));
              for (let t = 0; t < 20 * 60 * MAX_MINUTES && !g.state.outcome; t++) {
                g.step();
                for (const ai of ais) ai.update(g);
              }
              const key = `${level} ${style}`;
              const row = tally.get(key) ?? { crown: 0, wild: 0, none: 0, minutes: 0 };
              const w = g.state.outcome?.winner;
              const winner = w === undefined || w === null ? 'none' : factions[w];
              row[winner]++;
              row.minutes += g.state.tick / 1200;
              tally.set(key, row);
              console.log(`${key} ${mapId} s${seed} wild@${wildSeat + 1} -> ${winner} at ${(g.state.tick / 1200).toFixed(1)} min`);
            });
          }
  afterAll(() => console.table(Object.fromEntries([...tally].map(([k, r]) => [k, { ...r, minutes: +(r.minutes / (r.crown + r.wild + r.none)).toFixed(1) }]))));
});
