// The match server: private rooms by code, seats and readiness, then the
// lockstep relay for the match. It never runs the simulation. It decides
// the order of every player's commands, checks that each command is well
// formed and given in the sender's own name, compares state hashes to catch
// desyncs, keeps the command log so a dropped player can rejoin, and ends a
// seat that stays away too long by surrendering it, a command like any other.
//
// Transport-agnostic: a connection is anything that can send a message and
// close (a WebSocket in server/main.ts, an in-memory link in the tests), and
// time comes from `now`, so tests can run on a virtual clock.

import type { Command } from '../src/sim/commands';
import {
  cleanName,
  CODE_ALPHABET,
  HASH_TURNS,
  MAX_COMMANDS_PER_TURN,
  MAX_DELAY,
  MIN_DELAY,
  PROTOCOL_VERSION,
  RECONNECT_GRACE_MS,
  TURN_MS,
  validCommand,
  validFaction,
  validMap,
  type ClientMsg,
  type MatchSetup,
  type RoomState,
  type ServerMsg,
  type Turn,
} from '../src/net/protocol';
import type { FactionId } from '../src/sim/factions';

export interface Conn {
  send(msg: ServerMsg): void;
  close(): void;
}

interface SeatState {
  name: string;
  faction: FactionId;
  ready: boolean;
  token: string;
  conn: Conn | null;
  disconnectedAt: number;
  /** Next turn this seat must submit (submissions are contiguous). */
  nextTurn: number;
  /** Surrendered on its behalf after leaving for too long: its turns are empty from then on. */
  gone: boolean;
  rtt: number;
}

interface Room {
  code: string;
  mapId: string;
  seats: Array<SeatState | null>;
  setup: MatchSetup | null;
  /** Submissions waiting for the other seats: turn -> commands per seat. */
  pending: Map<number, Array<Command[] | null>>;
  /** Last turn sent out to everyone (-1 = none yet). */
  completed: number;
  /** Every turn that held a command, for rejoining players. */
  log: Turn[];
  hashes: Map<number, Array<string | null>>;
  delay: number;
  lowDelayChecks: number;
  desynced: boolean;
  results: Array<number | null | undefined>;
  over: boolean;
  emptySince: number;
}

export interface ServerOptions {
  now?: () => number;
  /** For room codes, tokens and seeds. */
  random?: () => number;
  log?: (line: string) => void;
}

export interface Session {
  receive(msg: unknown): void;
  closed(): void;
}


export class MatchServer {
  readonly rooms = new Map<string, Room>();
  private now: () => number;
  private random: () => number;
  private log: (line: string) => void;
  private lastPing = 0;
  /** Rejected messages, for tests and diagnostics. */
  rejected = 0;

  constructor(opts: ServerOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.random = opts.random ?? Math.random;
    this.log = opts.log ?? (() => {});
  }

  connect(conn: Conn): Session {
    let room: Room | null = null;
    let seat = -1;
    const reject = (reason: string) => {
      this.rejected++;
      conn.send({ t: 'error', reason });
    };
    return {
      receive: (raw: unknown) => {
        const m = raw as ClientMsg;
        if (!m || typeof m !== 'object' || typeof m.t !== 'string') return reject('Malformed message.');
        if (m.t === 'create' || m.t === 'join' || m.t === 'rejoin') {
          if (m.v !== PROTOCOL_VERSION) return reject('This game version does not match the server. Reload the page to update.');
          if (room) return reject('Already in a room.');
          const r = m.t === 'create' ? this.create(conn, m.name) : m.t === 'join' ? this.join(conn, m.code, m.name) : this.rejoin(conn, m.code, m.token);
          if (typeof r === 'string') return reject(r);
          [room, seat] = r;
          return;
        }
        if (!room) return reject('Not in a room.');
        this.handle(room, seat, m, reject);
        if (m.t === 'leave') room = null;
      },
      closed: () => {
        if (room) this.disconnected(room, seat, conn);
      },
    };
  }

  // ---- lobby ---------------------------------------------------------------------

