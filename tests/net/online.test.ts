import { describe, expect, it } from 'vitest';
import { RECONNECT_GRACE_MS, validCommand } from '../../src/net/protocol';
import { NetWorld, type Player } from './netsim';

/** Turns both players hashed, and whether they all agree. */
function compare(a: Player, b: Player): { common: number; agree: boolean } {
  let common = 0;
  let agree = true;
  for (const [turn, h] of a.hashes) {
    const other = b.hashes.get(turn);
    if (other === undefined) continue;
    common++;
    if (other !== h) agree = false;
  }
  return { common, agree };
}

const desyncs = (p: Player) => p.messages.filter((m) => m.t === 'desync').length;

describe('online match over the network', () => {
  it('two players complete a match on a good connection with identical results', () => {
    const w = new NetWorld(1);
    const a = w.add('Ada', { latency: 25, jitter: 15 }, 'hard');
    const b = w.add('Bo', { latency: 35, jitter: 20 }, 'easy');
    w.startMatch('vales');
    expect(a.game && b.game).toBeTruthy();
    w.run(20 * 60_000, () => !!a.game!.state.outcome && !!b.game!.state.outcome);
    expect(a.game!.state.outcome).toBeTruthy();
    expect(a.game!.state.outcome).toEqual(b.game!.state.outcome);
    const c = compare(a, b);
    expect(c.common).toBeGreaterThan(100);
    expect(c.agree).toBe(true);
    expect(desyncs(a) + desyncs(b)).toBe(0);
    expect(w.server.rejected).toBe(0);
  }, 120_000);

  it('a bad, uneven connection (one player 250 ms with heavy jitter) stays in sync; the delay rises to cover it', () => {
    const w = new NetWorld(2);
    const a = w.add('Near', { latency: 10, jitter: 5 }, 'normal');
    const b = w.add('Far', { latency: 250, jitter: 200 }, 'normal');
    b.frameMs = 33; // and a slower machine
    w.startMatch('river', ['crown', 'wild']);
    w.run(4 * 60_000);
    const delays = a.messages.filter((m) => m.t === 'delay').map((m) => (m as { turns: number }).turns);
    expect(Math.max(...delays)).toBeGreaterThanOrEqual(6);
    const c = compare(a, b);
    expect(c.common).toBeGreaterThan(50);
    expect(c.agree).toBe(true);
    // Both progressed at close to real time despite the lag.
    expect(a.lock!.turn).toBeGreaterThan((4 * 60_000) / 100 * 0.85);
    expect(Math.abs(a.lock!.turn - b.lock!.turn)).toBeLessThan(20);
  }, 120_000);

  it('a dropped player rejoins, replays the match from the log and plays on in sync', () => {
    const w = new NetWorld(3);
    const a = w.add('Stay', { latency: 30, jitter: 10 }, 'normal');
    const b = w.add('Drop', { latency: 40, jitter: 20 }, 'normal');
    const code = w.startMatch('highland', ['wild', 'crown']);
    w.run(3 * 60_000);
    const token = b.net.token;
    const turnBefore = a.lock!.turn;
    b.drop();
    w.run(15_000);
    // Lockstep waits for the missing player: the match has not run on without them.
    expect(a.lock!.turn - turnBefore).toBeLessThan(15);
    expect(a.lock!.status().waiting).toBe(true);
    expect(a.messages.some((m) => m.t === 'peer' && m.state === 'disconnected')).toBe(true);
    b.rejoin(code, token);
    w.run(2 * 60_000);
    expect(b.lock!.turn).toBeGreaterThan(turnBefore + 1000);
    const c = compare(a, b);
    expect(c.common).toBeGreaterThan(10);
    expect(c.agree).toBe(true);
    expect(desyncs(a)).toBe(0);
  }, 120_000);

  it('a player who stays away past the grace period forfeits; the other wins', () => {
    const w = new NetWorld(4);
    const a = w.add('Stay', { latency: 20, jitter: 10 });
    const b = w.add('Gone', { latency: 20, jitter: 10 });
    w.startMatch();
    w.run(60_000);
    b.drop();
    w.run(RECONNECT_GRACE_MS + 5_000);
    expect(a.messages.some((m) => m.t === 'peer' && m.state === 'forfeited')).toBe(true);
    expect(a.game!.state.outcome?.winner).toBe(0);
    // The seat is gone for good.
    b.rejoin(w.server.rooms.keys().next().value!, b.net.token);
    w.run(1000);
    expect(b.messages.some((m) => m.t === 'error' && /forfeited/.test(m.reason))).toBe(true);
  }, 120_000);

  it('a desync is caught at the next hash comparison and reported to both players', () => {
    const w = new NetWorld(5);
    const a = w.add('A', { latency: 20, jitter: 10 });
    const b = w.add('B', { latency: 20, jitter: 10 });
    w.startMatch();
    w.run(30_000);
    expect(desyncs(a)).toBe(0);
    // One player's simulation drifts (as a browser bug or a tampered client would).
    b.game!.player(1).gold += 1;
    w.run(5_000);
    expect(desyncs(a)).toBe(1);
    expect(desyncs(b)).toBe(1);
    expect(a.lock!.status().desyncTurn).not.toBeNull();
    const t = a.lock!.turn;
    w.run(5_000);
    expect(a.lock!.turn).toBe(t); // stopped, not playing on in two different worlds
  }, 60_000);

  it('a cheating client cannot command the other player or send malformed orders', () => {
    const w = new NetWorld(6);
    const a = w.add('Honest', { latency: 20, jitter: 10 });
    const b = w.add('Cheat', { latency: 20, jitter: 10 });
    w.startMatch();
    w.run(5_000);
    const victims = a.game!.units().filter((u) => u.owner === 0).map((u) => u.id);
    // A tampered client: its own outgoing queue gets orders in the other player's name and rubbish.
    const lockB = b.lock!;
    const before = w.server.rejected;
    lockB.issue({ type: 'stop', player: 1, units: victims }); // allowed shape, but not their units: the sim ignores it
    (lockB as unknown as { outbox: unknown[] }).outbox.push(
      { type: 'move', player: 0, units: victims, x: 1, y: 1 },
      { type: 'train', player: 1, buildingId: 1, unit: 'dragon' },
      { type: 'move', player: 1, units: victims, x: Infinity, y: 0 },
    );
    w.run(5_000);
    expect(w.server.rejected - before).toBeGreaterThanOrEqual(3);
    // Player 0's Laborers were never moved to (1, 1).
    for (const id of victims) {
      const u = a.game!.unit(id);
      if (u) expect(Math.hypot(u.x - 1, u.y - 1)).toBeGreaterThan(3);
    }
    w.run(5_000);
    expect(compare(a, b).agree).toBe(true);
    expect(desyncs(a)).toBe(0);
    expect(validCommand({ type: 'surrender', player: 1 }, 0)).toBe(false);
  }, 60_000);
});

