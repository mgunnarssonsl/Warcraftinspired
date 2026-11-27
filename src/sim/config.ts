// Central balance and tuning values. Gameplay code reads numbers from here
// rather than hard-coding them, so tuning never requires touching logic.

export const TICK_RATE = 20; // simulation ticks per second
export const TICK_SECONDS = 1 / TICK_RATE;

/** Convert seconds of game time to whole simulation ticks (at least 1). */
export function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * TICK_RATE));
}

/** How an attack deals damage; see CONFIG.combat.typeTable. */
export type AttackType = 'normal' | 'pierce' | 'siege' | 'magic' | 'hero';
/** What a unit or building is protected by. */
export type ArmorType = 'light' | 'medium' | 'heavy' | 'fortified' | 'hero';

/** Relative weights of the soldier types a computer player aims to field. */
/** What an ability does (several abilities can share an effect with their own numbers). */
export type AbilityEffect = 'bolt' | 'rally' | 'heal' | 'area' | 'burn' | 'mark' | 'slow' | 'ward' | 'reveal';
export type ArmyMix = { guard: number; archer: number; lancer: number; cleric: number; mangonel: number };
/** How a strategic style shifts a difficulty profile (timings multiply, counts add). */
export type StyleAdjust = {
  attackTiming?: number;
  expandTiming?: number;
  castleTiming?: number;
  waveSize?: number;
  waveGrowth?: number;
  towers?: number;
  workerTarget?: number;
  maxKeeps?: number;
  creepParty?: number;
  mix?: ArmyMix;
  /** Sends small raiding parties at enemy Laborers between waves. */
  raids?: boolean;
  /** Builds its Hall of Valor before the Barracks and raises heroes first. */
  heroesEarly?: boolean;
  /** Saves for its second Keep before towers, a Blacksmith or more Barracks. */
  expandsFirst?: boolean;
};

