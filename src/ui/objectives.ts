// Objectives panel: the match goal plus a short opening checklist that
// doubles as a tutorial. Steps tick off by observing the player's own state.

import { CONFIG } from '../sim/config';
import type { Game } from '../sim/game';

interface Step {
  text: string;
  hint: string;
  done: (g: Game, p: number) => boolean;
}

const own = (g: Game, p: number) => g.units().filter((u) => u.owner === p);
const has = (g: Game, p: number, t: string) => g.buildings().some((b) => b.owner === p && b.type === t && b.progress >= 1);

const STEPS: Step[] = [
  {
    text: 'Put Laborers to work on gold',
    hint: 'Drag a box around your Laborers, then right-click the gold mine.',
    done: (g, p) => own(g, p).filter((u) => u.order?.type === 'gather' && u.order.res === 'gold').length >= 3,
  },
  {
    text: 'Send a Laborer to chop wood',
    hint: 'Select one Laborer and right-click a tree near your Keep.',
    done: (g, p) => g.player(p).woodGathered > 0,
  },
  {
    text: 'Train more Laborers (8 total)',
    hint: 'Click your Keep and press Q. Right-click the mine to set a rally point.',
    done: (g, p) => own(g, p).filter((u) => u.type === 'worker').length >= 8,
  },
  {
    text: 'Build a Farm',
    hint: 'Select a Laborer, press F and click open ground.',
    done: (g, p) => has(g, p, 'farm'),
  },
  {
    text: 'Build a Barracks',
    hint: `Select a Laborer, press B. It costs ${CONFIG.buildings.barracks.cost.gold} gold and ${CONFIG.buildings.barracks.cost.wood} wood.`,
    done: (g, p) => has(g, p, 'barracks'),
  },
  {
    text: 'Train 4 soldiers',
    hint: 'Click the Barracks and press Q (Guard). Archers (W) need a Lumber Mill.',
    done: (g, p) => own(g, p).filter((u) => u.type !== 'worker').length >= 4,
  },
  {
    text: 'Raise a hero',
    hint: 'With a Laborer press V to build a Hall of Valor, then train the Marshal there. Clear Brigand camps to level it up.',
    done: (g, p) => !!g.player(p).hero,
  },
  {
    text: 'Destroy the enemy base',
    hint: 'The enemy starts in the north-east. Scout to find it, then select your army, press A and click there.',
    done: (g, p) => g.state.outcome?.winner === p,
  },
];

export class Objectives {
  private root = document.getElementById('objectives')!;
  private list: HTMLElement;
  private hint: HTMLElement;
  /** Steps stay checked once achieved, even if the condition later lapses. */
  private achieved = new Set<number>();
  private last = '';

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
    STEPS.forEach((s, i) => {
      if (!this.achieved.has(i) && s.done(this.game, this.player)) this.achieved.add(i);
    });
    const next = STEPS.findIndex((_, i) => !this.achieved.has(i));
    const key = [...this.achieved].join(',') + '|' + next;
    if (key === this.last) return;
    this.last = key;
    this.list.innerHTML = STEPS.map(
      (s, i) => `<li class="${this.achieved.has(i) ? 'done' : i === next ? 'next' : ''}">${s.text}</li>`,
    ).join('');
    this.hint.textContent = next >= 0 ? STEPS[next].hint : '';
  }
}
