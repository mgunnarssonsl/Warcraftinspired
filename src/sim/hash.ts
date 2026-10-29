// A fingerprint of the whole game state, compared between online players to
// catch a desync (their simulations disagreeing) as soon as it happens.
// JSON is exact and the same in every engine: numbers print as the shortest
// string that reads back to the same double, and object keys keep their
// (deterministic) insertion order.

import type { Game } from './game';

/** 32-bit FNV-1a of a string, as 8 hex digits. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function stateHash(game: Game): string {
  return fnv1a(JSON.stringify(game.state));
}
