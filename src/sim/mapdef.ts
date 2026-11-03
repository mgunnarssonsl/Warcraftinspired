// Custom maps: checking a map definition that came from outside (a file, a
// browser's storage, a lobby message) before anything uses it, and judging
// whether it makes a fair, playable match.

import { CONFIG, type MineKind } from './config';
import { CUSTOM_PREFIX, registerMap, type MapDef, type MineSpot } from './maps';
import { generateMap } from './mapgen';
import { Game } from './game';
import { findPath } from './pathfinding';
import { len } from './dmath';

/** Every custom map has the size the game supports (see the README's supported scope). */
export const MAP_W = 96;
export const MAP_H = 72;
const MAX_FEATURES = 40;

export type CleanResult = { ok: true; def: MapDef } | { ok: false; reason: string };

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const int = (v: unknown, lo: number, hi: number): number | null => {
  const n = num(v, lo, hi);
  return n !== null && Number.isInteger(n) ? n : null;
};
const MINE_KINDS = Object.keys(CONFIG.mineKinds) as MineKind[];

function list<T>(raw: unknown, each: (x: unknown) => T | null): T[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_FEATURES) return null;
  const out: T[] = [];
  for (const x of raw) {
    const v = each(x);
    if (v === null) return null;
    out.push(v);
  }
  return out;
}

const tuple = (n: number, ranges: Array<[number, number]>) => (x: unknown) => {
  if (!Array.isArray(x) || x.length !== n) return null;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = num(x[i], ranges[i][0], ranges[i][1]);
    if (v === null) return null;
    out.push(v);
  }
  return out;
};

