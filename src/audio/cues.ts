// Which sounds the game makes, and when. Pure logic, no audio: every cue
// belongs to a category the player can turn up or down, and simulation
// events become cues for one viewer only when that viewer could see them
// happen (a fight in the fog makes no sound: sound must not leak what the
// fog hides). Playback is in sound.ts.

import { isHeroType, type UnitType } from '../sim/config';
import { isWorker } from '../sim/factions';
import type { GameEvent } from '../sim/types';

export type Category = 'interface' | 'combat' | 'economy' | 'alerts' | 'ambience';

export const CUE_CATEGORY = {
  // interface
  click: 'interface',
  error: 'interface',
  select: 'interface',
  selectSoldier: 'interface',
  selectHero: 'interface',
  orderMove: 'interface',
  orderAttack: 'interface',
  orderWork: 'interface',
  // combat
  swing: 'combat',
  clash: 'combat',
  bowShot: 'combat',
  arrowHit: 'combat',
  spellShot: 'combat',
  siegeLaunch: 'combat',
  boom: 'combat',
  thud: 'combat',
  death: 'combat',
  collapse: 'combat',
  spell: 'combat',
  heal: 'combat',
  horn: 'combat',
  // economy and construction
  chop: 'economy',
  treeFall: 'economy',
  goldDrop: 'economy',
  woodDrop: 'economy',
  pick: 'economy',
  hammer: 'economy',
  built: 'economy',
  trained: 'economy',
  research: 'economy',
  levelUp: 'economy',
  pickup: 'economy',
  coin: 'economy',
  // alerts
  alertBase: 'alerts',
  alertArmy: 'alerts',
  sighting: 'alerts',
  heroFallen: 'alerts',
  mineGone: 'alerts',
  popBlocked: 'alerts',
  victory: 'alerts',
  defeat: 'alerts',
  campCleared: 'alerts',
} as const satisfies Record<string, Category>;

export type Cue = keyof typeof CUE_CATEGORY;

/** A cue to play, at a map position (for distance and stereo) or everywhere. */
export interface CueHit {
  cue: Cue;
  x?: number;
  y?: number;
}

/** What the cue picker needs to know about the match, from one viewer's side. */
export interface CueContext {
  viewer: number;
  /** Is this map spot in the viewer's sight right now? */
  visible: (x: number, y: number) => boolean;
  /** A unit's type, owner and place (undefined if gone). */
  unit: (id: number) => { type: string; owner: number; x: number; y: number } | undefined;
}

const RANGED = new Set(['archer', 'ranger', 'poacher', 'tower']);
const MAGIC = new Set(['cleric', 'sage']);

