// Serializable simulation state. Everything in GameState is plain data
// (numbers, strings, arrays, records) so JSON round-trips are lossless.
// Derived caches (navigation grid etc.) live outside it, in Game.

import type { AbilityId, AttackType, BuildingType, HeroType, ItemId, ResearchId, UnitType } from './config';

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
  /** Hostile neutral creeps: enemies of everyone, never win or lose. */
  neutral: boolean;
  defeated: boolean;
  stats: PlayerStats;
  /** Completed research (permanent for the match). */
  research: Partial<Record<ResearchId, boolean>>;
  /** The player's hero, once trained: kept while dead so it can be revived. */
  /** Every hero this player has raised, alive or awaiting revival. */
  heroes: HeroRecord[];
}

export interface HeroRecord {
  type: HeroType;
  unitId: number;
  alive: boolean;
  level: number;
  xp: number;
  /** Carried items, kept while the hero is dead (null = empty slot). */
  items: Array<ItemId | null>;
}

export interface HeroState {
  level: number;
  xp: number;
  mana: number;
  maxMana: number;
  /** Tick at which each ability is ready again. */
  ready: Partial<Record<AbilityId, number>>;
  /** Inventory slots (null = empty). */
  items: Array<ItemId | null>;
}

/**
 * Timed effects on a unit. cry: +amount damage share. mark: takes +amount
 * more damage. slow: moves and attacks amount slower. ward: +amount armor.
 */
export interface Buff {
  kind: 'cry' | 'mark' | 'slow' | 'ward';
  until: number;
  amount: number;
}

/** An item lying on the ground, waiting for a hero to pick it up. */
export interface GroundItem {
  id: number;
  type: ItemId;
  x: number;
  y: number;
}

/** A neutral camp: its guards and the item the last one drops. */
export interface Camp {
  level: number;
  x: number;
  y: number;
  drop: ItemId;
  cleared: boolean;
}

/** A temporary view of the map (Far Sight). */
export interface Reveal {
  owner: number;
  x: number;
  y: number;
  radius: number;
  until: number;
}

export interface PlayerStats {
  unitsTrained: number;
  unitsLost: number;
  /** Enemy units and buildings destroyed. */
  kills: number;
  buildingsBuilt: number;
  buildingsLost: number;
  /** Per type: units trained and buildings completed (for objectives and summaries). */
  trained: Partial<Record<UnitType, number>>;
  built: Partial<Record<BuildingType, number>>;
}

export function emptyStats(): PlayerStats {
  return { unitsTrained: 0, unitsLost: 0, kills: 0, buildingsBuilt: 0, buildingsLost: 0, trained: {}, built: {} };
}

export interface Outcome {
  /** Winning player, or null for a draw. */
  winner: number | null;
  tick: number;
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
  | {
      type: 'move';
      x: number;
      y: number;
      /** Group pace (tiles/s): a group ordered together moves at its slowest member's speed. */
      pace?: number;
    }
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
    }
  | {
      type: 'build';
      buildingType: BuildingType;
      tx: number;
      ty: number;
      /** Foundation entity once placed, else -1. */
      siteId: number;
      /** standby: another worker is already building this site. */
      phase: 'toSite' | 'building' | 'standby';
      /** Resource node to go back to afterwards (the previous job), or -1. */
      resumeNodeId: number;
    }
  | {
      type: 'attack';
      targetId: number;
      /** Engaged automatically (not ordered): leashed to the anchor point. */
      auto: boolean;
      anchorX: number;
      anchorY: number;
      /** Where the target was last seen (chased into the fog). */
      lastX: number;
      lastY: number;
    }
  | {
      type: 'attackMove';
      x: number;
      y: number;
      /** Enemy currently engaged on the way, or -1. */
      targetId: number;
      /** Group pace (tiles/s): a group ordered together moves at its slowest member's speed. */
      pace?: number;
    }
  | { type: 'hold'; targetId: number }
  | { type: 'cast'; ability: AbilityId; targetId: number; x: number; y: number }
  | { type: 'pickup'; itemId: number };

/** A Shift-queued instruction, turned into a real order when its turn comes. */
export type QueuedOrder =
  | { type: 'move'; x: number; y: number; pace?: number }
  | { type: 'attackMove'; x: number; y: number; pace?: number }
  | { type: 'attack'; targetId: number }
  | { type: 'gather'; nodeId: number }
  | { type: 'build'; buildingType: BuildingType; tx: number; ty: number }
  | { type: 'hold' };

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
  /** Shift-queued orders that run, in turn, once the current order ends. */
  orderQueue: QueuedOrder[];
  move: MoveState | null;
  carry: Carry;
  /** True while inside a gold mine (not drawn, not clickable). */
  hidden: boolean;
  /** Ticks until the next attack may start. */
  cooldown: number;
  /** Ticks left in the current attack wind-up (0 = not swinging). */
  swing: number;
  swingTarget: number;
  /** Home position for camp guards (neutral hostiles), else null. */
  home: Vec | null;
  /** Hero progression and mana; null for ordinary units. */
  hero: HeroState | null;
  /** Ticks of stun remaining: a stunned unit cannot act or move. */
  stun: number;
  buffs: Buff[];
  /** Index into GameState.camps for neutral camp guards, else -1. */
  camp: number;
  /** Mana of non-hero casters (Clerics); 0 for everyone else. */
  mana: number;
  /** Tick from which a Cleric's next prayer (heal) is ready. */
  prayerReady: number;
}

