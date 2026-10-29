// The game server process: WebSocket match server on /ws, and (if the game
// has been built) the game itself, so one command hosts everything.
//
//   npm run build && npm run server        # http://localhost:8787
//   PORT=9000 npm run server
//
// Run it behind HTTPS (a reverse proxy) when it is on the internet: browsers
// on an https page may only open wss:// sockets.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { MatchServer } from './match';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/** Messages a client may send per second before it is cut off (a real one sends about 12). */
const MAX_RATE = 200;

export interface Running {
  port: number;
  match: MatchServer;
  close(): Promise<void>;
}

export function startServer(port: number, staticDir: string | null = resolve('dist'), log: (l: string) => void = console.log): Promise<Running> {
  const match = new MatchServer({ log });
  const http: Server = createServer((req, res) => {
    if (!staticDir || !existsSync(staticDir)) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('Ironvale game server. Build the game (npm run build) to serve it from here too.');
      return;
    }
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const file = normalize(join(staticDir, path === '/' ? 'index.html' : path));
    if (!file.startsWith(staticDir) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 64 * 1024 });
  wss.on('connection', (ws) => {
    const session = match.connect({ send: (m) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m)), close: () => ws.close() });
    let windowStart = Date.now();
    let count = 0;
    ws.on('message', (data) => {
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > MAX_RATE) {
        log('closing a connection that sent too many messages');
        ws.close();
        return;
      }
      let msg: unknown;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      // One bad message must never take the server (and every match on it) down.
      try {
        session.receive(msg);
      } catch (e) {
        log(`error handling a message: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
      }
    });
    ws.on('close', () => {
      try {
        session.closed();
      } catch (e) {
        log(`error on close: ${String(e)}`);
      }
    });
  });
  const timer = setInterval(() => {
    try {
      match.tick();
    } catch (e) {
      log(`error in the server timer: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    }
  }, 100);
  return new Promise((ok) =>
    http.listen(port, () => {
      const addr = http.address();
      const actual = typeof addr === 'object' && addr ? addr.port : port;
      ok({
        port: actual,
        match,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(timer);
            for (const c of wss.clients) c.terminate();
            wss.close();
            http.close(() => done());
          }),
      });
    }),
  );
}

if (process.argv[1]?.endsWith('main.ts') || process.argv.includes('--serve')) {
  const port = Number(process.env.PORT ?? 8787);
  void startServer(port).then((r) => console.log(`Ironvale server on http://localhost:${r.port} (WebSocket /ws)`));
}
