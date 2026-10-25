// The settings screen: audio, graphics, camera, interface and controls.
// Every change applies at once and is saved; "Reset" restores the defaults
// of the open tab.

import { KEY_ACTIONS, keyLabel, rebind, type KeyAction } from '../input/keymap';
import { defaultSettings, RANGES, type Settings } from './settings';

type Tab = 'audio' | 'graphics' | 'camera' | 'interface' | 'controls';
const TABS: Array<[Tab, string]> = [
  ['audio', 'Audio'],
  ['graphics', 'Graphics'],
  ['camera', 'Camera'],
  ['interface', 'Interface'],
  ['controls', 'Controls'],
];

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function settingsHtml(s: Settings, tab: Tab, listening: KeyAction | null): string {
  const slider = (path: string, label: string, v: number, [lo, hi]: readonly [number, number], step: number, fmt: (v: number) => string = pct) =>
    `<label class="set-row"><span>${label}</span><input type="range" data-set="${path}" min="${lo}" max="${hi}" step="${step}" value="${v}"><output>${fmt(v)}</output></label>`;
  const check = (path: string, label: string, v: boolean, hint = '') =>
    `<label class="set-row check"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" data-set="${path}" ${v ? 'checked' : ''}></label>`;
  let body = '';
  if (tab === 'audio') {
    body =
      check('audio.muted', 'Mute all sound', s.audio.muted) +
      slider('audio.master', 'Master volume', s.audio.master, RANGES.volume, 0.05) +
      slider('audio.effects', 'Effects (construction, training, combat)', s.audio.effects, RANGES.volume, 0.05) +
      slider('audio.alerts', 'Alerts (under attack, sightings, result)', s.audio.alerts, RANGES.volume, 0.05) +
      `<p class="fine">Sounds are simple synthesized cues for now; original sound comes later.</p>`;
  } else if (tab === 'graphics') {
    body =
      check('graphics.shadows', 'Shadows', s.graphics.shadows, 'The most expensive effect: turn off on slow machines.') +
      slider('graphics.resolution', 'Rendering resolution', s.graphics.resolution, RANGES.resolution, 0.05) +
      `<label class="set-row"><span>Health bars</span><select data-set="graphics.healthBars">${(
        [
          ['damaged', 'Wounded and selected units'],
          ['always', 'Always'],
          ['selected', 'Selected units only'],
        ] as const
      )
        .map(([v, l]) => `<option value="${v}" ${s.graphics.healthBars === v ? 'selected' : ''}>${l}</option>`)
        .join('')}</select></label>`;
  } else if (tab === 'camera') {
    body =
      slider('camera.panSpeed', 'Scroll speed (keys and screen edge)', s.camera.panSpeed, RANGES.panSpeed, 0.1) +
      slider('camera.zoomSpeed', 'Zoom speed (mouse wheel)', s.camera.zoomSpeed, RANGES.zoomSpeed, 0.1) +
      check('camera.edgePan', 'Scroll when the mouse touches the screen edge', s.camera.edgePan);
  } else if (tab === 'interface') {
    body =
      slider('interface.uiScale', 'Interface size (bars, panels, text)', s.interface.uiScale, RANGES.uiScale, 0.05) +
      check('interface.colorblind', 'Colour-blind friendly teams', s.interface.colorblind, 'Blue and orange teams, health bars in blue, yellow and magenta. Teams also differ by shape on the minimap and by a coloured tab on health bars.') +
      check('interface.pauseOnBlur', 'Pause when the window loses focus', s.interface.pauseOnBlur);
  } else {
    const groups = [...new Set(KEY_ACTIONS.map((a) => a.group))];
    body =
      `<p class="fine">Click an action, then press its new key. A key already in use swaps with it. Number keys (control groups), Esc, F1 and F10 are fixed. Train, research, ability and item keys follow the command card (Q, W, E…).</p>` +
      groups
        .map(
          (g) =>
            `<h4>${g}</h4><div class="keys">${KEY_ACTIONS.filter((a) => a.group === g)
              .map(
                (a) =>
                  `<button class="key-row ${listening === a.id ? 'listening' : ''}" data-key="${a.id}"><span>${a.label}</span><kbd>${listening === a.id ? 'press a key…' : keyLabel(s.keys[a.id])}</kbd></button>`,
              )
              .join('')}</div>`,
        )
        .join('');
  }
  return `<h2>Settings</h2>
    <div class="tabs">${TABS.map(([id, l]) => `<button data-tab="${id}" class="${id === tab ? 'picked' : ''}">${l}</button>`).join('')}</div>
    <div class="set-body">${body}</div>
    <p class="fine" id="set-msg"></p>
    <div class="actions"><button id="set-reset">Reset ${TABS.find(([id]) => id === tab)![1].toLowerCase()}</button><button class="primary" id="set-done">Done</button></div>`;
}

/**
 * Wire a rendered settings screen. `apply` receives every change (and saves
 * it); `rerender` redraws the screen (tab switch, key capture).
 */
export function wireSettings(root: HTMLElement, s: Settings, tab: Tab, apply: (s: Settings) => void, rerender: (tab: Tab, listening: KeyAction | null) => void, done: () => void): void {
  const set = (path: string, value: unknown) => {
    const [a, b] = path.split('.') as [keyof Settings, string];
    (s[a] as Record<string, unknown>)[b] = value;
    apply(s);
  };
  root.querySelectorAll<HTMLInputElement>('input[type=range][data-set]').forEach((i) =>
    i.addEventListener('input', () => {
      set(i.dataset.set!, Number(i.value));
      i.nextElementSibling!.textContent = pct(Number(i.value));
    }),
  );
  root.querySelectorAll<HTMLInputElement>('input[type=checkbox][data-set]').forEach((i) => i.addEventListener('change', () => set(i.dataset.set!, i.checked)));
  root.querySelectorAll<HTMLSelectElement>('select[data-set]').forEach((i) => i.addEventListener('change', () => set(i.dataset.set!, i.value)));
  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => rerender(b.dataset.tab as Tab, null)));
  root.querySelector('#set-done')!.addEventListener('click', done);
  root.querySelector('#set-reset')!.addEventListener('click', () => {
    const d = defaultSettings();
    if (tab === 'controls') s.keys = d.keys;
    else (s as unknown as Record<string, unknown>)[tab] = (d as unknown as Record<string, unknown>)[tab];
    apply(s);
    rerender(tab, null);
  });
  root.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
    b.addEventListener('click', () => {
      const action = b.dataset.key as KeyAction;
      rerender('controls', action);
      const capture = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();
        window.removeEventListener('keydown', capture, true);
        if (e.key === 'Escape') return rerender('controls', null);
        const key = e.key === ' ' ? 'space' : e.key.toLowerCase();
        const r = rebind(s.keys, action, key);
        if ('error' in r) {
          rerender('controls', null);
          root.querySelector('#set-msg')!.textContent = r.error;
          return;
        }
        s.keys = r.map;
        apply(s);
        rerender('controls', null);
        const label = KEY_ACTIONS.find((x) => x.id === action)!.label;
        root.querySelector('#set-msg')!.textContent = r.swapped
          ? `${label} is now ${keyLabel(key)}; ${KEY_ACTIONS.find((x) => x.id === r.swapped)!.label} moved to ${keyLabel(s.keys[r.swapped])}.`
          : `${label} is now ${keyLabel(key)}.`;
      };
      window.addEventListener('keydown', capture, true);
    }),
  );
}

export type { Tab as SettingsTab };
