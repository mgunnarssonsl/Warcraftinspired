import { describe, expect, it } from 'vitest';
import { ComputerPlayer } from '../src/ai/computer';
import { CONFIG } from '../src/sim/config';
import { Game } from '../src/sim/game';
import { makeSave, parseSave, SAVE_FORMAT, SAVE_VERSION, SaveStore, type SaveFile } from '../src/save/save';

const SEC = 20;

function match(seed = 4, map = 'river') {
  const g = Game.create(seed, map);
  const ais = [new ComputerPlayer(0, 'hard', 'raider'), new ComputerPlayer(1, 'normal', 'warlord')];
  const run = (game: Game, players: ComputerPlayer[], seconds: number) => {
    for (let t = 0; t < seconds * SEC && !game.state.outcome; t++) {
      game.step();
      for (const a of players) a.update(game);
    }
  };
  return { g, ais, run };
}

/** Save to text and load it back, as the game does. */
function roundTrip(g: Game, ais: ComputerPlayer[]): { g: Game; ais: ComputerPlayer[]; text: string } {
  const save = makeSave({
    match: { seed: g.state.seed, difficulty: 'hard', mapId: g.state.mapId, style: 'raider', advantage: 'none' },
    state: g.state,
    pending: g.pendingCommands(),
    visible: g.vision.snapshot(),
    ai: ais.map((a) => a.snapshot()),
    view: { player: 0, camera: { x: 10, y: 20, distance: 21 }, groups: { 1: [5, 6] } },
  });
  const text = JSON.stringify(save);
  const parsed = parseSave(text);
  if (!parsed.ok) throw new Error(parsed.reason);
  const s = parsed.save;
  return { g: Game.restore(s.state, s.pending, s.visible), ais: s.ai.map((a) => ComputerPlayer.restore(a)), text };
}

const aiState = (ais: ComputerPlayer[]) => JSON.stringify(ais.map((a) => a.snapshot()));

describe('save and load', () => {
  it('a loaded match continues exactly as the original, computers included', () => {
    const { g, ais, run } = match();
    for (const at of [100, 330, 520]) {
      run(g, ais, at - g.state.tick / SEC);
      const copy = roundTrip(g, ais);
      expect(copy.g.toJSON()).toBe(g.toJSON());
      expect(aiState(copy.ais)).toBe(aiState(ais));
      run(g, ais, 90);
      run(copy.g, copy.ais, 90);
      expect(copy.g.toJSON()).toBe(g.toJSON());
      expect(aiState(copy.ais)).toBe(aiState(ais));
    }
  }, 60_000);

  it('keeps orders, cargo, construction, queues, combat, heroes, fog and memory', () => {
    const { g, ais, run } = match();
    run(g, ais, 520);
    const copy = roundTrip(g, ais).g;
    const units = g.units();
    // The save holds every kind of in-flight state (checked present, then equal).
    expect(units.some((u) => u.carry.amount > 0)).toBe(true);
    expect(units.some((u) => u.order?.type === 'gather')).toBe(true);
    expect(units.some((u) => u.order?.type === 'attack' || u.order?.type === 'attackMove')).toBe(true);
    expect(g.buildings().some((b) => b.queue.length > 0)).toBe(true);
    expect(units.some((u) => u.hero)).toBe(true);
    expect(g.state.history.length).toBeGreaterThan(10);
    for (const u of units) expect(JSON.stringify(copy.unit(u.id))).toBe(JSON.stringify(u));
    for (const b of g.buildings()) expect(JSON.stringify(copy.building(b.id))).toBe(JSON.stringify(b));
    expect(JSON.stringify(copy.state.explored)).toBe(JSON.stringify(g.state.explored));
    expect(JSON.stringify(copy.state.memory)).toBe(JSON.stringify(g.state.memory));
    expect(JSON.stringify(copy.state.projectiles)).toBe(JSON.stringify(g.state.projectiles));
    for (const p of [0, 1]) for (const [x, y] of [[10, 56], [84, 14], [48, 36]]) expect(copy.vision.isVisible(p, x, y)).toBe(g.vision.isVisible(p, x, y));
  }, 60_000);

  it('a command given just before saving is carried out after loading', () => {
    const { g, ais, run } = match();
    run(g, ais, 60);
    const w = g.units().find((u) => u.owner === 0 && u.type === 'worker')!;
    g.issue({ type: 'move', player: 0, units: [w.id], x: 30, y: 50 });
    const copy = roundTrip(g, ais);
    copy.g.step();
    g.step();
    expect(copy.g.unit(w.id)!.order).toEqual(g.unit(w.id)!.order);
    expect(copy.g.unit(w.id)!.order?.type).toBe('move');
  }, 30_000);
});

