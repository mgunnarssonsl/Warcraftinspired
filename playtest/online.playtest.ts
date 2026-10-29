// Online play under bad conditions (not part of `npm test`; run with
// `npm run playtest -- playtest/online.playtest.ts`).
//
// 1. Soak: full computer-vs-computer matches on the simulated network, each
//    with its own random latency, jitter, frame rate and connection drops.
//    Every match must end, identically for both players, with no desync.
// 2. Real sockets: a match over WebSockets through a TCP proxy that delays
//    and jitters every packet, as a long-distance connection would.

import { createServer, connect, type Socket } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { startServer } from '../server/main';
import { ComputerPlayer } from '../src/ai/computer';
import { NetClient, websocketTransport } from '../src/net/client';
import { Lockstep } from '../src/net/lockstep';
import { Game } from '../src/sim/game';
import { NetWorld, rng } from '../tests/net/netsim';

const rows: Array<Record<string, string | number | boolean>> = [];

/** Run the simulated network in slices, letting the test runner breathe between them. */
async function runYielding(w: NetWorld, ms: number, stop: () => boolean): Promise<void> {
  for (let t = 0; t < ms && !stop(); t += 20_000) {
    w.run(Math.min(20_000, ms - t), stop);
    await new Promise((ok) => setTimeout(ok, 0));
  }
}

describe('online soak on a simulated network', () => {
  for (let n = 0; n < 12; n++) {
    it(`match ${n + 1}`, async () => {
      const r = rng(1000 + n * 7919);
      r(); // the first value of neighbouring seeds is too alike
      const w = new NetWorld(n + 11);
      const pa = { latency: Math.round(10 + r() * 140), jitter: Math.round(r() * 120) };
      const pb = { latency: Math.round(10 + r() * 140), jitter: Math.round(r() * 120) };
      const a = w.add('A', pa, r() < 0.5 ? 'hard' : 'normal');
      const b = w.add('B', pb, r() < 0.5 ? 'hard' : 'easy');
      a.frameMs = r() < 0.3 ? 33 : 16;
      b.frameMs = r() < 0.3 ? 50 : 16;
      const maps = ['vales', 'river', 'highland'];
      const code = w.startMatch(maps[n % 3], [r() < 0.5 ? 'crown' : 'wild', r() < 0.5 ? 'crown' : 'wild']);
      // Up to two drops, each back within 5-30 s.
      const drops = Math.floor(r() * 3);
      const done = () => !!a.game?.state.outcome && !!b.game?.state.outcome;
      for (let d = 0; d < drops && !done(); d++) {
        await runYielding(w, 60_000 + r() * 240_000, done);
        if (done()) break;
        const who = r() < 0.5 ? a : b;
        who.drop();
        await runYielding(w, 5_000 + r() * 25_000, () => false);
        who.rejoin(code, who.token);
      }
      await runYielding(w, 30 * 60_000, done);
      let common = 0;
      let agree = true;
      for (const [turn, h] of a.hashes) {
        const o = b.hashes.get(turn);
        if (o === undefined) continue;
        common++;
        if (o !== h) agree = false;
      }
      const desync = [...a.messages, ...b.messages].some((m) => m.t === 'desync');
      const delays = a.messages.filter((m) => m.t === 'delay').map((m) => (m as { turns: number }).turns);
      rows.push({
        match: n + 1,
        links: `${pa.latency}±${pa.jitter} / ${pb.latency}±${pb.jitter} ms`,
        drops,
        minutes: +((a.game?.state.tick ?? 0) / 1200).toFixed(1),
        ended: done(),
        sameOutcome: JSON.stringify(a.game?.state.outcome) === JSON.stringify(b.game?.state.outcome),
        hashChecks: common,
        agree,
        maxDelayMs: Math.max(2, ...delays) * 100,
      });
      expect(done()).toBe(true);
      expect(a.game!.state.outcome).toEqual(b.game!.state.outcome);
      expect(agree).toBe(true);
      expect(desync).toBe(false);
    }, 300_000);
  }
  afterAll(() => console.table(rows));
});

/** A TCP proxy that holds every chunk for latency + jitter ms, keeping order. */
function laggyProxy(target: number, latency: number, jitter: number): Promise<{ port: number; close(): void }> {
  const r = rng(77);
  const sockets: Socket[] = [];
  const pipe = (from: Socket, to: Socket) => {
    let last = 0;
    from.on('data', (chunk) => {
      const at = Math.max(last, Date.now() + latency + r() * jitter);
      last = at;
      setTimeout(() => to.writable && to.write(chunk), at - Date.now());
    });
    from.on('close', () => setTimeout(() => to.destroy(), latency));
  };
  const server = createServer((client) => {
    const upstream = connect(target, 'localhost');
    sockets.push(client, upstream);
    pipe(client, upstream);
    pipe(upstream, client);
  });
  return new Promise((ok) =>
    server.listen(0, () => {
      const addr = server.address();
      ok({ port: typeof addr === 'object' && addr ? addr.port : 0, close: () => (sockets.forEach((s) => s.destroy()), server.close()) });
    }),
  );
}

describe('online over real sockets with lag', () => {
  it('a minute of play through a 150 ms ± 80 ms proxy stays in sync', async () => {
    const server = await startServer(0, null, () => {});
    const proxy = await laggyProxy(server.port, 150, 80);
    const url = `ws://localhost:${proxy.port}/ws`;
    const players = await Promise.all(
      [0, 1].map(async () => {
        const net = new NetClient(await websocketTransport(url));
        const p = { net, lock: null as Lockstep | null, hashes: new Map<number, string>(), delays: [] as number[] };
        net.onMessage = (m) => {
          if (m.t === 'resume') {
            const game = Game.create(m.setup.seed, m.setup.mapId, m.setup.factions);
            const apply = game.issue.bind(game);
            const lock = new Lockstep(game, m.seat, (msg) => {
              if (msg.t === 'hash') p.hashes.set(msg.turn, msg.hash);
              net.send(msg);
            }, apply, m.delay, m.nextTurn);
            game.issue = (c) => lock.issue(c);
            const ai = new ComputerPlayer(m.seat, 'hard');
            lock.afterTick = () => ai.update(game);
            p.lock = lock;
          } else if (m.t === 'turn') p.lock?.receive(m);
          else if (m.t === 'delay' && p.lock) {
            p.lock.delay = m.turns;
            p.delays.push(m.turns);
          }
        };
        return p;
      }),
    );
    const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
    const [a, b] = players;
    a.net.create('A');
    await wait(1000);
    b.net.join(a.net.room!.code, 'B');
    await wait(1000);
    a.net.send({ t: 'ready', ready: true });
    b.net.send({ t: 'ready', ready: true });
    await wait(1500);
    let last = performance.now();
    const end = last + 60_000;
    while (performance.now() < end) {
      await wait(16);
      const now = performance.now();
      a.lock!.update(now - last);
      b.lock!.update(now - last);
      last = now;
    }
    const common = [...a.hashes].filter(([t]) => b.hashes.has(t));
    console.log(`real sockets: turn ${a.lock!.turn} / ${b.lock!.turn} after 60 s, ${common.length} hash checks, delays ${a.delays.join(',')}`);
    expect(common.length).toBeGreaterThanOrEqual(20);
    for (const [t, h] of common) expect(b.hashes.get(t)).toBe(h);
    expect(a.lock!.turn).toBeGreaterThan(450); // close to real time (600 turns a minute)
    a.net.close();
    b.net.close();
    proxy.close();
    await server.close();
  }, 120_000);
});
