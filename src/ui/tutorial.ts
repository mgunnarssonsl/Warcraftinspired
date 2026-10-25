// The interactive tutorial: a short match on a fixed map against a computer
// that never attacks, guided one step at a time. Each step waits for the
// player to actually do it (checked against the match and the viewer's own
// selection, camera and control groups), highlights the button to press,
// and shows live progress. The step logic is DOM-free so it can be tested.

import type { ClientState } from '../input/client';
import { CONFIG } from '../sim/config';
import type { Game } from '../sim/game';

/** Tutorial match: fixed map and seed, a computer that builds but never attacks. */
export const TUTORIAL = {
  seed: 1,
  mapId: 'vales',
  difficulty: 'easy' as const,
  overrides: { firstAttackSeconds: 1e9, creeps: false, raids: false },
};

export interface TutorialView {
  game: Game;
  client: ClientState;
  /** Camera target, to notice the player moving the view. */
  camera: { x: number; y: number };
}

export interface TutorialStep {
  title: string;
  /** What to do, with the keys to press. */
  text: string;
  /** Command-card button to highlight (its action id), if any. */
  highlight?: string;
  /** Done, plus live progress such as "2/3". */
  status: (v: TutorialView, start: TutorialView['camera']) => { done: boolean; progress?: string };
}

const own = (v: TutorialView) => v.game.units().filter((u) => u.owner === v.client.player);
const soldiers = (v: TutorialView) => own(v).filter((u) => u.type !== 'worker' && u.type !== 'outrider' && !u.hero);
const count = (n: number, of: number) => ({ done: n >= of, progress: `${Math.min(n, of)}/${of}` });
const placed = (v: TutorialView, type: 'farm' | 'barracks') =>
  v.game.buildings().some((b) => b.owner === v.client.player && b.type === type) || (v.game.player(v.client.player).stats.built[type] ?? 0) > 0;

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Look around',
    text: 'Move the camera: arrow keys, push the mouse against a screen edge, or hold the right mouse button and drag the map. The mouse wheel zooms.',
    status: (v, start) => ({ done: Math.hypot(v.camera.x - start.x, v.camera.y - start.y) >= 6 }),
  },
  {
    title: 'Select your Laborers',
    text: 'Hold the left mouse button and drag a box around the Laborers beside your Keep.',
    status: (v) => count(v.client.selected.filter((id) => v.game.unit(id)?.type === 'worker').length, 3),
  },
  {
    title: 'Mine gold',
    text: 'With Laborers selected, right-click the gold mine next to your Keep. They carry gold home; only delivered gold counts.',
    status: (v) => count(own(v).filter((u) => u.order?.type === 'gather' && u.order.res === 'gold').length, 3),
  },
  {
    title: 'Chop wood',
    text: 'Select one Laborer and right-click a tree.',
    status: (v) => ({ done: own(v).some((u) => u.order?.type === 'gather' && u.order.res === 'wood') || v.game.player(v.client.player).woodGathered > 0 }),
  },
  {
    title: 'Train a Laborer',
    text: `Click your Keep and press Q (or click the glowing button). More Laborers, more income: about five keep a mine busy.`,
    highlight: 'train:worker',
    status: (v) => count(v.game.player(v.client.player).stats.trained.worker ?? 0, 1),
  },
  {
    title: 'Build a Farm',
    text: `Farms raise your population limit (soldiers need room too). Select a Laborer, press F and click open ground near your Keep, then let it finish.`,
    highlight: 'build:farm',
    status: (v) => {
      if ((v.game.player(v.client.player).stats.built.farm ?? 0) > 0) return { done: true };
      const site = v.game.buildings().find((b) => b.owner === v.client.player && b.type === 'farm');
      return { done: false, progress: site ? `building ${Math.floor(site.progress * 100)}%` : placed(v, 'farm') ? 'Laborer on the way' : '' };
    },
  },
  {
    title: 'Build a Barracks',
    text: `The Barracks trains soldiers. Select a Laborer, press B and place it. It costs ${CONFIG.buildings.barracks.cost.gold} gold and ${CONFIG.buildings.barracks.cost.wood} wood: keep mining while you wait.`,
    highlight: 'build:barracks',
    status: (v) => ({ done: placed(v, 'barracks') }),
  },
  {
    title: 'Train three Guards',
    text: 'When the Barracks is finished, click it and press Q three times. Queued soldiers come out one by one.',
    highlight: 'train:guard',
    status: (v) => count(v.game.player(v.client.player).stats.trained.guard ?? 0, 3),
  },
  {
    title: 'Make a control group',
    text: 'Select your Guards, press Ctrl+1 (on a Mac: Ctrl+1 or Option+1) to save them as group 1. Click elsewhere, then press 1 to select them again.',
    status: (v) => {
      const g = (v.client.groups[1] ?? []).filter((id) => v.game.unit(id));
      const recalled = g.length >= 2 && v.client.selected.length === g.length && g.every((id) => v.client.selected.includes(id));
      return { done: recalled, progress: g.length >= 2 ? 'saved: now press 1' : '' };
    },
  },
  {
    title: 'Attack-move',
    text: 'With your soldiers selected, press A and click the ground ahead. They walk there and fight anything they meet on the way.',
    highlight: 'attack',
    status: (v) => ({ done: soldiers(v).some((u) => u.order?.type === 'attackMove') }),
  },
  {
    title: 'Clear a camp',
    text: 'Neutral camps guard the richer mines (the coloured circles on the minimap; the number is their level). Attack-move your Guards onto the level 1 camp at the mine east of your base. Clearing it drops an item.',
    status: (v) => count(v.game.player(v.client.player).stats.campsCleared, 1),
  },
];

