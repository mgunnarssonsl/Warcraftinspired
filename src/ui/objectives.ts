// Objectives panel: the match goal plus a short opening checklist that
// doubles as a tutorial. Each step reports live progress ("3/5") and ticks
// off as soon as the player has clearly done it; counts are cumulative so
// losses along the way never undo progress.

import { CONFIG } from '../sim/config';
import { FACTION, type BuildingRole, type FactionId } from '../sim/factions';
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

function building(g: Game, p: number, role: BuildingRole): StepStatus {
  const type = FACTION[g.player(p).faction].buildings[role];
  if ((g.player(p).stats.built[type] ?? 0) > 0) return { done: true, progress: '' };
  const site = g.buildings().find((b) => b.owner === p && b.type === type);
  if (site) return { done: false, progress: `building ${Math.floor(site.progress * 100)}%` };
  const ordered = own(g, p).some((u) => u.order?.type === 'build' && u.order.buildingType === type);
  return { done: false, progress: ordered ? `${CONFIG.units[FACTION[g.player(p).faction].units.worker].name} on the way` : '' };
}

/** The opening checklist, in the player's faction's own words. */
export function stepsFor(f: FactionId): Step[] {
  const F = FACTION[f];
  const B = (r: BuildingRole) => CONFIG.buildings[F.buildings[r]];
  const worker = CONFIG.units[F.units.worker].name;
  const [melee, ranged] = [CONFIG.units[F.units.melee].name, CONFIG.units[F.units.ranged].name];
  const heroes = F.heroes.map((h, i) => `${'QWE'[i]} ${CONFIG.units[h].name}`).join(', ');
  const grows = F.construction === 'grow' ? ' It grows on its own; the builder goes back to work.' : '';
  return [
  {
    text: `Put ${worker}s to work on gold`,
    hint: `Drag a box around your ${worker}s, then right-click the gold mine.`,
    status: (g, p) => {
      const n = own(g, p).filter((u) => u.order?.type === 'gather' && u.order.res === 'gold').length;
      // Any gold already delivered also counts: the player clearly did it.
      return n >= 3 || g.player(p).goldGathered >= 30 ? { done: true, progress: '' } : count(n, 3);
    },
  },
  {
    text: `Send a ${worker} to gather wood`,
    hint: `Select one ${worker} and right-click a tree near your ${B('hq').name}.`,
    status: (g, p) => {
      const chopping = own(g, p).some((u) => u.order?.type === 'gather' && u.order.res === 'wood');
      return { done: chopping || g.player(p).woodGathered > 0, progress: '' };
    },
  },
  {
    text: `Train 3 more ${worker}s`,
    hint: `Click your ${B('hq').name} and press Q. Right-click the mine to set a rally point.`,
    status: (g, p) => count(g.player(p).stats.trained[F.units.worker] ?? 0, 3),
  },
  {
    text: `Build a ${B('farm').name}`,
    hint: `Select a ${worker}, press ${B('farm').hotkey} and click open ground.${grows}`,
    status: (g, p) => building(g, p, 'farm'),
  },
  {
    text: `Build a ${B('barracks').name}`,
    hint: `Select a ${worker}, press ${B('barracks').hotkey}. It costs ${B('barracks').cost.gold} gold and ${B('barracks').cost.wood} wood.`,
    status: (g, p) => building(g, p, 'barracks'),
  },
  {
    text: 'Train 4 soldiers',
    hint: `Click the ${B('barracks').name} and press Q (${melee}). ${ranged}s (W) need a ${B('lumbermill').name}.`,
    status: (g, p) => {
      const t = g.player(p).stats.trained;
      return count((t[F.units.melee] ?? 0) + (t[F.units.ranged] ?? 0), 4);
    },
  },
  {
    text: 'Raise a hero',
    hint: `With a ${worker} press ${B('altar').hotkey} to build a ${B('altar').name}, then pick a hero there (${heroes}). Clear camps to level it up and win items.`,
    status: (g, p) => ({ done: g.player(p).heroes.length > 0, progress: '' }),
  },
  {
    text: 'Destroy the enemy base',
    hint: 'The enemy starts in the north-east. Scout to find it, then select your army, press A and click there.',
    status: (g, p) => ({ done: g.state.outcome?.winner === p, progress: '' }),
  },
  ];
}

/** The Crown's checklist (the tutorial's faction). */
export const STEPS: Step[] = stepsFor('crown');

/** Tracks which steps are done (sticky) and which is next; DOM-free. */
export class ObjectiveTracker {
  readonly achieved = new Set<number>();
  constructor(readonly steps: Step[] = STEPS) {}

  /** Re-check every step; returns the indices that just completed. */
  check(game: Game, player: number): number[] {
    const fresh: number[] = [];
    this.steps.forEach((s, i) => {
      if (!this.achieved.has(i) && s.status(game, player).done) {
        this.achieved.add(i);
        fresh.push(i);
      }
    });
    return fresh;
  }

  next(): number {
    return this.steps.findIndex((_, i) => !this.achieved.has(i));
  }
}

export class Objectives {
  private root = document.getElementById('objectives')!;
  private list: HTMLElement;
  private hint: HTMLElement;
  private tracker: ObjectiveTracker;
  private last = '';
  /** Called with a step's text when it completes (for a notice). */
  onComplete: (text: string) => void = () => {};

  constructor(
    private game: Game,
    private player: number,
  ) {
    this.tracker = new ObjectiveTracker(stepsFor(game.player(player).faction));
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
    const steps = this.tracker.steps;
    for (const i of this.tracker.check(this.game, this.player)) this.onComplete(steps[i].text);
    const next = this.tracker.next();
    const items = steps.map((s, i) => {
      const done = this.tracker.achieved.has(i);
      const progress = done ? '' : s.status(this.game, this.player).progress;
      return `<li class="${done ? 'done' : i === next ? 'next' : ''}">${s.text}${progress ? ` <span class="obj-progress">${progress}</span>` : ''}</li>`;
    });
    const html = items.join('');
    if (html === this.last) return;
    this.last = html;
    this.list.innerHTML = html;
    this.hint.textContent = next >= 0 ? steps[next].hint : '';
  }
}
