import { describe, expect, it } from 'vitest';
import { ComputerPlayer } from '../src/ai/computer';
import { createMatch, Recorder, ReplayPlayer } from '../src/replay/replay';
import { parseSave, makeSave } from '../src/save/save';
import { Game } from '../src/sim/game';
import { stateHash } from '../src/sim/hash';
import { checkMap, cleanMapDef } from '../src/sim/mapdef';
import { MAPS, type MapDef } from '../src/sim/maps';
import { NetWorld } from './net/netsim';

/** A custom copy of a built-in map, with changes. */
function custom(base = 'vales', change: (d: MapDef) => void = () => {}, name = 'Test map'): MapDef {
  const d = JSON.parse(JSON.stringify(MAPS.find((m) => m.id === base)!)) as MapDef;
  change(d);
  const c = cleanMapDef({ ...d, id: undefined, name });
  if (!c.ok) throw new Error(c.reason);
  return c.def;
}

describe('custom maps: what is accepted', () => {
  it('a copy of every built-in map is accepted, gets a custom id and passes the check', () => {
    for (const m of MAPS) {
      const d = custom(m.id, () => {}, `${m.name} copy`);
      expect(d.id).toMatch(/^custom-/);
      expect(checkMap(d).errors).toEqual([]);
    }
  });

  it('malformed maps are refused with a reason', () => {
    const base = JSON.parse(JSON.stringify(MAPS[0])) as Record<string, unknown>;
    const reason = (x: unknown) => {
      const r = cleanMapDef(x);
      return r.ok ? '' : r.reason;
    };
    expect(reason(null)).toMatch(/not a map/);
    expect(reason({ ...base, name: '' })).toMatch(/name/);
    expect(reason({ ...base, mines: [] })).toMatch(/no gold mine/);
    expect(reason({ ...base, start: { tx: 500, ty: 3 } })).toMatch(/start/);
    expect(reason({ ...base, lakes: [[10, 10, Infinity]] })).toMatch(/damaged/);
    expect(reason({ ...base, groves: Array.from({ length: 41 }, () => [10, 10, 2]) })).toMatch(/too many/);
    expect(reason({ ...base, mines: [{ tx: 5, ty: 5, kind: 'diamond', camp: 0 }] })).toMatch(/damaged/);
  });
});

describe('custom maps: the playability check', () => {
  it('a walled-in base, bases on top of each other, overlapping mines and an unreachable mine are all caught', () => {
    // A ring wide enough that the space cleared around the base and its mines does not breach it.
    const walled = custom('vales', (d) => d.rings.push({ cx: d.start.tx + 2, cy: d.start.ty + 2, r: 16, width: 1.5, ramps: [] }));
    expect(checkMap(walled).errors.join(' ')).toMatch(/cannot be reached|not connected|walled in/);
    const middle = custom('vales', (d) => (d.start = { tx: 44, ty: 34 }));
    expect(checkMap(middle).errors.join(' ')).toMatch(/too close|on top of each other/);
    const overlap = custom('vales', (d) => d.mines.push({ ...d.mines[2], tx: d.mines[2].tx + 1 }));
    expect(checkMap(overlap).errors.join(' ')).toMatch(/on top of each other/);
    const moat = custom('vales', (d) => {
      const m = d.mines.find((x) => x.label === 'far')!;
      d.rings.push({ cx: m.tx + 1.5, cy: m.ty + 1.5, r: 5, width: 1.5, ramps: [] });
    });
    expect(checkMap(moat).errors.join(' ')).toMatch(/cannot be reached/);
  });
});

describe('custom maps in play', () => {
  const def = custom('river', (d) => {
    d.lakes.push([40, 50, 3]);
    d.mines.push({ tx: 60, ty: 60, kind: 'rich', camp: 3, label: 'island' });
  }, 'Rivercross Plus');

  it('a match on a custom map is mirrored, saves, loads and replays with the map inside', () => {
    const spec = { seed: 5, mapId: def.id, factions: ['crown', 'wild'] as Array<'crown' | 'wild'>, names: ['A', 'B'], incomeBonus: [], map: def };
    const g = createMatch(spec);
    expect(g.state.mapDef?.name).toBe('Rivercross Plus');
    const { width: W, height: H, terrain } = g.state.map;
    for (let i = 0; i < W * H; i++) expect(terrain[i]).toBe(terrain[W * H - 1 - i]);
    const rec = new Recorder(g, spec);
    const ais = [new ComputerPlayer(0, 'normal'), new ComputerPlayer(1, 'normal')];
    for (let t = 0; t < 20 * 180; t++) {
      g.step();
      rec.afterStep();
      for (const a of ais) a.update(g);
    }
    const save = parseSave(JSON.stringify(makeSave({ match: { seed: 5, difficulty: 'normal', mapId: def.id, style: 'balanced', advantage: 'none', faction: 'crown', opponentFaction: 'wild' }, state: g.state, pending: [], visible: g.vision.snapshot(), ai: [], view: { player: 0, camera: { x: 0, y: 0, distance: 20 }, groups: {} } })));
    expect(save.ok).toBe(true);
    if (save.ok) expect(stateHash(Game.restore(save.save.state))).toBe(stateHash(g));
    const p = new ReplayPlayer(JSON.parse(JSON.stringify(rec.file(0, 'single', '1'))));
    p.run(g.state.tick);
    expect(stateHash(p.game)).toBe(stateHash(g));
  }, 60_000);

  it('online, the host’s custom map is checked by the server and both players get it; an unplayable one is refused', () => {
    const w = new NetWorld(41);
    const a = w.add('Host', { latency: 10, jitter: 0 });
    const b = w.add('Guest', { latency: 10, jitter: 0 });
    a.connect().create('Host');
    w.run(100);
    b.connect().join(a.net.room!.code, 'Guest');
    w.run(100);
    const broken = custom('vales', (d) => (d.start = { tx: 44, ty: 34 }), 'Broken');
    a.net.send({ t: 'setMap', mapId: broken.id, map: broken });
    w.run(100);
    expect(a.messages.at(-1)).toMatchObject({ t: 'error', reason: expect.stringMatching(/not playable/) });
    a.net.send({ t: 'setMap', mapId: def.id, map: def });
    w.run(100);
    expect(b.net.room!.map?.name).toBe('Rivercross Plus');
    a.net.send({ t: 'ready', ready: true });
    b.net.send({ t: 'ready', ready: true });
    w.run(500);
    expect(a.game!.state.mapId).toBe(def.id);
    expect(stateHash(a.game!)).toBe(stateHash(b.game!));
  });
});
