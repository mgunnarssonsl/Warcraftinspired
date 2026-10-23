// Client-side (non-simulation) state: what this viewer has selected, what
// they are hovering, and transient interface modes. Never serialized with the
// match and never read by the simulation.

export type TargetMode = null | 'move' | 'gather';

export interface ClientState {
  player: number;
  selected: number[];
  hoverId: number;
  /** Screen-space drag rectangle while box-selecting. */
  drag: { x0: number; y0: number; x1: number; y1: number } | null;
  targetMode: TargetMode;
  debug: boolean;
  paused: boolean;
  groups: Record<number, number[]>;
}

export function createClientState(player: number): ClientState {
  return {
    player,
    selected: [],
    hoverId: 0,
    drag: null,
    targetMode: null,
    debug: false,
    paused: false,
    groups: {},
  };
}
