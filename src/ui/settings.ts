// Player settings: audio, graphics, camera, interface and keys. Stored in
// browser storage apart from saved matches, versioned the same way: a
// missing or unreadable field falls back to its default, so a settings file
// from an older build never stops the game from starting.

import { cleanKeyMap, defaultKeyMap, type KeyMap } from '../input/keymap';

export const SETTINGS_VERSION = 1;
const STORAGE_KEY = 'ironvale.settings';

export type HealthBars = 'always' | 'damaged' | 'selected';

export interface Settings {
  audio: { master: number; effects: number; alerts: number; muted: boolean };
  graphics: {
    /** Real-time shadows (the most expensive effect). */
    shadows: boolean;
    /** Rendering resolution as a share of the screen's (lower is faster). */
    resolution: number;
    healthBars: HealthBars;
  };
  camera: { panSpeed: number; zoomSpeed: number; edgePan: boolean };
  interface: {
    /** Size of the bars, panels and text (1 = 100%). */
    uiScale: number;
    /** Team colours that stay apart for red-green colour blindness, plus shape cues. */
    colorblind: boolean;
    /** Pause when the window loses focus. */
    pauseOnBlur: boolean;
  };
  keys: KeyMap;
}

export function defaultSettings(): Settings {
  return {
    audio: { master: 0.7, effects: 0.8, alerts: 1, muted: false },
    graphics: { shadows: true, resolution: 1, healthBars: 'damaged' },
    camera: { panSpeed: 1, zoomSpeed: 1, edgePan: true },
    interface: { uiScale: 1, colorblind: false, pauseOnBlur: true },
    keys: defaultKeyMap(),
  };
}

/** Limits for the numeric settings: [min, max]. */
export const RANGES = {
  volume: [0, 1],
  resolution: [0.5, 1],
  panSpeed: [0.3, 2.5],
  zoomSpeed: [0.3, 2.5],
  uiScale: [0.8, 1.6],
} as const;

const clamp = (v: unknown, [lo, hi]: readonly [number, number], d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

/** Settings read back from storage, each field checked; anything odd falls back to its default. */
export function cleanSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as { version?: number } & Partial<Record<keyof Settings, Record<string, unknown>>>;
  // Newer settings (from a later build) are read field by field too: what we know, we keep.
  const a = r.audio ?? {};
  const g = r.graphics ?? {};
  const c = r.camera ?? {};
  const i = r.interface ?? {};
  return {
    audio: {
      master: clamp(a.master, RANGES.volume, d.audio.master),
      effects: clamp(a.effects, RANGES.volume, d.audio.effects),
      alerts: clamp(a.alerts, RANGES.volume, d.audio.alerts),
      muted: bool(a.muted, d.audio.muted),
    },
    graphics: {
      shadows: bool(g.shadows, d.graphics.shadows),
      resolution: clamp(g.resolution, RANGES.resolution, d.graphics.resolution),
      healthBars: g.healthBars === 'always' || g.healthBars === 'selected' || g.healthBars === 'damaged' ? g.healthBars : d.graphics.healthBars,
    },
    camera: {
      panSpeed: clamp(c.panSpeed, RANGES.panSpeed, d.camera.panSpeed),
      zoomSpeed: clamp(c.zoomSpeed, RANGES.zoomSpeed, d.camera.zoomSpeed),
      edgePan: bool(c.edgePan, d.camera.edgePan),
    },
    interface: {
      uiScale: clamp(i.uiScale, RANGES.uiScale, d.interface.uiScale),
      colorblind: bool(i.colorblind, d.interface.colorblind),
      pauseOnBlur: bool(i.pauseOnBlur, d.interface.pauseOnBlur),
    },
    keys: cleanKeyMap(r.keys as Record<string, unknown> | undefined),
  };
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function loadSettings(storage: Store | null): Settings {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return cleanSettings(text ? JSON.parse(text) : null);
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(storage: Store | null, s: Settings): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ version: SETTINGS_VERSION, ...s }));
  } catch {
    // Storage disabled or full: settings still apply for this session.
  }
}

/** Browser storage if the page may use it (it can throw in private windows). */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Team colours: the match's own, or a colour-blind-safe pair (blue and orange). */
export const COLORBLIND_TEAMS = ['#3a8ee6', '#f0a020'];
