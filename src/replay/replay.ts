// Replays. A match is fully described by how it was set up and every
// command given during it (the simulation is deterministic), so a replay is
// just that: a few hundred kilobytes at most. Recording hooks the commands
// as they take effect, from every source (the player, the computer, online
// opponents); playback creates the same match and feeds them back in on the
// same ticks. State-hash checkpoints catch a replay recorded by a different
// version of the game, whose rules would make it play out differently.

import type { Command } from '../sim/commands';
import type { FactionId } from '../sim/factions';
import { Game } from '../sim/game';
import { stateHash } from '../sim/hash';
import { cleanMapDef } from '../sim/mapdef';
import { registerMap, type MapDef } from '../sim/maps';
import { cleanRules, DEFAULT_RULES, type MatchRules } from '../sim/rules';
import { isScenario, SCENARIOS, setupScenario, type ScenarioId } from '../sim/scenarios';

export const REPLAY_FORMAT = 'ironvale-replay';
export const REPLAY_VERSION = 1;
/** A state hash is recorded every this many ticks (1 minute). */
export const CHECK_TICKS = 1200;

/** How a match was set up: everything Game.create needs, plus what was set on the players after. */
export interface MatchSpec {
  seed: number;
  mapId: string;
  factions: FactionId[];
  names: string[];
  /** The computer's labelled income advantage, per player (0 = none). */
  incomeBonus: number[];
  /** Custom match rules (absent = the standard ones). */
  rules?: MatchRules;
  /** A challenge (its own rules and script). */
  scenario?: ScenarioId;
  /** A custom map's definition (built-in maps are known by id). */
  map?: MapDef;
}

/** Build a match from its spec: the one way matches are made, so a replay rebuilds the same one. */
export function createMatch(spec: MatchSpec): Game {
  if (spec.map) {
    const clean = cleanMapDef(spec.map);
    if (clean.ok) registerMap(clean.def);
  }
  const rules = spec.scenario && isScenario(spec.scenario) ? cleanRules({ ...DEFAULT_RULES, ...SCENARIOS[spec.scenario].rules }) : spec.rules ? cleanRules(spec.rules) : undefined;
  const game = Game.create(spec.seed, spec.mapId, spec.factions, rules);
  if (spec.scenario && isScenario(spec.scenario)) setupScenario(game, spec.scenario);
  spec.names.forEach((n, i) => {
    if (game.state.players[i]) game.player(i).name = n;
  });
  spec.incomeBonus.forEach((b, i) => {
    if (game.state.players[i]) game.player(i).incomeBonus = b;
  });
  return game;
}

export interface ReplayFile {
  format: typeof REPLAY_FORMAT;
  version: number;
  /** Game version that recorded it (shown when it no longer plays back the same). */
  gameVersion: string;
  savedAt: string;
  spec: MatchSpec;
  /** Whose match it was (the default point of view). */
  viewer: number;
  /** Last tick recorded. */
  ticks: number;
  outcome: { winner: number | null } | null;
  /** [tick, command], in the order they took effect. */
  commands: Array<[number, Command]>;
  /** [tick, state hash] every CHECK_TICKS ticks. */
  checks: Array<[number, string]>;
  /** Online, single player or a challenge: for the replay list. */
  kind: string;
}

/** The command log of a match in progress (also kept in saves, so a loaded match can still be replayed from its start). */
export interface ReplayLog {
  spec: MatchSpec;
  commands: Array<[number, Command]>;
  checks: Array<[number, string]>;
}

/** Records a match as it is played. */
export class Recorder {
  readonly log: ReplayLog;

  constructor(
    private game: Game,
    spec: MatchSpec,
    /** A log carried over from a save, to continue. */
    resume?: ReplayLog,
  ) {
    this.log = resume ?? { spec, commands: [], checks: [] };
    game.onApply = (tick, c) => this.log.commands.push([tick, JSON.parse(JSON.stringify(c)) as Command]);
  }

  /** Call after every simulation step (records the hash checkpoints). */
  afterStep(): void {
    const t = this.game.state.tick;
    if (t % CHECK_TICKS === 0 && !this.log.checks.some(([ct]) => ct === t)) this.log.checks.push([t, stateHash(this.game)]);
  }

  file(viewer: number, kind: string, gameVersion: string): ReplayFile {
    return {
      format: REPLAY_FORMAT,
      version: REPLAY_VERSION,
      gameVersion,
      savedAt: new Date().toISOString(),
      spec: this.log.spec,
      viewer,
      ticks: this.game.state.tick,
      outcome: this.game.state.outcome ? { winner: this.game.state.outcome.winner } : null,
      commands: this.log.commands,
      checks: this.log.checks,
      kind,
    };
  }
}

/** Plays a replay back: the same match, the same commands on the same ticks. */
export class ReplayPlayer {
  readonly game: Game;
  private next = 0;
  /** First tick at which the playback stopped matching the recording, if it did. */
  diverged: number | null = null;

  /** Game.issue as it was when created (the page may wrap it to turn players' clicks away). */
  private apply: (c: Command) => void;

  constructor(readonly replay: ReplayFile) {
    this.game = createMatch(replay.spec);
    this.apply = this.game.issue.bind(this.game);
  }

  get tick(): number {
    return this.game.state.tick;
  }

  get done(): boolean {
    return this.game.state.tick >= this.replay.ticks;
  }

  /** Run one tick: its commands, then the step. Returns false at the end. */
  step(): boolean {
    if (this.done) return false;
    const g = this.game;
    const cmds = this.replay.commands;
    while (this.next < cmds.length && cmds[this.next][0] === g.state.tick) this.apply(cmds[this.next++][1]);
    // Commands for ticks already past would mean a broken file: skip them.
    while (this.next < cmds.length && cmds[this.next][0] < g.state.tick) this.next++;
    g.step();
    const t = g.state.tick;
    if (this.diverged === null && t % CHECK_TICKS === 0) {
      const check = this.replay.checks.find(([ct]) => ct === t);
      if (check && check[1] !== stateHash(g)) this.diverged = t;
    }
    return true;
  }

  /** Run up to `n` ticks; returns how many ran. */
  run(n: number): number {
    let ran = 0;
    while (ran < n && this.step()) ran++;
    return ran;
  }
}

export type ParsedReplay = { ok: true; replay: ReplayFile } | { ok: false; reason: string };

/** Read a replay file; never throws. */
export function parseReplay(text: string): ParsedReplay {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'The file is damaged or is not a replay.' };
  }
  const r = raw as Partial<ReplayFile>;
  if (!r || typeof r !== 'object' || r.format !== REPLAY_FORMAT) return { ok: false, reason: 'This is not an Ironvale replay.' };
  if (typeof r.version !== 'number' || r.version > REPLAY_VERSION) return { ok: false, reason: 'This replay comes from a newer version of the game.' };
  const spec = r.spec as Partial<MatchSpec> | undefined;
  if (!spec || typeof spec.seed !== 'number' || typeof spec.mapId !== 'string' || !Array.isArray(spec.factions) || !Array.isArray(spec.names))
    return { ok: false, reason: 'The replay has no match setup.' };
  if (!Array.isArray(r.commands) || !Array.isArray(r.checks) || typeof r.ticks !== 'number') return { ok: false, reason: 'The replay is incomplete.' };
  return { ok: true, replay: { ...r, spec: { incomeBonus: [], ...spec } } as unknown as ReplayFile };
}
