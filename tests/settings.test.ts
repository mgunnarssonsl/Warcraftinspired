import { describe, expect, it } from 'vitest';
import { clashes, cleanKeyMap, defaultKeyMap, eventKey, KEY_ACTIONS, keyLabel, rebind } from '../src/input/keymap';
import { cleanSettings, defaultSettings, loadSettings, saveSettings } from '../src/ui/settings';

describe('key map', () => {
  it('the defaults are the documented keys, with no clashes', () => {
    const m = defaultKeyMap();
    expect([m.move, m.stop, m.attack, m.hold, m['build:farm'], m.idleWorker, m.jumpAlert]).toEqual(['m', 's', 'a', 'h', 'f', '.', 'space']);
    expect(clashes(m)).toEqual([]);
  });

  it('rebinding to a taken key swaps the two actions', () => {
    const r = rebind(defaultKeyMap(), 'attack', 's');
    if ('error' in r) throw new Error(r.error);
    expect(r.map.attack).toBe('s');
    expect(r.map.stop).toBe('a');
    expect(r.swapped).toBe('stop');
    expect(clashes(r.map)).toEqual([]);
  });

  it('keys the game keeps (number keys, Esc, F1, F10) cannot be bound', () => {
    for (const k of ['1', '0', 'escape', 'f10', 'f1']) expect('error' in rebind(defaultKeyMap(), 'move', k)).toBe(true);
  });

  it('a stored map is cleaned: unknown actions dropped, reserved keys and clashes rejected', () => {
    expect(cleanKeyMap({ move: 'q', bogus: 'z' }).move).toBe('q');
    expect(cleanKeyMap({ move: '1' }).move).toBe('m');
    // Two actions on one key: back to the defaults rather than a broken map.
    expect(cleanKeyMap({ move: 'a' })).toEqual(defaultKeyMap());
    expect(Object.keys(cleanKeyMap({})).length).toBe(KEY_ACTIONS.length);
  });

  it('reads keyboard events and shows keys readably', () => {
    expect(eventKey({ key: 'A' })).toBe('a');
    expect(eventKey({ key: ' ' })).toBe('space');
    expect([keyLabel('a'), keyLabel('space'), keyLabel('arrowleft'), keyLabel('f2')]).toEqual(['A', 'Space', '←', 'F2']);
  });
});

describe('settings', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it('round-trip through storage', () => {
    const store = memory();
    const s = defaultSettings();
    s.audio.master = 0.3;
    s.interface.colorblind = true;
    s.keys.attack = 'q';
    saveSettings(store, s);
    expect(loadSettings(store)).toEqual(s);
  });

  it('missing, damaged or out-of-range values fall back safely', () => {
    expect(loadSettings(null)).toEqual(defaultSettings());
    const store = memory();
    store.setItem('ironvale.settings', '{not json');
    expect(loadSettings(store)).toEqual(defaultSettings());
    const s = cleanSettings({ audio: { master: 7, muted: 'yes' }, interface: { uiScale: 0.1 }, graphics: { healthBars: 'sometimes' } });
    expect(s.audio.master).toBe(1);
    // An older "effects" volume carries over to combat and economy.
    expect(cleanSettings({ audio: { effects: 0.2 } }).audio).toMatchObject({ combat: 0.2, economy: 0.2 });
    expect(s.audio.muted).toBe(false);
    expect(s.interface.uiScale).toBe(0.8);
    expect(s.graphics.healthBars).toBe('damaged');
  });

  it('a settings file from a newer build keeps the fields this build knows', () => {
    const s = cleanSettings({ version: 99, camera: { panSpeed: 2, futureThing: true }, newSection: {} });
    expect(s.camera.panSpeed).toBe(2);
  });
});
