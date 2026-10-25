// Difficulty ladder (not part of `npm test`; run with
// `npm run playtest -- playtest/ladder.playtest.ts`). For every style, the
// stronger difficulty should beat the weaker one playing the same style,
// from both seats and on every map: difficulty is decision quality, and it
// should show whatever the plan.

import { afterAll, describe, it } from 'vitest';
import { ComputerPlayer, type Difficulty } from '../src/ai/computer';
import { STYLES, type StyleId } from '../src/ai/profile';
import { Game } from '../src/sim/game';
import { MAPS } from '../src/sim/maps';

declare const process: { env: Record<string, string | undefined> };

const PAIRS: Array<[Difficulty, Difficulty]> = [
  ['hard', 'normal'],
  ['normal', 'easy'],
];
const SEEDS = [3, 4];
const MAX_MINUTES = 30;
const styles = (process.env.STYLES?.split(',') ?? STYLES) as StyleId[];
const maps = process.env.MAPS?.split(',') ?? MAPS.map((m) => m.id);
const tally = new Map<string, { stronger: number; weaker: number; none: number }>();

describe('difficulty ladder', () => {
  for (const style of styles)
    for (const [hi, lo] of PAIRS)
      for (const mapId of maps)
        for (const seed of SEEDS)
          for (const hiSeat of [0, 1]) {
            it(`${style} ${hi} vs ${lo}, ${mapId} seed ${seed}, ${hi} in seat ${hiSeat + 1}`, async () => {
              await new Promise((r) => setTimeout(r, 0));
              const g = Game.create(seed, mapId);
              const ais = [0, 1].map((p) => new ComputerPlayer(p, p === hiSeat ? hi : lo, style));
              for (let t = 0; t < 20 * 60 * MAX_MINUTES && !g.state.outcome; t++) {
                g.step();
                for (const ai of ais) ai.update(g);
              }
              const key = `${style}: ${hi} vs ${lo}`;
              const row = tally.get(key) ?? { stronger: 0, weaker: 0, none: 0 };
              const w = g.state.outcome?.winner;
              if (w === hiSeat) row.stronger++;
              else if (w === 1 - hiSeat) row.weaker++;
              else row.none++;
              tally.set(key, row);
              console.log(`${key} ${mapId} s${seed} -> ${w === undefined || w === null ? 'no result' : w === hiSeat ? hi : lo}`);
            });
          }
  afterAll(() => console.table(Object.fromEntries(tally)));
});
