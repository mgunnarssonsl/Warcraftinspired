// Full-screen panels: start (introduction + difficulty), in-game menu
// (resume, surrender, restart) and the end-of-match summary.

import type { Difficulty } from '../ai/computer';
import { TICK_RATE } from '../sim/config';
import type { Game } from '../sim/game';

export type Modal = 'start' | 'menu' | 'end' | null;

export interface MatchSettings {
  seed: number;
  difficulty: Difficulty;
}

const DIFFICULTIES: Array<{ id: Difficulty; label: string; blurb: string }> = [
  { id: 'easy', label: 'Easy', blurb: 'Slow to build, attacks late with small groups.' },
  { id: 'normal', label: 'Normal', blurb: 'Steady build-up; attacks when it thinks it is stronger.' },
  { id: 'hard', label: 'Hard', blurb: 'Fast economy, two Barracks, early and growing pressure.' },
];

/** Reload into a new match (a clean page is the most reliable reset). */
export function startMatch(s: MatchSettings): void {
  const q = new URLSearchParams({ seed: String(s.seed), difficulty: s.difficulty, start: '1' });
  location.search = q.toString();
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
    this.open(
      'start',
      `<h1>Ironvale</h1>
      <p class="lead">Build an economy, raise an army, and destroy every enemy building before they destroy yours.</p>
      <div class="intro">
        <div>
          <h3>Economy</h3>
          <p>Laborers walk to gold mines and trees, carry what they gather and bring it home. Only delivered resources count.
          Two Laborers fit inside a mine at once; about five keep one busy.</p>
          <h3>Base</h3>
          <p>Farms raise your population limit. A Lumber Mill by the forest shortens wood trips. The Barracks trains Guards and Archers.
          Fortify the Keep to a Castle for Lancers, Clerics and Mangonels, then to a Citadel.</p>
          <h3>Heroes and the map</h3>
          <p>The Hall of Valor raises one hero who levels up from kills nearby. Brigand camps guard the richer mines and pay a bounty. You only see what your units see: scout.</p>
        </div>
        <div>
          <h3>Controls</h3>
          <ul>
            <li><b>Left-click / drag</b> select, <b>right-click</b> to act, <b>Shift</b> to queue orders</li>
            <li><b>A</b> attack-move, <b>H</b> hold, <b>S</b> stop</li>
            <li>With a Laborer: <b>F</b>arm, <b>B</b>arracks, <b>L</b>umber Mill, <b>T</b>ower</li>
            <li>With a Keep or Barracks: <b>Q</b> / <b>W</b> train</li>
            <li>Hero (<b>F2</b>): <b>Q</b> Stormhammer, <b>W</b> Battle Cry, <b>E</b> Mend</li>
            <li><b>Right-drag</b> grabs the map, <b>arrows</b> or edges scroll, <b>wheel</b> zooms</li>
            <li><b>F1</b> all controls, <b>F10</b> menu</li>
          </ul>
          <h3>Army</h3>
          <p>Guards beat Lancers, Lancers beat Archers, Archers beat Guards. Clerics heal nearby allies on their own. Mangonels wreck buildings but need protecting.</p>
        </div>
      </div>
      <h3>Opponent</h3>
      <div class="difficulty">
        ${DIFFICULTIES.map((d) => `<button data-d="${d.id}" class="${d.id === picked ? 'picked' : ''}"><b>${d.label}</b><span>${d.blurb}</span></button>`).join('')}
      </div>
      <p class="fine">The computer follows exactly the same rules as you: no bonus resources, no hidden information.</p>
      <div class="actions"><button class="primary" id="go">Start match</button></div>`,
    );
    this.root.querySelectorAll<HTMLButtonElement>('.difficulty button').forEach((b) =>
      b.addEventListener('click', () => {
        picked = b.dataset.d as Difficulty;
        this.root.querySelectorAll('.difficulty button').forEach((x) => x.classList.toggle('picked', x === b));
      }),
    );
    this.on('#go', () => {
      if (picked !== this.settings.difficulty) startMatch({ seed: this.settings.seed, difficulty: picked });
      else this.close();
    });
  }

  showMenu(): void {
    if (this.current === 'start' || this.current === 'end') return;
    const over = !!this.game.state.outcome;
    this.open(
      'menu',
      `<h2>Paused</h2>
      <p class="fine">Opponent: ${this.settings.difficulty} · match time ${fmtTime(this.game.state.tick)} · seed ${this.settings.seed}</p>
      <div class="stack">
        <button class="primary" id="resume">Resume</button>
        <button id="restart">Restart (same map and opponent)</button>
        <button id="new">New match…</button>
        ${over ? '' : '<button class="danger" id="surrender">Surrender</button>'}
      </div>`,
    );
    this.on('#resume', () => this.close());
    this.on('#restart', () => startMatch(this.settings));
    this.on('#new', () => startMatch({ seed: newSeed(), difficulty: this.settings.difficulty }));
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
        <tr><th></th>${players.map((p) => `<th style="color:${p.color}">${p.id === this.viewer ? 'You' : `Computer (${this.settings.difficulty})`}</th>`).join('')}</tr>
        ${rows.map(([k, f]) => `<tr><td>${k}</td>${players.map((_, i) => `<td>${f(i)}</td>`).join('')}</tr>`).join('')}
      </table>
      <div class="actions">
        <button class="primary" id="again">Play again</button>
        <button id="change">Change opponent</button>
        <button id="watch">Keep watching</button>
      </div>`,
    );
    this.on('#again', () => startMatch({ seed: newSeed(), difficulty: this.settings.difficulty }));
    this.on('#change', () => {
      const q = new URLSearchParams({ seed: String(newSeed()), difficulty: this.settings.difficulty });
      location.search = q.toString();
    });
    this.on('#watch', () => this.close());
  }
}
