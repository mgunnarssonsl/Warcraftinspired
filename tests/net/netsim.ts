// A simulated network for online-play tests: a virtual clock, links with
// latency and jitter that keep message order (as TCP does), and players that
// connect, drop and rejoin. Messages are serialized to JSON on the way, as
// on a real socket.

import { MatchServer } from '../../server/match';
import { ComputerPlayer } from '../../src/ai/computer';
import { NetClient, type Transport } from '../../src/net/client';
import { Lockstep } from '../../src/net/lockstep';
import type { MatchSetup, ServerMsg } from '../../src/net/protocol';
import type { Game } from '../../src/sim/game';
import { createMatch } from '../../src/replay/replay';
import { stateHash } from '../../src/sim/hash';

export class Clock {
  now = 0;
  private seq = 0;
  private queue: Array<{ at: number; seq: number; fn: () => void }> = [];
  at(delay: number, fn: () => void): void {
    this.queue.push({ at: this.now + delay, seq: this.seq++, fn });
  }
  advance(ms: number): void {
    const end = this.now + ms;
    for (;;) {
      this.queue.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = this.queue[0];
      if (!next || next.at > end) break;
      this.queue.shift();
      this.now = Math.max(this.now, next.at);
      next.fn();
    }
    this.now = end;
  }
}

export interface LinkProfile {
  /** One-way delay in ms. */
  latency: number;
  /** Extra random delay, 0..jitter ms. */
  jitter: number;
}

/** Deterministic pseudo-random numbers for the network (not the game). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** A one-way link: delayed, jittered, in order. */
function link(clock: Clock, p: LinkProfile, rand: () => number, deliver: (text: string) => void, alive: () => boolean) {
  let last = 0;
  return (text: string) => {
    if (!alive()) return;
    const at = Math.max(last, clock.now + p.latency + rand() * p.jitter);
    last = at;
    clock.at(at - clock.now, () => {
      if (alive()) deliver(text);
    });
  };
}

export class Player {
  net!: NetClient;
  game: Game | null = null;
  lock: Lockstep | null = null;
  ai: ComputerPlayer | null = null;
  setup: MatchSetup | null = null;
  messages: ServerMsg[] = [];
  /** The seat token, kept across rejoins (a real client keeps it in browser storage). */
  token = '';
  /** Every state hash this player reported, by turn. */
  readonly hashes = new Map<number, string>();
  connected = false;
  private dropLink: () => void = () => {};
  /** Called when this player's game is created (before it runs a tick). */
  onGame: (game: Game, setup: MatchSetup) => void = () => {};
  /** Frame length for this player's machine (ms). */
  frameMs = 16;
  sinceFrame = 0;

  constructor(
    private world: NetWorld,
    readonly name: string,
    public profile: LinkProfile,
    readonly difficulty: 'easy' | 'normal' | 'hard' = 'normal',
  ) {}

  connect(): NetClient {
    const { clock, server } = this.world;
    const rand = rng(this.name.length * 977 + Math.floor(clock.now));
    let open = true;
    const alive = () => open;
    const transport: Transport = { send: () => {}, close: () => {}, onMessage: () => {}, onClose: () => {} };
    const toClient = link(clock, this.profile, rand, (text) => transport.onMessage(JSON.parse(text) as ServerMsg), alive);
    const session = server.connect({
      send: (m) => toClient(JSON.stringify(m)),
      close: () => this.dropLink(),
    });
    const toServer = link(clock, this.profile, rand, (text) => session.receive(JSON.parse(text)), alive);
    transport.send = (m) => toServer(JSON.stringify(m));
    transport.close = () => this.dropLink();
    this.dropLink = () => {
      if (!open) return;
      open = false;
      this.connected = false;
      // Both ends notice the socket closing a little later.
      clock.at(this.profile.latency, () => session.closed());
      clock.at(this.profile.latency, () => transport.onClose());
    };
    this.net = new NetClient(transport);
    this.connected = true;
    this.net.onMessage = (m) => this.onMessage(m);
    return this.net;
  }