export const CONFIG = {
  match: {
    /** How often (seconds) the match summary samples each player. */
    historySeconds: 30,
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
      /** Vision radius in tiles. */
      sight: 8,
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
      /** Research that must be complete (a tier), or null. */
      tech: null as string | null,
      hotkey: 'Q',
      armor: 0,
      armorType: 'medium' as ArmorType,
      /** Experience granted to the killer's nearby hero, and gold bounty to the killer. */
      xp: 15,
      bounty: 0,
      // Laborers fight only when ordered to (acquire 0: no auto-targeting).
      attack: { type: 'normal' as AttackType, damage: 6, range: 0.4, cooldown: 1.6, windup: 0.45, acquire: 0, projectileSpeed: 0, minRange: 0, splash: 0 },
    },
    guard: {
      name: 'Guard',
      hp: 420,
      speed: 2.7,
      radius: 0.35,
      /** Vision radius in tiles. */
      sight: 8,
      pop: 2,
      cost: { gold: 135, wood: 0 },
      trainSeconds: 20,
      trainedAt: 'barracks',
      requires: null,
      /** Research that must be complete (a tier), or null. */
      tech: null as string | null,
      hotkey: 'Q',
      armor: 2,
      armorType: 'heavy' as ArmorType,
      /** Experience granted to the killer's nearby hero, and gold bounty to the killer. */
      xp: 35,
      bounty: 0,
      attack: { type: 'normal' as AttackType, damage: 14, range: 0.45, cooldown: 1.3, windup: 0.4, acquire: 6, projectileSpeed: 0, minRange: 0, splash: 0 },
    },
    archer: {
      name: 'Archer',
      hp: 300,
      speed: 2.9,
      radius: 0.3,
      /** Vision radius in tiles. */
      sight: 9,
      pop: 2,
      cost: { gold: 130, wood: 10 },
      trainSeconds: 18,
      trainedAt: 'barracks',
      /** Needs a completed Lumber Mill (bows need seasoned wood). */
      requires: 'lumbermill',
      /** Research that must be complete (a tier), or null. */
      tech: null as string | null,
      hotkey: 'W',
      armor: 0,
      armorType: 'light' as ArmorType,
      /** Experience granted to the killer's nearby hero, and gold bounty to the killer. */
      xp: 35,
      bounty: 0,
      attack: { type: 'pierce' as AttackType, damage: 15, range: 5.5, cooldown: 1.5, windup: 0.45, acquire: 7, projectileSpeed: 12, minRange: 0, splash: 0 },
    },
    // A scout: fast, sharp-eyed, cheap; it does not pick fights.
    outrider: {
      name: 'Outrider',
      hp: 180,
      speed: 4.3,
      radius: 0.38,
      /** Vision radius in tiles. */
      sight: 12,
      pop: 1,
      cost: { gold: 70, wood: 0 },
      trainSeconds: 14,
      trainedAt: 'barracks',
      requires: null,
      /** Research that must be complete (a tier), or null. */
      tech: null as string | null,
      hotkey: 'R',
      armor: 0,
      armorType: 'light' as ArmorType,
      /** Experience granted to the killer's nearby hero, and gold bounty to the killer. */
      xp: 15,
      bounty: 0,
      attack: { type: 'normal' as AttackType, damage: 5, range: 0.4, cooldown: 1.5, windup: 0.3, acquire: 0, projectileSpeed: 0, minRange: 0, splash: 0 },
    },
    // ---- tier II (requires Fortify to Castle) ----
    lancer: {
      name: 'Lancer',
      hp: 560,
      speed: 3.6,
      radius: 0.45,
      /** Vision radius in tiles. */
      sight: 9,
      pop: 3,
      cost: { gold: 195, wood: 40 },
      trainSeconds: 28,
      trainedAt: 'barracks',
      /** Horses need shoeing: a completed Blacksmith. */
      requires: 'smithy',
      /** Research that must be complete (a tier), or null. */
      tech: 'castle' as string | null,
      hotkey: 'E',
      armor: 2,
      armorType: 'medium' as ArmorType,
      /** Experience granted to the killer's nearby hero, and gold bounty to the killer. */
      xp: 55,
      bounty: 0,
      attack: { type: 'normal' as AttackType, damage: 17, range: 0.5, cooldown: 1.5, windup: 0.35, acquire: 7, projectileSpeed: 0, minRange: 0, splash: 0 },
    },
    cleric: {
      name: 'Cleric',
      hp: 280,
      speed: 2.7,
      radius: 0.3,
      /** Vision radius in tiles. */
      sight: 9,
      pop: 2,
      cost: { gold: 140, wood: 30 },
      trainSeconds: 24,
      trainedAt: 'chapel',
      requires: null,
      /** Research that must be complete (a tier), or null. */
      tech: 'castle' as string | null,
      hotkey: 'Q',
      armor: 0,
      armorType: 'light' as ArmorType,
      /** Experience granted to the killer's nearby hero, and gold bounty to the killer. */
      xp: 45,
      bounty: 0,
      attack: { type: 'magic' as AttackType, damage: 8, range: 4.5, cooldown: 1.8, windup: 0.4, acquire: 7, projectileSpeed: 10, minRange: 0, splash: 0 },
    },
    mangonel: {
      name: 'Mangonel',
      hp: 420,
      speed: 2.3,
      /** Under half a tile, like every unit: any free tile fits it, and paths through one-tile gaps work. */
      radius: 0.45,
      /** Vision radius in tiles. */
      sight: 9,
      pop: 2,
      cost: { gold: 180, wood: 90 },
      trainSeconds: 35,
      trainedAt: 'workshop',
      requires: null,
      /** Research that must be complete (a tier), or null. */
      tech: 'castle' as string | null,
      hotkey: 'Q',
      armor: 1,
      armorType: 'medium' as ArmorType,
      /** Experience granted to the killer's nearby hero, and gold bounty to the killer. */
      xp: 55,
      bounty: 0,
      // A boulder lands where the target stood at launch: moving units can
      // dodge it. Damage splashes (full at the centre, half at the edge) and
      // nothing closer than minRange can be hit.
      attack: { type: 'siege' as AttackType, damage: 45, range: 8, cooldown: 4.0, windup: 0.6, acquire: 8, projectileSpeed: 8, minRange: 2, splash: 1.2 },
    },
    // ---- Thornwild (the second faction): cheaper, lighter, regenerating ----
    // Tenders plant buildings that grow on their own, and never fell a tree.
    tender: {
      name: 'Tender',
      hp: 200,
      speed: 3.0,
      radius: 0.3,
      sight: 8,
      pop: 1,
      carryGold: 10,
      carryWood: 10,
      mineSeconds: 2.0,
      /** Tenders coax wood from living trees: slower, but the tree is never used up. */
      chopSeconds: 0.85,
      woodPerChop: 1,
      cost: { gold: 70, wood: 0 },
      trainSeconds: 15,
      trainedAt: 'heartwood',
      requires: null,
      tech: null as string | null,
      hotkey: 'Q',
      armor: 0,
      armorType: 'medium' as ArmorType,
      xp: 15,
      bounty: 0,
      attack: { type: 'normal' as AttackType, damage: 5, range: 0.4, cooldown: 1.6, windup: 0.45, acquire: 0, projectileSpeed: 0, minRange: 0, splash: 0 },
    },
    thornguard: {
      name: 'Thornguard',
      hp: 340,
      speed: 2.8,
      radius: 0.35,
      sight: 8,
      pop: 2,
      cost: { gold: 100, wood: 35 },
      trainSeconds: 18,
      trainedAt: 'den',
      requires: null,
      tech: null as string | null,
      hotkey: 'Q',
      armor: 1,
      armorType: 'heavy' as ArmorType,
      xp: 30,
      bounty: 0,
      attack: { type: 'normal' as AttackType, damage: 13, range: 0.45, cooldown: 1.3, windup: 0.4, acquire: 6, projectileSpeed: 0, minRange: 0, splash: 0 },
    },
    slinger: {
      name: 'Briar Slinger',
      hp: 250,
      speed: 2.9,
      radius: 0.3,
      sight: 9,
      pop: 2,
      cost: { gold: 90, wood: 45 },
      trainSeconds: 17,
      trainedAt: 'den',
      requires: 'saplodge',
      tech: null as string | null,
      hotkey: 'W',
      armor: 0,
      armorType: 'light' as ArmorType,
      xp: 30,
      bounty: 0,
      attack: { type: 'pierce' as AttackType, damage: 13, range: 6, cooldown: 1.5, windup: 0.45, acquire: 7, projectileSpeed: 12, minRange: 0, splash: 0 },
    },
    fox: {
      name: 'Fox Scout',
      hp: 160,
      speed: 4.6,
      radius: 0.32,
      sight: 12,
      pop: 1,
      cost: { gold: 60, wood: 0 },
      trainSeconds: 12,
      trainedAt: 'den',
      requires: null,
      tech: null as string | null,
      hotkey: 'R',
      armor: 0,
      armorType: 'light' as ArmorType,
      xp: 12,
      bounty: 0,
      attack: { type: 'normal' as AttackType, damage: 4, range: 0.4, cooldown: 1.4, windup: 0.3, acquire: 0, projectileSpeed: 0, minRange: 0, splash: 0 },
    },
    stagrider: {
      name: 'Stag Rider',
      hp: 520,
      speed: 3.8,
      radius: 0.45,
      sight: 9,
      pop: 3,
      cost: { gold: 150, wood: 85 },
      trainSeconds: 26,
      trainedAt: 'den',
      requires: 'barkweaver',
      tech: 'deepwood' as string | null,
      hotkey: 'E',
      armor: 1,
      armorType: 'medium' as ArmorType,
      xp: 50,
      bounty: 0,
      attack: { type: 'normal' as AttackType, damage: 15, range: 0.5, cooldown: 1.4, windup: 0.35, acquire: 7, projectileSpeed: 0, minRange: 0, splash: 0 },
    },
    mender: {
      name: 'Mender',
      hp: 260,
      speed: 2.8,
      radius: 0.3,
      sight: 9,
      pop: 2,
      cost: { gold: 110, wood: 55 },
      trainSeconds: 22,
      trainedAt: 'moonwell',
      requires: null,
      tech: 'deepwood' as string | null,
      hotkey: 'Q',
      armor: 0,
      armorType: 'light' as ArmorType,
      xp: 40,
      bounty: 0,
      attack: { type: 'magic' as AttackType, damage: 7, range: 4.5, cooldown: 1.8, windup: 0.4, acquire: 7, projectileSpeed: 10, minRange: 0, splash: 0 },
    },
    // A walking treant: crushes buildings up close, slow enough to kite.
    rootcrusher: {
      name: 'Rootcrusher',
      hp: 700,
      speed: 1.8,
      radius: 0.45,
      sight: 8,
      pop: 3,
      cost: { gold: 150, wood: 150 },
      trainSeconds: 34,
      trainedAt: 'rootpit',
      requires: null,
      tech: 'deepwood' as string | null,
      hotkey: 'Q',
      armor: 2,
      armorType: 'medium' as ArmorType,
      xp: 55,
      bounty: 0,
      attack: { type: 'siege' as AttackType, damage: 40, range: 0.6, cooldown: 2.6, windup: 0.6, acquire: 6, projectileSpeed: 0, minRange: 0, splash: 0 },
    },
    // Hostile neutrals that guard expansions. Not trainable by anyone.
    brigand: {
      name: 'Brigand',
      hp: 300,
      speed: 2.6,
      radius: 0.35,
      /** Vision radius in tiles. */
      sight: 7,
      pop: 0,
      cost: { gold: 0, wood: 0 },
      trainSeconds: 0,
      trainedAt: null,
      requires: null,
      /** Research that must be complete (a tier), or null. */
      tech: null as string | null,
      hotkey: '',
      armor: 1,
      armorType: 'medium' as ArmorType,
      /** Experience granted to the killer's nearby hero, and gold bounty to the killer. */
      xp: 40,
      bounty: 25,
      attack: { type: 'normal' as AttackType, damage: 11, range: 0.45, cooldown: 1.4, windup: 0.4, acquire: 5, projectileSpeed: 0, minRange: 0, splash: 0 },
    },
    poacher: {
      name: 'Poacher',
      hp: 200,
      speed: 2.6,
      radius: 0.3,
      /** Vision radius in tiles. */
      sight: 8,
      pop: 0,
      cost: { gold: 0, wood: 0 },
      trainSeconds: 0,
      trainedAt: null,
      requires: null,
      /** Research that must be complete (a tier), or null. */
      tech: null as string | null,
      hotkey: '',
      armor: 0,
      armorType: 'light' as ArmorType,
      /** Experience granted to the killer's nearby hero, and gold bounty to the killer. */
      xp: 30,
      bounty: 20,
      attack: { type: 'pierce' as AttackType, damage: 10, range: 5, cooldown: 1.7, windup: 0.5, acquire: 6, projectileSpeed: 11, minRange: 0, splash: 0 },
    },
    chief: {
      name: 'Brigand Chief',
      hp: 650,
      speed: 2.6,
      radius: 0.45,
      sight: 8,
      pop: 0,
      cost: { gold: 0, wood: 0 },
      trainSeconds: 0,
      trainedAt: null,
      requires: null,
      /** Research that must be complete (a tier), or null. */
      tech: null as string | null,
      hotkey: '',
      armor: 3,
      armorType: 'heavy' as ArmorType,
      xp: 90,
      bounty: 60,
      attack: { type: 'normal' as AttackType, damage: 20, range: 0.5, cooldown: 1.6, windup: 0.45, acquire: 6, projectileSpeed: 0, minRange: 0, splash: 0 },
    },
    hero: {
      name: 'Marshal',
      hp: 650,
      speed: 3.0,
      radius: 0.4,
      sight: 10,
      pop: 3,
      cost: { gold: 250, wood: 50 },
      trainSeconds: 30,
      trainedAt: 'altar',
      requires: null,
      /** Research that must be complete (a tier), or null. */
      tech: null as string | null,
      hotkey: 'Q',
      armor: 3,
      armorType: 'hero' as ArmorType,
      xp: 0, // a slain hero is worth CONFIG.hero.killXpPerLevel x level
      bounty: 0,
      attack: { type: 'hero' as AttackType, damage: 22, range: 0.5, cooldown: 1.5, windup: 0.4, acquire: 7, projectileSpeed: 0, minRange: 0, splash: 0 },
    },
    ranger: {
      name: 'Pathfinder',
      hp: 540,
      speed: 3.1,
      radius: 0.4,
      sight: 11,
      pop: 3,
      cost: { gold: 250, wood: 50 },
      trainSeconds: 30,
      trainedAt: 'altar',
      requires: null,
      /** Research that must be complete (a tier), or null. */
      tech: null as string | null,
      hotkey: 'W',
      armor: 1,
      armorType: 'hero' as ArmorType,
      xp: 0,
      bounty: 0,
      attack: { type: 'hero' as AttackType, damage: 19, range: 6, cooldown: 1.4, windup: 0.4, acquire: 8, projectileSpeed: 13, minRange: 0, splash: 0 },
    },
    sage: {
      name: 'Sage',
      hp: 580,
      speed: 2.9,
      radius: 0.4,
      sight: 10,
      pop: 3,
      cost: { gold: 250, wood: 50 },
      trainSeconds: 30,
      trainedAt: 'altar',
      requires: null,
      /** Research that must be complete (a tier), or null. */
      tech: null as string | null,
      hotkey: 'E',
      armor: 2,
      armorType: 'hero' as ArmorType,
      xp: 0,
      bounty: 0,
      attack: { type: 'hero' as AttackType, damage: 19, range: 5.5, cooldown: 1.6, windup: 0.4, acquire: 7, projectileSpeed: 11, minRange: 0, splash: 0 },
    },
    // Thornwild heroes (Elder Circle).
    warden: {
      name: 'Thorn Warden',
      hp: 700,
      speed: 2.9,
      radius: 0.4,
      sight: 10,
      pop: 3,
      cost: { gold: 240, wood: 60 },
      trainSeconds: 30,
      trainedAt: 'circle',
      requires: null,
      tech: null as string | null,
      hotkey: 'Q',
      armor: 4,
      armorType: 'hero' as ArmorType,
      xp: 0,
      bounty: 0,
      attack: { type: 'hero' as AttackType, damage: 20, range: 0.5, cooldown: 1.5, windup: 0.4, acquire: 7, projectileSpeed: 0, minRange: 0, splash: 0 },
    },
    huntress: {
      name: 'Huntress',
      hp: 520,
      speed: 3.3,
      radius: 0.4,
      sight: 11,
      pop: 3,
      cost: { gold: 240, wood: 60 },
      trainSeconds: 30,
      trainedAt: 'circle',
      requires: null,
      tech: null as string | null,
      hotkey: 'W',
      armor: 1,
      armorType: 'hero' as ArmorType,
      xp: 0,
      bounty: 0,
      attack: { type: 'hero' as AttackType, damage: 18, range: 6.5, cooldown: 1.35, windup: 0.4, acquire: 8, projectileSpeed: 13, minRange: 0, splash: 0 },
    },
    speaker: {
      name: 'Grove Speaker',
      hp: 560,
      speed: 2.9,
      radius: 0.4,
      sight: 10,
      pop: 3,
      cost: { gold: 240, wood: 60 },
      trainSeconds: 30,
      trainedAt: 'circle',
      requires: null,
      tech: null as string | null,
      hotkey: 'E',
      armor: 1,
      armorType: 'hero' as ArmorType,
      xp: 0,
      bounty: 0,
      attack: { type: 'hero' as AttackType, damage: 17, range: 5.5, cooldown: 1.6, windup: 0.4, acquire: 7, projectileSpeed: 11, minRange: 0, splash: 0 },
    },
    // Neutral creeps (camp guards). Not trainable by anyone.
    wolf: {
      name: 'Timber Wolf',
      hp: 220,
      speed: 3.4,
      radius: 0.35,
      sight: 8,
      pop: 0,
      cost: { gold: 0, wood: 0 },
      trainSeconds: 0,
      trainedAt: null,
      requires: null,
      /** Research that must be complete (a tier), or null. */
      tech: null as string | null,
      hotkey: '',
      armor: 0,
      armorType: 'medium' as ArmorType,
      xp: 25,
      bounty: 12,
      attack: { type: 'normal' as AttackType, damage: 9, range: 0.4, cooldown: 1.2, windup: 0.3, acquire: 5, projectileSpeed: 0, minRange: 0, splash: 0 },
    },
    brute: {
      name: 'Bog Brute',
      hp: 1100,
      speed: 2.4,
      radius: 0.48,
      sight: 8,
      pop: 0,
      cost: { gold: 0, wood: 0 },
      trainSeconds: 0,
      trainedAt: null,
      requires: null,
      /** Research that must be complete (a tier), or null. */
      tech: null as string | null,
      hotkey: '',
      armor: 3,
      armorType: 'heavy' as ArmorType,
      xp: 140,
      bounty: 90,
      attack: { type: 'normal' as AttackType, damage: 30, range: 0.55, cooldown: 1.9, windup: 0.5, acquire: 6, projectileSpeed: 0, minRange: 0, splash: 0 },
    },
  },

  /**
   * The hero. One per player (alive, training or awaiting revival). Gains
   * experience when its owner kills enemies within xpRadius of it, levels up
   * to maxLevel, and grows stronger per level. A fallen hero keeps its level
   * and can be revived at an Altar for a level-scaled cost and time.
   */
  /**
   * Heroes. Rules shared by every hero type; per-type numbers are in
   * CONFIG.heroTypes. A player may have 1 hero, 2 once fortified to a Castle,
   * each of a different type. A hero gains experience when its owner kills
   * enemies within xpRadius of it (shared among heroes there), levels up to
   * maxLevel, and grows stronger per level. Neutral kills give less
   * experience to higher-level heroes (creepXpFactor), so creeping alone
   * cannot max a hero. A fallen hero keeps its level, experience and items,
   * and can be revived at the Hall of Valor for a level-scaled cost and time.
   */
  hero: {
    maxLevel: 5,
    /** Total experience needed for each level (index 0 = level 1). */
    xpForLevel: [0, 200, 500, 900, 1400],
    xpRadius: 12,
    killXpPerLevel: 60,
    /** Share of neutral-kill experience by hero level (index 0 = level 1). */
    creepXpFactor: [1, 0.8, 0.65, 0.5, 0.4],
    /** Heroes allowed: one, plus one more with Fortify to Castle. */
    maxHeroes: 1,
    maxHeroesCastle: 2,
    inventorySize: 3,
    revive: { goldBase: 100, goldPerLevel: 50, secondsBase: 20, secondsPerLevel: 5 },
    /**
     * Every ability lists the same fields. Per-rank arrays: rank 1 at levels
     * 1-2, 2 at 3-4, 3 at 5. target: 'enemy' / 'ally' (a unit), 'point'
     * (ground) or 'none' (around the hero).
     */
    abilities: {
      hammer: {
        effect: 'bolt' as AbilityEffect,
        name: 'Stormhammer', hero: 'hero', hotkey: 'Q', learnLevel: 1, target: 'enemy', range: 6, radius: 0, mana: 75, cooldown: 10,
        damage: [90, 140, 190], stun: [1.5, 2, 2.5], duration: [0, 0, 0], bonus: [0, 0, 0], heal: [0, 0, 0], projectileSpeed: 14,
        desc: 'Hurls a hammer that damages and stuns an enemy unit.',
      },
      cry: {
        effect: 'rally' as AbilityEffect,
        name: 'Battle Cry', hero: 'hero', hotkey: 'W', learnLevel: 2, target: 'none', range: 0, radius: 8, mana: 60, cooldown: 30,
        damage: [0, 0, 0], stun: [0, 0, 0], duration: [12, 12, 12], bonus: [0.15, 0.25, 0.35], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'Nearby allies deal more damage for a while.',
      },
      mend: {
        effect: 'heal' as AbilityEffect,
        name: 'Mend', hero: 'hero', hotkey: 'E', learnLevel: 3, target: 'ally', range: 6, radius: 0, mana: 50, cooldown: 8,
        damage: [0, 0, 0], stun: [0, 0, 0], duration: [0, 0, 0], bonus: [0, 0, 0], heal: [150, 225, 300], projectileSpeed: 0,
        desc: 'Heals one of your units.',
      },
      volley: {
        effect: 'area' as AbilityEffect,
        name: 'Volley', hero: 'ranger', hotkey: 'Q', learnLevel: 1, target: 'point', range: 8, radius: 2.5, mana: 70, cooldown: 12,
        damage: [70, 105, 140], stun: [0, 0, 0], duration: [0, 0, 0], bonus: [0, 0, 0], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'A rain of arrows damages every enemy unit in an area.',
      },
      mark: {
        effect: 'mark' as AbilityEffect,
        name: "Hunter's Mark", hero: 'ranger', hotkey: 'W', learnLevel: 2, target: 'enemy', range: 8, radius: 0, mana: 40, cooldown: 14,
        damage: [0, 0, 0], stun: [0, 0, 0], duration: [10, 12, 14], bonus: [0.2, 0.3, 0.4], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'The marked enemy takes extra damage from every source.',
      },
      farsight: {
        effect: 'reveal' as AbilityEffect,
        name: 'Far Sight', hero: 'ranger', hotkey: 'E', learnLevel: 3, target: 'point', range: 999, radius: 9, mana: 50, cooldown: 30,
        damage: [0, 0, 0], stun: [0, 0, 0], duration: [10, 14, 18], bonus: [0, 0, 0], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'Reveals any spot on the map for a while.',
      },
      flame: {
        effect: 'burn' as AbilityEffect,
        name: 'Flame Burst', hero: 'sage', hotkey: 'Q', learnLevel: 1, target: 'point', range: 7, radius: 2.5, mana: 80, cooldown: 8,
        damage: [95, 145, 195], stun: [0, 0, 0], duration: [0, 0, 0], bonus: [0, 0, 0], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'Fire erupts at a spot, burning enemy units and buildings there.',
      },
      slow: {
        effect: 'slow' as AbilityEffect,
        name: 'Slow', hero: 'sage', hotkey: 'W', learnLevel: 2, target: 'enemy', range: 7, radius: 0, mana: 35, cooldown: 9,
        damage: [0, 0, 0], stun: [0, 0, 0], duration: [6, 8, 10], bonus: [0.4, 0.5, 0.6], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'An enemy unit moves and attacks much more slowly.',
      },
      ward: {
        effect: 'ward' as AbilityEffect,
        name: 'Arcane Ward', hero: 'sage', hotkey: 'E', learnLevel: 3, target: 'ally', range: 6, radius: 0, mana: 55, cooldown: 12,
        damage: [0, 0, 0], stun: [0, 0, 0], duration: [15, 15, 15], bonus: [5, 8, 11], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'Shields one of your units with extra armor.',
      },
      entangle: {
        effect: 'bolt' as AbilityEffect,
        name: 'Entangle', hero: 'warden', hotkey: 'Q', learnLevel: 1, target: 'enemy', range: 5, radius: 0, mana: 70, cooldown: 11,
        damage: [60, 100, 140], stun: [1.75, 2.25, 2.75], duration: [0, 0, 0], bonus: [0, 0, 0], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'Roots burst from the ground: an enemy unit is held fast and hurt.',
      },
      barkskin: {
        effect: 'ward' as AbilityEffect,
        name: 'Barkskin', hero: 'warden', hotkey: 'W', learnLevel: 2, target: 'ally', range: 6, radius: 0, mana: 50, cooldown: 12,
        damage: [0, 0, 0], stun: [0, 0, 0], duration: [15, 15, 15], bonus: [4, 6, 8], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'Covers one of your units in bark: extra armor for a while.',
      },
      howl: {
        effect: 'rally' as AbilityEffect,
        name: 'Wild Howl', hero: 'warden', hotkey: 'E', learnLevel: 3, target: 'none', range: 0, radius: 8, mana: 65, cooldown: 30,
        damage: [0, 0, 0], stun: [0, 0, 0], duration: [12, 12, 12], bonus: [0.15, 0.25, 0.35], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'Nearby allies fight harder for a while.',
      },
      thornrain: {
        effect: 'area' as AbilityEffect,
        name: 'Thorn Rain', hero: 'huntress', hotkey: 'Q', learnLevel: 1, target: 'point', range: 8, radius: 2.5, mana: 70, cooldown: 12,
        damage: [65, 100, 135], stun: [0, 0, 0], duration: [0, 0, 0], bonus: [0, 0, 0], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'A shower of thorns damages every enemy unit in an area.',
      },
      snare: {
        effect: 'slow' as AbilityEffect,
        name: 'Snare', hero: 'huntress', hotkey: 'W', learnLevel: 2, target: 'enemy', range: 8, radius: 0, mana: 35, cooldown: 10,
        damage: [0, 0, 0], stun: [0, 0, 0], duration: [6, 8, 10], bonus: [0.35, 0.45, 0.55], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'A snared enemy moves and attacks more slowly.',
      },
      owl: {
        effect: 'reveal' as AbilityEffect,
        name: 'Owl Eyes', hero: 'huntress', hotkey: 'E', learnLevel: 3, target: 'point', range: 999, radius: 9, mana: 50, cooldown: 30,
        damage: [0, 0, 0], stun: [0, 0, 0], duration: [10, 14, 18], bonus: [0, 0, 0], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'An owl reveals any spot on the map for a while.',
      },
      swarm: {
        effect: 'burn' as AbilityEffect,
        name: 'Swarm', hero: 'speaker', hotkey: 'Q', learnLevel: 1, target: 'point', range: 7, radius: 2.5, mana: 80, cooldown: 8,
        damage: [90, 140, 190], stun: [0, 0, 0], duration: [0, 0, 0], bonus: [0, 0, 0], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'Stinging insects swarm a spot, hurting enemy units and buildings there.',
      },
      wither: {
        effect: 'mark' as AbilityEffect,
        name: 'Wither', hero: 'speaker', hotkey: 'W', learnLevel: 2, target: 'enemy', range: 8, radius: 0, mana: 40, cooldown: 14,
        damage: [0, 0, 0], stun: [0, 0, 0], duration: [10, 12, 14], bonus: [0.2, 0.3, 0.4], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'The withered enemy takes extra damage from every source.',
      },
      regrowth: {
        effect: 'heal' as AbilityEffect,
        name: 'Regrowth', hero: 'speaker', hotkey: 'E', learnLevel: 3, target: 'ally', range: 6, radius: 0, mana: 50, cooldown: 8,
        damage: [0, 0, 0], stun: [0, 0, 0], duration: [0, 0, 0], bonus: [0, 0, 0], heal: [150, 225, 300], projectileSpeed: 0,
        desc: 'Heals one of your units.',
      },
    },
  },

  /**
   * Items. Heroes carry up to CONFIG.hero.inventorySize, keep them through
   * death and revival, and can drop them for another hero. Permanent items
   * work while carried; consumables are used up. Tier decides where they
   * come from: camp drops (by camp level) and the neutral Trading Posts.
   */
  items: {
    blade: { name: 'Keen Blade', tier: 1, price: 160, hotkey: 'Q', consumable: false, damage: 4, armor: 0, hp: 0, mana: 0, speed: 0, heal: 0, restore: 0, desc: '+4 attack damage.' },
    mail: { name: 'Ringmail Vest', tier: 1, price: 160, hotkey: 'W', consumable: false, damage: 0, armor: 3, hp: 0, mana: 0, speed: 0, heal: 0, restore: 0, desc: '+3 armor.' },
    charm: { name: 'Charm of Vigor', tier: 1, price: 160, hotkey: 'E', consumable: false, damage: 0, armor: 0, hp: 150, mana: 0, speed: 0, heal: 0, restore: 0, desc: '+150 maximum health.' },
    draught: { name: 'Healing Draught', tier: 1, price: 75, hotkey: 'R', consumable: true, damage: 0, armor: 0, hp: 0, mana: 0, speed: 0, heal: 300, restore: 0, desc: 'Use: the hero regains 300 health.' },
    tonic: { name: 'Mana Tonic', tier: 1, price: 60, hotkey: 'T', consumable: true, damage: 0, armor: 0, hp: 0, mana: 0, speed: 0, heal: 0, restore: 150, desc: 'Use: the hero regains 150 mana.' },
    scroll: { name: 'Scroll of Return', tier: 1, price: 100, hotkey: 'Y', consumable: true, damage: 0, armor: 0, hp: 0, mana: 0, speed: 0, heal: 0, restore: 0, desc: 'Use: the hero returns at once to your nearest Keep.' },
    salve: { name: 'Mending Salve', tier: 1, price: 125, hotkey: 'D', consumable: true, damage: 0, armor: 0, hp: 0, mana: 0, speed: 0, heal: 150, restore: 0, desc: 'Use: your units within 6 tiles regain 150 health.' },
    // Tier 2: only from the hardest camps.
    boots: { name: 'Swift Boots', tier: 2, price: 0, hotkey: '', consumable: false, damage: 0, armor: 0, hp: 0, mana: 0, speed: 0.6, heal: 0, restore: 0, desc: '+0.6 movement speed.' },
    gauntlets: { name: 'Gauntlets of Might', tier: 2, price: 0, hotkey: '', consumable: false, damage: 9, armor: 0, hp: 0, mana: 0, speed: 0, heal: 0, restore: 0, desc: '+9 attack damage.' },
    circlet: { name: "Seer's Circlet", tier: 2, price: 0, hotkey: '', consumable: false, damage: 0, armor: 0, hp: 0, mana: 120, speed: 0, heal: 0, restore: 0, desc: '+120 maximum mana.' },
  },

  /**
   * Neutral camps guard mines (and lairs guard treasure). Level sets their
   * strength and what the last guard drops when the camp is wiped out:
   * level 1 a consumable, level 2 a tier-1 item, level 3 a tier-2 item.
   * Mirrored camps drop the same item.
   */
  /** Guards by camp level. Maps decide where camps of each level stand. */
  campLevels: {
    1: ['brigand', 'wolf'],
    2: ['chief', 'brigand', 'poacher'],
    3: ['brute', 'chief', 'poacher'],
  },
  /** Treasure lairs (camps with no mine) drop one tier better than their level. */
  lairGuards: {
    2: ['chief', 'wolf', 'wolf', 'poacher'],
    3: ['brute', 'brute', 'poacher'],
  },
  campDrops: {
    1: ['draught', 'tonic', 'salve', 'scroll'],
    2: ['blade', 'mail', 'charm'],
    3: ['boots', 'gauntlets', 'circlet'],
  },

  /** Neutral Trading Posts: a hero within `range` can buy their stock. */
  shop: {
    range: 4,
    stock: ['blade', 'mail', 'charm', 'draught', 'tonic', 'scroll', 'salve'],
  },

  /**
   * Signal Flare: any finished Keep can light up a spot anywhere on the map
   * for a few seconds. Costs gold; one flare per player per cooldown.
   */
  flare: {
    gold: 25,
    radius: 8,
    seconds: 8,
    cooldown: 40,
  },

  /** Healing Fountains heal every unit near them, any owner. */
  fountain: {
    radius: 5,
    hpPerSecond: 15,
    manaPerSecond: 3,
  },

  /** Per hero type: growth per level and mana. Base stats are in CONFIG.units. */
  heroTypes: {
    hero: { role: 'Frontline: stuns, rallies and heals.', hpPerLevel: 60, damagePerLevel: 3, armorPerLevel: 0.5, mana: 200, manaPerLevel: 30, manaRegen: 0.6 },
    ranger: { role: 'Ranged: area damage, marks targets, scouts the map.', hpPerLevel: 45, damagePerLevel: 3, armorPerLevel: 0.4, mana: 220, manaPerLevel: 35, manaRegen: 0.7 },
    sage: { role: 'Caster: burns groups, slows threats, wards allies.', hpPerLevel: 55, damagePerLevel: 3, armorPerLevel: 0.3, mana: 260, manaPerLevel: 45, manaRegen: 1.3 },
    warden: { role: 'Frontline: roots enemies in place, barks allies, howls.', hpPerLevel: 65, damagePerLevel: 3, armorPerLevel: 0.6, mana: 200, manaPerLevel: 30, manaRegen: 0.6 },
    huntress: { role: 'Ranged: thorn rain, snares, owl scouting.', hpPerLevel: 45, damagePerLevel: 3, armorPerLevel: 0.4, mana: 220, manaPerLevel: 35, manaRegen: 0.7 },
    speaker: { role: 'Caster: swarms groups and buildings, withers threats, regrows allies.', hpPerLevel: 55, damagePerLevel: 3, armorPerLevel: 0.3, mana: 260, manaPerLevel: 45, manaRegen: 1.3 },
  },

  vision: {
    /** Ticks between visibility updates. 1 keeps save/load exact: a loaded game
     *  rebuilds visibility from the same positions the original used. */
    updateTicks: 1,
    /** Unfinished buildings see only this far. */
    foundationSight: 4,
  },

  /** Thornwild faction mechanics (see sim/factions.ts). */
  wild: {
    /** Health per second a unit regrows once it has not been hurt for regenDelay seconds. */
    unitRegen: 1.0,
    /** The same for buildings (also while growing). */
    buildingRegen: 2,
    regenDelay: 5,
    /** Deep Roots research multiplies regrowth by this. */
    deepRootsFactor: 2,
    /** Planted buildings take this much longer than their listed build time... */
    growFactor: 1.0,
    /** ...and Swift Growth shortens it by this share. */
    swiftGrowth: 0.35,
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
    buildingArmor: 1,
    /**
     * Damage multiplier by attack type (rows) against armor type (columns).
     * The roles it creates: Pierce (Archers) shreds light units but barely
     * scratches buildings; Normal (Guards, Lancers) is best against medium
     * armor (Lancers, siege); Magic (Clerics) burns heavy armor; Siege
     * demolishes buildings and is poor against medium armor.
     */
    typeTable: {
      normal: { light: 1, medium: 1.5, heavy: 1, fortified: 0.8, hero: 1 },
      pierce: { light: 1.5, medium: 0.6, heavy: 1.8, fortified: 0.4, hero: 0.75 },
      siege: { light: 1, medium: 0.5, heavy: 1, fortified: 2, hero: 0.5 },
      magic: { light: 1.25, medium: 0.75, heavy: 1.5, fortified: 0.35, hero: 0.5 },
      hero: { light: 1, medium: 1, heavy: 1, fortified: 0.7, hero: 1 },
    } satisfies Record<AttackType, Record<ArmorType, number>>,
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
      sight: 10,
      popProvided: 10,
      accepts: ['gold', 'wood'] as const,
      cost: { gold: 385, wood: 205 },
      buildSeconds: 110,
      hotkey: 'K',
      /** Research needed before it can be built (a tier), or null. */
      requires: null as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: true,
      attack: null,
    },
    farm: {
      name: 'Farm',
      hp: 400,
      size: 2,
      sight: 6,
      popProvided: 6,
      accepts: [] as const,
      cost: { gold: 80, wood: 20 },
      buildSeconds: 20,
      hotkey: 'F',
      /** Research needed before it can be built (a tier), or null. */
      requires: null as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: true,
      attack: null,
    },
    barracks: {
      name: 'Barracks',
      hp: 1000,
      size: 3,
      sight: 7,
      popProvided: 0,
      accepts: [] as const,
      cost: { gold: 160, wood: 60 },
      buildSeconds: 45,
      hotkey: 'B',
      /** Research needed before it can be built (a tier), or null. */
      requires: null as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: true,
      attack: null,
    },
    lumbermill: {
      name: 'Lumber Mill',
      hp: 600,
      size: 3,
      sight: 7,
      popProvided: 0,
      accepts: ['wood'] as const,
      cost: { gold: 120, wood: 0 },
      buildSeconds: 30,
      hotkey: 'L',
      /** Research needed before it can be built (a tier), or null. */
      requires: null as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: true,
      attack: null,
    },
    tower: {
      name: 'Watch Tower',
      hp: 500,
      size: 2,
      sight: 11,
      popProvided: 0,
      accepts: [] as const,
      cost: { gold: 110, wood: 80 },
      buildSeconds: 35,
      hotkey: 'T',
      /** Research needed before it can be built (a tier), or null. */
      requires: null as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: true,
      attack: { type: 'pierce' as AttackType, damage: 16, range: 7, cooldown: 1.2, windup: 0, acquire: 7, projectileSpeed: 14 },
    },
    altar: {
      name: 'Hall of Valor',
      hp: 800,
      size: 3,
      sight: 7,
      popProvided: 0,
      accepts: [] as const,
      cost: { gold: 180, wood: 50 },
      buildSeconds: 40,
      hotkey: 'V',
      /** Research needed before it can be built (a tier), or null. */
      requires: null as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: true,
      attack: null,
    },
    smithy: {
      name: 'Blacksmith',
      hp: 700,
      size: 3,
      sight: 7,
      popProvided: 0,
      accepts: [] as const,
      cost: { gold: 140, wood: 60 },
      buildSeconds: 40,
      hotkey: 'N',
      /** Research needed before it can be built (a tier), or null. */
      requires: null as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: true,
      attack: null,
    },
    chapel: {
      name: 'Chapel',
      hp: 700,
      size: 3,
      sight: 7,
      popProvided: 0,
      accepts: [] as const,
      cost: { gold: 150, wood: 100 },
      buildSeconds: 45,
      hotkey: 'C',
      /** Research needed before it can be built (a tier), or null. */
      requires: 'castle' as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: true,
      attack: null,
    },
    workshop: {
      name: 'Siege Works',
      hp: 800,
      size: 3,
      sight: 7,
      popProvided: 0,
      accepts: [] as const,
      cost: { gold: 160, wood: 140 },
      buildSeconds: 50,
      hotkey: 'W',
      /** Research needed before it can be built (a tier), or null. */
      requires: 'castle' as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: true,
      attack: null,
    },
    // ---- Thornwild: buildings are planted and grow on their own (slower), and regrow damage ----
    heartwood: {
      name: 'Heartwood',
      hp: 1400,
      size: 4,
      sight: 10,
      popProvided: 10,
      accepts: ['gold', 'wood'] as const,
      cost: { gold: 360, wood: 220 },
      buildSeconds: 130,
      hotkey: 'K',
      requires: null as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: true,
      attack: null,
    },
    grove: {
      name: 'Grove',
      hp: 350,
      size: 2,
      sight: 6,
      popProvided: 7,
      accepts: [] as const,
      cost: { gold: 75, wood: 30 },
      buildSeconds: 26,
      hotkey: 'F',
      requires: null as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: true,
      attack: null,
    },
    saplodge: {
      name: 'Sap Lodge',
      hp: 550,
      size: 3,
      sight: 7,
      popProvided: 0,
      accepts: ['wood'] as const,
      cost: { gold: 100, wood: 20 },
      buildSeconds: 34,
      hotkey: 'L',
      requires: null as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: true,
      attack: null,
    },
    den: {
      name: 'Thicket Den',
      hp: 950,
      size: 3,
      sight: 7,
      popProvided: 0,
      accepts: [] as const,
      cost: { gold: 150, wood: 70 },
      buildSeconds: 55,
      hotkey: 'B',
      requires: null as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: true,
      attack: null,
    },
    spire: {
      name: 'Thorn Spire',
      hp: 450,
      size: 2,
      sight: 11,
      popProvided: 0,
      accepts: [] as const,
      cost: { gold: 100, wood: 90 },
      buildSeconds: 40,
      hotkey: 'T',
      requires: null as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: true,
      attack: { type: 'pierce' as AttackType, damage: 15, range: 7, cooldown: 1.2, windup: 0, acquire: 7, projectileSpeed: 14 },
    },
    circle: {
      name: 'Elder Circle',
      hp: 750,
      size: 3,
      sight: 7,
      popProvided: 0,
      accepts: [] as const,
      cost: { gold: 170, wood: 60 },
      buildSeconds: 44,
      hotkey: 'V',
      requires: null as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: true,
      attack: null,
    },
    barkweaver: {
      name: 'Barkweaver',
      hp: 650,
      size: 3,
      sight: 7,
      popProvided: 0,
      accepts: [] as const,
      cost: { gold: 130, wood: 80 },
      buildSeconds: 44,
      hotkey: 'N',
      requires: null as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: true,
      attack: null,
    },
    moonwell: {
      name: 'Moonwell',
      hp: 650,
      size: 3,
      sight: 7,
      popProvided: 0,
      accepts: [] as const,
      cost: { gold: 140, wood: 100 },
      buildSeconds: 50,
      hotkey: 'C',
      requires: 'deepwood' as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: true,
      attack: null,
    },
    rootpit: {
      name: 'Root Pit',
      hp: 750,
      size: 3,
      sight: 7,
      popProvided: 0,
      accepts: [] as const,
      cost: { gold: 150, wood: 140 },
      buildSeconds: 55,
      hotkey: 'W',
      requires: 'deepwood' as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: true,
      attack: null,
    },
    // Neutral map objectives: placed with the map, owned by the neutral
    // player, cannot be built, attacked or destroyed.
    shop: {
      name: 'Trading Post',
      hp: 1000,
      size: 3,
      sight: 6,
      popProvided: 0,
      accepts: [] as const,
      cost: { gold: 0, wood: 0 },
      buildSeconds: 0,
      hotkey: '',
      /** Research needed before it can be built (a tier), or null. */
      requires: null as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: false,
      attack: null,
    },
    fountain: {
      name: 'Healing Fountain',
      hp: 1000,
      size: 2,
      sight: 6,
      popProvided: 0,
      accepts: [] as const,
      cost: { gold: 0, wood: 0 },
      buildSeconds: 0,
      hotkey: '',
      /** Research needed before it can be built (a tier), or null. */
      requires: null as string | null,
      armorType: 'fortified' as ArmorType,
      buildable: false,
      attack: null,
    },
  },

  /**
   * Research: queued at a building like a unit (same payment, cancel and
   * refund rules), completes once per player and lasts the whole match even
   * if the building is later lost. `requires` lists research that must be done.
   */
  research: {
    // ---- Thornwild research ----
    thorns1: {
      name: 'Sharpened Thorns',
      at: 'barkweaver',
      cost: { gold: 100, wood: 50 },
      seconds: 40,
      requires: [] as string[],
      hotkey: 'Q',
      desc: '+2 attack damage for Thornwild soldiers and heroes.',
    },
    thorns2: {
      name: 'Barbed Thorns',
      at: 'barkweaver',
      cost: { gold: 175, wood: 100 },
      seconds: 55,
      requires: ['thorns1', 'deepwood'] as string[],
      hotkey: 'Q',
      desc: 'Another +2 attack damage for Thornwild soldiers and heroes.',
    },
    thorns3: {
      name: 'Ironwood Thorns',
      at: 'barkweaver',
      cost: { gold: 250, wood: 150 },
      seconds: 70,
      requires: ['thorns2', 'ancient'] as string[],
      hotkey: 'Q',
      desc: 'A third +2 attack damage for Thornwild soldiers and heroes.',
    },
    bark1: {
      name: 'Thick Bark',
      at: 'barkweaver',
      cost: { gold: 100, wood: 50 },
      seconds: 40,
      requires: [] as string[],
      hotkey: 'W',
      desc: '+2 armor for Thornwild soldiers, Menders and heroes.',
    },
    bark2: {
      name: 'Oak Bark',
      at: 'barkweaver',
      cost: { gold: 175, wood: 100 },
      seconds: 55,
      requires: ['bark1', 'deepwood'] as string[],
      hotkey: 'W',
      desc: 'Another +2 armor for Thornwild soldiers, Menders and heroes.',
    },
    bark3: {
      name: 'Ironbark',
      at: 'barkweaver',
      cost: { gold: 250, wood: 150 },
      seconds: 70,
      requires: ['bark2', 'ancient'] as string[],
      hotkey: 'W',
      desc: 'A third +2 armor for Thornwild soldiers, Menders and heroes.',
    },
    deeproots: {
      name: 'Deep Roots',
      at: 'barkweaver',
      cost: { gold: 120, wood: 120 },
      seconds: 45,
      requires: ['deepwood'] as string[],
      hotkey: 'E',
      desc: 'Thornwild units and buildings regrow twice as fast.',
    },
    sapflow: {
      name: 'Sap Flow',
      at: 'saplodge',
      cost: { gold: 75, wood: 50 },
      seconds: 30,
      requires: [] as string[],
      hotkey: 'Q',
      desc: 'Tenders carry 15 wood instead of 10.',
    },
    longthorn: {
      name: 'Long Thorns',
      at: 'saplodge',
      cost: { gold: 125, wood: 100 },
      seconds: 45,
      requires: ['deepwood'] as string[],
      hotkey: 'W',
      desc: 'Briar Slingers reach 1.5 tiles further.',
    },
    swiftgrowth: {
      name: 'Swift Growth',
      at: 'heartwood',
      cost: { gold: 100, wood: 100 },
      seconds: 40,
      requires: [] as string[],
      hotkey: 'E',
      desc: 'Planted buildings grow 35% faster.',
    },
    deepwood: {
      name: 'Grow to Deepwood',
      at: 'heartwood',
      cost: { gold: 300, wood: 200 },
      seconds: 60,
      requires: [] as string[],
      hotkey: 'W',
      desc: 'This Heartwood gains 500 health. Unlocks tier II: Stag Riders, the Moonwell, the Root Pit and tier II research.',
    },
    ancient: {
      name: 'Grow to Ancient',
      at: 'heartwood',
      cost: { gold: 400, wood: 300 },
      seconds: 80,
      requires: ['deepwood'] as string[],
      hotkey: 'W',
      desc: 'This Heartwood gains another 500 health. Unlocks tier III research.',
    },
    bloom: {
      name: 'Full Bloom',
      at: 'moonwell',
      cost: { gold: 150, wood: 125 },
      seconds: 45,
      requires: ['ancient'] as string[],
      hotkey: 'W',
      desc: "Menders' healing restores more health.",
    },
    weapons1: {
      name: 'Forged Blades',
      at: 'smithy',
      cost: { gold: 100, wood: 50 },
      seconds: 40,
      requires: [] as string[],
      hotkey: 'Q',
      desc: '+2 attack damage for Guards, Archers, Lancers and your hero.',
    },
    weapons2: {
      name: 'Tempered Blades',
      at: 'smithy',
      cost: { gold: 175, wood: 100 },
      seconds: 55,
      requires: ['weapons1', 'castle'] as string[],
      hotkey: 'Q',
      desc: 'Another +2 attack damage for Guards, Archers, Lancers and your hero.',
    },
    armor1: {
      name: 'Studded Armor',
      at: 'smithy',
      cost: { gold: 100, wood: 50 },
      seconds: 40,
      requires: [] as string[],
      hotkey: 'W',
      desc: '+2 armor for Guards, Archers, Lancers, Clerics and your hero.',
    },
    armor2: {
      name: 'Plate Armor',
      at: 'smithy',
      cost: { gold: 175, wood: 100 },
      seconds: 55,
      requires: ['armor1', 'castle'] as string[],
      hotkey: 'W',
      desc: 'Another +2 armor for Guards, Archers, Lancers, Clerics and your hero.',
    },
    saws: {
      name: 'Bow Saws',
      at: 'lumbermill',
      cost: { gold: 75, wood: 50 },
      seconds: 30,
      requires: [] as string[],
      hotkey: 'Q',
      desc: 'Laborers carry 15 wood instead of 10.',
    },
    castle: {
      name: 'Fortify to Castle',
      at: 'hq',
      cost: { gold: 300, wood: 200 },
      seconds: 60,
      requires: [] as string[],
      hotkey: 'W',
      desc: 'This Keep gains 500 health. Unlocks tier II: Lancers, the Chapel, the Siege Works and tier II research.',
    },
    citadel: {
      name: 'Fortify to Citadel',
      at: 'hq',
      cost: { gold: 400, wood: 300 },
      seconds: 80,
      requires: ['castle'] as string[],
      hotkey: 'W',
      desc: 'This Castle gains another 500 health. Unlocks tier III research.',
    },
    weapons3: {
      name: 'Masterwork Blades',
      at: 'smithy',
      cost: { gold: 250, wood: 150 },
      seconds: 70,
      requires: ['weapons2', 'citadel'] as string[],
      hotkey: 'Q',
      desc: 'A third +2 attack damage for Guards, Archers, Lancers and your hero.',
    },
    armor3: {
      name: 'Gothic Plate',
      at: 'smithy',
      cost: { gold: 250, wood: 150 },
      seconds: 70,
      requires: ['armor2', 'citadel'] as string[],
      hotkey: 'W',
      desc: 'A third +2 armor for Guards, Archers, Lancers, Clerics and your hero.',
    },
    carts: {
      name: 'Mule Carts',
      at: 'hq',
      cost: { gold: 150, wood: 100 },
      seconds: 45,
      requires: [] as string[],
      hotkey: 'E',
      desc: 'Laborers carry 12 gold per trip instead of 10: a mine yields 20% more.',
    },
    longbows: {
      name: 'Longbows',
      at: 'lumbermill',
      cost: { gold: 125, wood: 100 },
      seconds: 45,
      requires: ['castle'] as string[],
      hotkey: 'W',
      desc: 'Archers shoot 1.5 tiles further.',
    },
    healing2: {
      name: 'Greater Healing',
      at: 'chapel',
      cost: { gold: 150, wood: 150 },
      seconds: 50,
      requires: ['citadel'] as string[],
      hotkey: 'W',
      desc: 'Clerics heal 50% more per prayer.',
    },
  },

  tech: {
    weaponBonus: 2,
    armorBonus: 2,
    sawsCarry: 5,
    /** Health added to a Keep by each fortification (Castle, Citadel). */
    castleHp: 500,
    cartsCarry: 2,
    longbowRange: 1.5,
  },

  /**
   * Clerics heal on their own: whenever a prayer is ready and they have the
   * mana, they heal the most wounded friendly unit in range (not buildings).
   * Same rule for every player; nothing to micro-manage.
   */
  cleric: {
    mana: 180,
    manaRegen: 0.9, // per second
    healRange: 5,
    healMana: 15,
    healCooldown: 2,
    /** Health restored per prayer, before and after Greater Healing. */
    heal: [35, 50],
    /** Only units missing at least this much health are worth a prayer. */
    minMissing: 15,
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
        /** Workers before it adds Barracks beyond the first (up to maxBarracks). */
        extraBarracksAtWorkers: 11,
        maxBarracks: 1,
        towers: 0,
        /** Army composition it aims for (relative weights, among units it can train). */
        mix: { guard: 3, archer: 1, lancer: 0, cleric: 0, mangonel: 0 } as ArmyMix,
        /** Shifts that mix to counter the enemy units it has seen. */
        adapt: false,
        /** Heroes it raises, in order (the second once fortified). */
        heroes: ['hero'] as Array<'hero' | 'ranger' | 'sage'>,
        /** Sends a hero to buy items at Trading Posts. */
        shops: false,
        /** Outriders it keeps scouting (0 = none). */
        scouts: 0,
        /** Fires Signal Flares to find the enemy. */
        flares: false,
        firstAttackSeconds: 540,
        waveSize: 4,
        waveGrowth: 2,
        expandSeconds: 900,
        /** Compare its army with the enemy's before launching a wave. */
        assessStrength: false,
        /** Builds a Blacksmith and researches upgrades. */
        upgrades: false,
        /** When (seconds) it fortifies to a Castle; null = never. */
        castleSeconds: null as number | null,
        /** When (seconds) it fortifies further to a Citadel; null = never. */
        citadelSeconds: null as number | null,
        /** Takes its army and hero to clear neutral camps for experience. */
        creeps: false,
        /** Simultaneous constructions it will manage. */
        builders: 1,
        /** Most Keeps it will run at once. */
        maxKeeps: 2,
        // ---- decision quality (what difficulty is mostly about) ----
        /** Seconds before it reacts to enemies at its base. */
        reactSeconds: 6,
        /** Seconds between checks for idle Laborers. */
        idleCheckSeconds: 10,
        /** A wave falls back when reduced to this share of its launch size. */
        retreatShare: 0.25,
        /** Judges each fight: falls back from a stronger force, recalls a wave to defend. */
        judgeFights: false,
        /** Gathers a wave before it marches, so it arrives together. */
        regroup: false,
        /** Sends new soldiers after a wave that is already out. */
        reinforce: false,
        /** Soldiers switch to wounded enemies and heroes in their reach. */
        focusFire: false,
        /** Laborers run from an army they cannot fight, and come back after. */
        pullWorkers: false,
        /** A badly hurt hero leaves the fight to heal. */
        heroRetreat: false,
        /** Sends a worker to repair damaged buildings once no enemy is near. */
        repairs: false,
        /** Saves gold to rebuild when its last Keep is going down. */
        saveForKeep: false,
        /** When (seconds) a Laborer walks over to look at the enemy base; null = never. */
        scoutWorkerSeconds: null as number | null,
        /** Changes plan on what it has scouted (early pressure, towers, expansions). */
        readsIntel: false,
        /** Counts the towers it has seen, and the defender's edge, before attacking. */
        countsDefences: false,
        /** Puts banked wood to use: more units that cost wood, an earlier Castle. */
        usesSurplus: false,
        /** Expands as soon as it is safe (no threat known, an army at home), not on a timer. */
        expandWhenSafe: false,
      },
      normal: {
        thinkSeconds: 1.0,
        workerTarget: 12,
        barracksAtWorkers: 8,
        extraBarracksAtWorkers: 11,
        maxBarracks: 2,
        towers: 1,
        mix: { guard: 3, archer: 2, lancer: 1.5, cleric: 1, mangonel: 0.6 } as ArmyMix,
        adapt: true,
        heroes: ['hero', 'sage'] as Array<'hero' | 'ranger' | 'sage'>,
        shops: true,
        scouts: 1,
        flares: true,
        firstAttackSeconds: 400,
        waveSize: 6,
        waveGrowth: 3,
        expandSeconds: 600,
        assessStrength: true,
        upgrades: true,
        castleSeconds: 720 as number | null,
        citadelSeconds: null as number | null,
        creeps: true,
        builders: 1,
        maxKeeps: 2,
        reactSeconds: 2.5,
        idleCheckSeconds: 3,
        retreatShare: 0.35,
        judgeFights: true,
        regroup: true,
        reinforce: false,
        focusFire: false,
        pullWorkers: true,
        heroRetreat: true,
        repairs: true,
        saveForKeep: true,
        scoutWorkerSeconds: 120 as number | null,
        readsIntel: true,
        countsDefences: false,
        usesSurplus: true,
        expandWhenSafe: false,
      },
      hard: {
        thinkSeconds: 0.5,
        workerTarget: 13,
        barracksAtWorkers: 7,
        extraBarracksAtWorkers: 11,
        maxBarracks: 2,
        towers: 1,
        mix: { guard: 3, archer: 2, lancer: 2, cleric: 1, mangonel: 0.8 } as ArmyMix,
        adapt: true,
        heroes: ['hero', 'ranger'] as Array<'hero' | 'ranger' | 'sage'>,
        shops: true,
        scouts: 1,
        flares: true,
        firstAttackSeconds: 400,
        waveSize: 6,
        waveGrowth: 3,
        expandSeconds: 420,
        assessStrength: true,
        upgrades: true,
        castleSeconds: 540 as number | null,
        citadelSeconds: 960 as number | null,
        creeps: true,
        builders: 2,
        maxKeeps: 3,
        reactSeconds: 1,
        idleCheckSeconds: 0.5,
        retreatShare: 0.35,
        judgeFights: true,
        regroup: true,
        reinforce: true,
        focusFire: true,
        pullWorkers: true,
        heroRetreat: true,
        repairs: true,
        saveForKeep: true,
        scoutWorkerSeconds: 75 as number | null,
        readsIntel: true,
        countsDefences: true,
        usesSurplus: true,
        expandWhenSafe: true,
      },
    },
    /**
     * Strategic styles, layered on a difficulty: what it plans, not how well
     * it plays. Timings multiply the difficulty's, counts add to them.
     */
    styles: {
      balanced: {
        name: 'Balanced',
        blurb: 'Expands on schedule and attacks when it judges itself stronger.',
        adjust: {} as StyleAdjust,
      },
      raider: {
        name: 'Raider',
        blurb: 'Strikes early and often with small, fast groups aimed at your Laborers. Expands late.',
        adjust: {
          attackTiming: 0.65,
          expandTiming: 1.6,
          castleTiming: 1.25,
          waveSize: -2,
          waveGrowth: -1,
          towers: -1,
          raids: true,
          mix: { guard: 3, archer: 1, lancer: 3, cleric: 0, mangonel: 0 },
        } as StyleAdjust,
      },
      expander: {
        name: 'Expander',
        blurb: 'Takes mines early, up to three Keeps, and attacks with larger waves.',
        // It used to attack at 1.5x and skip a tower; waiting that long only let
        // opponents break their waves on its base (68-27 in the Phase I round robin).
        adjust: { expandTiming: 0.4, waveSize: 2, workerTarget: 2, maxKeeps: 1, expandsFirst: true } as StyleAdjust,
      },
      warden: {
        name: 'Warden',
        blurb: 'Guards its approach and its mines with towers, fortifies early and pushes late with siege.',
        adjust: {
          attackTiming: 1.3,
          castleTiming: 0.7,
          waveSize: 3,
          towers: 2,
          mix: { guard: 3, archer: 2, lancer: 1, cleric: 1, mangonel: 1 },
        } as StyleAdjust,
      },
      warlord: {
        name: 'Warlord',
        blurb: 'Raises heroes first and hunts camps for items and levels, then hits with its heroes leading.',
        adjust: { attackTiming: 1.1, creepParty: -2, heroesEarly: true, castleTiming: 0.85 } as StyleAdjust,
      },
    },
    /**
     * Optional computer advantages, chosen before a match and always shown
     * as such. Without one, the computer plays by exactly your rules.
     */
    advantages: {
      none: { name: 'None', income: 0 },
      income25: { name: '+25% income (cheat)', income: 0.25 },
      income50: { name: '+50% income (cheat)', income: 0.5 },
    },
    /** Enemies this close to any of its buildings trigger defence. */
    defendRadius: 14,
    /** Laborers it puts on a mine that holds two miners at once (two more per extra miner). */
    goldWorkersPerMine: 5,
    /** Judging a fight: falls back when the enemy near its wave is this much stronger. */
    retreatOdds: 1.4,
    /** Once in a fight (an enemy within engagedRange tiles), it pulls out only at these odds. */
    hopelessOdds: 2.2,
    engagedRange: 5,
    /** A regrouping wave marches once this share of it has gathered (or after regroupSeconds). */
    regroupShare: 0.8,
    regroupSeconds: 20,
    /** Smallest group it sends to join a wave already out. */
    reinforceGroup: 3,
    /** A hero leaves a fight below this share of health, and returns above backShare. */
    heroRetreatShare: 0.3,
    /** Repair a building below this share of its health, with this much gold spare. */
    repairBelow: 0.75,
    repairGold: 60,
    heroBackShare: 0.75,
    /** A raid lasts at most this long (seconds), with this many soldiers. */
    raidSeconds: 45,
    raidSize: 4,
    /** Intel: enemy soldiers seen on its half before this time (seconds) count as early pressure... */
    earlyPressureSeconds: 300,
    /** ...when there are at least this many. */
    earlyPressureSoldiers: 3,
    /** Known enemy towers that read as a defensive player (it expands and techs instead). */
    turtleTowers: 3,
    /** Scouts it will train in a whole match (replacing ones that die). */
    maxScouts: 3,
    /** Tiles of extra walk a rich mine (per extra miner) and a full-size mine are worth. */
    richMineBonus: 12,
    fullMineBonus: 5,
    /** Gold on hand before it sends a hero shopping. */
    shopGold: 350,
    /** Earliest time (seconds) it researches Mule Carts. */
    cartsSeconds: 300,
    /** Enemy soldiers it must have seen before it adapts its army mix. */
    adaptAfterSeen: 4,
    /** How strongly observed enemy units shift its mix toward counters. */
    adaptStrength: 4,
    /** How long (seconds) it remembers enemy soldiers it saw. */
    armyMemorySeconds: 120,
    /** Waves route this far (tiles) around neutral camps they know of. */
    campClearance: 9,
    /** Spare population it keeps ahead of demand before adding a Farm. */
    popBuffer: 4,
    /** Wood banked beyond this while gold-starved means: expand now. */
    woodSurplus: 600,
    /** Assessing players attack only with this strength advantage... */
    attackAdvantage: 1.15,
    /** Choosing a target: an outlying base counts as this many tiles nearer (it is defended less). */
    outlyingBonus: 10,
    /** Focus fire: leaves a soldier's swing alone (1) or retargets mid-swing (0). */
    focusKeepSwing: 0,
    /** Focus fire: how far past its range a soldier looks for a target, in tiles. */
    focusSlack: 0.8,
    /**
     * Focus fire: switches to an enemy hero below this share of its health
     * (1 = any hero). Chasing healthy heroes, which back off to heal, cost
     * Hard more than focus fire gained (172-120 against Normal; 181-111 at 0.5).
     */
    focusHeroShare: 0.5,
    /** Against an enemy known to have more bases, the first attack comes at this share of the usual time. */
    greedAttackTiming: 1,
    /** Expanding when safe: not before this time (seconds), and with this many soldiers home. */
    safeExpandSeconds: 180,
    safeExpandArmy: 3,
    /** What an expansion-first style holds until its second Keep: 1 towers, 2 Blacksmith, 4 more Barracks (7 = everything). */
    expandsFirstHolds: 7,
    /** Counting defences: a defender fights at home with this edge... */
    defenderEdge: 1.25,
    /** ...and each tower it has seen counts for this many Guards. */
    towerAsGuards: 2.5,
    /** ...unless the army is already this large (prevents endless turtling). */
    attackAnyway: 24,
    /** Smallest army (hero included) it takes camp-clearing. */
    creepParty: 6,
    /** Gold it keeps for the army before spending on research. */
    researchBuffer: 150,
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
    /**
     * Repair: a worker restores a damaged, finished building of its own
     * side. One worker restores the whole of a building's health in
     * repairTime x its build time; more workers repair faster, each at that
     * rate. The full repair costs repairCost x the building's price, paid
     * bit by bit as health comes back; with nothing left to pay, repair stops.
     */
    repairTime: 1.0,
    repairCost: 0.35,
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

  /**
   * Mine kinds: the reward side of an expansion. A rich mine holds three
   * miners at once instead of two (half again the income) and lasts longer;
   * maps put them behind the toughest camps and furthest from home.
   */
  mineKinds: {
    start: { name: 'Gold Mine', gold: 7000, miners: 2 },
    tiny: { name: 'Small Gold Mine', gold: 800, miners: 2 },
    small: { name: 'Small Gold Mine', gold: 3000, miners: 2 },
    standard: { name: 'Gold Mine', gold: 9000, miners: 2 },
    rich: { name: 'Rich Gold Mine', gold: 14000, miners: 3 },
  },

  movement: {
    /** Distance (tiles) from a footprint at which a unit counts as adjacent. */
    reach: 0.85,
    /** Ticks without progress before a moving unit re-plans its path. */
    stuckTicks: 12,
    maxRepaths: 4,
    /** Units within this distance (tiles) of their group's centre march together at the slowest one's pace. */
    groupRadius: 5,
    /**
     * Path-search work (tiles expanded) each player may spend per tick. A
     * huge group order spreads over a few ticks instead of freezing one: a
     * unit still waiting simply starts a tick later. Per player, so no seat
     * plans first.
     */
    pathBudget: 12000,
  },
} as const;

export type UnitType = keyof typeof CONFIG.units;
export type BuildingType = keyof typeof CONFIG.buildings;
export type ResearchId = keyof typeof CONFIG.research;
export type AbilityId = keyof typeof CONFIG.hero.abilities;
export type ItemId = keyof typeof CONFIG.items;
export type HeroType = keyof typeof CONFIG.heroTypes;
export type MineKind = keyof typeof CONFIG.mineKinds;

export const HERO_TYPES = Object.keys(CONFIG.heroTypes) as HeroType[];
export function isHeroType(t: string): t is HeroType {
  return t in CONFIG.heroTypes;
}

/** Buildings a Laborer can construct (not the neutral map objectives). */
export const BUILDABLE = (Object.keys(CONFIG.buildings) as BuildingType[]).filter((t) => CONFIG.buildings[t].buildable);
