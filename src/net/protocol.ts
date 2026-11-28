// Online play: the messages between game clients and the match server, and
// the rules both sides share.
//
// Model: deterministic lockstep. Every player runs the same simulation from
// the same seed; only commands travel. Time is cut into turns of TURN_TICKS
// ticks. A client sends its commands for a turn `delay` turns ahead; the
// server waits for every player's submission for a turn, then broadcasts
// all of them together in slot order. A client runs a turn only once it has
// it, so every simulation applies the same commands on the same tick.
// The server never simulates: it orders, relays and checks shapes, and the
// (identical) simulations enforce the rules of the game.

import { CONFIG } from '../sim/config';
import type { Command } from '../sim/commands';
import { FACTIONS, type FactionId } from '../sim/factions';
import { MAPS, type MapDef } from '../sim/maps';
import type { MatchRules } from '../sim/rules';

export const PROTOCOL_VERSION = 3; // 2: elite units (skills, mounting, specialization); 3: upkeep, fragile expansions, raiding
/** Simulation ticks per lockstep turn (2 ticks = 100 ms). */
export const TURN_TICKS = 2;
export const TURN_MS = (TURN_TICKS * 1000) / 20;
/** Every this many turns, players compare state hashes (desync check). */
export const HASH_TURNS = 20;
/** Input delay bounds, in turns. */
export const MIN_DELAY = 2;
export const MAX_DELAY = 10;
/** How long a disconnected player's seat is kept before they forfeit. */
export const RECONNECT_GRACE_MS = 60_000;
/** Most commands one player may send in one turn. */
export const MAX_COMMANDS_PER_TURN = 32;

export interface Seat {
  name: string;
  faction: FactionId;
  ready: boolean;
  connected: boolean;
}

export interface RoomState {
  code: string;
  mapId: string;
  /** The host's custom map, if one is chosen (so guests can see it before the start). */
  map?: MapDef;
  rules: MatchRules;
  /** One entry per seat; null = open. Seat 0 is the host. */
  seats: Array<Seat | null>;
  started: boolean;
}

/** Everything needed to create the same match everywhere. */
export interface MatchSetup {
  seed: number;
  mapId: string;
  factions: FactionId[];
  names: string[];
  /** Custom match rules chosen by the host (absent = standard). */
  rules?: MatchRules;
  /** A custom map's definition (built-in maps are known by id). */
  map?: MapDef;
}

export interface Turn {
  turn: number;
  /** Every player's commands for this turn, in seat order. */
  cmds: Command[];
}

export type ClientMsg =
  | { t: 'create'; name: string; v: number }
  | { t: 'join'; code: string; name: string; v: number }
  | { t: 'rejoin'; code: string; token: string; v: number }
  | { t: 'leave' }
  /** A built-in map by id, or a custom one with its definition. */
  | { t: 'setMap'; mapId: string; map?: MapDef }
  | { t: 'setRules'; rules: MatchRules }
  | { t: 'pick'; faction: FactionId }
  | { t: 'ready'; ready: boolean }
  | { t: 'cmds'; turn: number; cmds: Command[] }
  | { t: 'hash'; turn: number; hash: string }
  | { t: 'over'; winner: number | null }
  | { t: 'pong'; at: number };

export type ServerMsg =
  | { t: 'room'; room: RoomState; seat: number; token: string }
  | { t: 'start'; setup: MatchSetup }
  /** Sent on rejoin (and to start a match): replay `log` from the start, then play on. */
  | { t: 'resume'; seat: number; setup: MatchSetup; log: Turn[]; completed: number; nextTurn: number; delay: number }
  | { t: 'turn'; turn: number; cmds: Command[] }
  | { t: 'delay'; turns: number; rtt: number[] }
  | { t: 'peer'; seat: number; state: 'connected' | 'disconnected' | 'forfeited'; graceMs?: number }
  | { t: 'desync'; turn: number; hashes: Array<string | null> }
  /** `rtt`: this player's last measured round trip to the server, in ms. */
  | { t: 'ping'; at: number; rtt: number }
  | { t: 'error'; reason: string };

