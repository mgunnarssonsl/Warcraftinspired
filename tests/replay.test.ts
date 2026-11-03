import { describe, expect, it } from 'vitest';
import { ComputerPlayer } from '../src/ai/computer';
import { createMatch, parseReplay, Recorder, ReplayPlayer, type MatchSpec, type ReplayFile } from '../src/replay/replay';
import { Game } from '../src/sim/game';
import { stateHash } from '../src/sim/hash';
import { NetWorld } from './net/netsim';

const spec: MatchSpec = { seed: 12, mapId: 'vales', factions: ['crown', 'wild'], names: ['You', 'Computer (hard)'], incomeBonus: [0, 0.25] };

/** Play a computer-vs-computer match while recording it. */
function record(ticks: number): { game: Game; rec: Recorder } {
  const game = createMatch(spec);
  const rec = new Recorder(game, spec);
  const ais = [new ComputerPlayer(0, 'hard'), new ComputerPlayer(1, 'normal')];
  for (let t = 0; t < ticks && !game.state.outcome; t++) {
    game.step();
    rec.afterStep();
    for (const a of ais) a.update(game);
  }
  return { game, rec };
}

const roundTrip = (f: ReplayFile) => {
  const r = parseReplay(JSON.stringify(f));
  if (!r.ok) throw new Error(r.reason);
  return r.replay;
};

describe('replays', () => {
  it('a whole match plays back to exactly the same end, from the spec and commands alone', () => {
    const { game, rec } = record(20 * 60 * 30);
    expect(game.state.outcome).toBeTruthy();
    const file = roundTrip(rec.file(0, 'single', '1.0.0'));
    expect(file.commands.length).toBeGreaterThan(200);
    expect(JSON.stringify(file).length).toBeLessThan(1_000_000);
    const p = new ReplayPlayer(file);
    // The income bonus and names come back too.
    expect(p.game.player(1).incomeBonus).toBe(0.25);
    expect(p.game.player(1).name).toBe('Computer (hard)');
    while (p.step());
    expect(p.diverged).toBeNull();
    expect(p.tick).toBe(game.state.tick);
    expect(stateHash(p.game)).toBe(stateHash(game));
    expect(p.game.state.outcome).toEqual(game.state.outcome);
  }, 120_000);

  it('a match saved, loaded and finished still replays from its very start', () => {
    const { game, rec } = record(20 * 60 * 4);
    // Save: the state and the log so far; load: a new game continuing both.
    const loaded = Game.restore(JSON.parse(JSON.stringify(game.state)), game.pendingCommands(), game.vision.snapshot());
    const rec2 = new Recorder(loaded, spec, JSON.parse(JSON.stringify(rec.log)));
    const ais = [new ComputerPlayer(0, 'hard'), new ComputerPlayer(1, 'normal')];
    // The computers' memory is part of a save too; fresh ones play differently, which is fine:
    // the replay must follow whatever actually happened.
    for (let t = 0; t < 20 * 60 * 3; t++) {
      loaded.step();
      rec2.afterStep();
      for (const a of ais) a.update(loaded);
    }
    const p = new ReplayPlayer(roundTrip(rec2.file(0, 'single', '1.0.0')));
    while (p.step());
    expect(p.diverged).toBeNull();
    expect(stateHash(p.game)).toBe(stateHash(loaded));
  }, 60_000);

  it('an online match recorded by one player replays to that player’s final state', () => {
    const w = new NetWorld(21);
    const a = w.add('Ada', { latency: 30, jitter: 20 }, 'hard');
    w.add('Bo', { latency: 60, jitter: 40 }, 'normal');
    let rec: Recorder | null = null;
    // Recording starts with the game, as the page does when the match loads.
    a.onGame = (g, s) => (rec = new Recorder(g, { seed: s.seed, mapId: s.mapId, factions: s.factions, names: s.names, incomeBonus: [] }));
    w.startMatch('river', ['wild', 'crown']);
    w.run(4 * 60_000);
    const file = roundTrip(rec!.file(0, 'online', '1.0.0'));
    const p = new ReplayPlayer(file);
    p.run(file.ticks);
    expect(p.tick).toBe(a.game!.state.tick);
    expect(stateHash(p.game)).toBe(stateHash(a.game!));
  }, 60_000);

  it('a replay that no longer plays back the same is caught at the next checkpoint', () => {
    const { rec } = record(20 * 60 * 3);
    const file = roundTrip(rec.file(0, 'single', '0.9.0'));
    // As if the rules had changed since: one early order goes missing.
    file.commands.splice(5, 1);
    const p = new ReplayPlayer(file);
    while (p.step());
    expect(p.diverged).not.toBeNull();
    expect(p.diverged! % 1200).toBe(0);
  }, 60_000);

  it('files that are not replays are refused with a reason', () => {
    const bad = (t: string) => {
      const r = parseReplay(t);
      return r.ok ? '' : r.reason;
    };
    expect(bad('{nope')).toMatch(/damaged/);
    expect(bad('{"format":"ironvale-save"}')).toMatch(/not an Ironvale replay/);
    expect(bad('{"format":"ironvale-replay","version":99}')).toMatch(/newer/);
    expect(bad('{"format":"ironvale-replay","version":1,"spec":{"seed":1}}')).toMatch(/setup/);
  });
});
