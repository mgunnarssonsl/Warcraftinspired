// Saved matches: a versioned envelope around the simulation state, the
// computer players' state, commands not yet applied, and the viewer's own
// camera and control groups. Saves are plain JSON, kept in browser storage
// slots or exported to a file.
//
// Versioning: SAVE_VERSION goes up whenever the saved shape changes. Older
// saves are carried forward by MIGRATIONS (one step per version); a save
// from a newer build, or one too old to migrate, is refused with a clear
// reason instead of being loaded half-broken.

import type { AiSnapshot } from '../ai/computer';
import type { AdvantageId, Difficulty, StyleId } from '../ai/profile';
import type { Command } from '../sim/commands';
import type { FactionId } from '../sim/factions';
import { mapById } from '../sim/maps';
import type { GameState } from '../sim/types';

export const SAVE_FORMAT = 'ironvale-save';
export const SAVE_VERSION = 2;

/** The match settings a save was started with (same shape as the start screen's). */
export interface SavedMatch {
  seed: number;
  difficulty: Difficulty;
  mapId: string;
  style: StyleId | 'random';
  advantage: AdvantageId;
  /** The viewer's faction, and the computer's (or 'random', fixed by the seed). */
  faction: FactionId;
  opponentFaction: FactionId | 'random';
}

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  /** ISO time the save was made (for the slot list). */
  savedAt: string;
  match: SavedMatch;
  state: GameState;
  pending: Command[];
  /** Fog: what each player sees right now (Game.vision.snapshot()). */
  visible: string[];
  ai: AiSnapshot[];
  /** The viewer's camera and control groups. */
  view: { player: number; camera: { x: number; y: number; distance: number }; groups: Record<number, number[]> };
}

export type ParseResult = { ok: true; save: SaveFile } | { ok: false; reason: string };

/** Steps that upgrade a save from version n to n + 1, keyed by n. */
const MIGRATIONS: Record<number, (save: Record<string, unknown>) => Record<string, unknown>> = {
  // 1 -> 2: factions. Everyone before then played the Crown; nothing had
  // been hurt for regrowth, and nothing was growing.
  1: (save) => {
    const state = save.state as { players?: Array<Record<string, unknown>>; entities?: Record<string, Record<string, unknown>> } | undefined;
    for (const p of state?.players ?? []) p.faction ??= 'crown';
    for (const e of Object.values(state?.entities ?? {})) {
      e.hurt ??= -1e9;
      if (e.kind === 'building') e.grows ??= false;
    }
    const match = save.match as Record<string, unknown> | undefined;
    if (match) {
      match.faction ??= 'crown';
      match.opponentFaction ??= 'crown';
    }
    return save;
  },
};

export function makeSave(parts: Omit<SaveFile, 'format' | 'version' | 'savedAt'>, now = new Date()): SaveFile {
  return { format: SAVE_FORMAT, version: SAVE_VERSION, savedAt: now.toISOString(), ...parts };
}

/** Read a save, upgrading old versions; never throws. */
export function parseSave(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'The file is damaged or is not a saved game.' };
  }
  if (!raw || typeof raw !== 'object' || (raw as { format?: unknown }).format !== SAVE_FORMAT) {
    return { ok: false, reason: 'This is not an Ironvale saved game.' };
  }
  let save = raw as Record<string, unknown>;
  let version = typeof save.version === 'number' ? save.version : NaN;
  if (!Number.isInteger(version) || version < 1) return { ok: false, reason: 'The save has no valid version number.' };
  if (version > SAVE_VERSION) {
    return { ok: false, reason: `This save comes from a newer version of the game (save format ${version}, this game reads up to ${SAVE_VERSION}).` };
  }
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return { ok: false, reason: `This save is too old to load (save format ${version}).` };
    save = step(save);
    version++;
    save.version = version;
  }
  const problem = shapeProblem(save);
  if (problem) return { ok: false, reason: `The save is incomplete or damaged: ${problem}.` };
  return { ok: true, save: save as unknown as SaveFile };
}

/** A sanity check of the parts the game needs, so a bad save fails here, not mid-match. */
function shapeProblem(s: Record<string, unknown>): string | null {
  const state = s.state as Partial<GameState> | undefined;
  if (!state || typeof state !== 'object') return 'no match state';
  if (typeof state.tick !== 'number' || !state.entities || typeof state.entities !== 'object') return 'no entities';
  if (!Array.isArray(state.players) || state.players.length < 2) return 'no players';
  if (!state.map || !Array.isArray(state.map.terrain) || state.map.terrain.length !== state.map.width * state.map.height) return 'a broken map';
  if (!Array.isArray(state.explored) || !Array.isArray(state.memory) || !Array.isArray(state.history)) return 'no fog of war data';
  if (mapById(state.mapId).id !== state.mapId) return `an unknown map "${String(state.mapId)}"`;
  const match = s.match as Partial<SavedMatch> | undefined;
  if (!match || typeof match.seed !== 'number') return 'no match settings';
  if (!Array.isArray(s.ai) || !Array.isArray(s.pending)) return 'no computer player state';
  if (!Array.isArray(s.visible)) return 'no fog of war data';
  const view = s.view as Partial<SaveFile['view']> | undefined;
  if (!view || !view.camera || typeof view.player !== 'number') return 'no camera';
  return null;
}

// ---- storage slots ---------------------------------------------------------------

export type SlotId = 'auto' | '1' | '2' | '3';
export const SLOTS: SlotId[] = ['auto', '1', '2', '3'];
const key = (slot: SlotId) => `ironvale.save.${slot}`;

/** What the slot list shows without loading the whole match. */
export interface SlotInfo {
  slot: SlotId;
  savedAt: string;
  mapId: string;
  difficulty: string;
  style: string;
  tick: number;
}

export class SaveStore {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {}

  /** Store a save; reports a full storage instead of throwing. */
  write(slot: SlotId, save: SaveFile): { ok: true } | { ok: false; reason: string } {
    try {
      this.storage.setItem(key(slot), JSON.stringify(save));
      this.storage.setItem(`${key(slot)}.info`, JSON.stringify(slotInfo(slot, save)));
      return { ok: true };
    } catch {
      return { ok: false, reason: 'The browser refused to store the save (storage full or disabled). Export it to a file instead.' };
    }
  }

  read(slot: SlotId): ParseResult | null {
    const text = this.storage.getItem(key(slot));
    return text === null ? null : parseSave(text);
  }

  info(slot: SlotId): SlotInfo | null {
    try {
      const t = this.storage.getItem(`${key(slot)}.info`);
      return t ? (JSON.parse(t) as SlotInfo) : null;
    } catch {
      return null;
    }
  }

  remove(slot: SlotId): void {
    this.storage.removeItem(key(slot));
    this.storage.removeItem(`${key(slot)}.info`);
  }

  /** The newest save of all slots, for "Continue". */
  latest(): SlotId | null {
    let best: SlotInfo | null = null;
    for (const s of SLOTS) {
      const i = this.info(s);
      if (i && (!best || i.savedAt > best.savedAt)) best = i;
    }
    return best?.slot ?? null;
  }
}

export function slotInfo(slot: SlotId, save: SaveFile): SlotInfo {
  return { slot, savedAt: save.savedAt, mapId: save.match.mapId, difficulty: save.match.difficulty, style: save.match.style, tick: save.state.tick };
}
