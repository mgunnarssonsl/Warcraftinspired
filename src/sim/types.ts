// Serializable simulation state. Everything in GameState is plain data
// (numbers, strings, arrays, records) so JSON round-trips are lossless.
// Derived caches (navigation grid etc.) live outside it, in Game.

import type { BuildingType, UnitType } from './config';

export type ResourceKind = 'gold' | 'wood';
export type NodeType = 'goldmine' | 'tree';

export const TERRAIN = {
  grass: 0,
  dirt: 1,
  water: 2,
  rock: 3,
} as const;
export type Terrain = (typeof TERRAIN)[keyof typeof TERRAIN];

export function terrainBlocks(t: number): boolean {
  return t === TERRAIN.water || t === TERRAIN.rock;
}

export interface Vec {
  x: number;
  y: number;
}

/** Inclusive-exclusive tile rectangle [tx, tx+w) x [ty, ty+h). */
export interface Footprint {
  tx: number;
  ty: number;
  w: number;
  h: number;
}

export interface Player {
  id: number;
  name: string;
  color: string;
  gold: number;
  wood: number;
  /** Totals delivered over the match, for summaries and tests. */
  goldGathered: number;
  woodGathered: number;
}

export interface Carry {
  res: ResourceKind | null;
  amount: number;
}

export type MoveGoal =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'rect'; tx: number; ty: number; w: number; h: number };

export interface MoveState {
  goal: MoveGoal;
  path: Vec[];
  state: 'moving' | 'arrived' | 'failed';
  /** Position at the last progress check, for stuck detection. */
  checkX: number;
  checkY: number;
  checkTick: number;
  repaths: number;
  /** NavGrid.version the path was planned against (derived; -1 = replan). */
  navVersion: number;
}

export type GatherPhase = 'toNode' | 'waiting' | 'working' | 'toDropoff';

export type Order =
  | { type: 'move'; x: number; y: number }
  | {
      type: 'gather';
      /** Resource node to (re)visit; -1 = none, go idle after delivering. */
      nodeId: number;
      res: ResourceKind;
      phase: GatherPhase;
      timer: number;
      /** Where the last node was, to find replacement trees nearby. */
      lastX: number;
      lastY: number;
      /** Preferred drop-off building, or -1 for nearest. */
      dropoffId: number;
    };

interface EntityBase {
  id: number;
  owner: number; // player id, or -1 for neutral
  x: number; // center, in tiles
  y: number;
}

export interface Unit extends EntityBase {
  kind: 'unit';
  type: UnitType;
  hp: number;
  maxHp: number;
  radius: number;
  /** Previous-tick position, for render interpolation. */
  px: number;
  py: number;
  facing: number; // radians
  order: Order | null;
  move: MoveState | null;
  carry: Carry;
  /** True while inside a gold mine (not drawn, not clickable). */
  hidden: boolean;
}

export interface Building extends EntityBase, Footprint {
  kind: 'building';
  type: BuildingType;
  hp: number;
  maxHp: number;
}

export interface ResourceNode extends EntityBase, Footprint {
  kind: 'resource';
  type: NodeType;
  amount: number;
  maxAmount: number;
}

export type Entity = Unit | Building | ResourceNode;

export interface MapData {
  width: number;
  height: number;
  terrain: number[];
}

export interface GameState {
  seed: number;
  tick: number;
  nextId: number;
  rng: number;
  /** Bumped whenever tile passability changes (mirrors NavGrid.version). */
  navVersion: number;
  map: MapData;
  players: Player[];
  /** Keyed by id; integer keys iterate in ascending order (deterministic). */
  entities: Record<number, Entity>;
}

export type GameEvent =
  | { type: 'deliver'; player: number; res: ResourceKind; amount: number; x: number; y: number }
  | { type: 'mineDepleted'; player: number; x: number; y: number }
  | { type: 'treeFelled'; x: number; y: number }
  | { type: 'noDropoff'; player: number; x: number; y: number }
  | { type: 'chop'; x: number; y: number };