/** A map definition from outside, checked field by field; anything malformed is refused with a reason. */
export function cleanMapDef(raw: unknown): CleanResult {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'This is not a map.' };
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) : '';
  if (!name) return { ok: false, reason: 'The map has no name.' };
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'map';
  const id = typeof r.id === 'string' && /^custom-[a-z0-9-]{1,40}$/.test(r.id) ? r.id : `${CUSTOM_PREFIX}${slug}`;
  const start = r.start as Record<string, unknown> | undefined;
  const sx = int(start?.tx, 2, MAP_W - 6);
  const sy = int(start?.ty, 2, MAP_H - 6);
  if (sx === null || sy === null) return { ok: false, reason: 'The start position is missing or off the map.' };
  const mines = list<MineSpot>(r.mines, (x) => {
    const m = x as Record<string, unknown>;
    const tx = int(m?.tx, 1, MAP_W - 4);
    const ty = int(m?.ty, 1, MAP_H - 4);
    const camp = int(m?.camp, 0, 3);
    if (tx === null || ty === null || camp === null || !MINE_KINDS.includes(m.kind as MineKind)) return null;
    return { tx, ty, kind: m.kind as MineKind, camp: camp as 0 | 1 | 2 | 3, label: typeof m.label === 'string' ? m.label.slice(0, 20) : 'mine' };
  });
  const lairs = list(r.lairs, (x) => {
    const l = x as Record<string, unknown>;
    const lx = num(l?.x, 2, MAP_W - 2);
    const ly = num(l?.y, 2, MAP_H - 2);
    return lx !== null && ly !== null && (l.level === 2 || l.level === 3) ? { x: lx, y: ly, level: l.level as 2 | 3 } : null;
  });
  const objectives = list(r.objectives, (x) => {
    const o = x as Record<string, unknown>;
    const tx = int(o?.tx, 1, MAP_W - 4);
    const ty = int(o?.ty, 1, MAP_H - 4);
    return tx !== null && ty !== null && (o.type === 'shop' || o.type === 'fountain') ? { type: o.type as 'shop' | 'fountain', tx, ty } : null;
  });
  const forests = list(r.forests, (x) => {
    const f = x as Record<string, unknown>;
    const v = [num(f?.x0, -5, MAP_W + 5), num(f?.y0, -5, MAP_H + 5), num(f?.x1, -5, MAP_W + 5), num(f?.y1, -5, MAP_H + 5)];
    return v.every((n) => n !== null) ? { x0: v[0]!, y0: v[1]!, x1: v[2]!, y1: v[3]! } : null;
  });
  const circle = tuple(3, [[-5, MAP_W + 5], [-5, MAP_H + 5], [0.5, 12]]);
  const groves = list(r.groves, circle) as Array<[number, number, number]> | null;
  const lakes = list(r.lakes, circle) as Array<[number, number, number]> | null;
  const outcrops = list(r.outcrops, circle) as Array<[number, number, number]> | null;
  const ridges = list(r.ridges, tuple(6, [[-5, MAP_W + 5], [-5, MAP_H + 5], [-5, MAP_W + 5], [-5, MAP_H + 5], [0, 1], [0, 1]])) as MapDef['ridges'] | null;
  const rivers = list(r.rivers, (x) => {
    const v = x as Record<string, unknown>;
    const c = [num(v?.x0, -10, MAP_W + 10), num(v?.y0, -10, MAP_H + 10), num(v?.x1, -10, MAP_W + 10), num(v?.y1, -10, MAP_H + 10), num(v?.width, 0.5, 6)];
    const fords = list(v?.fords, tuple(2, [[0, 1], [0, 1]]));
    return c.every((n) => n !== null) && fords ? { x0: c[0]!, y0: c[1]!, x1: c[2]!, y1: c[3]!, width: c[4]!, fords: fords as Array<[number, number]> } : null;
  });
  const rings = list(r.rings, (x) => {
    const v = x as Record<string, unknown>;
    const c = [num(v?.cx, 0, MAP_W), num(v?.cy, 0, MAP_H), num(v?.r, 2, 40), num(v?.width, 0.5, 5)];
    const ramps = list(v?.ramps, tuple(2, [[-7, 7], [-7, 7]]));
    return c.every((n) => n !== null) && ramps ? { cx: c[0]!, cy: c[1]!, r: c[2]!, width: c[3]!, ramps: ramps as Array<[number, number]> } : null;
  });
  if (!mines || !lairs || !objectives || !forests || !groves || !lakes || !outcrops || !ridges || !rivers || !rings)
    return { ok: false, reason: 'Some of the map’s features are damaged or there are too many of them.' };
  if (!mines.length) return { ok: false, reason: 'The map has no gold mine.' };
  return {
    ok: true,
    def: {
      id,
      name,
      blurb: typeof r.blurb === 'string' ? r.blurb.replace(/[\u0000-\u001f<>]/g, '').slice(0, 160) : '',
      width: MAP_W,
      height: MAP_H,
      start: { tx: sx, ty: sy },
      mines,
      lairs,
      objectives,
      forests,
      groves,
      lakes,
      ridges,
      outcrops,
      rivers,
      rings,
    },
  };
}

export interface MapCheck {
  /** Problems that make the map unplayable or unfair. */
  errors: string[];
  /** Things worth a second look. */
  warnings: string[];
  /** Walking distance between the two bases, in tiles (when they connect). */
  baseDistance: number | null;
}

