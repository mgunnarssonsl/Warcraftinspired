// The last few replays, kept in browser storage (each is a few hundred
// kilobytes at most). Never throws: a full or disabled storage only means
// fewer replays are kept; the file download always works.

import type { ReplayFile } from './replay';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface ReplayInfo {
  id: string;
  savedAt: string;
  /** "Ada vs Bo" */
  title: string;
  mapId: string;
  ticks: number;
  kind: string;
  /** Winner's name, "Draw", or "Unfinished". */
  result: string;
}

const INDEX = 'ironvale.replays';
const KEEP = 5;
const key = (id: string) => `ironvale.replay.${id}`;

export function replayInfo(id: string, r: ReplayFile): ReplayInfo {
  const w = r.outcome?.winner;
  return {
    id,
    savedAt: r.savedAt,
    title: r.spec.names.join(' vs '),
    mapId: r.spec.mapId,
    ticks: r.ticks,
    kind: r.kind,
    result: !r.outcome ? 'Unfinished' : w === null || w === undefined ? 'Draw' : `${r.spec.names[w] ?? 'Someone'} won`,
  };
}

export class ReplayStore {
  constructor(private storage: Store | null) {}

  list(): ReplayInfo[] {
    try {
      const raw = JSON.parse(this.storage?.getItem(INDEX) ?? '[]') as ReplayInfo[];
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  read(id: string): string | null {
    try {
      return this.storage?.getItem(key(id)) ?? null;
    } catch {
      return null;
    }
  }

  /** Keep a replay (newest first); the oldest go when there are too many or storage is full. */
  add(r: ReplayFile): string | null {
    if (!this.storage) return null;
    const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const text = JSON.stringify(r);
    let list = [replayInfo(id, r), ...this.list()];
    for (const old of list.slice(KEEP)) this.remove(old.id, false);
    list = list.slice(0, KEEP);
    for (;;) {
      try {
        this.storage.setItem(key(id), text);
        this.storage.setItem(INDEX, JSON.stringify(list));
        return id;
      } catch {
        // Full: drop the oldest other replay and try again; give up when none is left.
        const oldest = list.length > 1 ? list[list.length - 1] : null;
        if (!oldest) return null;
        this.remove(oldest.id, false);
        list = list.slice(0, -1);
      }
    }
  }

  remove(id: string, updateIndex = true): void {
    try {
      this.storage?.removeItem(key(id));
      if (updateIndex) this.storage?.setItem(INDEX, JSON.stringify(this.list().filter((r) => r.id !== id)));
    } catch {
      // Nothing to do.
    }
  }
}

/** Where a replay waits for the page that plays it (session storage, like a load request). */
export const PLAY_KEY = 'ironvale.playReplay';

/** Offer a replay as a file download. */
export function downloadReplay(r: ReplayFile): void {
  const blob = new Blob([JSON.stringify(r)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const mins = Math.floor(r.ticks / 1200);
  a.download = `ironvale-replay-${r.spec.mapId}-${r.spec.names.join('-vs-').replace(/[^\w-]+/g, '')}-${mins}min.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
