// Performance benchmark for the simulation (not part of `npm test`).
//
//   npm run bench                 all scenarios
//   npm run bench -- battle       one scenario by name
//
// Each scenario reports simulation time per tick (mean, 99th percentile,
// worst) against the 50 ms a tick has at 20 ticks a second. The browser
// also renders, so the simulation should stay far below that budget.

import { ComputerPlayer, type Difficulty } from '../src/ai/computer';
import type { UnitType } from '../src/sim/config';
import type { FactionId } from '../src/sim/factions';
import { Game } from '../src/sim/game';

declare const process: { argv: string[]; memoryUsage(): { heapUsed: number } };

interface Result {
  name: string;
  ticks: number;
  units: number;
  mean: number;
  /** The first ticks run cold (the JavaScript engine compiles as it goes): reported apart. */
  first: number;
  p99: number;
  worst: number;
  heapMb: number;
}

/** Ticks reported apart as warm-up. */
const WARMUP = 20;

function measure(name: string, g: Game, ticks: number, each: (t: number) => void = () => {}): Result {
  const times: number[] = [];
  let units = 0;
  for (let t = 0; t < ticks; t++) {
    const t0 = performance.now();
    g.step();
    each(t);
    times.push(performance.now() - t0);
    units = Math.max(units, g.units().length);
  }
  if (process.argv.includes('--spikes')) {
    const worst = times.map((ms, t) => ({ ms, t })).sort((a, b) => b.ms - a.ms).slice(0, 6);
    console.log(`  slowest ticks: ${worst.map((w) => `#${w.t} ${w.ms.toFixed(1)}ms`).join(', ')}`);
  }
  const first = Math.max(...times.slice(0, WARMUP));
  const warm = times.slice(WARMUP).sort((a, b) => a - b);
  return {
    name,
    ticks,
    units,
    mean: warm.reduce((a, b) => a + b, 0) / warm.length,
    first,
    p99: warm[Math.floor(warm.length * 0.99)],
    worst: warm[warm.length - 1],
    heapMb: process.memoryUsage().heapUsed / 1e6,
  };
}

/** A whole match, two computers, until someone wins or 40 minutes pass. */
function match(factions: FactionId[], difficulty: Difficulty, map: string): Result {
  const g = Game.create(4, map, factions);
  const ais = [0, 1].map((p) => new ComputerPlayer(p, difficulty));
  let end = 0;
  const r = measure(`match ${factions.join('-')} ${difficulty} ${map}`, g, 20 * 60 * 40, (t) => {
    for (const a of ais) a.update(g);
    if (g.state.outcome && !end) end = t;
  });
  return { ...r, name: `${r.name} (${end ? `won at ${(end / 1200).toFixed(1)} min` : 'no result'})` };
}

/** The most units the population cap allows: two full armies meet in the middle while workers keep gathering. */
function battle(): Result {
  const g = Game.create(5, 'vales');
  const mix: UnitType[] = ['guard', 'guard', 'archer', 'archer', 'lancer', 'cleric'];
  const armies: number[][] = [[], []];
  for (const p of [0, 1]) {
    const hq = g.buildings().find((b) => b.owner === p)!;
    g.spawnUnitsNear('worker', p, hq, 15); // 20 workers
    const mine = g.resources().filter((r) => r.type === 'goldmine').sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0];
    g.issue({ type: 'gather', player: p, units: g.units().filter((u) => u.owner === p).map((u) => u.id), nodeId: mine.id });
    // 80 population of soldiers: 36 units.
    for (let i = 0; i < 36; i++) armies[p].push(...g.spawnUnitsNear(mix[i % mix.length], p, hq, 1).map((u) => u.id));
  }
  const centre = { x: g.state.map.width / 2, y: g.state.map.height / 2 };
  for (const p of [0, 1]) g.issue({ type: 'attackMove', player: p, units: armies[p], x: centre.x, y: centre.y });
  return measure('battle: 2 x (20 workers + 36 soldiers)', g, 20 * 120);
}

/** Headroom: twice the population cap's worth of soldiers, all fighting at once. */
function headroom(): Result {
  const g = Game.create(5, 'highland');
  const mix: UnitType[] = ['guard', 'guard', 'archer', 'archer', 'lancer', 'cleric'];
  const armies: number[][] = [[], []];
  for (const p of [0, 1]) {
    const hq = g.buildings().find((b) => b.owner === p)!;
    for (let i = 0; i < 120; i++) armies[p].push(...g.spawnUnitsNear(mix[i % mix.length], p, hq, 1).map((u) => u.id));
  }
  const centre = { x: g.state.map.width / 2, y: g.state.map.height / 2 };
  for (const p of [0, 1]) g.issue({ type: 'attackMove', player: p, units: armies[p], x: centre.x, y: centre.y });
  return measure('headroom: 2 x 120 soldiers', g, 20 * 120);
}

/** Many long paths at once: every soldier ordered across the whole map in the same tick. */
function crossing(): Result {
  const g = Game.create(6, 'river');
  const ids: number[] = [];
  const hq = g.buildings().find((b) => b.owner === 0)!;
  for (let i = 0; i < 60; i++) ids.push(...g.spawnUnitsNear('guard', 0, hq, 1).map((u) => u.id));
  const foe = g.state.starts[1];
  let r: Result | null = null;
  // Re-order every 5 seconds, as a player clicking around would.
  r = measure('crossing: 60 soldiers re-ordered across a river map', g, 20 * 60, (t) => {
    if (t % 100 === 0) g.issue({ type: 'move', player: 0, units: ids, x: t % 200 === 0 ? foe.x : hq.x, y: t % 200 === 0 ? foe.y : hq.y });
  });
  return r;
}

const SCENARIOS: Record<string, () => Result> = {
  battle,
  crossing,
  headroom,
  crown: () => match(['crown', 'crown'], 'hard', 'vales'),
  wild: () => match(['wild', 'crown'], 'hard', 'highland'),
  river: () => match(['crown', 'wild'], 'normal', 'river'),
};

const pick = process.argv.slice(2).filter((a) => a in SCENARIOS);
const rows: Result[] = [];
for (const name of pick.length ? pick : Object.keys(SCENARIOS)) {
  const r = SCENARIOS[name]();
  rows.push(r);
  console.log(`${r.name}: ${r.ticks} ticks, up to ${r.units} units; per tick mean ${r.mean.toFixed(2)} ms, p99 ${r.p99.toFixed(2)} ms, worst ${r.worst.toFixed(1)} ms (first ticks ${r.first.toFixed(0)} ms); heap ${r.heapMb.toFixed(0)} MB`);
}
