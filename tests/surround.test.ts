import { describe, expect, it } from 'vitest';
import { gap } from '../src/sim/combat';
import { CONFIG } from '../src/sim/config';
import { emptyGame, run } from './helpers';

describe('melee surround', () => {
  it('a group of melee units spreads around one target instead of queueing behind each other', () => {
    const g = emptyGame(30, 20);
    const t = g.addUnit('guard', 1, 15.5, 10.5);
    t.hp = t.maxHp = 1e6;
    g.issue({ type: 'hold', player: 1, units: [t.id] });
    const ids = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => g.addUnit("guard", 0, 10.5 - (i % 2) * 0.8, 10 + Math.floor(i / 2) * 0.8).id);
    g.issue({ type: 'attack', player: 0, units: ids, targetId: t.id });
    run(g, 20 * 8);
    const engaged = ids.filter((id) => gap(g.unit(id)!, t) <= CONFIG.units.guard.attack.range + 0.01).length;
    expect(engaged).toBeGreaterThanOrEqual(7);
  });
});
