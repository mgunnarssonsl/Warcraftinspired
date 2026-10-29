// A connection to the match server: sends client messages, answers pings,
// remembers the room and the seat token (for rejoining), and hands every
// other server message to whoever listens. The transport is a browser
// WebSocket in the game, an in-memory link in tests.

import { PROTOCOL_VERSION, type ClientMsg, type RoomState, type ServerMsg } from './protocol';

export interface Transport {
  send(m: ClientMsg): void;
  close(): void;
  onMessage: (m: ServerMsg) => void;
  onClose: () => void;
}

export class NetClient {
  room: RoomState | null = null;
  seat = -1;
  token = '';
  /** Every server message (after the client's own bookkeeping). */
  onMessage: (m: ServerMsg) => void = () => {};
  onClose: () => void = () => {};
  closed = false;

  constructor(private transport: Transport) {
    transport.onMessage = (m) => {
      if (m.t === 'ping') return transport.send({ t: 'pong', at: m.at });
      if (m.t === 'room') {
        this.room = m.room;
        this.seat = m.seat;
        this.token = m.token;
      }
      if (m.t === 'resume') this.seat = m.seat;
      this.onMessage(m);
    };
    transport.onClose = () => {
      this.closed = true;
      this.onClose();
    };
  }

  send(m: ClientMsg): void {
    if (!this.closed) this.transport.send(m);
  }

  create(name: string): void {
    this.send({ t: 'create', name, v: PROTOCOL_VERSION });
  }

  join(code: string, name: string): void {
    this.send({ t: 'join', code, name, v: PROTOCOL_VERSION });
  }

  rejoin(code: string, token: string): void {
    this.send({ t: 'rejoin', code, token, v: PROTOCOL_VERSION });
  }

  close(): void {
    this.closed = true;
    this.transport.close();
  }
}

/** A WebSocket transport (browser). Resolves once connected. */
export function websocketTransport(url: string): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const t: Transport = {
      send: (m) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
      },
      close: () => ws.close(),
      onMessage: () => {},
      onClose: () => {},
    };
    ws.onopen = () => resolve(t);
    ws.onerror = () => reject(new Error('Could not reach the game server.'));
    ws.onmessage = (e) => {
      try {
        t.onMessage(JSON.parse(String(e.data)) as ServerMsg);
      } catch {
        // A message we cannot read is ignored; the server never sends one.
      }
    };
    ws.onclose = () => t.onClose();
  });
}
