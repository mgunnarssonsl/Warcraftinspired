// An online match as the game page sees it: the lockstep runner, the
// connection, the other player's state, and what to tell the player
// (waiting, reconnecting, desync). main.ts connects and rejoins the match
// before the game loads (OnlineStart); app.ts creates the session with the
// game and drives it every frame.

import type { Command } from '../sim/commands';
import type { Game } from '../sim/game';
import { NetClient, websocketTransport, ONLINE_KEY, type StoredSeat } from './client';
import { Lockstep } from './lockstep';
import type { MatchSetup, ServerMsg, Turn } from './protocol';

export type ResumeMsg = Extract<ServerMsg, { t: 'resume' }>;

export interface OnlineStart {
  net: NetClient;
  resume: ResumeMsg;
  /** Messages that arrived before the game took over. */
  early: ServerMsg[];
  seat: StoredSeat;
}

/** Connect and take this browser's seat in an online match (before the game loads). */
export async function rejoinOnline(seat: StoredSeat): Promise<OnlineStart> {
  const net = new NetClient(await websocketTransport(seat.server));
  return new Promise((ok, fail) => {
    const early: ServerMsg[] = [];
    const timer = setTimeout(() => fail(new Error('The game server did not answer.')), 10_000);
    net.onMessage = (m) => {
      if (m.t === 'resume') {
        clearTimeout(timer);
        net.onMessage = (later) => early.push(later);
        ok({ net, resume: m, early, seat });
      } else if (m.t === 'error') {
        clearTimeout(timer);
        net.close();
        fail(new Error(m.reason));
      } else early.push(m);
    };
    net.onClose = () => fail(new Error('The connection to the game server closed.'));
    net.rejoin(seat.code, seat.token);
  });
}

/** Seats by match code, kept per browser so a closed tab can come back (newest last, a few kept). */
const SEATS_KEY = 'ironvale.seats';

function browserSeats(): Record<string, StoredSeat> {
  try {
    return (JSON.parse(localStorage.getItem(SEATS_KEY) ?? '{}') as Record<string, StoredSeat>) ?? {};
  } catch {
    return {};
  }
}

/**
 * This browser's seat in the match `code`: the tab's own (a reload), else
 * the browser's (the tab was closed and opened again).
 */
export function storedSeat(code: string): StoredSeat | null {
  try {
    const tab = JSON.parse(sessionStorage.getItem(ONLINE_KEY) ?? 'null') as StoredSeat | null;
    if (tab?.code === code) return tab;
  } catch {
    // Fall back to the browser's copy.
  }
  return browserSeats()[code] ?? null;
}

export function storeSeat(seat: StoredSeat | null, forget?: string): void {
  try {
    if (seat) sessionStorage.setItem(ONLINE_KEY, JSON.stringify(seat));
    else sessionStorage.removeItem(ONLINE_KEY);
  } catch {
    // Without session storage a reload cannot rejoin; the match itself still works.
  }
  try {
    const all = browserSeats();
    if (seat) all[seat.code] = seat;
    if (forget) delete all[forget];
    const codes = Object.keys(all);
    for (const c of codes.slice(0, Math.max(0, codes.length - 5))) delete all[c];
    localStorage.setItem(SEATS_KEY, JSON.stringify(all));
  } catch {
    // Not kept across tabs; a reload still works.
  }
}

export type PeerState = 'connected' | 'disconnected' | 'forfeited';

export class OnlineSession {
  readonly lock: Lockstep;
  readonly seat: number;
  readonly setup: MatchSetup;
  readonly peers: PeerState[];
  /** When each peer dropped (ms, performance.now) and how long it has. */
  private dropped: Array<{ since: number; graceMs: number } | null>;
  connection: 'online' | 'reconnecting' = 'online';
  private serverHashes: Array<string | null> | null = null;
  private overSent = false;
  onNotice: (text: string, cls: string) => void = () => {};
  onDesync: () => void = () => {};

