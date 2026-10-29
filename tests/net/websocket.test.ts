import { describe, expect, it } from 'vitest';
import { startServer } from '../../server/main';
import { ComputerPlayer } from '../../src/ai/computer';
import { NetClient, websocketTransport } from '../../src/net/client';
import { Lockstep } from '../../src/net/lockstep';
import type { ServerMsg } from '../../src/net/protocol';
import { Game } from '../../src/sim/game';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('over real WebSockets', () => {
  it('the server process hosts a lobby and a lockstep match; both clients agree', async () => {
    const server = await startServer(0, null, () => {});
    const url = `ws://localhost:${server.port}/ws`;
    try {
      const players = await Promise.all(
        [0, 1].map(async () => {
          const net = new NetClient(await websocketTransport(url));
          const p = { net, lock: null as Lockstep | null, hashes: new Map<number, string>(), msgs: [] as ServerMsg[] };
          net.onMessage = (m) => {
            p.msgs.push(m);
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
            else if (m.t === 'delay' && p.lock) p.lock.delay = m.turns;
          };
          return p;
        }),
      );
      const [a, b] = players;
      a.net.create('Ada');
      await wait(200);
      b.net.join(a.net.room!.code, 'Bo');
      await wait(200);
      a.net.send({ t: 'ready', ready: true });
      b.net.send({ t: 'ready', ready: true });
      await wait(300);
      expect(a.lock && b.lock).toBeTruthy();
      // Six seconds of real play (60 turns: hash checks at turns 19 and 39).
      let last = performance.now();
      const end = last + 6000;
      while (performance.now() < end) {
        await wait(16);
        const now = performance.now();
        a.lock!.update(now - last);
        b.lock!.update(now - last);
        last = now;
      }
      expect(a.lock!.turn).toBeGreaterThan(45);
      const common = [...a.hashes].filter(([t]) => b.hashes.has(t));
      expect(common.length).toBeGreaterThanOrEqual(2);
      for (const [t, h] of common) expect(b.hashes.get(t)).toBe(h);
      expect([...a.msgs, ...b.msgs].some((m) => m.t === 'desync' || m.t === 'error')).toBe(false);
      a.net.close();
      b.net.close();
    } finally {
      await server.close();
    }
  }, 30_000);
});

describe('the server process survives hostile requests', () => {
  it('bad paths, malformed escapes and junk messages do not take it down or leak files', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'ironvale-'));
    writeFileSync(join(dir, 'index.html'), '<p>game</p>');
    const server = await startServer(0, dir, () => {});
    const base = `http://localhost:${server.port}`;
    try {
      const raw = (path: string) =>
        new Promise<number>((ok) => {
          // Raw HTTP, so the path is sent exactly as written.
          import('node:net').then(({ connect }) => {
            const s = connect(server.port, 'localhost', () => s.write(`GET ${path} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`));
            let text = '';
            s.on('data', (d) => (text += d));
            s.on('end', () => ok(Number(text.split(' ')[1])));
          });
        });
      expect(await raw('/')).toBe(200);
      expect(await raw('/%E0%A4%A')).toBe(400);
      expect(await raw('/../package.json')).toBe(404);
      expect(await raw('/%2e%2e/%2e%2e/etc/passwd')).toBe(404);
      // Junk over the socket: ignored or answered with an error, never a crash.
      const ws = new WebSocket(`ws://localhost:${server.port}/ws`);
      await new Promise((ok) => (ws.onopen = ok));
      for (const junk of ['not json', '{}', '{"t":"cmds","turn":"x"}', '[1,2]', 'null', '{"t":"join","code":{"a":1}}']) ws.send(junk);
      await wait(300);
      ws.close();
      expect((await fetch(`${base}/`)).status).toBe(200);
    } finally {
      await server.close();
    }
  });
});
