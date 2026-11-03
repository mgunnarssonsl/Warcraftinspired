// Watching a replay: play and pause, speed, a timeline to jump around,
// whose eyes to see through (either player, or everything), and an
// observer panel comparing both players' economy, army and tech as the
// match unfolds.

import { CONFIG, TICK_RATE } from '../sim/config';
import { FACTION, isWorker } from '../sim/factions';
import type { Game } from '../sim/game';
import type { ClientState } from '../input/client';
import type { ReplayFile } from '../replay/replay';

export const SPEEDS = [0.5, 1, 2, 4, 8, 16];

function fmt(ticks: number): string {
  const s = Math.floor(ticks / TICK_RATE);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function esc(t: string): string {
  return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export type Vision = number | 'all';

export class ReplayBar {
  speed = 1;
  vision: Vision;
  private bar: HTMLElement;
  private panel: HTMLElement;
  private slider: HTMLInputElement;
  private time: HTMLElement;
  private playBtn: HTMLButtonElement;
  private dragging = false;
  private lastPanel = 0;
  /** Jump to a tick (the app fast-forwards, or reloads to go back). */
  onSeek: (tick: number) => void = () => {};
  onVision: (v: Vision) => void = () => {};
  onExit: () => void = () => {};

  constructor(
    private game: Game,
    private client: ClientState,
    private replay: ReplayFile,
    vision: Vision,
    speed: number,
  ) {
    this.vision = vision;
    this.speed = speed;
    const names = replay.spec.names;
    this.bar = document.createElement('div');
    this.bar.id = 'replaybar';
    this.bar.innerHTML = `
      <button id="rp-play" title="Play / pause (P)">❚❚</button>
      <span id="rp-time"></span>
      <input id="rp-slider" type="range" min="0" max="${replay.ticks}" step="20" value="0" aria-label="Replay time">
      <span class="rp-group">${SPEEDS.map((s) => `<button data-speed="${s}" class="${s === speed ? 'picked' : ''}">${s}×</button>`).join('')}</span>
      <select id="rp-vision" aria-label="Whose view">
        <option value="all">See everything</option>
        ${names.map((n, i) => `<option value="${i}">${esc(n)}'s view</option>`).join('')}
      </select>
      <button id="rp-exit" title="Leave the replay">Exit</button>`;
    document.getElementById('stage')!.appendChild(this.bar);
    this.panel = document.getElementById('objectives')!;
    this.panel.classList.add('observer');
    this.slider = this.bar.querySelector('#rp-slider')!;
    this.time = this.bar.querySelector('#rp-time')!;
    this.playBtn = this.bar.querySelector('#rp-play')!;
    (this.bar.querySelector('#rp-vision') as HTMLSelectElement).value = String(vision);
    this.playBtn.addEventListener('click', () => (client.paused = !client.paused));
    this.bar.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) =>
      b.addEventListener('click', () => {
        this.speed = Number(b.dataset.speed);
        this.bar.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('picked', x === b));
      }),
    );
    this.slider.addEventListener('input', () => (this.dragging = true));
    this.slider.addEventListener('change', () => {
      this.dragging = false;
      this.onSeek(Number(this.slider.value));
    });
    this.bar.querySelector('#rp-vision')!.addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      this.vision = v === 'all' ? 'all' : Number(v);
      this.onVision(this.vision);
    });
    this.bar.querySelector('#rp-exit')!.addEventListener('click', () => this.onExit());
  }

  /** Refresh the bar every frame, the observer panel a few times a second. */
  update(now: number, note: string | null): void {
    const t = this.game.state.tick;
    const end = this.replay.ticks;
    const text = `${fmt(t)} / ${fmt(end)}${note ? ` · ${note}` : ''}`;
    if (this.time.textContent !== text) this.time.textContent = text;
    if (!this.dragging) this.slider.value = String(t);
    const icon = this.client.paused || t >= end ? '▶' : '❚❚';
    if (this.playBtn.textContent !== icon) this.playBtn.textContent = icon;
    if (now - this.lastPanel > 250) {
      this.lastPanel = now;
      this.panel.innerHTML = this.observerHtml();
    }
  }

  private observerHtml(): string {
    const g = this.game;
    const players = g.state.players.filter((p) => !p.neutral);
    const rows: Array<[string, (p: (typeof players)[number]) => string]> = [
      ['Faction', (p) => FACTION[p.faction].name],
      ['Gold / wood', (p) => `${Math.floor(p.gold)} / ${Math.floor(p.wood)}`],
      ['Gathered', (p) => `${p.goldGathered} / ${p.woodGathered}`],
      ['Population', (p) => `${g.popUsed(p.id)} / ${g.popCap(p.id)}`],
      ['Workers / army', (p) => {
        const us = g.units().filter((u) => u.owner === p.id);
        return `${us.filter((u) => isWorker(u.type)).length} / ${us.filter((u) => !isWorker(u.type)).length}`;
      }],
      ['Army value', (p) => String(g.units().filter((u) => u.owner === p.id && !isWorker(u.type)).reduce((s, u) => s + CONFIG.units[u.type].cost.gold + CONFIG.units[u.type].cost.wood, 0))],
      ['Tier', (p) => {
        const [t2, t3] = FACTION[p.faction].tiers;
        return p.research[t3] ? 'III' : p.research[t2] ? 'II' : 'I';
      }],
      ['Upgrades', (p) => String(Object.keys(p.research).length)],
      ['Heroes', (p) => p.heroes.map((h) => `${CONFIG.units[h.type].name} ${h.level}`).join(', ') || '–'],
      ['Making', (p) => {
        const q = g.buildings().filter((b) => b.owner === p.id).flatMap((b) => b.queue.slice(0, 1));
        const names = q.map((x) => (x.research ? CONFIG.research[x.research].name : CONFIG.units[x.unit!].name));
        return names.length ? esc(names.slice(0, 4).join(', ') + (names.length > 4 ? '…' : '')) : '–';
      }],
      ['Kills / losses', (p) => `${p.stats.kills} / ${p.stats.unitsLost}`],
    ];
    const head = players.map((p) => `<th style="color:${p.color}">${esc(p.name)}</th>`).join('');
    const body = rows.map(([label, f]) => `<tr><td>${label}</td>${players.map((p) => `<td>${f(p)}</td>`).join('')}</tr>`).join('');
    return `<div class="obj-head"><b>Observer</b></div><table class="observer-table"><tr><th></th>${head}</tr>${body}</table>`;
  }
}