/** Room codes: 5 letters without look-alikes (no I, L, O, 0, 1). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';

export function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20) : '';
  return s || 'Player';
}

// ---- command validation --------------------------------------------------------

const UNIT_TYPES = new Set(Object.keys(CONFIG.units));
const BUILDING_TYPES = new Set(Object.keys(CONFIG.buildings));
const RESEARCH = new Set(Object.keys(CONFIG.research));
const ABILITIES = new Set(Object.keys(CONFIG.hero.abilities));
const ITEMS = new Set(Object.keys(CONFIG.items));
const SKILLS = new Set(Object.keys(CONFIG.skills));
const SPECS = new Set(Object.keys(CONFIG.specialize));
const MAP_IDS = new Set(MAPS.map((m) => m.id));

const isInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && Math.abs(v) < 1e9;
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e6;
const isIds = (v: unknown) => Array.isArray(v) && v.length <= 400 && v.every(isInt);
const isBool = (v: unknown) => v === undefined || typeof v === 'boolean';

/**
 * Is this a well-formed command for `seat` to give? Shape only: the
 * simulation decides what is allowed in the game (it ignores orders to
 * someone else's units, unaffordable training and so on), identically for
 * every player. What it must never see is a malformed command, or one in
 * another player's name.
 */
export function validCommand(c: unknown, seat: number): c is Command {
  if (!c || typeof c !== 'object') return false;
  const o = c as Record<string, unknown>;
  if (o.player !== seat) return false;
  switch (o.type) {
    case 'move':
    case 'attackMove':
      return isIds(o.units) && isNum(o.x) && isNum(o.y) && isBool(o.queued);
    case 'gather':
      return isIds(o.units) && isInt(o.nodeId) && isBool(o.queued);
    case 'returnCargo':
      return isIds(o.units) && (o.dropoffId === undefined || isInt(o.dropoffId));
    case 'stop':
      return isIds(o.units);
    case 'attack':
      return isIds(o.units) && isInt(o.targetId) && isBool(o.queued);
    case 'hold':
      return isIds(o.units) && isBool(o.queued);
    case 'surrender':
      return true;
    case 'research':
      return isInt(o.buildingId) && RESEARCH.has(o.research as string);
    case 'cast':
      return isIds(o.units) && ABILITIES.has(o.ability as string) && isInt(o.targetId) && (o.x === undefined || isNum(o.x)) && (o.y === undefined || isNum(o.y));
    case 'pickup':
      return isIds(o.units) && isInt(o.itemId);
    case 'useItem':
    case 'dropItem':
      return isIds(o.units) && isInt(o.slot);
    case 'buyItem':
      return isInt(o.shopId) && isInt(o.heroId) && ITEMS.has(o.item as string);
    case 'flare':
      return isInt(o.buildingId) && isNum(o.x) && isNum(o.y);
    case 'build':
      return isIds(o.units) && BUILDING_TYPES.has(o.buildingType as string) && isInt(o.tx) && isInt(o.ty) && isBool(o.queued);
    case 'resumeBuild':
      return isIds(o.units) && isInt(o.buildingId);
    case 'repair':
      return isIds(o.units) && isInt(o.buildingId) && isBool(o.queued);
    case 'cancelBuild':
      return isInt(o.buildingId);
    case 'train':
      return isInt(o.buildingId) && UNIT_TYPES.has(o.unit as string);
    case 'cancelTrain':
      return isInt(o.buildingId) && isInt(o.index);
    case 'setRally':
      return isInt(o.buildingId) && isNum(o.x) && isNum(o.y) && isInt(o.targetId);
    case 'skill':
      return isIds(o.units) && SKILLS.has(o.skill as string) && isInt(o.targetId) && (o.x === undefined || isNum(o.x)) && (o.y === undefined || isNum(o.y));
    case 'mount':
      return isIds(o.units) && isInt(o.targetId);
    case 'dismount':
      return isIds(o.units);
    case 'specialize':
      return isIds(o.units) && SPECS.has(o.into as string);
    default:
      return false;
  }
}

export function validMap(id: unknown): id is string {
  return typeof id === 'string' && MAP_IDS.has(id);
}

export function validFaction(f: unknown): f is FactionId {
  return typeof f === 'string' && (FACTIONS as string[]).includes(f);
}
