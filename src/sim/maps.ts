// Hand-designed skirmish maps, authored as data. Each map is described for
// player 1's half (south-west) and made point-symmetric (180° rotation)
// around the centre, so both starts are identical: same distances, same
// mines, same camps, same objectives. A match seed only roughens edges with
// noise; the strategic layout of a map never changes.

import type { MineKind } from './config';

export interface MineSpot {
  tx: number;
  ty: number;
  kind: MineKind;
  /** Guard camp level beside the mine, 0 = unguarded. */
  camp: 0 | 1 | 2 | 3;
  /** What the spot is, for the AI and the README (natural, far, rich...). */
  label: string;
}

export interface MapDef {
  id: string;
  name: string;
  blurb: string;
  width: number;
  height: number;
  /** Player 1's Keep footprint (player 2's is the mirror). */
  start: { tx: number; ty: number };
  mines: MineSpot[];
  /** Treasure camps with no mine: tougher guards, a better item. */
  lairs: Array<{ x: number; y: number; level: 2 | 3 }>;
  /** Neutral objectives (footprint top-left); each is mirrored. Empty = placed automatically. */
  objectives: Array<{ type: 'shop' | 'fountain'; tx: number; ty: number }>;
  forests: Array<{ x0: number; y0: number; x1: number; y1: number }>;
  groves: Array<[number, number, number]>;
  lakes: Array<[number, number, number]>;
  /** Rock walls: [x0, y0, x1, y1, gapStart, gapEnd] with the gap in t-space (0..1). */
  ridges: Array<[number, number, number, number, number, number]>;
  outcrops: Array<[number, number, number]>;
  /** Rivers: deep water along a line, crossable only at the fords (t ranges). */
  rivers: Array<{ x0: number; y0: number; x1: number; y1: number; width: number; fords: Array<[number, number]> }>;
  /** Plateau walls: a rock ring, entered only through its ramps (angle ranges, radians). */
  rings: Array<{ cx: number; cy: number; r: number; width: number; ramps: Array<[number, number]> }>;
}

const W = 96;
const H = 72;

export const MAPS: MapDef[] = [
  {
    id: 'vales',
    name: 'Twin Vales',
    blurb: 'Open valleys. A rich guarded mine on each flank of the centre; far expansions behind the forests.',
    width: W,
    height: H,
    start: { tx: 10, ty: 56 },
    mines: [
      { tx: 18, ty: 57, kind: 'start', camp: 0, label: 'start' },
      { tx: 11, ty: 47, kind: 'tiny', camp: 0, label: 'small' },
      { tx: 36, ty: 60, kind: 'standard', camp: 1, label: 'natural' },
      { tx: 8, ty: 25, kind: 'standard', camp: 2, label: 'far' },
      { tx: 34, ty: 29, kind: 'rich', camp: 3, label: 'center' },
    ],
    lairs: [],
    objectives: [],
    forests: [
      { x0: 3, y0: 64, x1: 33, y1: 71 },
      { x0: 2, y0: 38, x1: 6, y1: 71 },
    ],
    groves: [
      [5, 46, 3.5],
      [24, 44, 3.5],
      [31, 53, 2.8],
      [19, 31, 4.5],
      [47, 57, 3.5],
      [55, 64, 4],
      [14, 15, 4],
      [28, 22, 3],
      [40, 68, 4],
    ],
    lakes: [
      [26, 50, 2.6],
      [62, 46, 3],
    ],
    ridges: [
      [13, 36, 32, 43, 0.48, 0.62],
      [41, 47, 46, 62, 0.45, 0.62],
    ],
    outcrops: [
      [46.5, 35.5, 2.2],
      [70, 60, 1.8],
    ],
    rivers: [],
    rings: [],
  },
  {
    id: 'river',
    name: 'Rivercross',
    blurb: 'A river splits the map: three fords are the only crossings. Rich mines sit on both banks of the centre ford.',
    width: W,
    height: H,
    start: { tx: 10, ty: 56 },
    mines: [
      { tx: 18, ty: 57, kind: 'start', camp: 0, label: 'start' },
      { tx: 5, ty: 43, kind: 'small', camp: 0, label: 'pocket' },
      { tx: 30, ty: 62, kind: 'standard', camp: 1, label: 'natural' },
      { tx: 50, ty: 63, kind: 'standard', camp: 2, label: 'ford' },
      { tx: 22, ty: 17, kind: 'standard', camp: 2, label: 'far' },
      { tx: 37, ty: 37, kind: 'rich', camp: 3, label: 'center' },
    ],
    lairs: [{ x: 22, y: 34, level: 2 }],
    objectives: [
      { type: 'shop', tx: 30, ty: 24 },
      { type: 'fountain', tx: 41, ty: 30 },
    ],
    forests: [
      { x0: 2, y0: 64, x1: 26, y1: 71 },
      { x0: 2, y0: 30, x1: 8, y1: 40 },
      { x0: 9, y0: 36, x1: 14, y1: 40 },
    ],
    groves: [
      [14, 26, 4],
      [33, 50, 3.5],
      [24, 46, 3],
      [42, 70, 3],
      [6, 8, 4],
    ],
    lakes: [],
    ridges: [],
    outcrops: [[30, 40, 1.6]],
    rivers: [
      {
        x0: 26,
        y0: -2,
        x1: 70,
        y1: 74,
        width: 2.4,
        fords: [
          [0.18, 0.25],
          [0.465, 0.535],
          [0.75, 0.82],
        ],
      },
    ],
    rings: [],
  },
  {
    id: 'highland',
    name: 'Highland Crown',
    blurb: 'A walled plateau holds the richest mines, entered by two ramps. The long way round passes guarded flank mines.',
    width: W,
    height: H,
    start: { tx: 10, ty: 56 },
    mines: [
      { tx: 18, ty: 57, kind: 'start', camp: 0, label: 'start' },
      { tx: 4, ty: 41, kind: 'small', camp: 0, label: 'pocket' },
      { tx: 32, ty: 62, kind: 'standard', camp: 1, label: 'natural' },
      { tx: 18, ty: 20, kind: 'standard', camp: 2, label: 'flank' },
      { tx: 40, ty: 34, kind: 'rich', camp: 3, label: 'crown' },
    ],
    lairs: [{ x: 27, y: 40, level: 3 }],
    objectives: [
      { type: 'fountain', tx: 46, ty: 29 },
      { type: 'shop', tx: 60, ty: 54 },
    ],
    forests: [
      { x0: 2, y0: 65, x1: 30, y1: 71 },
      { x0: 2, y0: 28, x1: 9, y1: 38 },
      { x0: 10, y0: 34, x1: 14, y1: 38 },
    ],
    groves: [
      [24, 50, 3.5],
      [30, 28, 3],
      [8, 12, 4],
      [44, 62, 3],
      [62, 66, 3.5],
    ],
    lakes: [[16, 46, 2]],
    ridges: [],
    outcrops: [],
    rivers: [],
    rings: [
      {
        cx: 48,
        cy: 36,
        r: 11,
        width: 1.6,
        // Ramps face the flanks, across the line between the bases.
        ramps: [
          [0.78, 1.26],
          [0.78 - Math.PI, 1.26 - Math.PI],
        ],
      },
    ],
  },
];

export function mapById(id: string | undefined): MapDef {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}