/** The cues a batch of simulation events makes for this viewer. */
export function eventCues(events: GameEvent[], ctx: CueContext): CueHit[] {
  const out: CueHit[] = [];
  const mine = (p: number) => p === ctx.viewer;
  const seen = (x: number, y: number) => ctx.visible(x, y);
  const at = (cue: Cue, x: number, y: number) => out.push({ cue, x, y });
  for (const e of events) {
    switch (e.type) {
      case 'attack': {
        // The swing or shot, where the attacker stands.
        const u = ctx.unit(e.id);
        if (!u || (!mine(u.owner) && !seen(u.x, u.y))) break;
        at(u.type === 'mangonel' ? 'siegeLaunch' : RANGED.has(u.type) ? 'bowShot' : MAGIC.has(u.type) ? 'spellShot' : 'swing', u.x, u.y);
        break;
      }
      case 'hit': {
        // The blow landing, where it lands.
        if (!mine(e.owner) && !mine(e.attackerOwner) && !seen(e.x, e.y)) break;
        const a = ctx.unit(e.attacker);
        if (a?.type === 'mangonel') break; // its impact booms instead
        if (!ctx.unit(e.id)) at('thud', e.x, e.y);
        else at(a && (RANGED.has(a.type) || MAGIC.has(a.type)) ? 'arrowHit' : 'clash', e.x, e.y);
        break;
      }
      case 'impact':
        if (seen(e.x, e.y)) at('boom', e.x, e.y);
        break;
      case 'death':
        if (mine(e.owner) || seen(e.x, e.y)) at('death', e.x, e.y);
        break;
      case 'buildingDestroyed':
        if (mine(e.player) || seen(e.x, e.y)) at('collapse', e.x, e.y);
        break;
      case 'cast':
        if (!mine(e.player) && !seen(e.x, e.y)) break;
        at(e.ability === 'cry' ? 'horn' : e.ability === 'mend' ? 'heal' : e.ability === 'flame' ? 'boom' : 'spell', e.x, e.y);
        break;
      case 'heal':
        if (mine(e.player) && seen(e.x, e.y)) at('heal', e.x, e.y);
        break;
      case 'chop':
        if (seen(e.x, e.y)) at('chop', e.x, e.y);
        break;
      case 'treeFelled':
        if (seen(e.x, e.y)) at('treeFall', e.x, e.y);
        break;
      case 'deliver':
        if (mine(e.player)) at(e.res === 'gold' ? 'goldDrop' : 'woodDrop', e.x, e.y);
        break;
      case 'buildingComplete':
        if (mine(e.player)) out.push({ cue: 'built' });
        break;
      case 'unitTrained':
        if (mine(e.player)) out.push({ cue: 'trained' });
        break;
      case 'researchComplete':
        if (mine(e.player)) out.push({ cue: 'research' });
        break;
      case 'levelUp':
        if (mine(e.player)) out.push({ cue: 'levelUp' });
        break;
      case 'itemPicked':
        if (mine(e.player)) at('pickup', e.x, e.y);
        break;
      case 'itemBought':
        if (mine(e.player)) out.push({ cue: 'coin' });
        break;
      case 'cantBuild':
      case 'cantTrain':
      case 'cantCast':
      case 'cantItem':
        if (mine(e.player)) out.push({ cue: 'error' });
        break;
      case 'popBlocked':
        if (mine(e.player)) out.push({ cue: 'popBlocked' });
        break;
      case 'heroFallen':
        if (mine(e.player)) out.push({ cue: 'heroFallen' });
        break;
      case 'mineDepleted':
        if (mine(e.player)) out.push({ cue: 'mineGone' });
        break;
      case 'campCleared':
        if (seen(e.x, e.y)) at('campCleared', e.x, e.y);
        break;
      case 'matchOver':
        out.push({ cue: e.winner === ctx.viewer ? 'victory' : 'defeat' });
        break;
    }
  }
  return out;
}

/** The acknowledgement for an order the player gives. */
export function orderCue(type: string): Cue | null {
  if (type === 'move') return 'orderMove';
  if (type === 'attack' || type === 'attackMove') return 'orderAttack';
  if (type === 'gather' || type === 'build' || type === 'resumeBuild' || type === 'returnCargo') return 'orderWork';
  return null;
}

/** The acknowledgement for a new selection: by what was picked. */
export function selectCue(types: string[]): Cue | null {
  if (!types.length) return null;
  if (types.some((t) => isHeroType(t))) return 'selectHero';
  if (types.some((t) => !isWorker(t as UnitType))) return 'selectSoldier';
  return 'select';
}

/**
 * Loudness of a cue heard from the camera: full nearby, fading out with
 * distance, silent beyond `reach`. Interface and alert cues are never placed.
 */
export function spatial(cue: Cue, at: { x?: number; y?: number }, listener: { x: number; y: number; reach: number }): { gain: number; pan: number } {
  const cat = CUE_CATEGORY[cue];
  if (at.x === undefined || at.y === undefined || cat === 'interface' || cat === 'alerts') return { gain: 1, pan: 0 };
  const d = Math.hypot(at.x - listener.x, at.y - listener.y);
  const gain = d >= listener.reach ? 0 : 1 - 0.85 * (d / listener.reach) ** 1.5;
  const pan = Math.max(-0.8, Math.min(0.8, (at.x - listener.x) / (listener.reach * 0.6)));
  return { gain, pan };
}
