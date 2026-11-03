// Challenges in the interface: the goal and live progress in place of the
// objectives checklist, and the best result per challenge (kept in this
// browser) for the challenge list.

import type { Game } from '../sim/game';
import { SCENARIOS, scenarioProgress, type Medal, type ScenarioId } from '../sim/scenarios';

const KEY = 'ironvale.challenges';
const RANK: Record<Medal, number> = { gold: 3, silver: 2, bronze: 1 };

export interface ChallengeBest {
  medal: Medal;
  ticks: number;
  losses: number;
  faction: string;
  date: string;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function challengeBests(storage: Store | null): Partial<Record<ScenarioId, ChallengeBest>> {
  try {
    return (JSON.parse(storage?.getItem(KEY) ?? '{}') as Partial<Record<ScenarioId, ChallengeBest>>) ?? {};
  } catch {
    return {};
  }
}

/** Keep a result if it beats the best so far (a better medal, or the same medal sooner / with fewer losses). Returns true if it is a new best. */
export function recordChallenge(storage: Store | null, id: ScenarioId, r: ChallengeBest): boolean {
  const all = challengeBests(storage);
  const old = all[id];
  const better =
    !old || RANK[r.medal] > RANK[old.medal] || (RANK[r.medal] === RANK[old.medal] && (id === 'holdTheLine' ? r.losses < old.losses : r.ticks < old.ticks));
  if (!better) return false;
  all[id] = r;
  try {
    storage?.setItem(KEY, JSON.stringify(all));
  } catch {
    // Not kept; the result still shows.
  }
  return true;
}

export const MEDAL_ICON: Record<Medal, string> = { gold: '🥇', silver: '🥈', bronze: '🥉' };

/** The goal and progress, where the objectives panel usually is. */
export class ChallengePanel {
  private root = document.getElementById('objectives')!;
  private line: HTMLElement;
  private last = '';

  constructor(private game: Game) {
    const def = SCENARIOS[game.state.scenario!.id];
    this.root.innerHTML = `<div class="obj-head"><b>${def.name}</b></div><div class="obj-body"><div class="obj-goal">${def.goal}</div><div class="obj-hint" id="challenge-progress"></div><div class="fine">${def.medals}</div></div>`;
    this.line = this.root.querySelector('#challenge-progress')!;
  }

  update(): void {
    const text = scenarioProgress(this.game);
    if (text !== this.last) this.line.textContent = this.last = text;
  }
}
