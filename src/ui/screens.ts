// Full-screen panels: start (introduction, map and opponent), in-game menu
// (resume, surrender, restart) and the end-of-match summary, which also
// shows the computer's plan and its main decisions.

import type { AdvantageId, Difficulty, StyleId } from '../ai/profile';
import { CONFIG, TICK_RATE } from '../sim/config';
import type { Game } from '../sim/game';
import { mapById, MAPS } from '../sim/maps';

export type Modal = 'start' | 'menu' | 'end' | null;

export interface MatchSettings {
  seed: number;
  difficulty: Difficulty;
  mapId: string;
  /** The opponent's strategic style, or 'random' (fixed by the seed, revealed at the end). */
  style: StyleId | 'random';
  advantage: AdvantageId;
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

/** "Hard Raider", with the style kept secret while a random one is in play. */
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

export class Screens {
  private root = document.getElementById('modal')!;
  current: Modal = null;
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
    this.open(
      'start',
      `<h1>Ironvale</h1>
      <p class="lead">Build an economy, raise an army, and destroy every enemy building before they destroy yours.</p>
      <div class="intro">
        <div>
          <h3>Economy</h3>
          <p>Laborers carry gold and wood home; only delivered resources count. About five keep a mine busy.</p>
          <h3>Base</h3>
          <p>Farms raise population, a Lumber Mill by the forest shortens wood trips. Fortify the Keep to a Castle, then a Citadel, for stronger units.</p>
          <h3>Heroes and the map</h3>
          <p>Heroes level up and carry items. Camps guard the richer mines and drop treasure. You only see what your units see: scout.</p>
        </div>
        <div>
          <h3>Controls</h3>
          <ul>
            <li><b>Left-click / drag</b> select, <b>right-click</b> to act, <b>Shift</b> to queue orders</li>
            <li><b>A</b> attack-move, <b>H</b> hold, <b>S</b> stop</li>
            <li>With a Laborer: <b>F</b>arm, <b>B</b>arracks, <b>L</b>umber Mill, <b>T</b>ower</li>
            <li>With a Keep or Barracks: <b>Q</b> / <b>W</b> train</li>
            <li>Hero (<b>F2</b>): <b>Q</b> / <b>W</b> / <b>E</b> abilities, <b>Z</b> / <b>X</b> / <b>C</b> items</li>
            <li><b>Right-drag</b> grabs the map, <b>arrows</b> or edges scroll, <b>wheel</b> zooms</li>
            <li><b>F1</b> all controls, <b>F10</b> menu</li>
          </ul>
          <h3>Army</h3>
          <p>Guards beat Lancers, Lancers beat Archers, Archers beat Guards. Clerics heal nearby allies on their own. Mangonels wreck buildings but need protecting.</p>
        </div>
      </div>
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
      <p class="fine">Without an advantage the computer plays by exactly your rules: the same costs, the same fog of war, no hidden information. An advantage is a cheat and is always shown as one.</p>
      <div class="actions"><button class="primary" id="go">Start match</button></div>`,
    );
    this.root.querySelectorAll<HTMLButtonElement>('button[data-d]').forEach((b) =>
      b.addEventListener('click', () => {
        picked = b.dataset.d as Difficulty;
        this.root.querySelectorAll('button[data-d]').forEach((x) => x.classList.toggle('picked', x === b));
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('button[data-m]').forEach((b) =>
      b.addEventListener('click', () => {
        pickedMap = b.dataset.m!;
        this.root.querySelectorAll('button[data-m]').forEach((x) => x.classList.toggle('picked', x === b));
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('button[data-s]').forEach((b) =>
      b.addEventListener('click', () => {
        pickedStyle = b.dataset.s as StyleId | 'random';
        this.root.querySelectorAll('button[data-s]').forEach((x) => x.classList.toggle('picked', x === b));
        this.root.querySelector('#style-blurb')!.textContent = styleBlurb(pickedStyle);
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('button[data-a]').forEach((b) =>
      b.addEventListener('click', () => {
        pickedAdv = b.dataset.a as AdvantageId;
        this.root.querySelectorAll('button[data-a]').forEach((x) => x.classList.toggle('picked', x === b));
      }),
    );
    this.on('#go', () => {
      const next: MatchSettings = { seed: this.settings.seed, difficulty: picked, mapId: pickedMap, style: pickedStyle, advantage: pickedAdv };
      const same = (Object.keys(next) as Array<keyof MatchSettings>).every((k) => next[k] === this.settings[k]);
      if (!same) startMatch(next);
      else this.close();
    });
  }

  showMenu(): void {
    if (this.current === 'start' || this.current === 'end') return;
    const over = !!this.game.state.outcome;
    this.open(
      'menu',
      `<h2>Paused</h2>
      <p class="fine">Map: ${mapById(this.settings.mapId).name} · opponent: ${opponentLabel(this.settings, this.opponent.style, over)}${this.settings.advantage === 'none' ? '' : ` · ${CONFIG.ai.advantages[this.settings.advantage].name}`} · match time ${fmtTime(this.game.state.tick)} · seed ${this.settings.seed}</p>
      <div class="stack">
        <button class="primary" id="resume">Resume</button>
        <button id="restart">Restart (same map and opponent)</button>
        <button id="new">New match…</button>
        ${over ? '' : '<button class="danger" id="surrender">Surrender</button>'}
      </div>`,
    );
    this.on('#resume', () => this.close());
    this.on('#restart', () => startMatch(this.settings));
    this.on('#new', () => startMatch({ ...this.settings, seed: newSeed() }));
    this.on('#surrender', () => {
      this.onSurrender();
      this.close();
    });
  }

  showEnd(): void {
    const o = this.game.state.outcome;
    if (!o) return;
    const title = o.winner === null ? 'Draw' : o.winner === this.viewer ? 'Victory' : 'Defeat';
    const reason =
      o.winner === null
        ? 'Both sides lost their last building at the same moment.'
        : o.winner === this.viewer
          ? 'Every enemy building has been destroyed.'
          : this.defeatReason === 'surrendered'
            ? 'You surrendered.'
            : 'All of your buildings were destroyed.';
    const players = this.game.state.players.filter((p) => !p.neutral);
    const rows: Array<[string, (i: number) => number]> = [
      ['Gold gathered', (i) => players[i].goldGathered],
      ['Wood gathered', (i) => players[i].woodGathered],
      ['Units trained', (i) => players[i].stats.unitsTrained],
      ['Units lost', (i) => players[i].stats.unitsLost],
      ['Enemies destroyed', (i) => players[i].stats.kills],
      ['Buildings built', (i) => players[i].stats.buildingsBuilt],
      ['Buildings lost', (i) => players[i].stats.buildingsLost],
    ];
    this.open(
      'end',
      `<h1 class="${title.toLowerCase()}">${title}</h1>
      <p class="lead">${reason} Match time ${fmtTime(o.tick)}.</p>
      <table class="stats">
        <tr><th></th>${players.map((p) => `<th style="color:${p.color}">${p.id === this.viewer ? 'You' : 'Computer'}</th>`).join('')}</tr>
        ${rows.map(([k, f]) => `<tr><td>${k}</td>${players.map((_, i) => `<td>${f(i)}</td>`).join('')}</tr>`).join('')}
      </table>
      <h3>Your opponent: ${opponentLabel(this.settings, this.opponent.style, true)}${this.settings.style === 'random' ? ' (picked at random)' : ''}</h3>
      <p class="fine">${CONFIG.ai.styles[this.opponent.style].blurb}${this.settings.advantage === 'none' ? ' It had no advantage.' : ` It had an advantage: ${CONFIG.ai.advantages[this.settings.advantage].name}.`}</p>
      ${this.journalHtml()}
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
    return `<details class="journal" open><summary>What the computer did (${j.length})</summary><ol>${j
      .map((e) => `<li><span class="when">${fmtTime(e.tick)}</span>${escapeHtml(e.text)}</li>`)
      .join('')}</ol></details>`;
  }
}

function escapeHtml(t: string): string {
  return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