/** Which step the player is on; a step stays done once done. */
export class TutorialTracker {
  step = 0;
  private start: { x: number; y: number } | null = null;

  /** Advance past every step that is done now; returns the titles just completed. */
  update(v: TutorialView): string[] {
    const done: string[] = [];
    while (this.step < TUTORIAL_STEPS.length) {
      this.start ??= { ...v.camera };
      if (!TUTORIAL_STEPS[this.step].status(v, this.start).done) break;
      done.push(TUTORIAL_STEPS[this.step].title);
      this.step++;
      this.start = { ...v.camera };
    }
    return done;
  }

  skip(): void {
    if (this.step < TUTORIAL_STEPS.length) this.step++;
    this.start = null;
  }

  get finished(): boolean {
    return this.step >= TUTORIAL_STEPS.length;
  }

  progress(v: TutorialView): string {
    const s = TUTORIAL_STEPS[this.step];
    return s ? (s.status(v, this.start ?? v.camera).progress ?? '') : '';
  }
}

/** The tutorial panel, in place of the objectives checklist. */
export class TutorialPanel {
  private root = document.getElementById('objectives')!;
  private tracker = new TutorialTracker();
  private last = '';
  onComplete: (title: string) => void = () => {};
  onFinish: () => void = () => {};

  constructor(private view: () => TutorialView) {
    this.root.classList.add('tutorial');
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.id === 'tut-skip') {
        this.tracker.skip();
        this.last = '';
      }
      if (t.id === 'tut-done') this.onFinish();
    });
  }

  update(): void {
    const v = this.view();
    for (const title of this.tracker.update(v)) this.onComplete(title);
    document.querySelectorAll('.tut-glow').forEach((e) => e.classList.remove('tut-glow'));
    const n = TUTORIAL_STEPS.length;
    let html: string;
    if (this.tracker.finished) {
      html = `<div class="obj-head"><b>Tutorial complete</b></div><div class="obj-body">
        <p>You know the basics: economy, building, training, control groups, attack-move and camps.
        Keep exploring this match (the computer will not attack), or start a real one.</p>
        <p class="obj-hint">F1 lists every control. Heroes (Hall of Valor, V) level up from camps and carry items.</p>
        <button id="tut-done">Start a real match</button></div>`;
    } else {
      const s = TUTORIAL_STEPS[this.tracker.step];
      if (s.highlight) document.querySelector(`[data-action="${s.highlight}"]`)?.classList.add('tut-glow');
      const progress = this.tracker.progress(v);
      html = `<div class="obj-head"><b>Tutorial ${this.tracker.step + 1}/${n}: ${s.title}</b></div><div class="obj-body">
        <div class="tut-text">${s.text}</div>
        ${progress ? `<div class="obj-progress">${progress}</div>` : ''}
        <div class="tut-bar"><i style="width:${(100 * this.tracker.step) / n}%"></i></div>
        <button id="tut-skip">Skip this step</button></div>`;
    }
    if (html === this.last) return;
    this.last = html;
    this.root.innerHTML = html;
  }
}
