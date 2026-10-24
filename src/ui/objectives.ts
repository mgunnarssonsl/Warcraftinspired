// Objectives panel: the match goal plus a short opening checklist that
// doubles as a tutorial. Each step reports live progress ("3/5") and ticks
// off as soon as the player has clearly done it; counts are cumulative so
// losses along the way never undo progress.

import { CONFIG } from '../sim/config';
import type { Game } from '../sim/game';

export interface StepStatus {
  done: boolean;
  /** Short live progress text, e.g. "2/3" or "building 40%". */
  progress: string;
}

export interface Step {
  text: string;
  hint: string;
  status: (g: Game, p: number) => StepStatus;
}

const own = (g: Game, p: number) => g.units().filter((u) => u.owner === p);
const count = (n: number, of: number): StepStatus => ({ done: n >= of, progress: `${Math.min(n, of)}/${of}` });

function building(g: Game, p: number, type: 'farm' | 'barracks'): StepStatus {
  if ((g.player(p).stats.built[type] ?? 0) > 0) return { done: true, progress: '' };
  const site = g.buildings().find((b) => b.owner === p && b.type === type);
  if (site) return { done: false, progress: `building ${Math.floor(site.progress * 100)}%` };
  const ordered = own(g, p).some((u) => u.order?.type === 'build' && u.order.buildingType === type);
  return { done: false, progress: ordered ? 'Laborer on the way' : '' };
}

export const STEPS: Step[] = [
  {
    text: 'Put Laborers to work on gold',
    hint: 'Drag a box around your Laborers, then right-click the gold mine.',
    status: (g, p) => {
      const n = own(g, p).filter((u) => u.order?.type === 'gather' && u.order.res === 'gold').length;
      // Any gold already delivered also counts: the player clearly did it.
      return n >= 3 || g.player(p).goldGathered >= 30 ? { done: true, progress: '' } : count(n, 3);
    },
  },
  {
    text: 'Send a Laborer to chop wood',
    hint: 'Select one Laborer and right-click a tree near your Keep.',
    status: (g, p) => {
      const chopping = own(g, p).some((u) => u.order?.type === 'gather' && u.order.res === 'wood');
      return { done: chopping || g.player(p).woodGathered > 0, progress: '' };
    },
  },
  {
    text: 'Train 3 more Laborers',
    hint: 'Click your Keep and press Q. Right-click the mine to set a rally point.',
    status: (g, p) => count(g.player(p).stats.trained.worker ?? 0, 3),
  },
  {
    text: 'Build a Farm',
    hint: 'Select a Laborer, press F and click open ground.',
    status: (g, p) => building(g, p, 'farm'),
  },
  {
    text: 'Build a Barracks',
    hint: `Select a Laborer, press B. It costs ${CONFIG.buildings.barracks.cost.gold} gold and ${CONFIG.buildings.barracks.cost.wood} wood.`,
    status: (g, p) => building(g, p, 'barracks'),
  },
  {
    text: 'Train 4 soldiers',
    hint: 'Click the Barracks and press Q (Guard). Archers (W) need a Lumber Mill.',
    status: (g, p) => {
      const t = g.player(p).stats.trained;
      return count((t.guard ?? 0) + (t.archer ?? 0), 4);
    },
  },
  {
    text: 'Raise a hero',
    hint: 'With a Laborer press V to build a Hall of Valor, then pick a hero there (Q Marshal, W Pathfinder, E Sage). Clear camps to level it up and win items.',
    status: (g, p) => ({ done: g.player(p).heroes.length > 0, progress: '' }),
  },
  {
    text: 'Destroy the enemy base',
    hint: 'The enemy starts in the north-east. Scout to find it, then select your army, press A and click there.',
    status: (g, p) => ({ done: g.state.outcome?.winner === p, progress: '' }),
  },
];

/** Tracks which steps are done (sticky) and which is next; DOM-free. */
export class ObjectiveTracker {
  readonly achieved = new Set<number>();

  /** Re-check every step; returns the indices that just completed. */
  check(game: Game, player: number): number[] {
    const fresh: number[] = [];
    STEPS.forEach((s, i) => {
      if (!this.achieved.has(i) && s.status(game, player).done) {
        this.achieved.add(i);
        fresh.push(i);
      }
    });
    return fresh;
  }

  next(): number {
    return STEPS.findIndex((_, i) => !this.achieved.has(i));
  }
}

export class Objectives {
  private root = document.getElementById('objectives')!;
  private list: HTMLElement;
  private hint: HTMLElement;
  private tracker = new ObjectiveTracker();
  private last = '';
  /** Called with a step's text when it completes (for a notice). */
  onComplete: (text: string) => void = () => {};

  constructor(
    private game: Game,
    private player: number,
  ) {
    this.root.innerHTML = `<div class="obj-head"><b>Objective</b><button id="obj-toggle" title="Show or hide">–</button></div>
      <div class="obj-body"><div class="obj-goal">Destroy every enemy building. Lose all of yours and you are defeated.</div>
      <ol class="obj-steps"></ol><div class="obj-hint"></div></div>`;
    this.list = this.root.querySelector('.obj-steps')!;
    this.hint = this.root.querySelector('.obj-hint')!;
    this.root.querySelector('#obj-toggle')!.addEventListener('click', () => {
      const hidden = this.root.classList.toggle('collapsed');
      this.root.querySelector('#obj-toggle')!.textContent = hidden ? '+' : '–';
    });
  }

  update(): void {
    for (const i of this.tracker.check(this.game, this.player)) this.onComplete(STEPS[i].text);
    const next = this.tracker.next();
    const items = STEPS.map((s, i) => {
      const done = this.tracker.achieved.has(i);
      const progress = done ? '' : s.status(this.game, this.player).progress;
      return `<li class="${done ? 'done' : i === next ? 'next' : ''}">${s.text}${progress ? ` <span class="obj-progress">${progress}</span>` : ''}</li>`;
    });
    const html = items.join('');
    if (html === this.last) return;
    this.last = html;
    this.list.innerHTML = html;
    this.hint.textContent = next >= 0 ? STEPS[next].hint : '';
  }
}
