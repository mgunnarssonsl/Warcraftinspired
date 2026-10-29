// The client side of lockstep: runs the local copy of the simulation one
// turn at a time, only once the server has sent that turn (everyone's
// commands for it). The player's own orders are queued and submitted for a
// turn `delay` turns ahead, so they reach the other players before anyone
// needs them. Pure logic: time comes in through update(), messages go out
// through `send`, so tests can drive it on a virtual clock.

import type { Command } from '../sim/commands';
import type { Game } from '../sim/game';
import { stateHash } from '../sim/hash';
import { HASH_TURNS, MAX_COMMANDS_PER_TURN, TURN_TICKS, type ClientMsg, type Turn } from './protocol';

const TICK_MS = 50;
/** Most ticks run in one update when catching up (keeps frames responsive). */
const MAX_CATCH_UP_TICKS = 12;

export interface LockstepStatus {
  /** Waiting for a turn that has not arrived (another player is slow or gone). */
  waiting: boolean;
  /** For how long, in ms. */
  waitingMs: number;
  /** Turns received but not yet run. */
  buffered: number;
  delay: number;
  /** The turn on which the players' states first disagreed, if they have. */
  desyncTurn: number | null;
}

export class Lockstep {
  private turns = new Map<number, Command[]>();
  /** Highest turn received from the server. */
  private lastTurn = -1;
  /** The turn being run, and how many of its ticks have run. */
  private execTurn = 0;
  private tickInTurn = 0;
  /** Next turn to submit commands for. */
  private nextSubmit: number;
  private outbox: Command[] = [];
  private acc = 0;
  private waitingMs = 0;
  private desyncTurn: number | null = null;
  /** Hashes sent, by turn (kept briefly, for desync diagnostics). */
  readonly hashes = new Map<number, string>();
  /** Called after every simulation tick (for a computer player driving this seat). */
  afterTick: () => void = () => {};

  constructor(
    readonly game: Game,
    readonly seat: number,
    private send: (m: ClientMsg) => void,
    /** Applies a command to the simulation (Game.issue, before any UI wrapping). */
    private apply: (c: Command) => void,
    public delay: number,
    nextTurn = 0,
  ) {
    this.nextSubmit = nextTurn;
  }

  /** An order from this player: it runs `delay` turns from now, everywhere at once. */
  issue(c: Command): void {
    if (c.player !== this.seat || this.desyncTurn !== null) return;
    this.outbox.push(c);
  }

  /** A turn from the server. They arrive in order. */
  receive(t: Turn): void {
    this.turns.set(t.turn, t.cmds);
    this.lastTurn = Math.max(this.lastTurn, t.turn);
  }

  /** On rejoin: every turn up to `completed` (only non-empty ones are listed). */
  receiveLog(log: Turn[], completed: number): void {
    for (let turn = this.execTurn; turn <= completed; turn++) this.turns.set(turn, []);
    for (const t of log) if (t.turn >= this.execTurn) this.turns.set(t.turn, t.cmds);
    this.lastTurn = Math.max(this.lastTurn, completed);
  }

  desynced(turn: number): void {
    this.desyncTurn = turn;
  }

  get turn(): number {
    return this.execTurn;
  }

  status(): LockstepStatus {
    return { waiting: this.waitingMs > 0, waitingMs: this.waitingMs, buffered: this.lastTurn - this.execTurn + 1, delay: this.delay, desyncTurn: this.desyncTurn };
  }

  /**
   * Advance by `dtMs` of real time: run the ticks that are due and have
   * arrived; run a few extra when far behind (after a stall or a rejoin).
   * Returns the number of ticks run.
   */
  update(dtMs: number): number {
    if (this.desyncTurn !== null) return 0;
    this.submitAhead();
    this.acc += dtMs;
    let ran = 0;
    while (this.acc >= TICK_MS && ran < MAX_CATCH_UP_TICKS) {
      if (!this.step()) break;
      this.acc -= TICK_MS;
      ran++;
    }
    if (this.acc >= TICK_MS) {
      // Stalled: wait without building up a backlog of time to rush through later.
      this.waitingMs += dtMs;
      this.acc = Math.min(this.acc, TICK_MS);
    } else this.waitingMs = 0;
    // Behind the others (turns piling up): catch up a little faster.
    while (ran < MAX_CATCH_UP_TICKS && this.lastTurn - this.execTurn > this.delay + 1 && this.step()) ran++;
    return ran;
  }

  /** Run every turn already received, as fast as possible (rejoin catch-up). Returns ticks run. */
  catchUp(maxTicks: number): number {
    let ran = 0;
    while (ran < maxTicks && this.step()) ran++;
    return ran;
  }

  /** Turns already received and not yet run. */
  get behind(): number {
    return this.lastTurn - this.execTurn + 1;
  }

  private step(): boolean {
    if (this.tickInTurn === 0) {
      const cmds = this.turns.get(this.execTurn);
      if (!cmds) return false;
      this.turns.delete(this.execTurn);
      for (const c of cmds) this.apply(c);
    }
    this.game.step();
    this.afterTick();
    this.tickInTurn++;
    if (this.tickInTurn === TURN_TICKS) {
      if (this.execTurn % HASH_TURNS === HASH_TURNS - 1) {
        const hash = stateHash(this.game);
        this.hashes.set(this.execTurn, hash);
        if (this.hashes.size > 10) this.hashes.delete(this.hashes.keys().next().value!);
        this.send({ t: 'hash', turn: this.execTurn, hash });
      }
      this.execTurn++;
      this.tickInTurn = 0;
      this.submitAhead();
    }
    return true;
  }

  /** Keep submissions `delay` turns ahead of the turn being run (one per turn, in order, never skipped). */
  private submitAhead(): void {
    while (this.nextSubmit <= this.execTurn + this.delay) {
      this.send({ t: 'cmds', turn: this.nextSubmit, cmds: this.outbox.splice(0, MAX_COMMANDS_PER_TURN) });
      this.nextSubmit++;
    }
  }
}
