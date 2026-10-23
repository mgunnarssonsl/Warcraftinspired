// Central balance and tuning values. Gameplay code reads numbers from here
// rather than hard-coding them, so tuning never requires touching logic.

export const TICK_RATE = 20; // simulation ticks per second
export const TICK_SECONDS = 1 / TICK_RATE;

/** Convert seconds of game time to whole simulation ticks (at least 1). */
export function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * TICK_RATE));
}

export const CONFIG = {
  match: {
    startGold: 500,
    startWood: 150,
    startWorkers: 5,
    /** Hard ceiling on population capacity, however many Farms exist. */
    maxPop: 100,
  },

  units: {
    worker: {
      name: 'Laborer',
      hp: 220,
      speed: 3.0, // tiles per second
      radius: 0.3, // tiles
      pop: 1,
      carryGold: 10,
      carryWood: 10,
      /** Seconds spent inside a mine to extract one load. */
      mineSeconds: 2.0,
      /** Seconds per swing at a tree; each swing yields woodPerChop. */
      chopSeconds: 0.6,
      woodPerChop: 1,
      cost: { gold: 75, wood: 0 },
      trainSeconds: 15,
      trainedAt: 'hq',
      requires: null,
      hotkey: 'Q',
      armor: 0,
      // Laborers fight only when ordered to (acquire 0: no auto-targeting).
      attack: { damage: 6, range: 0.4, cooldown: 1.6, windup: 0.45, acquire: 0, projectileSpeed: 0 },
    },
    guard: {
      name: 'Guard',
      hp: 420,
      speed: 2.7,
      radius: 0.35,
      pop: 2,
      cost: { gold: 135, wood: 0 },
      trainSeconds: 20,
      trainedAt: 'barracks',
      requires: null,
      hotkey: 'Q',
      armor: 2,
      attack: { damage: 14, range: 0.45, cooldown: 1.3, windup: 0.4, acquire: 6, projectileSpeed: 0 },
    },
    archer: {
      name: 'Archer',
      hp: 260,
      speed: 2.9,
      radius: 0.3,
      pop: 2,
      cost: { gold: 130, wood: 10 },
      trainSeconds: 18,
      trainedAt: 'barracks',
      /** Needs a completed Lumber Mill (bows need seasoned wood). */
      requires: 'lumbermill',
      hotkey: 'W',
      armor: 0,
      attack: { damage: 13, range: 5.5, cooldown: 1.5, windup: 0.45, acquire: 7, projectileSpeed: 12 },
    },
    // Hostile neutrals that guard expansions. Not trainable by anyone.
    brigand: {
      name: 'Brigand',
      hp: 300,
      speed: 2.6,
      radius: 0.35,
      pop: 0,
      cost: { gold: 0, wood: 0 },
      trainSeconds: 0,
      trainedAt: null,
      requires: null,
      hotkey: '',
      armor: 1,
      attack: { damage: 11, range: 0.45, cooldown: 1.4, windup: 0.4, acquire: 5, projectileSpeed: 0 },
    },
    poacher: {
      name: 'Poacher',
      hp: 200,
      speed: 2.6,
      radius: 0.3,
      pop: 0,
      cost: { gold: 0, wood: 0 },
      trainSeconds: 0,
      trainedAt: null,
      requires: null,
      hotkey: '',
      armor: 0,
      attack: { damage: 10, range: 5, cooldown: 1.7, windup: 0.5, acquire: 6, projectileSpeed: 11 },
    },
  },

  combat: {
    /** Damage multiplier is 1 / (1 + armor * armorFactor). */
    armorFactor: 0.06,
    /** Units that auto-engaged give up past this distance from where they started. */
    leash: 8,
    /** Neutral camp guards return home sooner. */
    campLeash: 6,
    /** Ticks between auto-acquire scans for idle units (staggered by id). */
    scanTicks: 5,
    /** Extra reach allowed when a swing lands, so a step back doesn't whiff. */
    swingSlack: 0.5,
    buildingArmor: 5,
  },

  production: {
    /**
     * Rules, applied identically to every player:
     * - Cost is paid when an item is queued; queuing fails if unaffordable.
     * - Population is reserved when an item starts training (reaches the
     *   front of the queue). If capacity is short, it waits at 0% until
     *   capacity frees up; nothing is lost.
     * - Cancelling any queued or in-progress item refunds cancelRefund.
     * - If a production building is destroyed, its whole queue is refunded
     *   at destroyedRefund.
     * - If capacity drops below usage (a Farm is lost), existing units stay;
     *   new training simply cannot start until usage is under capacity.
     */
    queueSize: 5,
    cancelRefund: 1,
    destroyedRefund: 1,
  },

  buildings: {
    hq: {
      name: 'Keep',
      hp: 1500,
      size: 4,
      popProvided: 10,
      accepts: ['gold', 'wood'] as const,
      cost: { gold: 385, wood: 205 },
      buildSeconds: 60,
      hotkey: 'K',
      attack: null,
    },
    farm: {
      name: 'Farm',
      hp: 400,
      size: 2,
      popProvided: 6,
      accepts: [] as const,
      cost: { gold: 80, wood: 20 },
      buildSeconds: 20,
      hotkey: 'F',
      attack: null,
    },
    barracks: {
      name: 'Barracks',
      hp: 1000,
      size: 3,
      popProvided: 0,
      accepts: [] as const,
      cost: { gold: 160, wood: 60 },
      buildSeconds: 45,
      hotkey: 'B',
      attack: null,
    },
    lumbermill: {
      name: 'Lumber Mill',
      hp: 600,
      size: 3,
      popProvided: 0,
      accepts: ['wood'] as const,
      cost: { gold: 120, wood: 0 },
      buildSeconds: 30,
      hotkey: 'L',
      attack: null,
    },
    tower: {
      name: 'Watch Tower',
      hp: 500,
      size: 2,
      popProvided: 0,
      accepts: [] as const,
      cost: { gold: 110, wood: 80 },
      buildSeconds: 35,
      hotkey: 'T',
      attack: { damage: 16, range: 7, cooldown: 1.2, windup: 0, acquire: 7, projectileSpeed: 14 },
    },
  },

  /**
   * Computer opponent profiles. Difficulty changes decision quality, timing
   * and aggression only: every profile pays the same costs, obeys the same
   * rules and receives no extra resources or information.
   */
  ai: {
    profiles: {
      easy: {
        thinkSeconds: 2.0,
        workerTarget: 11,
        barracksAtWorkers: 9,
        maxBarracks: 1,
        towers: 0,
        archerShare: 0.25,
        firstAttackSeconds: 540,
        waveSize: 4,
        waveGrowth: 2,
        expandSeconds: 900,
        /** Compare its army with the enemy's before launching a wave. */
        assessStrength: false,
        /** Simultaneous constructions it will manage. */
        builders: 1,
      },
      normal: {
        thinkSeconds: 1.0,
        workerTarget: 12,
        barracksAtWorkers: 8,
        maxBarracks: 2,
        towers: 1,
        archerShare: 0.4,
        firstAttackSeconds: 400,
        waveSize: 6,
        waveGrowth: 3,
        expandSeconds: 600,
        assessStrength: true,
        builders: 1,
      },
      hard: {
        thinkSeconds: 0.5,
        workerTarget: 13,
        barracksAtWorkers: 7,
        maxBarracks: 2,
        towers: 1,
        archerShare: 0.4,
        firstAttackSeconds: 300,
        waveSize: 7,
        waveGrowth: 3,
        expandSeconds: 420,
        assessStrength: true,
        builders: 2,
      },
    },
    /** Enemies this close to any of its buildings trigger defence. */
    defendRadius: 14,
    goldWorkersPerMine: 5,
    /** A wave falls back when reduced to this share of its launch size. */
    retreatShare: 0.35,
    /** Spare population it keeps ahead of demand before adding a Farm. */
    popBuffer: 4,
    /** Wood banked beyond this while gold-starved means: expand now. */
    woodSurplus: 600,
    /** Assessing players attack only with this strength advantage... */
    attackAdvantage: 1.15,
    /** ...unless the army is already this large (prevents endless turtling). */
    attackAnyway: 24,
  },

  construction: {
    /**
     * One construction model: a worker walks to the site; on arrival the cost
     * is paid and the foundation placed. A single active builder raises it;
     * if the builder leaves, construction pauses until a worker resumes it.
     */
    startHpFraction: 0.1,
    /** Share of the cost returned when an unfinished building is cancelled. */
    cancelRefund: 0.75,
  },

  resources: {
    goldmine: {
      name: 'Gold Mine',
      size: 3,
      /**
       * At most this many workers can be inside a mine at once. Extra workers
       * wait outside, so income from one mine saturates (diminishing returns).
       */
      maxMiners: 2,
    },
    tree: {
      name: 'Tree',
      wood: 50,
      /** At most this many workers chop the same tree simultaneously. */
      maxChoppers: 2,
    },
    /** Radius (tiles) a woodcutter searches for a replacement tree. */
    treeSearchRadius: 12,
  },

  /** Gold amounts for each mine role on the skirmish map. */
  mines: {
    start: 7000,
    small: 800,
    natural: 9000,
    far: 9000,
    center: 12000,
  },

  movement: {
    /** Distance (tiles) from a footprint at which a unit counts as adjacent. */
    reach: 0.85,
    /** Ticks without progress before a moving unit re-plans its path. */
    stuckTicks: 12,
    maxRepaths: 4,
  },
} as const;

export type UnitType = keyof typeof CONFIG.units;
export type BuildingType = keyof typeof CONFIG.buildings;
