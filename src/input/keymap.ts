// Remappable keys. Each action has one key, stored as KeyboardEvent.key in
// lower case ("a", "f2", ".", "arrowleft"; the space bar is "space").
// Building, ability, item and shop keys on the command card (Q W E R ...)
// follow the card's grid and are not remapped here.
//
// Rebinding swaps: giving an action a key another action already uses
// hands that action the old key, so two actions never share one.

import { CONFIG } from '../sim/config';
import { FACTION, type BuildingRole } from '../sim/factions';

export type KeyAction =
  | 'move'
  | 'stop'
  | 'attack'
  | 'hold'
  | 'gather'
  | 'return'
  | 'cancel'
  | 'idleWorker'
  | 'jumpAlert'
  | 'selectHero'
  | 'pause'
  | 'debug'
  | 'panLeft'
  | 'panRight'
  | 'panUp'
  | 'panDown'
  | `build:${BuildingRole}`;

export type KeyMap = Record<KeyAction, string>;

export interface KeyActionDef {
  id: KeyAction;
  label: string;
  group: 'Commands' | 'Build (worker selected)' | 'Camera' | 'Interface';
  key: string;
}

export const KEY_ACTIONS: KeyActionDef[] = [
  { id: 'move', label: 'Move', group: 'Commands', key: 'm' },
  { id: 'stop', label: 'Stop', group: 'Commands', key: 's' },
  { id: 'attack', label: 'Attack / attack-move', group: 'Commands', key: 'a' },
  { id: 'hold', label: 'Hold position', group: 'Commands', key: 'h' },
  { id: 'gather', label: 'Gather', group: 'Commands', key: 'g' },
  { id: 'return', label: 'Return cargo', group: 'Commands', key: 'r' },
  { id: 'cancel', label: 'Cancel construction or last queued', group: 'Commands', key: 'x' },
  // One key per building role: the same key builds the Crown's Farm or the Thornwild Grove.
  ...(Object.entries(FACTION.crown.buildings) as Array<[BuildingRole, keyof typeof CONFIG.buildings]>).map(([role, t]) => ({
    id: `build:${role}` as KeyAction,
    label: `${CONFIG.buildings[t].name} / ${CONFIG.buildings[FACTION.wild.buildings[role]].name}`,
    group: 'Build (worker selected)' as const,
    key: CONFIG.buildings[t].hotkey.toLowerCase(),
  })),
  { id: 'panLeft', label: 'Pan left', group: 'Camera', key: 'arrowleft' },
  { id: 'panRight', label: 'Pan right', group: 'Camera', key: 'arrowright' },
  { id: 'panUp', label: 'Pan up', group: 'Camera', key: 'arrowup' },
  { id: 'panDown', label: 'Pan down', group: 'Camera', key: 'arrowdown' },
  { id: 'jumpAlert', label: 'Jump to latest alert', group: 'Camera', key: 'space' },
  { id: 'idleWorker', label: 'Next idle Laborer', group: 'Interface', key: '.' },
  { id: 'selectHero', label: 'Select hero', group: 'Interface', key: 'f2' },
  { id: 'pause', label: 'Pause', group: 'Interface', key: 'p' },
  { id: 'debug', label: 'Debug overlay', group: 'Interface', key: '`' },
];

/** Keys the game keeps for itself: number keys (control groups), Esc, F1, F10, Shift-like modifiers. */
const RESERVED = /^(?:[0-9]|escape|f1|f10|shift|control|alt|meta|tab|capslock|enter)$/;

export function defaultKeyMap(): KeyMap {
  return Object.fromEntries(KEY_ACTIONS.map((a) => [a.id, a.key])) as KeyMap;
}

/** A stored map with defaults filled in, unknown entries dropped and clashes resolved. */
export function cleanKeyMap(stored: Partial<Record<string, unknown>> | undefined): KeyMap {
  const map = defaultKeyMap();
  if (!stored) return map;
  for (const a of KEY_ACTIONS) {
    const k = stored[a.id];
    if (typeof k === 'string' && k && !RESERVED.test(k)) map[a.id] = k;
  }
  // A clash (from an edited or older file): later actions fall back to defaults.
  return clashes(map).length ? defaultKeyMap() : map;
}

/** The key of a keyboard event, in key-map form. */
export function eventKey(e: Pick<KeyboardEvent, 'key'>): string {
  return e.key === ' ' ? 'space' : e.key.toLowerCase();
}

export function isReserved(key: string): boolean {
  return RESERVED.test(key);
}

/** Give `action` the key `key`; whoever had it gets the action's old key. */
export function rebind(map: KeyMap, action: KeyAction, key: string): { map: KeyMap; swapped: KeyAction | null } | { error: string } {
  if (isReserved(key)) return { error: `${keyLabel(key)} is kept by the game (control groups, menus).` };
  const next = { ...map };
  const holder = (Object.keys(next) as KeyAction[]).find((a) => a !== action && next[a] === key) ?? null;
  if (holder) next[holder] = map[action];
  next[action] = key;
  return { map: next, swapped: holder };
}

/** Pairs of actions sharing a key (should never happen after rebind). */
export function clashes(map: KeyMap): Array<[KeyAction, KeyAction]> {
  const seen = new Map<string, KeyAction>();
  const out: Array<[KeyAction, KeyAction]> = [];
  for (const a of KEY_ACTIONS) {
    const other = seen.get(map[a.id]);
    if (other) out.push([other, a.id]);
    else seen.set(map[a.id], a.id);
  }
  return out;
}

/** How a key reads on buttons and in the controls list. */
export function keyLabel(key: string): string {
  const names: Record<string, string> = { space: 'Space', arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', escape: 'Esc', '`': '`' };
  if (names[key]) return names[key];
  return key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1);
}