  private code(): string {
    for (;;) {
      let c = '';
      for (let i = 0; i < 5; i++) c += CODE_ALPHABET[Math.floor(this.random() * CODE_ALPHABET.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  private token(): string {
    let t = '';
    for (let i = 0; i < 24; i++) t += Math.floor(this.random() * 36).toString(36);
    return t;
  }

  private newSeat(conn: Conn, name: unknown): SeatState {
    return { name: cleanName(name), faction: 'crown', ready: false, token: this.token(), conn, disconnectedAt: 0, nextTurn: 0, gone: false, rtt: 0 };
  }

  private create(conn: Conn, name: unknown): [Room, number] {
    const room: Room = {
      code: this.code(),
      mapId: 'vales',
      seats: [this.newSeat(conn, name), null],
      setup: null,
      pending: new Map(),
      completed: -1,
      log: [],
      hashes: new Map(),
      delay: MIN_DELAY,
      lowDelayChecks: 0,
      desynced: false,
      results: [],
      over: false,
      emptySince: 0,
    };
    this.rooms.set(room.code, room);
    this.log(`room ${room.code} created`);
    this.sendRoom(room);
    return [room, 0];
  }

  private join(conn: Conn, code: unknown, name: unknown): [Room, number] | string {
    const room = typeof code === 'string' ? this.rooms.get(code.trim().toUpperCase()) : undefined;
    if (!room) return 'No match with that code. Check the code with the host.';
    if (room.setup) return 'That match has already started.';
    const seat = room.seats.findIndex((s) => s === null);
    if (seat < 0) return 'That match is full.';
    room.seats[seat] = this.newSeat(conn, name);
    for (const s of room.seats) if (s) s.ready = false;
    this.sendRoom(room);
    return [room, seat];
  }

  private rejoin(conn: Conn, code: unknown, token: unknown): [Room, number] | string {
    const room = typeof code === 'string' ? this.rooms.get(code.trim().toUpperCase()) : undefined;
    const seat = room ? room.seats.findIndex((s) => s?.token === token) : -1;
    if (!room || seat < 0) return 'That match is no longer available.';
    const s = room.seats[seat]!;
    if (s.gone) return 'You left that match too long ago: it was forfeited.';
    s.conn?.close();
    s.conn = conn;
    s.disconnectedAt = 0;
    if (!room.setup) {
      this.sendRoom(room);
    } else {
      conn.send({ t: 'resume', seat, setup: room.setup, log: room.log, completed: room.completed, nextTurn: s.nextTurn, delay: room.delay });
      this.broadcast(room, { t: 'peer', seat, state: 'connected' }, seat);
    }
    this.log(`room ${room.code}: seat ${seat} rejoined`);
    return [room, seat];
  }

  private publicRoom(room: Room): RoomState {
    return {
      code: room.code,
      mapId: room.mapId,
      seats: room.seats.map((s) => (s ? { name: s.name, faction: s.faction, ready: s.ready, connected: !!s.conn } : null)),
      started: !!room.setup,
    };
  }

  private sendRoom(room: Room): void {
    const state = this.publicRoom(room);
    room.seats.forEach((s, i) => s?.conn?.send({ t: 'room', room: state, seat: i, token: s.token }));
  }

  private handle(room: Room, seat: number, m: ClientMsg, reject: (r: string) => void): void {
    const me = room.seats[seat];
    if (!me) return reject('Not seated.');
    switch (m.t) {
      case 'leave':
        if (room.setup && !room.over) {
          // Leaving a match in progress is a forfeit.
          this.forfeit(room, seat);
          me.conn = null;
        } else {
          room.seats[seat] = null;
          for (const s of room.seats) if (s) s.ready = false;
          if (room.seats.every((s) => !s)) this.rooms.delete(room.code);
          else this.sendRoom(room);
        }
        return;
      case 'setMap':
        if (room.setup || seat !== 0) return reject('Only the host chooses the map, before the start.');
        if (!validMap(m.mapId)) return reject('Unknown map.');
        room.mapId = m.mapId;
        for (const s of room.seats) if (s) s.ready = false;
        return this.sendRoom(room);
      case 'pick':
        if (room.setup) return reject('The match has started.');
        if (!validFaction(m.faction)) return reject('Unknown faction.');
        me.faction = m.faction;
        me.ready = false;
        return this.sendRoom(room);
      case 'ready':
        if (room.setup) return;
        me.ready = !!m.ready;
        this.sendRoom(room);
        if (room.seats.every((s) => s?.ready && s.conn)) this.start(room);
        return;
      case 'cmds':
        return this.submit(room, seat, m, reject);
      case 'hash':
        return this.hash(room, seat, m);
      case 'over':
        room.results[seat] = typeof m.winner === 'number' || m.winner === null ? m.winner : undefined;
        if (room.seats.every((s, i) => !s || s.gone || room.results[i] !== undefined)) {
          room.over = true;
          this.log(`room ${room.code}: over, results ${JSON.stringify(room.results)}`);
        }
        return;
      case 'pong':
        if (typeof m.at === 'number') me.rtt = Math.max(0, this.now() - m.at);
        return;
      default:
        return reject('Unknown message.');
    }
  }

  private start(room: Room): void {
    const seats = room.seats as SeatState[];
    room.setup = {
      seed: Math.floor(this.random() * 1e9),
      mapId: room.mapId,
      factions: seats.map((s) => s.faction),
      names: seats.map((s) => s.name),
    };
    this.log(`room ${room.code}: started, ${JSON.stringify(room.setup)}`);
    seats.forEach((s, i) =>
      s.conn?.send({ t: 'resume', seat: i, setup: room.setup!, log: [], completed: -1, nextTurn: 0, delay: room.delay }),
    );
  }

  // ---- lockstep ------------------------------------------------------------------

  private submit(room: Room, seat: number, m: { turn: number; cmds: Command[] }, reject: (r: string) => void): void {
    const me = room.seats[seat]!;
    if (!room.setup || room.desynced) return;
    if (me.gone) return;
    if (!Number.isInteger(m.turn) || m.turn !== me.nextTurn) {
      // A late duplicate after a rejoin is harmless; anything else is a broken client.
      if (Number.isInteger(m.turn) && m.turn < me.nextTurn) return;
      return reject(`Turn ${m.turn} out of order (expected ${me.nextTurn}).`);
    }
    if (m.turn > room.completed + MAX_DELAY * 4) return reject('Too far ahead.');
    const cmds = Array.isArray(m.cmds) ? m.cmds : [];
    const ok = cmds.length <= MAX_COMMANDS_PER_TURN ? cmds.filter((c) => validCommand(c, seat)) : [];
    if (ok.length !== cmds.length) {
      this.rejected += cmds.length - ok.length;
      this.log(`room ${room.code}: seat ${seat} sent ${cmds.length - ok.length} invalid command(s) for turn ${m.turn}`);
    }
    me.nextTurn++;
    this.put(room, m.turn, seat, ok);
    this.flush(room);
  }

  private put(room: Room, turn: number, seat: number, cmds: Command[]): void {
    let row = room.pending.get(turn);
    if (!row) room.pending.set(turn, (row = room.seats.map(() => null)));
    row[seat] = cmds;
  }

  /** Send out every turn all seats have submitted, in order. */
  private flush(room: Room): void {
    // With nobody left to play, no turn is ever complete (and none is needed).
    if (room.seats.every((s) => !s || s.gone)) return;
    for (;;) {
      const turn = room.completed + 1;
      const row = room.pending.get(turn);
      const seats = room.seats as SeatState[];
      const ready = seats.every((s, i) => s.gone || (row && row[i] !== null));
      if (!ready) return;
      const cmds = seats.flatMap((_, i) => row?.[i] ?? []);
      room.pending.delete(turn);
      room.completed = turn;
      if (cmds.length) room.log.push({ turn, cmds });
      this.broadcast(room, { t: 'turn', turn, cmds });
    }
  }

  private hash(room: Room, seat: number, m: { turn: number; hash: string }): void {
    if (room.desynced || !Number.isInteger(m.turn) || typeof m.hash !== 'string' || m.turn % HASH_TURNS !== HASH_TURNS - 1) return;
    let row = room.hashes.get(m.turn);
    if (!row) room.hashes.set(m.turn, (row = room.seats.map(() => null)));
    row[seat] = m.hash.slice(0, 16);
    const seats = room.seats as SeatState[];
    if (!seats.every((s, i) => s.gone || row![i] !== null)) return;
    room.hashes.delete(m.turn);
    const live = row.filter((_, i) => !seats[i].gone);
    if (live.every((h) => h === live[0])) return;
    room.desynced = true;
    this.log(`room ${room.code}: DESYNC at turn ${m.turn}: ${JSON.stringify(row)}`);
    this.broadcast(room, { t: 'desync', turn: m.turn, hashes: row });
  }

  /** Surrender for a seat (it left, or stayed away too long). Lockstep carries it to everyone. */
  private forfeit(room: Room, seat: number): void {
    const s = room.seats[seat]!;
    if (s.gone) return;
    // Its next submission is the surrender; after that its turns count as empty.
    this.put(room, s.nextTurn, seat, [{ type: 'surrender', player: seat }]);
    s.nextTurn++;
    s.gone = true;
    this.log(`room ${room.code}: seat ${seat} forfeited`);
    this.broadcast(room, { t: 'peer', seat, state: 'forfeited' }, seat);
    this.flush(room);
  }

  private disconnected(room: Room, seat: number, conn: Conn): void {
    const s = room.seats[seat];
    if (!s || s.conn !== conn) return; // already replaced by a rejoin
    s.conn = null;
    if (!room.setup) {
      // In the lobby a closed tab leaves the seat.
      room.seats[seat] = null;
      for (const x of room.seats) if (x) x.ready = false;
      if (room.seats.every((x) => !x)) this.rooms.delete(room.code);
      else this.sendRoom(room);
      return;
    }
    s.disconnectedAt = this.now();
    if (!s.gone && !room.over) this.broadcast(room, { t: 'peer', seat, state: 'disconnected', graceMs: RECONNECT_GRACE_MS }, seat);
    this.log(`room ${room.code}: seat ${seat} disconnected`);
  }

  private broadcast(room: Room, msg: ServerMsg, except = -1): void {
    room.seats.forEach((s, i) => {
      if (i !== except) s?.conn?.send(msg);
    });
  }

  /** Timers: forfeits, pings, input delay, closing finished rooms. Call often (every 100-500 ms). */
  tick(): void {
    const now = this.now();
    const ping = now - this.lastPing >= 1000;
    if (ping) this.lastPing = now;
    for (const room of [...this.rooms.values()]) {
      const seats = room.seats.filter((s): s is SeatState => !!s);
      if (room.setup && !room.over) {
        room.seats.forEach((s, i) => {
          if (s && !s.conn && !s.gone && s.disconnectedAt && now - s.disconnectedAt > RECONNECT_GRACE_MS) this.forfeit(room, i);
        });
      }
      // Hash reports that can never complete (a player left before sending theirs).
      for (const turn of room.hashes.keys()) if (turn < room.completed - HASH_TURNS * 10) room.hashes.delete(turn);
      if (ping) {
        for (const s of seats) s.conn?.send({ t: 'ping', at: now, rtt: s.rtt });
        if (room.setup) this.adjustDelay(room);
      }
      // Forget rooms nobody is in any more (after a while, so a reload can rejoin).
      const empty = seats.every((s) => !s.conn);
      if (!empty) room.emptySince = 0;
      else if (!room.emptySince) room.emptySince = now;
      else if (now - room.emptySince > RECONNECT_GRACE_MS * 2) {
        this.rooms.delete(room.code);
        this.log(`room ${room.code} closed`);
      }
    }
  }

  /**
   * The input delay must cover a command's trip from one player through the
   * server to the other: about half of each one's round trip, plus margin
   * for jitter. Raised at once, lowered only after it has been comfortably
   * lower for a while (no see-sawing).
   */
  private adjustDelay(room: Room): void {
    const rtts = room.seats.map((s) => (s && s.conn && !s.gone ? s.rtt : 0));
    const worst = Math.max(...rtts);
    const need = Math.min(MAX_DELAY, Math.max(MIN_DELAY, Math.ceil((worst + 60) / TURN_MS)));
    let next = room.delay;
    if (need > room.delay) {
      next = need;
      room.lowDelayChecks = 0;
    } else if (need < room.delay - 1) {
      if (++room.lowDelayChecks >= 10) {
        next = room.delay - 1;
        room.lowDelayChecks = 0;
      }
    } else room.lowDelayChecks = 0;
    if (next !== room.delay) {
      room.delay = next;
      this.broadcast(room, { t: 'delay', turns: next, rtt: rtts });
    }
  }
}