  constructor(
    private start: OnlineStart,
    readonly game: Game,
    apply: (c: Command) => void,
  ) {
    const r = start.resume;
    this.seat = r.seat;
    this.setup = r.setup;
    this.peers = r.setup.names.map(() => 'connected');
    this.dropped = r.setup.names.map(() => null);
    this.lock = new Lockstep(game, r.seat, (m) => start.net.send(m), apply, r.delay, r.nextTurn);
    this.lock.receiveLog(r.log as Turn[], r.completed);
    start.net.onMessage = (m) => this.receive(m);
    start.net.onClose = () => this.lost();
    for (const m of start.early) this.receive(m);
    start.early.length = 0;
  }

  get net(): NetClient {
    return this.start.net;
  }

  issue(c: Command): void {
    this.lock.issue(c);
  }

  private receive(m: ServerMsg): void {
    switch (m.t) {
      case 'turn':
        return this.lock.receive(m);
      case 'delay':
        this.lock.delay = m.turns;
        return;
      case 'peer': {
        this.peers[m.seat] = m.state;
        const name = this.setup.names[m.seat];
        if (m.state === 'disconnected') {
          this.dropped[m.seat] = { since: performance.now(), graceMs: m.graceMs ?? 60_000 };
          this.onNotice(`${name} lost the connection. Waiting for them to come back.`, 'alert');
        } else {
          this.dropped[m.seat] = null;
          this.onNotice(m.state === 'connected' ? `${name} is back.` : `${name} left the match.`, m.state === 'connected' ? 'good' : 'alert');
        }
        return;
      }
      case 'desync':
        this.serverHashes = m.hashes;
        this.lock.desynced(m.turn);
        this.onDesync();
        return;
      case 'error':
        this.onNotice(m.reason, 'alert');
        return;
      default:
    }
  }

  /** Run the match for dtMs of real time. A big backlog (a rejoin) is replayed in chunks. */
  frame(dtMs: number): { replaying: boolean } {
    if (this.lock.behind > this.lock.delay + 40) {
      this.lock.catchUp(600);
      return { replaying: true };
    }
    this.lock.update(dtMs);
    return { replaying: false };
  }

  /** The match ended here: tell the server (once). */
  over(winner: number | null): void {
    if (this.overSent) return;
    this.overSent = true;
    this.net.send({ t: 'over', winner });
  }

  /** Leaving on purpose: forfeits a match in progress, and forgets the seat. */
  leave(): void {
    this.net.send({ t: 'leave' });
    storeSeat(null, this.start.seat.code);
    this.net.close();
  }

  /** What to show over the game, if anything. */
  banner(): string | null {
    const s = this.lock.status();
    if (s.desyncTurn !== null) return null; // the desync dialog says it
    if (this.connection === 'reconnecting') return 'Connection to the game server lost. Reconnecting…';
    if (!s.waiting || s.waitingMs < 400) return null;
    const gone = this.dropped.findIndex((d, i) => d && i !== this.seat);
    if (gone >= 0) {
      const d = this.dropped[gone]!;
      const left = Math.max(0, Math.ceil((d.since + d.graceMs - performance.now()) / 1000));
      return `Waiting for ${this.setup.names[gone]} to reconnect (${left} s, then they forfeit)…`;
    }
    return 'Waiting for the other player…';
  }

  /** "ping 45 ms · delay 200 ms", for the top bar. */
  statusLine(): string {
    return `ping ${Math.round(this.net.rtt)} ms · input delay ${this.lock.delay * 100} ms`;
  }

  /** Everything needed to work out what went wrong, as one file. */
  diagnostics(): string {
    return JSON.stringify({
      seat: this.seat,
      setup: this.setup,
      desyncTurn: this.lock.status().desyncTurn,
      ourHashes: Object.fromEntries(this.lock.hashes),
      serverHashes: this.serverHashes,
      userAgent: navigator.userAgent,
      state: this.game.state,
    });
  }

  /**
   * Our own connection dropped. Keep trying the server; once it answers,
   * reload: the page rejoins the seat and replays the match to now.
   */
  private lost(): void {
    if (this.connection === 'reconnecting' || this.overSent) return;
    this.connection = 'reconnecting';
    const attempt = () => {
      websocketTransport(this.start.seat.server)
        .then((t) => {
          t.close();
          location.reload();
        })
        .catch(() => {
          window.setTimeout(attempt, 2000);
        });
    };
    window.setTimeout(attempt, 1000);
  }
}