  /** The connection drops (cable pulled, tab closed). */
  drop(): void {
    this.dropLink();
  }

  /** Reconnect and take the seat back (a fresh copy of the game is rebuilt from the log). */
  rejoin(code: string, token: string): void {
    this.game = null;
    this.lock = null;
    this.ai = null;
    this.connect();
    this.net.rejoin(code, token);
  }

  private onMessage(m: ServerMsg): void {
    this.messages.push(m);
    if (m.t === 'room') this.token = m.token;
    if (m.t === 'resume') {
      this.setup = m.setup;
      const game = createMatch({ seed: m.setup.seed, mapId: m.setup.mapId, factions: m.setup.factions, names: m.setup.names, incomeBonus: [] });
      const apply = game.issue.bind(game);
      const send = (msg: Parameters<NetClient['send']>[0]) => {
        if (msg.t === 'hash') this.hashes.set(msg.turn, msg.hash);
        this.net.send(msg);
      };
      const lock = new Lockstep(game, m.seat, send, apply, m.delay, m.nextTurn);
      game.issue = (c) => lock.issue(c);
      lock.receiveLog(m.log, m.completed);
      this.game = game;
      this.onGame(game, m.setup);
      this.lock = lock;
      // The computer playing this seat starts once caught up (a person would be waiting for the replay too).
      const ai = new ComputerPlayer(m.seat, this.difficulty);
      this.ai = ai;
      while (lock.catchUp(1000) > 0);
      lock.afterTick = () => ai.update(game);
    } else if (m.t === 'turn') this.lock?.receive(m);
    else if (m.t === 'delay' && this.lock) this.lock.delay = m.turns;
    else if (m.t === 'desync') this.lock?.desynced(m.turn);
  }

  frame(dt: number): void {
    this.lock?.update(dt);
  }

  get stateHash(): string {
    return this.game ? stateHash(this.game) : '';
  }
}

export class NetWorld {
  readonly clock = new Clock();
  readonly server: MatchServer;
  readonly players: Player[] = [];
  readonly log: string[] = [];

  constructor(seed = 1) {
    const r = rng(seed);
    this.server = new MatchServer({ now: () => this.clock.now, random: r, log: (l) => this.log.push(`${this.clock.now}: ${l}`) });
  }

  add(name: string, profile: LinkProfile, difficulty: 'easy' | 'normal' | 'hard' = 'normal'): Player {
    const p = new Player(this, name, profile, difficulty);
    this.players.push(p);
    return p;
  }

  /** Advance virtual time, giving every player its frames and the server its timer ticks. */
  run(ms: number, stop: () => boolean = () => false): void {
    const step = 4;
    let serverTimer = 0;
    for (let t = 0; t < ms && !stop(); t += step) {
      this.clock.advance(step);
      serverTimer += step;
      if (serverTimer >= 100) {
        serverTimer = 0;
        this.server.tick();
      }
      for (const p of this.players) {
        p.sinceFrame += step;
        if (p.sinceFrame >= p.frameMs) {
          p.frame(p.sinceFrame);
          p.sinceFrame = 0;
        }
      }
    }
  }

  /** Create a room with the first player, join with the second, both ready: the match starts. */
  startMatch(mapId = 'vales', factions: Array<'crown' | 'wild'> = ['crown', 'crown']): string {
    const [a, b] = this.players;
    a.connect().create(a.name);
    this.run(500);
    const code = a.net.room!.code;
    b.connect().join(code, b.name);
    this.run(500);
    a.net.send({ t: 'setMap', mapId });
    a.net.send({ t: 'pick', faction: factions[0] });
    b.net.send({ t: 'pick', faction: factions[1] });
    this.run(500);
    a.net.send({ t: 'ready', ready: true });
    b.net.send({ t: 'ready', ready: true });
    this.run(1000);
    return code;
  }
}
