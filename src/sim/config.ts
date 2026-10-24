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
export type ArmyMix = { guard: number; archer: number; lancer: number; cleric: number; mangonel: number };

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
        name: 'Stormhammer', hero: 'hero', hotkey: 'Q', learnLevel: 1, target: 'enemy', range: 6, radius: 0, mana: 75, cooldown: 10,
        damage: [90, 140, 190], stun: [1.5, 2, 2.5], duration: [0, 0, 0], bonus: [0, 0, 0], heal: [0, 0, 0], projectileSpeed: 14,
        desc: 'Hurls a hammer that damages and stuns an enemy unit.',
      },
      cry: {
        name: 'Battle Cry', hero: 'hero', hotkey: 'W', learnLevel: 2, target: 'none', range: 0, radius: 8, mana: 60, cooldown: 30,
        damage: [0, 0, 0], stun: [0, 0, 0], duration: [12, 12, 12], bonus: [0.15, 0.25, 0.35], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'Nearby allies deal more damage for a while.',
      },
      mend: {
        name: 'Mend', hero: 'hero', hotkey: 'E', learnLevel: 3, target: 'ally', range: 6, radius: 0, mana: 50, cooldown: 8,
        damage: [0, 0, 0], stun: [0, 0, 0], duration: [0, 0, 0], bonus: [0, 0, 0], heal: [150, 225, 300], projectileSpeed: 0,
        desc: 'Heals one of your units.',
      },
      volley: {
        name: 'Volley', hero: 'ranger', hotkey: 'Q', learnLevel: 1, target: 'point', range: 8, radius: 2.5, mana: 70, cooldown: 12,
        damage: [70, 105, 140], stun: [0, 0, 0], duration: [0, 0, 0], bonus: [0, 0, 0], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'A rain of arrows damages every enemy unit in an area.',
      },
      mark: {
        name: "Hunter's Mark", hero: 'ranger', hotkey: 'W', learnLevel: 2, target: 'enemy', range: 8, radius: 0, mana: 40, cooldown: 14,
        damage: [0, 0, 0], stun: [0, 0, 0], duration: [10, 12, 14], bonus: [0.2, 0.3, 0.4], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'The marked enemy takes extra damage from every source.',
      },
      farsight: {
        name: 'Far Sight', hero: 'ranger', hotkey: 'E', learnLevel: 3, target: 'point', range: 999, radius: 9, mana: 50, cooldown: 30,
        damage: [0, 0, 0], stun: [0, 0, 0], duration: [10, 14, 18], bonus: [0, 0, 0], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'Reveals any spot on the map for a while.',
      },
      flame: {
        name: 'Flame Burst', hero: 'sage', hotkey: 'Q', learnLevel: 1, target: 'point', range: 7, radius: 2.5, mana: 80, cooldown: 8,
        damage: [95, 145, 195], stun: [0, 0, 0], duration: [0, 0, 0], bonus: [0, 0, 0], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'Fire erupts at a spot, burning enemy units and buildings there.',
      },
      slow: {
        name: 'Slow', hero: 'sage', hotkey: 'W', learnLevel: 2, target: 'enemy', range: 7, radius: 0, mana: 35, cooldown: 9,
        damage: [0, 0, 0], stun: [0, 0, 0], duration: [6, 8, 10], bonus: [0.4, 0.5, 0.6], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'An enemy unit moves and attacks much more slowly.',
      },
      ward: {
        name: 'Arcane Ward', hero: 'sage', hotkey: 'E', learnLevel: 3, target: 'ally', range: 6, radius: 0, mana: 55, cooldown: 12,
        damage: [0, 0, 0], stun: [0, 0, 0], duration: [15, 15, 15], bonus: [5, 8, 11], heal: [0, 0, 0], projectileSpeed: 0,
        desc: 'Shields one of your units with extra armor.',
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
   * Neutral camps guard mines. Level sets their strength and what the last
   * guard drops when the camp is wiped out: level 1 a consumable, level 2 a
   * tier-1 item, level 3 a tier-2 item. Mirrored camps drop the same item.
   */
  camps: {
    // The small mine beside each base stays unguarded: a camp there would
    // maul Laborers before anyone has an army.
    natural: { level: 1, guards: ['brigand', 'wolf'] },
    far: { level: 2, guards: ['chief', 'brigand', 'poacher'] },
    center: { level: 3, guards: ['brute', 'chief', 'poacher'] },
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
  },

  vision: {
    /** Ticks between visibility updates. 1 keeps save/load exact: a loaded game
     *  rebuilds visibility from the same positions the original used. */
    updateTicks: 1,
    /** Unfinished buildings see only this far. */
    foundationSight: 4,
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
        firstAttackSeconds: 300,
        waveSize: 7,
        waveGrowth: 3,
        expandSeconds: 420,
        assessStrength: true,
        upgrades: true,
        castleSeconds: 540 as number | null,
        citadelSeconds: 960 as number | null,
        creeps: true,
        builders: 2,
      },
    },
    /** Enemies this close to any of its buildings trigger defence. */
    defendRadius: 14,
    goldWorkersPerMine: 5,
    /** A wave falls back when reduced to this share of its launch size. */
    retreatShare: 0.35,
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
    /** Units within this distance (tiles) of their group's centre march together at the slowest one's pace. */
    groupRadius: 5,
  },
} as const;

export type UnitType = keyof typeof CONFIG.units;
export type BuildingType = keyof typeof CONFIG.buildings;
export type ResearchId = keyof typeof CONFIG.research;
export type AbilityId = keyof typeof CONFIG.hero.abilities;
export type ItemId = keyof typeof CONFIG.items;
export type HeroType = keyof typeof CONFIG.heroTypes;
export type CampRole = keyof typeof CONFIG.camps;

export const HERO_TYPES = Object.keys(CONFIG.heroTypes) as HeroType[];
export function isHeroType(t: string): t is HeroType {
  return t in CONFIG.heroTypes;
}

/** Buildings a Laborer can construct (not the neutral map objectives). */
export const BUILDABLE = (Object.keys(CONFIG.buildings) as BuildingType[]).filter((t) => CONFIG.buildings[t].buildable);
