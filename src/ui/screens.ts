// Full-screen panels: the start screen (new match, continue, load, tutorial,
// settings), the in-game menu (save, load, settings, restart, surrender),
// saved-game slots, settings, and the end-of-match summary with the
// computer's plan and decisions.

import type { AdvantageId, Difficulty, StyleId } from '../ai/profile';
import { SLOTS, type SaveStore, type SlotId } from '../save/save';
import { CONFIG, TICK_RATE } from '../sim/config';
import type { Game } from '../sim/game';
import { mapById, MAPS } from '../sim/maps';
import type { Settings } from './settings';
import { settingsHtml, wireSettings, type SettingsTab } from './settingsPanel';
import { summaryHtml } from './summary';

export type Modal = 'start' | 'menu' | 'end' | 'settings' | 'saves' | null;

export interface MatchSettings {
  seed: number;
  difficulty: Difficulty;
  mapId: string;
  /** The opponent's strategic style, or 'random' (fixed by the seed, revealed at the end). */
  style: StyleId | 'random';
  advantage: AdvantageId;
}

/** What the screens need from the running game (main.ts provides it). */
export interface ScreenHost {
  settings: Settings;
  /** Apply and store changed settings. */
  applySettings(s: Settings): void;
  store: SaveStore;
  saveTo(slot: SlotId): { ok: true } | { ok: false; reason: string };
  /** Download the current match as a file. */
  exportSave(): void;
  /** Leave this match and continue a saved one (from a slot or a file's text). */
  load(source: { slot: SlotId } | { text: string }): void;
  startTutorial(): void;
  /** Set when a load failed: shown on the start screen. */
  loadError: string | null;
  /** True while playing the tutorial (no saving needed, different end). */
  tutorial: boolean;
}

/** Difficulty is how well it plays; the style (below) is what it plans. */
const DIFFICULTIES: Array<{ id: Difficulty; label: string; blurb: string }> = [
  { id: 'easy', label: 'Easy', blurb: 'Slow to react and to notice idle Laborers; never retreats or adapts.' },
  { id: 'normal', label: 'Normal', blurb: 'Scouts, adapts its army, regroups and falls back from bad fights.' },
  { id: 'hard', label: 'Hard', blurb: 'Reacts at once, focuses fire, reinforces its attacks, runs three Keeps.' },
];

/** Reload into a new match (a clean page is the most reliable reset). */
export function startMatch(s: MatchSettings): void {
  const q = new URLSearchParams({ seed: String(s.seed), difficulty: s.difficulty, map: s.mapId, style: s.style, adv: s.advantage, start: '1' });
  location.search = q.toString();
}

/** "Hard · Raider", with the style kept secret while a random one is in play. */
export function opponentLabel(s: MatchSettings, resolved: StyleId, reveal: boolean): string {
  const level = s.difficulty[0].toUpperCase() + s.difficulty.slice(1);
  const style = s.style === 'random' && !reveal ? 'random style' : CONFIG.ai.styles[resolved].name;
  return `${level} · ${style}`;
}

export function newSeed(): number {
  return Math.floor(Math.random() * 1e9);
}

