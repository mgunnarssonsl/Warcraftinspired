import { describe, expect, it } from 'vitest';
import { ComputerPlayer } from '../src/ai/computer';
import { findSite } from '../src/ai/placement';
import { createClientState } from '../src/input/client';
import { Game } from '../src/sim/game';
import { TUTORIAL, TUTORIAL_STEPS, TutorialTracker, type TutorialView } from '../src/ui/tutorial';

describe('tutorial', () => {
  it('a player doing each step as told goes through the whole tutorial, in order', () => {
    const game = Game.create(TUTORIAL.seed, TUTORIAL.mapId);
    const ai = new ComputerPlayer(1, TUTORIAL.difficulty, 'balanced', TUTORIAL.overrides);
    const client = createClientState(0);
    const v: TutorialView = { game, client, camera: { x: 14, y: 58 } };
    const tracker = new TutorialTracker();
    const run = (seconds: number, until?: () => boolean) => {
      for (let t = 0; t < seconds * 20 && !until?.(); t++) {
        game.step();
        ai.update(game);
        tracker.update(v);
      }
    };
    const own = () => game.units().filter((u) => u.owner === 0);
    const workers = () => own().filter((u) => u.type === 'worker');
    const keep = game.buildings().find((b) => b.owner === 0 && b.type === 'hq')!;
    const homeMine = game.resources().filter((r) => r.type === 'goldmine').sort((a, b) => Math.hypot(a.x - keep.x, a.y - keep.y) - Math.hypot(b.x - keep.x, b.y - keep.y))[0];
    const expect_step = (n: number) => {
      tracker.update(v);
      expect(TUTORIAL_STEPS[tracker.step - 1]?.title, `after step ${n}`).toBe(TUTORIAL_STEPS[n - 1].title);
    };

    // 1. Move the camera.
    tracker.update(v);
    v.camera = { x: 24, y: 52 };
    expect_step(1);
    // 2. Box-select the Laborers.
    client.selected = workers().map((u) => u.id);
    expect_step(2);
    // 3. Right-click the mine.
    game.issue({ type: 'gather', player: 0, units: workers().slice(0, 4).map((u) => u.id), nodeId: homeMine.id });
    run(1);
    expect_step(3);
    // 4. One Laborer to a tree.
    const tree = game.resources().filter((r) => r.type === 'tree').sort((a, b) => Math.hypot(a.x - keep.x, a.y - keep.y) - Math.hypot(b.x - keep.x, b.y - keep.y))[0];
    game.issue({ type: 'gather', player: 0, units: [workers()[4].id], nodeId: tree.id });
    run(1);
    expect_step(4);
    // 5. Train a Laborer at the Keep.
    game.issue({ type: 'train', player: 0, buildingId: keep.id, unit: 'worker' });
    run(40, () => tracker.step >= 5);
    expect_step(5);
    // 6. and 7. A Farm, then a Barracks.
    for (const [n, type] of [[6, 'farm'], [7, 'barracks']] as const) {
      const site = findSite(game, 0, type, keep.x + 6, keep.y - 6)!;
      run(30, () => game.player(0).gold >= 200 && game.player(0).wood >= 60);
      game.issue({ type: 'build', player: 0, units: [workers()[n - 6].id], buildingType: type, tx: site.tx, ty: site.ty });
      run(60, () => tracker.step >= n);
      expect_step(n);
    }
    // 8. Three Guards, once the Barracks stands.
    run(120, () => game.buildings().some((b) => b.owner === 0 && b.type === 'barracks' && b.progress >= 1));
    const rax = game.buildings().find((b) => b.owner === 0 && b.type === 'barracks')!;
    for (let i = 0; i < 3; i++) {
      run(30, () => game.player(0).gold >= 135);
      game.issue({ type: 'train', player: 0, buildingId: rax.id, unit: 'guard' });
    }
    run(150, () => tracker.step >= 8);
    expect_step(8);
    // 9. Ctrl+1, then 1.
    const guards = own().filter((u) => u.type === 'guard').map((u) => u.id);
    client.groups[1] = guards;
    tracker.update(v);
    expect(tracker.step).toBe(8); // saved but not recalled yet
    client.selected = [...guards];
    expect_step(9);
    // 10. A + click.
    game.issue({ type: 'attackMove', player: 0, units: guards, x: keep.x + 10, y: keep.y });
    run(1);
    expect_step(10);
    // 11. Attack-move onto the level 1 camp.
    const camp = game.state.camps.filter((c) => c.level === 1).sort((a, b) => Math.hypot(a.x - keep.x, a.y - keep.y) - Math.hypot(b.x - keep.x, b.y - keep.y))[0];
    game.issue({ type: 'attackMove', player: 0, units: guards, x: camp.x, y: camp.y });
    run(120, () => tracker.finished);
    expect(tracker.finished).toBe(true);
    // The tutorial computer never attacked.
    expect(game.player(0).stats.buildingsLost).toBe(0);
    expect(ai.journal.some((j) => j.text.startsWith('Attacking'))).toBe(false);
  }, 60_000);

  it('a step can be skipped', () => {
    const t = new TutorialTracker();
    t.skip();
    expect(t.step).toBe(1);
  });
});
