// Full-screen panels: the start screen (new match, continue, load, tutorial,
// settings), the in-game menu (save, load, settings, restart, surrender),
// saved-game slots, settings, and the end-of-match summary with the
// computer's plan and decisions.

import type { AdvantageId, Difficulty, StyleId } from '../ai/profile';
import { SLOTS, type SaveStore, type SlotId } from '../save/save';
import { CONFIG, TICK_RATE } from '../sim/config';
import type { Game } from '../sim/game';
import { FACTION, FACTIONS, type FactionId } from '../sim/factions';
import { DEFAULT_RULES, describeRules, isDefaultRules, RULE_CHOICES, type MatchRules } from '../sim/rules';
import { customMapList, isCustomMap, mapById, MAPS } from '../sim/maps';
import type { Settings } from './settings';
import { settingsHtml, wireSettings, type SettingsTab } from './settingsPanel';
import { summaryHtml } from './summary';
import { Lobby } from './lobby';
import { parseReplay, type ReplayFile } from '../replay/replay';
import type { ReplayStore } from '../replay/store';
import { SCENARIO_IDS, SCENARIOS, scenarioMedal, type ScenarioId } from '../sim/scenarios';
import { MEDAL_ICON, type ChallengeBest } from './challenge';

export type Modal = 'start' | 'menu' | 'end' | 'settings' | 'saves' | 'lobby' | 'desync' | 'replays' | 'challenges' | null;

export interface MatchSettings {
  seed: number;
  difficulty: Difficulty;
  mapId: string;
  /** The opponent's strategic style, or 'random' (fixed by the seed, revealed at the end). */
  style: StyleId | 'random';
  advantage: AdvantageId;
  /** The viewer's faction, and the computer's: 'random' is fixed by the seed and shown from the start. */
  faction: FactionId;
  opponentFaction: FactionId | 'random';
  /** Custom match rules (sim/rules.ts). */
  rules: MatchRules;
}

/** How each rule's choices read on the start screen. */
const RULE_LABELS: { [K in keyof MatchRules]: { title: string; label: (v: MatchRules[K]) => string } } = {
  startGold: { title: 'Starting gold', label: (v) => String(v) },
  startWood: { title: 'Starting wood', label: (v) => String(v) },
  startWorkers: { title: 'Starting workers', label: (v) => String(v) },
  maxPop: { title: 'Population limit', label: (v) => String(v) },
  fog: { title: 'Map knowledge', label: (v) => (v === 'normal' ? 'Fog of war' : v === 'explored' ? 'Map explored' : 'No fog') },
  camps: { title: 'Neutral camps', label: (v) => (v ? 'On' : 'Off') },
};

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
  /** Recent replays kept in this browser. */
  replays: ReplayStore;
  /** The replay of the match just finished, if it was recorded. */
  lastReplay(): ReplayFile | null;
  watchReplay(file: ReplayFile | string): void;
  downloadReplay(file: ReplayFile): void;
  /** True while watching a replay. */
  watching: boolean;
  /** Set while playing a challenge. */
  challenge: { id: ScenarioId; faction: FactionId } | null;
  challengeBests(): Partial<Record<ScenarioId, ChallengeBest>>;
  /** Set during an online match: the players, and how to leave it (forfeiting if it is on). */
  online: { names: string[]; leave(): void; diagnostics(): string } | null;
}

/** Difficulty is how well it plays; the style (below) is what it plans. */
const DIFFICULTIES: Array<{ id: Difficulty; label: string; blurb: string }> = [
  { id: 'easy', label: 'Easy', blurb: 'Slow to react and to notice idle Laborers; never retreats or adapts.' },
  { id: 'normal', label: 'Normal', blurb: 'Scouts, adapts its army, regroups and falls back from bad fights.' },
  { id: 'hard', label: 'Hard', blurb: 'Reacts at once, focuses fire, reinforces its attacks, runs three Keeps.' },
];

