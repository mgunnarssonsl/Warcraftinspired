import { describe, expect, it } from 'vitest';
import { kill } from '../src/sim/combat';
import { Game } from '../src/sim/game';
import { ObjectiveTracker, STEPS } from '../src/ui/objectives';
import { run, runUntil } from './helpers';

function setup() {
  const g = Game.create(13);
  g.player(0).gold = 5000;
  g.player(0).wood = 5000;
  const keep = g.buildings().find((b) => b.owner === 0)!;
  const ws = g.units().filter((u) => u.owner === 0);
  const mine = g.resources().filter((r) => r.type === 'goldmine').sort((a, b) => Math.hypot(a.x - keep.x, a.y - keep.y) - Math.hypot(b.x - keep.x, b.y - keep.y))[0];
  const tree = g.resources().filter((r) => r.type === 'tree').sort((a, b) => Math.hypot(a.x - keep.x, a.y - keep.y) - Math.hypot(b.x - keep.x, b.y - keep.y))[0];
  return { g, keep, ws, mine, tree };
}
const idx = (text: string) => STEPS.findIndex((s) => s.text.includes(text));

describe('objectives checklist', () => {
  it('registers gold and wood as soon as Laborers are sent, even just one', () => {
    const { g, ws, mine, tree } = setup();
    const t = new ObjectiveTracker();
    g.issue({ type: 'gather', player: 0, units: [ws[0].id], nodeId: mine.id });
    g.issue({ type: 'gather', player: 0, units: [ws[1].id], nodeId: tree.id });
    g.step();
    t.check(g, 0);
    expect(t.achieved.has(idx('wood'))).toBe(true);
    expect(STEPS[idx('gold')].status(g, 0).progress).toBe('1/3');
    // One miner is enough once gold actually arrives.
    runUntil(g, () => (t.check(g, 0), t.achieved.has(idx('gold'))), 20 * 60);
  });

  it('counts soldiers trained cumulatively, so losses do not undo progress', () => {
    const { g, keep } = setup();
    const t = new ObjectiveTracker();
    const rax = g.addBuilding('barracks', 0, keep.tx - 6, keep.ty - 7);
    for (let i = 0; i < 4; i++) g.issue({ type: 'train', player: 0, buildingId: rax.id, unit: 'guard' });
    g.addBuilding('farm', 0, keep.tx + 6, keep.ty - 4);
    g.addBuilding('farm', 0, keep.tx + 9, keep.ty - 4);
    runUntil(g, () => g.units().filter((u) => u.type === 'guard' && u.owner === 0).length === 2, 20 * 60);
    for (const u of g.units().filter((u) => u.type === 'guard' && u.owner === 0)) kill(g, u, 1);
    runUntil(g, () => (t.check(g, 0), t.achieved.has(idx('soldiers'))), 20 * 60);
    expect(g.units().filter((u) => u.type === 'guard' && u.owner === 0).length).toBe(2);
  });

  it('shows construction progress and completes when the building is finished', () => {
    const { g, keep, ws } = setup();
    const t = new ObjectiveTracker();
    g.issue({ type: 'build', player: 0, units: [ws[2].id], buildingType: 'farm', tx: keep.tx + 6, ty: keep.ty - 4 });
    g.step();
    expect(STEPS[idx('Farm')].status(g, 0).progress).toBe('Laborer on the way');
    runUntil(g, () => g.buildings().some((b) => b.type === 'farm'), 20 * 20);
    run(g, 20 * 5);
    expect(STEPS[idx('Farm')].status(g, 0).progress).toMatch(/^building \d+%$/);
    runUntil(g, () => (t.check(g, 0), t.achieved.has(idx('Farm'))), 20 * 40);
  });

  it('trained Laborers count toward "3 more" regardless of how many are alive', () => {
    const { g, keep } = setup();
    const t = new ObjectiveTracker();
    for (let i = 0; i < 3; i++) g.issue({ type: 'train', player: 0, buildingId: keep.id, unit: 'worker' });
    runUntil(g, () => (t.check(g, 0), t.achieved.has(idx('more Laborers'))), 20 * 60);
  });

  it('the hero and victory steps', () => {
    const { g, keep } = setup();
    const t = new ObjectiveTracker();
    const hall = g.addBuilding('altar', 0, keep.tx - 6, keep.ty - 7);
    g.issue({ type: 'train', player: 0, buildingId: hall.id, unit: 'hero' });
    runUntil(g, () => (t.check(g, 0), t.achieved.has(idx('hero'))), 20 * 40);
    for (const b of g.buildings().filter((b) => b.owner === 1)) kill(g, b, 0);
    g.step();
    t.check(g, 0);
    expect(t.achieved.has(idx('enemy base'))).toBe(true);
  });
});