function fmtTime(ticks: number): string {
  const s = Math.floor(ticks / TICK_RATE);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function escapeHtml(t: string): string {
  return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export class Screens {
  private root = document.getElementById('modal')!;
  current: Modal = null;
  /** The screen to return to from settings or saves. */
  private back: 'start' | 'menu' | 'end' = 'start';
  onClose: () => void = () => {};
  onSurrender: () => void = () => {};
  /** How the viewer was defeated, recorded from simulation events. */
  defeatReason: 'eliminated' | 'surrendered' | null = null;
  /** The style the computer actually plays, and its decision journal. */
  opponent: { style: StyleId; journal: ReadonlyArray<{ tick: number; text: string }> } = { style: 'balanced', journal: [] };

  constructor(
    private game: Game,
    private settings: MatchSettings,
    private viewer: number,
    private host: ScreenHost,
  ) {}

  close(): void {
    this.current = null;
    this.root.classList.add('hidden');
    this.root.replaceChildren();
    this.onClose();
  }

  private open(kind: Modal, html: string): void {
    this.current = kind;
    this.root.innerHTML = `<div class="modal-card ${kind}">${html}</div>`;
    this.root.classList.remove('hidden');
  }

  private on(sel: string, fn: () => void): void {
    this.root.querySelector(sel)?.addEventListener('click', fn);
  }

  private returnTo(): void {
    if (this.back === 'start') this.showStart();
    else if (this.back === 'end') this.showEnd();
    else this.showMenu();
  }

  showStart(): void {
    let picked: Difficulty = this.settings.difficulty;
    let pickedMap = this.settings.mapId;
    let pickedStyle: StyleId | 'random' = this.settings.style;
    let pickedAdv: AdvantageId = this.settings.advantage;
    const styles: Array<{ id: StyleId | 'random'; name: string; blurb: string }> = [
      { id: 'random', name: 'Random', blurb: 'One of the styles below, kept secret until the end of the match.' },
      ...(Object.entries(CONFIG.ai.styles) as Array<[StyleId, (typeof CONFIG.ai.styles)[StyleId]]>).map(([id, st]) => ({ id, name: st.name, blurb: st.blurb })),
    ];
    const styleBlurb = (id: string) => styles.find((x) => x.id === id)!.blurb;
    const latest = this.host.store.latest();
    const latestInfo = latest ? this.host.store.info(latest) : null;
    this.open(
      'start',
      `<h1>Ironvale</h1>
      <p class="lead">Build an economy, raise an army, and destroy every enemy building before they destroy yours.</p>
      ${this.host.loadError ? `<p class="load-error">${escapeHtml(this.host.loadError)}</p>` : ''}
      <div class="start-actions">
        <button id="tutorial"><b>Tutorial</b><span>New here? Learn the basics in about ten minutes.</span></button>
        ${latestInfo ? `<button id="continue"><b>Continue</b><span>${this.slotLine(latest!)}</span></button>` : ''}
        <button id="load"><b>Load a saved game…</b><span>From a slot or a file.</span></button>
        <button id="settings"><b>Settings</b><span>Sound, graphics, camera, interface, controls.</span></button>
      </div>
      <h2 class="new-match">New match</h2>
      <div class="choices">
        <div>
          <h3>Map</h3>
          <div class="difficulty">
            ${MAPS.map((m) => `<button data-m="${m.id}" class="${m.id === pickedMap ? 'picked' : ''}"><b>${m.name}</b><span>${m.blurb}</span></button>`).join('')}
          </div>
        </div>
        <div>
          <h3>Opponent</h3>
          <div class="difficulty">
            ${DIFFICULTIES.map((d) => `<button data-d="${d.id}" class="${d.id === picked ? 'picked' : ''}"><b>${d.label}</b><span>${d.blurb}</span></button>`).join('')}
          </div>
          <h3>Style</h3>
          <div class="chips">
            ${styles.map((st) => `<button data-s="${st.id}" class="${st.id === pickedStyle ? 'picked' : ''}">${st.name}</button>`).join('')}
          </div>
          <p class="fine" id="style-blurb">${styleBlurb(pickedStyle)}</p>
          <h3>Computer advantage</h3>
          <div class="chips">
            ${(Object.entries(CONFIG.ai.advantages) as Array<[AdvantageId, { name: string }]>).map(([id, a]) => `<button data-a="${id}" class="${id === pickedAdv ? 'picked' : ''}${id === 'none' ? '' : ' cheat'}">${a.name}</button>`).join('')}
          </div>
        </div>
      </div>
      <p class="fine">Without an advantage the computer plays by exactly your rules: the same costs, the same fog of war, no hidden information. An advantage is a cheat and is always shown as one. F1 in a match lists every control.</p>
      <div class="actions"><button class="primary" id="go">Start match</button></div>`,
    );
    const pick = (attr: string, fn: (v: string) => void) =>
      this.root.querySelectorAll<HTMLButtonElement>(`button[data-${attr}]`).forEach((b) =>
        b.addEventListener('click', () => {
          fn(b.dataset[attr]!);
          this.root.querySelectorAll(`button[data-${attr}]`).forEach((x) => x.classList.toggle('picked', x === b));
        }),
      );
    pick('d', (v) => (picked = v as Difficulty));
    pick('m', (v) => (pickedMap = v));
    pick('s', (v) => {
      pickedStyle = v as StyleId | 'random';
      this.root.querySelector('#style-blurb')!.textContent = styleBlurb(pickedStyle);
    });
    pick('a', (v) => (pickedAdv = v as AdvantageId));
    this.on('#go', () => {
      const next: MatchSettings = { seed: this.settings.seed, difficulty: picked, mapId: pickedMap, style: pickedStyle, advantage: pickedAdv };
      const same = !this.host.tutorial && (Object.keys(next) as Array<keyof MatchSettings>).every((k) => next[k] === this.settings[k]);
      if (!same) startMatch(next);
      else this.close();
    });
    this.on('#tutorial', () => this.host.startTutorial());
    this.on('#continue', () => latest && this.host.load({ slot: latest }));
    this.on('#load', () => this.showSaves('load', 'start'));
    this.on('#settings', () => this.showSettings('start'));
  }

  showMenu(): void {
    if (this.current === 'start') return;
    const over = !!this.game.state.outcome;
    this.open(
      'menu',
      `<h2>Paused</h2>
      <p class="fine">${this.host.tutorial ? 'Tutorial' : `Map: ${mapById(this.settings.mapId).name} · opponent: ${opponentLabel(this.settings, this.opponent.style, over)}${this.settings.advantage === 'none' ? '' : ` · ${CONFIG.ai.advantages[this.settings.advantage].name}`}`} · match time ${fmtTime(this.game.state.tick)} · seed ${this.settings.seed}</p>
      <div class="stack">
        <button class="primary" id="resume">Resume</button>
        ${this.host.tutorial ? '' : '<button id="save">Save game…</button>'}
        <button id="load">Load game…</button>
        <button id="settings">Settings…</button>
        <button id="restart">${this.host.tutorial ? 'Restart the tutorial' : 'Restart (same map and opponent)'}</button>
        <button id="new">New match…</button>
        ${over || this.host.tutorial ? '' : '<button class="danger" id="surrender">Surrender</button>'}
      </div>`,
    );
    this.on('#resume', () => this.close());
    this.on('#save', () => this.showSaves('save', 'menu'));
    this.on('#load', () => this.showSaves('load', 'menu'));
    this.on('#settings', () => this.showSettings('menu'));
    this.on('#restart', () => (this.host.tutorial ? this.host.startTutorial() : startMatch(this.settings)));
    this.on('#new', () => {
      const q = new URLSearchParams({ seed: String(newSeed()), difficulty: this.settings.difficulty, map: this.settings.mapId, style: this.settings.style, adv: this.settings.advantage });
      location.search = q.toString();
    });
    this.on('#surrender', () => {
      this.onSurrender();
      this.close();
    });
  }

  private slotLine(slot: SlotId): string {
    const i = this.host.store.info(slot);
    if (!i) return 'Empty';
    const when = new Date(i.savedAt);
    const style = i.style === 'random' ? 'random style' : (CONFIG.ai.styles[i.style as StyleId]?.name ?? i.style);
    return `${mapById(i.mapId).name} · ${i.difficulty} ${style} · ${fmtTime(i.tick)} · saved ${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  /** Saved-game slots: save into one, or load one (or a file). */
  showSaves(mode: 'save' | 'load', back: 'start' | 'menu' | 'end', message = ''): void {
    this.back = back;
    const slots = SLOTS.filter((s) => mode === 'load' || s !== 'auto');
    this.open(
      'saves',
      `<h2>${mode === 'save' ? 'Save game' : 'Load game'}</h2>
      <p class="fine">${mode === 'save' ? 'Pick a slot. Saves stay in this browser; export one to keep it elsewhere.' : 'The autosave is made every two minutes of play and when you leave the page.'}</p>
      <div class="slots">${slots
        .map((s) => {
          const info = this.host.store.info(s);
          const name = s === 'auto' ? 'Autosave' : `Slot ${s}`;
          return `<div class="slot"><div><b>${name}</b><span>${escapeHtml(this.slotLine(s))}</span></div><div class="slot-actions">
            ${mode === 'save' ? `<button data-save="${s}">${info ? 'Overwrite' : 'Save here'}</button>` : info ? `<button data-load="${s}" class="primary">Load</button>` : ''}
            ${info && s !== 'auto' ? `<button data-del="${s}" class="danger">Delete</button>` : ''}</div></div>`;
        })
        .join('')}</div>
      <p class="fine" id="save-msg">${escapeHtml(message)}</p>
      <div class="actions">
        ${mode === 'save' ? '<button id="export">Export to a file…</button>' : '<label class="file-btn">Load from a file…<input type="file" id="import" accept=".json,application/json"></label>'}
        <button class="primary" id="back">Back</button>
      </div>`,
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((b) =>
      b.addEventListener('click', () => {
        const r = this.host.saveTo(b.dataset.save as SlotId);
        this.showSaves('save', back, r.ok ? `Saved in slot ${b.dataset.save}.` : r.reason);
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-load]').forEach((b) => b.addEventListener('click', () => this.host.load({ slot: b.dataset.load as SlotId })));
    this.root.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) =>
      b.addEventListener('click', () => {
        this.host.store.remove(b.dataset.del as SlotId);
        this.showSaves(mode, back, `Slot ${b.dataset.del} deleted.`);
      }),
    );
    this.on('#export', () => this.host.exportSave());
    this.root.querySelector<HTMLInputElement>('#import')?.addEventListener('change', async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) this.host.load({ text: await f.text() });
    });
    this.on('#back', () => this.returnTo());
  }

  private settingsTab: SettingsTab = 'audio';

  showSettings(back: 'start' | 'menu' | 'end'): void {
    this.back = back;
    const render = (tab: SettingsTab, listening: Parameters<typeof settingsHtml>[2]) => {
      this.settingsTab = tab;
      this.open('settings', settingsHtml(this.host.settings, tab, listening));
      wireSettings(this.root, this.host.settings, tab, (s) => this.host.applySettings(s), render, () => this.returnTo());
    };
    render(this.settingsTab, null);
  }

  showEnd(): void {
    const o = this.game.state.outcome;
    if (!o) return;
    this.back = 'end';
    const title = o.winner === null ? 'Draw' : o.winner === this.viewer ? 'Victory' : 'Defeat';
    const reason =
      o.winner === null
        ? 'Both sides lost their last building at the same moment.'
        : o.winner === this.viewer
          ? 'Every enemy building has been destroyed.'
          : this.defeatReason === 'surrendered'
            ? 'You surrendered.'
            : 'All of your buildings were destroyed.';
    const names: Record<number, string> = { [this.viewer]: 'You' };
    for (const p of this.game.state.players) if (!p.neutral && p.id !== this.viewer) names[p.id] = 'Computer';
    this.open(
      'end',
      `<h1 class="${title.toLowerCase()}">${title}</h1>
      <p class="lead">${reason} Match time ${fmtTime(o.tick)}.</p>
      ${summaryHtml(this.game, this.viewer, names)}
      ${
        this.host.tutorial
          ? ''
          : `<h3>Your opponent: ${opponentLabel(this.settings, this.opponent.style, true)}${this.settings.style === 'random' ? ' (picked at random)' : ''}</h3>
      <p class="fine">${CONFIG.ai.styles[this.opponent.style].blurb}${this.settings.advantage === 'none' ? ' It had no advantage.' : ` It had an advantage: ${CONFIG.ai.advantages[this.settings.advantage].name}.`}</p>
      ${this.journalHtml()}`
      }
      <div class="actions">
        <button class="primary" id="again">Play again</button>
        <button id="change">Change opponent</button>
        <button id="watch">Keep watching</button>
      </div>`,
    );
    this.on('#again', () => startMatch({ ...this.settings, seed: newSeed() }));
    this.on('#change', () => {
      const q = new URLSearchParams({ seed: String(newSeed()), difficulty: this.settings.difficulty, map: this.settings.mapId, style: this.settings.style, adv: this.settings.advantage });
      location.search = q.toString();
    });
    this.on('#watch', () => this.close());
  }

  /** What the computer did and why, from its journal (shown only after the match). */
  private journalHtml(): string {
    const j = this.opponent.journal;
    if (!j.length) return '';
    return `<details class="journal"><summary>What the computer did (${j.length})</summary><ol>${j
      .map((e) => `<li><span class="when">${fmtTime(e.tick)}</span>${escapeHtml(e.text)}</li>`)
      .join('')}</ol></details>`;
  }
}
