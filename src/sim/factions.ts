// Factions: who builds what, and the traits that make each one play
// differently. Every unit, building and research belongs to one faction
// (or to the neutrals). Rules ask these tables rather than naming types, so
// a second faction is data plus a few clearly named mechanics:
//
//   Ironvale Crown - builders raise every building by hand; sturdy units.
//   Thornwild      - Tenders plant buildings that grow on their own (slower,
//                    weak while growing), harvest wood without felling trees
//                    (slower), and everything regrows damage when left alone.
//                    Units are cheaper and lighter one-on-one.

import { CONFIG, type BuildingType, type ResearchId, type UnitType } from './config';

export type FactionId = 'crown' | 'wild';
export const FACTIONS: FactionId[] = ['crown', 'wild'];

/**
 * Roles shared by both factions, named after the Crown's buildings and
 * units. The computer opponent and the key map think in roles, so they work
 * for either faction.
 */
export type BuildingRole = 'hq' | 'farm' | 'lumbermill' | 'barracks' | 'tower' | 'altar' | 'smithy' | 'chapel' | 'workshop';
export type UnitRole = 'worker' | 'melee' | 'ranged' | 'scout' | 'cavalry' | 'support' | 'siege';

export interface Faction {
  name: string;
  blurb: string;
  /** How its buildings come up: raised by a builder, or planted and left to grow. */
  construction: 'raise' | 'grow';
  buildings: Record<BuildingRole, BuildingType>;
  units: Record<UnitRole, UnitType>;
  heroes: UnitType[];
  /** Research that raises the main hall to tier II and tier III. */
  tiers: [ResearchId, ResearchId];
  /** Research by what it does. */
  upgrades: { weapons: ResearchId[]; armor: ResearchId[]; carryWood: ResearchId; carryGold: ResearchId | null; range: ResearchId; heal: ResearchId };
  /** The ranged unit the range upgrade applies to. */
  rangeUnit: UnitType;
}

export const FACTION: Record<FactionId, Faction> = {
  crown: {
    name: 'Ironvale Crown',
    blurb: 'Builders raise every building by hand. Heavy, sturdy soldiers, siege that hits from afar.',
    construction: 'raise',
    buildings: { hq: 'hq', farm: 'farm', lumbermill: 'lumbermill', barracks: 'barracks', tower: 'tower', altar: 'altar', smithy: 'smithy', chapel: 'chapel', workshop: 'workshop' },
    units: { worker: 'worker', melee: 'guard', ranged: 'archer', scout: 'outrider', cavalry: 'lancer', support: 'cleric', siege: 'mangonel' },
    heroes: ['hero', 'ranger', 'sage'],
    tiers: ['castle', 'citadel'],
    upgrades: { weapons: ['weapons1', 'weapons2', 'weapons3'], armor: ['armor1', 'armor2', 'armor3'], carryWood: 'saws', carryGold: 'carts', range: 'longbows', heal: 'healing2' },
    rangeUnit: 'archer',
  },
  wild: {
    name: 'Thornwild',
    blurb: 'Tenders plant buildings that grow on their own and never fell a tree. Cheaper, lighter units that regrow damage when left alone.',
    construction: 'grow',
    buildings: { hq: 'heartwood', farm: 'grove', lumbermill: 'saplodge', barracks: 'den', tower: 'spire', altar: 'circle', smithy: 'barkweaver', chapel: 'moonwell', workshop: 'rootpit' },
    units: { worker: 'tender', melee: 'thornguard', ranged: 'slinger', scout: 'fox', cavalry: 'stagrider', support: 'mender', siege: 'rootcrusher' },
    heroes: ['warden', 'huntress', 'speaker'],
    tiers: ['deepwood', 'ancient'],
    upgrades: { weapons: ['thorns1', 'thorns2', 'thorns3'], armor: ['bark1', 'bark2', 'bark3'], carryWood: 'sapflow', carryGold: null, range: 'longthorn', heal: 'bloom' },
    rangeUnit: 'slinger',
  },
};

/** Whose a unit type is (neutral camp guards belong to no one). */
export function unitFaction(t: UnitType): FactionId | null {
  for (const f of FACTIONS) {
    const d = FACTION[f];
    if (Object.values(d.units).includes(t) || d.heroes.includes(t)) return f;
  }
  return null;
}

export function buildingFaction(t: BuildingType): FactionId | null {
  for (const f of FACTIONS) if (Object.values(FACTION[f].buildings).includes(t)) return f;
  return null;
}

// Lookups by type, built once (the computer asks these many times a tick).
const BUILDING_ROLE = new Map<string, BuildingRole>();
const UNIT_ROLE = new Map<string, UnitRole>();
for (const f of FACTIONS) {
  for (const [role, type] of Object.entries(FACTION[f].buildings)) BUILDING_ROLE.set(type, role as BuildingRole);
  for (const [role, type] of Object.entries(FACTION[f].units)) UNIT_ROLE.set(type, role as UnitRole);
}

/** The role a building plays (its Crown counterpart's name), for keys and the computer. */
export function buildingRole(t: BuildingType): BuildingRole | null {
  return BUILDING_ROLE.get(t) ?? null;
}

/** Gatherers and builders. */
export function isWorker(t: UnitType): boolean {
  return t === 'worker' || t === 'tender';
}

/** A faction's main hall: drop-off, flares, tiers, the base. */
export function isHall(t: BuildingType): boolean {
  return t === 'hq' || t === 'heartwood';
}

/** Units that heal nearby allies on their own (Cleric, Mender). */
export function isHealer(t: UnitType): boolean {
  return t === 'cleric' || t === 'mender';
}

/** Buildings a player of this faction can construct. */
export function buildableFor(f: FactionId): BuildingType[] {
  return Object.values(FACTION[f].buildings);
}

/** Units and heroes that weapon and armor research improve. */
const ARMED = new Set<UnitType>(['guard', 'archer', 'lancer', 'hero', 'ranger', 'sage', 'thornguard', 'slinger', 'stagrider', 'warden', 'huntress', 'speaker', 'rootcrusher']);
const ARMORED = new Set<UnitType>(['guard', 'archer', 'lancer', 'cleric', 'hero', 'ranger', 'sage', 'thornguard', 'slinger', 'stagrider', 'mender', 'warden', 'huntress', 'speaker', 'rootcrusher']);
export const upgradesWeapons = (t: UnitType) => ARMED.has(t);
export const upgradesArmor = (t: UnitType) => ARMORED.has(t);

/** Health regrown per second when left alone (Thornwild), before Deep Roots. */
export function regenRate(kind: 'unit' | 'building', type: UnitType | BuildingType): number {
  const f = kind === 'unit' ? unitFaction(type as UnitType) : buildingFaction(type as BuildingType);
  if (f !== 'wild') return 0;
  return kind === 'unit' ? CONFIG.wild.unitRegen : CONFIG.wild.buildingRegen;
}

/** The faction's research at a tier (2 or 3). */
export function tierResearch(f: FactionId, tier: 2 | 3): ResearchId {
  return FACTION[f].tiers[tier - 2];
}

/** The role a unit type plays, for any faction (null for heroes and neutrals). */
export function unitRole(t: UnitType): UnitRole | null {
  return UNIT_ROLE.get(t) ?? null;
}