export interface Projectile {
  id: number;
  owner: number;
  sourceId: number;
  targetId: number;
  x: number;
  y: number;
  px: number;
  py: number;
  speed: number;
  damage: number;
  kind: 'arrow' | 'hammer' | 'bolt' | 'boulder';
  attackType: AttackType;
  /** Stun applied on hit, in ticks. */
  stun: number;
  /**
   * Area damage radius. A projectile with splash flies to a fixed ground
   * point (where the target stood at launch) instead of homing.
   */
  splash: number;
  tx: number;
  ty: number;
}

export interface Building extends EntityBase, Footprint {
  kind: 'building';
  type: BuildingType;
  hp: number;
  maxHp: number;
  /** Construction progress in [0, 1]; 1 = complete and functional. */
  progress: number;
  /** Training queue; the head trains first. */
  queue: QueueItem[];
  /** Where newly trained units go (and what they gather, if a resource). */
  rally: Rally | null;
  /** Defensive buildings: ticks until the next shot, and current target. */
  cooldown: number;
  targetId: number;
  /** Bitmask of players who have seen this building (fog of war memory). */
  seenBy: number;
  /** 2 once a Keep has been fortified to a Castle. */
  tier: number;
}

export interface QueueItem {
  /** Exactly one of unit / research is set. */
  unit: UnitType | null;
  research: ResearchId | null;
  /** Reviving the fallen hero rather than training a new one. */
  revive: boolean;
  /** What was paid (refunds use it) and how long it takes. */
  cost: { gold: number; wood: number };
  ticks: number;
  /** Training progress in [0, 1]. */
  progress: number;
  /** Population has been reserved (training has started). */
  started: boolean;
  /** Waiting for population capacity (the player has been told once). */
  blocked: boolean;
}

export interface Rally {
  x: number;
  y: number;
  /** Resource node to gather from on arrival (workers), or -1. */
  targetId: number;
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
  /** Ranged attacks in flight; damage lands on arrival. */
  projectiles: Projectile[];
  /** Set once the match is decided; play may continue for spectating. */
  outcome: Outcome | null;
  /** Elimination rules active (skirmishes); off in rule-test sandboxes. */
  victoryRules: boolean;
  /** Per player, per tile: 1 once ever seen (fog of war). */
  explored: number[][];
  /** Starting Keep centre per player: public map knowledge, like any 1v1 map. */
  starts: Vec[];
  /** Items lying on the map. */
  items: GroundItem[];
  camps: Camp[];
  /** Active Far Sight reveals. */
  reveals: Reveal[];
}

export type GameEvent =
  | { type: 'itemDropped'; id: number; item: ItemId; x: number; y: number }
  | { type: 'itemPicked'; player: number; hero: number; item: ItemId; x: number; y: number }
  | { type: 'itemUsed'; player: number; hero: number; item: ItemId; x: number; y: number }
  | { type: 'itemBought'; player: number; hero: number; item: ItemId }
  | { type: 'cantItem'; player: number; reason: string }
  | { type: 'campCleared'; level: number; x: number; y: number }
  | { type: 'teleport'; player: number; id: number; fromX: number; fromY: number; x: number; y: number }
  | { type: 'impact'; x: number; y: number; radius: number }
  | { type: 'heal'; player: number; id: number; source: number; amount: number; x: number; y: number }
  | { type: 'deliver'; player: number; res: ResourceKind; amount: number; x: number; y: number }
  | { type: 'mineDepleted'; player: number; x: number; y: number }
  | { type: 'treeFelled'; x: number; y: number }
  | { type: 'noDropoff'; player: number; x: number; y: number }
  | { type: 'chop'; x: number; y: number }
  | { type: 'buildingComplete'; player: number; id: number; x: number; y: number }
  | { type: 'cantBuild'; player: number; reason: string; x: number; y: number }
  | { type: 'constructionCancelled'; player: number; x: number; y: number }
  | { type: 'unitTrained'; player: number; id: number; x: number; y: number }
  | { type: 'popBlocked'; player: number; buildingId: number }
  | { type: 'cantTrain'; player: number; reason: string }
  | { type: 'cantCast'; player: number; reason: string }
  | { type: 'buildingDestroyed'; player: number; building: BuildingType; refundGold: number; refundWood: number; x: number; y: number }
  | { type: 'attack'; id: number }
  | { type: 'hit'; id: number; attacker: number; attackerOwner: number; owner: number; damage: number; x: number; y: number }
  | { type: 'death'; id: number; owner: number; unit: UnitType; x: number; y: number }
  | { type: 'playerDefeated'; player: number; reason: 'eliminated' | 'surrendered' }
  | { type: 'matchOver'; winner: number | null }
  | { type: 'researchComplete'; player: number; research: ResearchId }
  | { type: 'levelUp'; player: number; id: number; level: number; x: number; y: number }
  | { type: 'cast'; player: number; id: number; ability: AbilityId; targetId: number; x: number; y: number }
  | { type: 'bounty'; player: number; amount: number; x: number; y: number }
  | { type: 'heroFallen'; player: number; x: number; y: number };
