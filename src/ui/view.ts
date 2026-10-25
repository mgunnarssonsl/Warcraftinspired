// How the match looks to this viewer: options the settings change that the
// 3D view, overlay, minimap and HUD all read. Never part of the simulation.

import type { Game } from '../sim/game';
import { COLORBLIND_TEAMS, type HealthBars } from './settings';

export const view = {
  colorblind: false,
  healthBars: 'damaged' as HealthBars,
};

/** A player's colour as shown: the match colour, or the colour-blind-safe pair. */
export function teamColor(game: Game, owner: number): string {
  const p = game.state.players[owner];
  if (!p) return '#999';
  if (view.colorblind && !p.neutral && COLORBLIND_TEAMS[owner]) return COLORBLIND_TEAMS[owner];
  return p.color;
}

/** Health bar colour: green-yellow-red, or blue-yellow-magenta when colour-blind safe. */
export function hpColor(f: number): string {
  if (view.colorblind) return f > 0.6 ? '#3fb0ff' : f > 0.3 ? '#ffd23a' : '#ff40c8';
  return f > 0.6 ? '#4cd964' : f > 0.3 ? '#f0c030' : '#ff4a3a';
}
