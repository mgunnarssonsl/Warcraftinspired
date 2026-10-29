// Client-side (non-simulation) state: what this viewer has selected, what
// they are hovering, and transient interface modes. Never serialized with the
// match and never read by the simulation.

import type { AbilityId, BuildingType } from '../sim/config';

export type TargetMode = null | 'move' | 'gather' | 'repair' | 'attack' | 'flare' | `cast:${AbilityId}`;

export interface ClientState {
  player: number;
  selected: number[];
  hoverId: number;
  /** Screen-space drag rectangle while box-selecting. */
  drag: { x0: number; y0: number; x1: number; y1: number } | null;
  targetMode: TargetMode;
  /** Building being placed (placement preview active), if any. */
  placing: BuildingType | null;
  debug: boolean;
  paused: boolean;
  /** An online match: no pausing (the other player's game runs on). */
  online: boolean;
  /** A full-screen panel is open: world input is ignored. */
  modalOpen: boolean;
  /** Lift the fog for this viewer (after the match, or ?fog=0 for debugging). */
  revealAll: boolean;
  groups: Record<number, number[]>;
}

export function createClientState(player: number): ClientState {
  return {
    player,
    selected: [],
    hoverId: 0,
    drag: null,
    targetMode: null,
    placing: null,
    debug: false,
    paused: false,
    online: false,
    modalOpen: false,
    revealAll: false,
    groups: {},
  };
}