describe('incompatible or damaged saves are refused with a reason', () => {
  const good = () => {
    const { g, ais } = match();
    return JSON.parse(roundTrip(g, ais).text) as SaveFile;
  };
  const reason = (text: string) => {
    const r = parseSave(text);
    expect(r.ok).toBe(false);
    return r.ok ? '' : r.reason;
  };

  it('not JSON, or not a save at all', () => {
    expect(reason('{oops')).toMatch(/damaged/);
    expect(reason(JSON.stringify({ hello: 1 }))).toMatch(/not an Ironvale saved game/);
  });

  it('a save from a newer version of the game', () => {
    expect(reason(JSON.stringify({ ...good(), version: SAVE_VERSION + 1 }))).toMatch(/newer version/);
  });

  it('a save with missing or broken parts', () => {
    const s = good();
    expect(reason(JSON.stringify({ ...s, version: 0 }))).toMatch(/version/);
    expect(reason(JSON.stringify({ ...s, state: { ...s.state, entities: undefined } }))).toMatch(/entities/);
    expect(reason(JSON.stringify({ ...s, state: { ...s.state, mapId: 'atlantis' } }))).toMatch(/unknown map/);
    expect(reason(JSON.stringify({ ...s, state: { ...s.state, map: { ...s.state.map, terrain: [1, 2] } } }))).toMatch(/map/);
    expect(reason(JSON.stringify({ ...s, ai: undefined }))).toMatch(/computer/);
  });

  it('the current version loads, with its format and version stamped', () => {
    const r = parseSave(JSON.stringify(good()));
    expect(r.ok).toBe(true);
    if (r.ok) expect([r.save.format, r.save.version]).toEqual([SAVE_FORMAT, SAVE_VERSION]);
  });
});

describe('save slots', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };

  it('stores, lists, finds the latest and removes saves', () => {
    const { g, ais } = match();
    const store = new SaveStore(memory());
    const save = JSON.parse(roundTrip(g, ais).text) as SaveFile;
    expect(store.write('1', { ...save, savedAt: '2026-01-01T10:00:00.000Z' }).ok).toBe(true);
    expect(store.write('auto', { ...save, savedAt: '2026-01-02T10:00:00.000Z' }).ok).toBe(true);
    expect(store.latest()).toBe('auto');
    expect(store.info('1')).toMatchObject({ mapId: 'river', tick: save.state.tick });
    expect(store.read('1')?.ok).toBe(true);
    store.remove('auto');
    expect(store.latest()).toBe('1');
    expect(store.read('2')).toBeNull();
  });

  it('a full storage is reported, not thrown', () => {
    const store = new SaveStore({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} });
    const r = store.write('1', JSON.parse(roundTrip(match().g, match().ais).text) as SaveFile);
    expect(r.ok).toBe(false);
  });

  it('a save stays well inside browser storage limits', () => {
    const { g, ais, run } = match();
    run(g, ais, 720);
    expect(roundTrip(g, ais).text.length).toBeLessThan(CONFIG.match.maxPop * 10_000);
  }, 60_000);
});