describe('lobby', () => {
  it('codes, seats, map and faction choice, readiness and the start', () => {
    const w = new NetWorld(7);
    const a = w.add('Host', { latency: 10, jitter: 0 });
    const b = w.add('Guest', { latency: 10, jitter: 0 });
    const c = w.add('Third', { latency: 10, jitter: 0 });
    a.connect().create('Host');
    w.run(100);
    const code = a.net.room!.code;
    expect(code).toMatch(/^[A-Z]{5}$/);
    b.connect().join('wrong', 'Guest');
    w.run(100);
    expect(b.messages.at(-1)).toMatchObject({ t: 'error' });
    b.net.join(code.toLowerCase(), 'Guest');
    w.run(100);
    expect(a.net.room!.seats.map((s) => s?.name)).toEqual(['Host', 'Guest']);
    c.connect().join(code, 'Third');
    w.run(100);
    expect(c.messages.at(-1)).toMatchObject({ t: 'error', reason: expect.stringMatching(/full/) });
    // Only the host picks the map; a change un-readies everyone.
    b.net.send({ t: 'setMap', mapId: 'river' });
    a.net.send({ t: 'ready', ready: true });
    w.run(100);
    expect(a.net.room!.mapId).toBe('vales');
    a.net.send({ t: 'setMap', mapId: 'highland' });
    b.net.send({ t: 'pick', faction: 'wild' });
    w.run(100);
    expect(a.net.room!.seats.map((s) => s?.ready)).toEqual([false, false]);
    expect(a.net.room!.mapId).toBe('highland');
    a.net.send({ t: 'ready', ready: true });
    w.run(100);
    expect(a.game).toBeNull();
    b.net.send({ t: 'ready', ready: true });
    w.run(300);
    expect(a.setup).toMatchObject({ mapId: 'highland', factions: ['crown', 'wild'], names: ['Host', 'Guest'] });
    expect(b.setup).toEqual(a.setup);
    expect(a.lock && b.lock).toBeTruthy();
    // No joining after the start; an old client version is turned away.
    c.net.join(code, 'Late');
    w.run(100);
    expect(c.messages.at(-1)).toMatchObject({ t: 'error', reason: expect.stringMatching(/started/) });
    c.net.send({ t: 'create', name: 'x', v: 0 });
    w.run(100);
    expect(c.messages.at(-1)).toMatchObject({ t: 'error', reason: expect.stringMatching(/version/) });
  });

  it('closing the tab in the lobby frees the seat', () => {
    const w = new NetWorld(8);
    const a = w.add('Host', { latency: 10, jitter: 0 });
    const b = w.add('Guest', { latency: 10, jitter: 0 });
    a.connect().create('Host');
    w.run(100);
    b.connect().join(a.net.room!.code, 'Guest');
    w.run(100);
    b.drop();
    w.run(200);
    expect(a.net.room!.seats[1]).toBeNull();
  });
});
