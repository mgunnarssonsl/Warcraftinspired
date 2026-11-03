// Custom maps kept in this browser (each a few kilobytes). Never throws.

import { cleanMapDef } from '../sim/mapdef';
import { registerMap, type MapDef } from '../sim/maps';

const KEY = 'ironvale.maps';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function loadMaps(storage: Store | null): MapDef[] {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) ?? '[]') as unknown[];
    const out: MapDef[] = [];
    for (const r of Array.isArray(raw) ? raw : []) {
      const c = cleanMapDef(r);
      if (c.ok) out.push(c.def);
    }
    return out;
  } catch {
    return [];
  }
}

/** Make the stored maps known to the game (call at page start). */
export function registerStoredMaps(storage: Store | null): MapDef[] {
  const maps = loadMaps(storage);
  for (const m of maps) registerMap(m);
  return maps;
}

export function saveMap(storage: Store | null, def: MapDef): boolean {
  const maps = loadMaps(storage).filter((m) => m.id !== def.id);
  maps.push(def);
  try {
    storage?.setItem(KEY, JSON.stringify(maps));
    registerMap(def);
    return true;
  } catch {
    return false;
  }
}

export function deleteMap(storage: Store | null, id: string): void {
  try {
    storage?.setItem(KEY, JSON.stringify(loadMaps(storage).filter((m) => m.id !== id)));
  } catch {
    // Nothing to do.
  }
}