/** Reload into a new match (a clean page is the most reliable reset). */
export function startMatch(s: MatchSettings): void {
  const q = new URLSearchParams({ ...matchParams(s), start: '1' });
  location.search = q.toString();
}

/** "Hard · Raider", with the style kept secret while a random one is in play. */
export function opponentLabel(s: MatchSettings, resolved: StyleId, reveal: boolean): string {
  const level = s.difficulty[0].toUpperCase() + s.difficulty.slice(1);
  const style = s.style === 'random' && !reveal ? 'random style' : CONFIG.ai.styles[resolved].name;
  return `${level} · ${style}`;
}

function matchParams(s: MatchSettings): Record<string, string> {
  const r = s.rules ?? DEFAULT_RULES;
  const custom: Record<string, string> = isDefaultRules(r)
    ? {}
    : { gold: String(r.startGold), wood: String(r.startWood), workers: String(r.startWorkers), pop: String(r.maxPop), fog: r.fog, camps: r.camps ? '1' : '0' };
  return { seed: String(s.seed), difficulty: s.difficulty, map: s.mapId, style: s.style, adv: s.advantage, faction: s.faction, vs: s.opponentFaction, ...custom };
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
  /** Set when a challenge result just beat the best so far. */
  challengeBest = false;
  /** How the (last) opponent was defeated. */
  foeDefeatReason: 'eliminated' | 'surrendered' | null = null;
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
    let pickedFaction: FactionId = this.settings.faction;
    let pickedVs: FactionId | 'random' = this.settings.opponentFaction;
    const pickedRules: MatchRules = { ...(this.settings.rules ?? DEFAULT_RULES) };
    const ruleKeys = Object.keys(RULE_LABELS) as Array<keyof MatchRules>;
    const rulesHtml = ruleKeys
      .map((k) => {
        const def = RULE_LABELS[k] as { title: string; label: (v: unknown) => string };
        const chips = (RULE_CHOICES[k] as readonly unknown[])
          .map((v, i) => `<button data-rule="${k}" data-ri="${i}" class="${v === pickedRules[k] ? 'picked' : ''}">${def.label(v)}${v === DEFAULT_RULES[k] ? '*' : ''}</button>`)
          .join('');
        return `<div class="rule"><span>${def.title}</span><div class="chips">${chips}</div></div>`;
      })
      .join('');
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
        <button id="online"><b>Play online…</b><span>A private match against a friend, with a code.</span></button>
        <button id="challenges"><b>Challenges…</b><span>Hold the Line, Gold Rush, Hero Trial: fixed goals, medals to earn.</span></button>
        <button id="replays"><b>Replays…</b><span>Watch a recent match again, or a replay file.</span></button>
        <button id="load"><b>Load a saved game…</b><span>From a slot or a file.</span></button>
        <button id="settings"><b>Settings</b><span>Sound, graphics, camera, interface, controls.</span></button>
      </div>
      <h2 class="new-match">New match</h2>
      <div class="choices">
        <div>
          <h3>Your faction</h3>
          <div class="difficulty">
            ${FACTIONS.map((f) => `<button data-f="${f}" class="${f === pickedFaction ? 'picked' : ''}"><b>${FACTION[f].name}</b><span>${FACTION[f].blurb}</span></button>`).join('')}
          </div>
          <h3>Map</h3>
          <div class="difficulty">
            ${[...MAPS, ...customMapList()].map((m) => `<button data-m="${m.id}" class="${m.id === pickedMap ? 'picked' : ''}"><b>${escapeHtml(m.name)}${isCustomMap(m.id) ? ' <small>(your map)</small>' : ''}</b><span>${escapeHtml(m.blurb)}</span></button>`).join('')}
            <button id="editor"><b>Map editor…</b><span>Make your own map, or change one of these.</span></button>
          </div>
        </div>
        <div>
          <h3>Opponent</h3>
          <div class="difficulty">
            ${DIFFICULTIES.map((d) => `<button data-d="${d.id}" class="${d.id === picked ? 'picked' : ''}"><b>${d.label}</b><span>${d.blurb}</span></button>`).join('')}
          </div>
          <h3>Opponent faction</h3>
          <div class="chips">
            ${[...FACTIONS, 'random' as const].map((f) => `<button data-v="${f}" class="${f === pickedVs ? 'picked' : ''}">${f === 'random' ? 'Random' : FACTION[f].name}</button>`).join('')}
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
      <details class="rules" ${isDefaultRules(pickedRules) ? '' : 'open'}>
        <summary>Match rules <span id="rules-summary">${escapeHtml(describeRules(pickedRules) || 'standard')}</span></summary>
        ${rulesHtml}
        <p class="fine">* the standard rules. The computer plays by the same rules as you.</p>
      </details>
      <p class="fine">Without an advantage the computer plays by exactly your rules: the same costs, the same fog of war, no hidden information. An advantage is a cheat and is always shown as one. F1 in a match lists every control. Version ${__VERSION__}.</p>
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
    pick('f', (v) => (pickedFaction = v as FactionId));
    pick('v', (v) => (pickedVs = v as FactionId | 'random'));
    this.root.querySelectorAll<HTMLButtonElement>('button[data-rule]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.rule as keyof MatchRules;
        (pickedRules as unknown as Record<string, unknown>)[k] = (RULE_CHOICES[k] as readonly unknown[])[Number(b.dataset.ri)];
        this.root.querySelectorAll<HTMLButtonElement>(`button[data-rule="${k}"]`).forEach((x) => x.classList.toggle('picked', x === b));
        this.root.querySelector('#rules-summary')!.textContent = describeRules(pickedRules) || 'standard';
      }),
    );
    this.on('#go', () => {
      const next: MatchSettings = { seed: this.settings.seed, difficulty: picked, mapId: pickedMap, style: pickedStyle, advantage: pickedAdv, faction: pickedFaction, opponentFaction: pickedVs, rules: { ...pickedRules } };
      const same =
        !this.host.tutorial &&
        (Object.keys(next) as Array<keyof MatchSettings>).every((k) => (k === 'rules' ? JSON.stringify(next.rules) === JSON.stringify(this.settings.rules ?? DEFAULT_RULES) : next[k] === this.settings[k]));
      if (!same) startMatch(next);
      else this.close();
    });
    this.on('#tutorial', () => this.host.startTutorial());
    this.on('#continue', () => latest && this.host.load({ slot: latest }));
    this.on('#load', () => this.showSaves('load', 'start'));
    this.on('#online', () => this.showLobby());
    this.on('#replays', () => this.showReplays());
    this.on('#challenges', () => this.showChallenges());
    this.on('#editor', () => (location.search = 'editor=1'));
    this.on('#settings', () => this.showSettings('start'));
  }

  /** The challenges, with each one's best result here. */
  showChallenges(): void {
    const bests = this.host.challengeBests();
    let faction: FactionId = 'crown';
    this.open(
      'challenges',
      `<h2>Challenges</h2>
      <p class="fine">Fixed scenarios with a goal of their own. Everyone plays the same map and start, so results compare. Win for a medal; better play earns a better one.</p>
      <h3>Play as</h3>
      <div class="chips">${FACTIONS.map((f) => `<button data-cf="${f}" class="${f === faction ? 'picked' : ''}">${FACTION[f].name}</button>`).join('')}</div>
      <div class="slots">${SCENARIO_IDS.map((id) => {
        const d = SCENARIOS[id];
        const b = bests[id];
        const best = b ? `Best: ${MEDAL_ICON[b.medal]} ${b.medal}, ${id === 'holdTheLine' ? `${b.losses} units lost` : fmtTime(b.ticks)} (${FACTION[b.faction as FactionId]?.name ?? b.faction})` : 'Not won yet';
        return `<div class="slot challenge"><div><b>${d.name}</b><span>${escapeHtml(d.blurb)}</span><span class="goal">${escapeHtml(d.goal)}</span><span>${escapeHtml(d.medals)}</span><span class="best">${escapeHtml(best)}</span></div>
          <div class="slot-actions"><button class="primary" data-challenge="${id}">Play</button></div></div>`;
      }).join('')}</div>
      <div class="actions"><button class="primary" id="back">Back</button></div>`,
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-cf]').forEach((b) =>
      b.addEventListener('click', () => {
        faction = b.dataset.cf as FactionId;
        this.root.querySelectorAll('[data-cf]').forEach((x) => x.classList.toggle('picked', x === b));
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-challenge]').forEach((b) =>
      b.addEventListener('click', () => (location.search = new URLSearchParams({ challenge: b.dataset.challenge!, faction }).toString())),
    );
    this.on('#back', () => this.showStart());
  }

  /** Recent replays, and opening one from a file. */
  showReplays(message = ''): void {
    const list = this.host.replays.list();
    this.open(
      'replays',
      `<h2>Replays</h2>
      <p class="fine">Every match you finish is recorded (the tutorial aside); the last five stay in this browser. Save one as a file to keep it or share it.</p>
      <div class="slots">${
        list.length
          ? list
              .map(
                (r) => `<div class="slot"><div><b>${escapeHtml(r.title)}</b><span>${mapById(r.mapId).name} · ${fmtTime(r.ticks)} · ${escapeHtml(r.result)} · ${r.kind} · ${new Date(r.savedAt).toLocaleDateString()}</span></div>
                <div class="slot-actions"><button data-watch="${r.id}" class="primary">Watch</button><button data-file="${r.id}">Save file</button><button data-del="${r.id}" class="danger">Delete</button></div></div>`,
              )
              .join('')
          : '<p class="fine">No replays yet: finish a match and it appears here.</p>'
      }</div>
      <p class="fine" id="replay-msg">${escapeHtml(message)}</p>
      <div class="actions">
        <label class="file-btn">Open a replay file…<input type="file" id="replay-file" accept=".json,application/json"></label>
        <button class="primary" id="back">Back</button>
      </div>`,
    );
    const read = (id: string) => this.host.replays.read(id);
    this.root.querySelectorAll<HTMLButtonElement>('[data-watch]').forEach((b) =>
      b.addEventListener('click', () => {
        const text = read(b.dataset.watch!);
        if (text) this.host.watchReplay(text);
        else this.showReplays('That replay is no longer stored.');
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-file]').forEach((b) =>
      b.addEventListener('click', () => {
        const r = parseReplay(read(b.dataset.file!) ?? '');
        if (r.ok) this.host.downloadReplay(r.replay);
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) =>
      b.addEventListener('click', () => {
        this.host.replays.remove(b.dataset.del!);
        this.showReplays();
      }),
    );
    this.root.querySelector<HTMLInputElement>('#replay-file')?.addEventListener('change', async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      const text = await f.text();
      const r = parseReplay(text);
      if (!r.ok) return this.showReplays(r.reason);
      this.host.watchReplay(text);
    });
    this.on('#back', () => this.showStart());
  }

  private lobby: Lobby | null = null;

  showLobby(): void {
    this.lobby ??= new Lobby(
      (html) => {
        this.open('lobby', html);
        return this.root;
      },
      () => this.showStart(),
    );
    this.lobby.show();
  }

  /** The players' games disagree: stop and say so, with a file to report it. */
  showDesync(turn: number): void {
    this.open(
      'desync',
      `<h2>The match went out of sync</h2>
      <p class="lead">Your game and your opponent's stopped agreeing at ${fmtTime(turn * 2)}, so the match cannot go on: you would be playing two different games. This is a bug in the game, not something either of you did.</p>
      <p class="fine">Download the diagnostics and attach them to a bug report (both players' files help most). They contain the match state, nothing personal beyond your browser's name.</p>
      <div class="actions">
        <button id="diag">Download diagnostics</button>
        <button class="primary" id="leave">Leave the match</button>
      </div>`,
    );
    this.on('#diag', () => {
      const blob = new Blob([this.host.online!.diagnostics()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ironvale-desync-${turn}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
    this.on('#leave', () => {
      this.host.online!.leave();
      location.search = '';
    });
  }

  showMenu(): void {
    if (this.current === 'start') return;
    const over = !!this.game.state.outcome;
    if (this.host.online) return this.showOnlineMenu(over);
    if (this.host.watching) {
      this.open(
        'menu',
        `<h2>Replay</h2>
        <div class="stack">
          <button class="primary" id="resume">Back to the replay</button>
          <button id="settings">Settings…</button>
          <button id="quit">Leave the replay</button>
        </div>`,
      );
      this.on('#resume', () => this.close());
      this.on('#settings', () => this.showSettings('menu'));
      this.on('#quit', () => (location.search = ''));
      return;
    }
    this.open(
      'menu',
      `<h2>Paused</h2>
      <p class="fine">${this.host.tutorial ? 'Tutorial' : `Map: ${mapById(this.settings.mapId).name} · opponent: ${opponentLabel(this.settings, this.opponent.style, over)} ${this.opponentFaction()}${this.settings.advantage === 'none' ? '' : ` · ${CONFIG.ai.advantages[this.settings.advantage].name}`}`} · match time ${fmtTime(this.game.state.tick)} · seed ${this.settings.seed}</p>
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
    this.on('#restart', () => {
      const c = this.host.challenge;
      if (c) location.search = new URLSearchParams({ challenge: c.id, faction: c.faction }).toString();
      else if (this.host.tutorial) this.host.startTutorial();
      else startMatch(this.settings);
    });
    this.on('#new', () => {
      const q = new URLSearchParams(matchParams({ ...this.settings, seed: newSeed() }));
      location.search = q.toString();
    });
    this.on('#surrender', () => {
      this.onSurrender();
      this.close();
    });
  }

  private opponentFaction(): string {
    const foe = this.game.state.players.find((p) => !p.neutral && p.id !== this.viewer);
    return foe ? FACTION[foe.faction].name : '';
  }

  private showOnlineMenu(over: boolean): void {
    const foe = this.host.online!.names.filter((_, i) => i !== this.viewer).join(', ');
    this.open(
      'menu',
      `<h2>Menu</h2>
      <p class="fine">Online match against ${escapeHtml(foe)} · map ${mapById(this.settings.mapId).name} · match time ${fmtTime(this.game.state.tick)}. The match keeps running while this menu is open.</p>
      <div class="stack">
        <button class="primary" id="resume">Back to the match</button>
        <button id="settings">Settings…</button>
        ${over ? '' : '<button class="danger" id="surrender">Surrender</button>'}
        <button id="quit">${over ? 'Leave' : 'Leave (counts as a surrender)'}</button>
      </div>`,
    );
    this.on('#resume', () => this.close());
    this.on('#settings', () => this.showSettings('menu'));
    this.on('#surrender', () => {
      this.onSurrender();
      this.close();
    });
    this.on('#quit', () => {
      this.host.online!.leave();
      location.search = '';
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
          ? this.foeDefeatReason === 'surrendered'
            ? this.host.online
              ? 'Your opponent surrendered or left the match.'
              : 'Your opponent surrendered.'
            : 'Every enemy building has been destroyed.'
          : this.defeatReason === 'surrendered'
            ? 'You surrendered.'
            : 'All of your buildings were destroyed.';
    const names: Record<number, string> = { [this.viewer]: 'You' };
    for (const p of this.game.state.players) if (!p.neutral && p.id !== this.viewer) names[p.id] = this.host.online ? escapeHtml(this.host.online.names[p.id] ?? 'Opponent') : 'Computer';
    const c = this.host.challenge;
    if (c) {
      const def = SCENARIOS[c.id];
      const medal = scenarioMedal(this.game);
      const lost = this.game.player(this.viewer).stats.unitsLost;
      const result = medal
        ? `${MEDAL_ICON[medal]} ${medal[0].toUpperCase()}${medal.slice(1)} medal: ${c.id === 'holdTheLine' ? `${lost} units lost` : `done in ${fmtTime(o.tick)}`}.${this.challengeBest ? ' A new best!' : ''}`
        : `${def.goal} Not this time: try again.`;
      this.open(
        'end',
        `<h1 class="${medal ? 'victory' : 'defeat'}">${medal ? 'Challenge complete' : 'Challenge failed'}</h1>
        <p class="lead">${escapeHtml(def.name)}: ${escapeHtml(result)}</p>
        <p class="fine">${escapeHtml(def.medals)}</p>
        ${summaryHtml(this.game, this.viewer, names)}
        <div class="actions">
          ${this.replayButtons()}
          <button class="primary" id="again">Try again</button>
          <button id="list">Challenges</button>
          <button id="watch">Keep watching</button>
        </div>`,
      );
      this.wireReplayButtons();
      this.on('#again', () => (location.search = new URLSearchParams({ challenge: c.id, faction: c.faction }).toString()));
      this.on('#list', () => this.showChallenges());
      this.on('#watch', () => this.close());
      return;
    }
    if (this.host.online) {
      this.open(
        'end',
        `<h1 class="${title.toLowerCase()}">${title}</h1>
        <p class="lead">${reason} Match time ${fmtTime(o.tick)}.</p>
        ${summaryHtml(this.game, this.viewer, names)}
        <div class="actions">
          ${this.replayButtons()}
          <button class="primary" id="home">Back to the start screen</button>
          <button id="watch">Keep watching</button>
        </div>`,
      );
      this.wireReplayButtons();
      this.on('#home', () => {
        this.host.online!.leave();
        location.search = '';
      });
      this.on('#watch', () => this.close());
      return;
    }
    this.open(
      'end',
      `<h1 class="${title.toLowerCase()}">${title}</h1>
      <p class="lead">${reason} Match time ${fmtTime(o.tick)}.</p>
      ${summaryHtml(this.game, this.viewer, names)}
      ${
        this.host.tutorial
          ? ''
          : `<h3>Your opponent: ${opponentLabel(this.settings, this.opponent.style, true)}${this.settings.style === 'random' ? ' (picked at random)' : ''}, playing the ${this.opponentFaction()}</h3>
      <p class="fine">${CONFIG.ai.styles[this.opponent.style].blurb}${this.settings.advantage === 'none' ? ' It had no advantage.' : ` It had an advantage: ${CONFIG.ai.advantages[this.settings.advantage].name}.`}</p>
      ${this.journalHtml()}`
      }
      <div class="actions">
        ${this.replayButtons()}
        <button class="primary" id="again">Play again</button>
        <button id="change">Change opponent</button>
        <button id="watch">Keep watching</button>
      </div>`,
    );
    this.wireReplayButtons();
    this.on('#again', () => startMatch({ ...this.settings, seed: newSeed() }));
    this.on('#change', () => {
      const q = new URLSearchParams(matchParams({ ...this.settings, seed: newSeed() }));
      location.search = q.toString();
    });
    this.on('#watch', () => this.close());
  }

  private replayButtons(): string {
    return this.host.lastReplay() ? '<button id="replay-watch">Watch the replay</button><button id="replay-save">Save replay file</button>' : '';
  }

  private wireReplayButtons(): void {
    const r = this.host.lastReplay();
    if (!r) return;
    this.on('#replay-watch', () => {
      this.host.online?.leave();
      this.host.watchReplay(r);
    });
    this.on('#replay-save', () => this.host.downloadReplay(r));
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