/** Is this a map two players can have a fair match on? (It is mirrored by construction; this checks it is playable.) */
export function checkMap(def: MapDef): MapCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  registerMap(def);
  let g: Game;
  try {
    generateMap(1, def.id);
    g = Game.create(1, def.id);
  } catch (e) {
    return { errors: [`The map could not be built: ${e instanceof Error ? e.message : String(e)}`], warnings, baseDistance: null };
  }
  const HQ = CONFIG.buildings.hq.size;
  const MINE = CONFIG.resources.goldmine.size;
  const [a, b] = g.state.starts;
  if (len(a.x - b.x, a.y - b.y) < 30) errors.push('The two bases are too close: move the start away from the middle of the map.');
  const startMine = def.mines.find((m) => m.kind === 'start');
  if (!startMine) errors.push('There is no start mine (a mine of the kind "start" next to the base).');
  else if (len(startMine.tx + MINE / 2 - (def.start.tx + HQ / 2), startMine.ty + MINE / 2 - (def.start.ty + HQ / 2)) > 12)
    errors.push('The start mine is too far from the base (it should be within 12 tiles).');
  // Footprints must not overlap (mines, objectives, the base, and their mirrors).
  const feet = [
    { what: 'the base', tx: def.start.tx, ty: def.start.ty, w: HQ, h: HQ },
    ...def.mines.map((m) => ({ what: 'a mine', tx: m.tx, ty: m.ty, w: MINE, h: MINE })),
    ...def.objectives.map((o) => ({ what: `the ${o.type === 'shop' ? 'Trading Post' : 'Fountain'}`, tx: o.tx, ty: o.ty, w: CONFIG.buildings[o.type].size, h: CONFIG.buildings[o.type].size })),
  ];
  const all = [...feet, ...feet.map((f) => ({ ...f, what: `${f.what} (mirrored)`, tx: MAP_W - f.tx - f.w, ty: MAP_H - f.ty - f.h }))];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const p = all[i];
      const q = all[j];
      if (p.tx < q.tx + q.w + 1 && q.tx < p.tx + p.w + 1 && p.ty < q.ty + q.h + 1 && q.ty < p.ty + p.h + 1) {
        errors.push(`${p.what[0].toUpperCase()}${p.what.slice(1)} and ${q.what} are on top of each other.`);
        i = all.length;
        break;
      }
    }
  // Everything must be reachable from both bases.
  const keeps = g.buildings().filter((x) => x.owner === 0 || x.owner === 1).filter((x) => x.w === HQ);
  const doors = keeps.map((k) => g.freeTilesAround(k, 1)[0]);
  if (doors.some((d) => !d)) errors.push('A base is walled in: nothing can leave it.');
  else {
    const reach = (from: { x: number; y: number }, f: { tx: number; ty: number; w: number; h: number }) => {
      const res = findPath(g.nav, from.x, from.y, { x0: f.tx - 1, y0: f.ty - 1, x1: f.tx + f.w, y1: f.ty + f.h }, 200000);
      return res.reached ? res.tiles.length : null;
    };
    const mines = g.resources().filter((r) => r.type === 'goldmine');
    const unreachable = mines.filter((m) => reach(doors[0], m) === null).length;
    if (unreachable) errors.push(`${unreachable} gold mine(s) cannot be reached from the bases: open a path (a gap in a ridge, a ford in a river).`);
    for (const o of g.buildings().filter((x) => x.type === 'shop' || x.type === 'fountain'))
      if (reach(doors[0], o) === null) errors.push(`The ${o.type === 'shop' ? 'Trading Post' : 'Fountain'} cannot be reached.`);
    for (const c of g.state.camps)
      if (reach(doors[0], { tx: Math.floor(c.x) - 1, ty: Math.floor(c.y) - 1, w: 2, h: 2 }) === null) {
        errors.push('A neutral camp cannot be reached (its mine or lair is walled off).');
        break;
      }
    const d = reach(doors[0], keeps[1]);
    if (d === null) errors.push('The two bases are not connected: players could never meet.');
    if (def.mines.filter((m) => m.kind !== 'start').length === 0) warnings.push('There is no mine to expand to: every match will be a one-base fight.');
    if (!def.mines.some((m) => m.camp > 0) && !def.lairs.length) warnings.push('There are no neutral camps: no items to win and no experience for heroes outside fights.');
    if (d !== null && d < 45) warnings.push(`The bases are only ${d} tiles apart: rushes will be very strong.`);
    return { errors, warnings, baseDistance: d };
  }
  return { errors, warnings, baseDistance: null };
}
