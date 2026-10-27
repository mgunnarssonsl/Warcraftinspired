// End-of-match summary: charts of each side's economy and army over time
// (from the simulation's 30-second history), and a table of what happened.

import { CONFIG, TICK_RATE, type UnitType } from '../sim/config';
import type { Game } from '../sim/game';
import type { HistoryPoint } from '../sim/types';
import { teamColor } from './view';

type Metric = { key: keyof HistoryPoint; title: string };
const CHARTS: Metric[] = [
  { key: 'gold', title: 'Gold gathered' },
  { key: 'wood', title: 'Wood gathered' },
  { key: 'army', title: 'Army size' },
  { key: 'workers', title: 'Workers' },
  { key: 'value', title: 'Army value (gold + wood)' },
];

const fmtMin = (ticks: number) => `${Math.round(ticks / TICK_RATE / 60)}m`;

/** A small line chart, one line per player, x = match time. */
function chart(game: Game, ids: number[], m: Metric): string {
  const h = game.state.history;
  const W = 220;
  const H = 90;
  const pad = { l: 34, r: 6, t: 6, b: 16 };
  if (h.length < 2) return '';
  const tMax = h[h.length - 1].tick || 1;
  const vMax = Math.max(1, ...h.flatMap((s) => ids.map((p) => s.players[p]?.[m.key] ?? 0)));
  const x = (t: number) => pad.l + ((W - pad.l - pad.r) * t) / tMax;
  const y = (v: number) => H - pad.b - ((H - pad.t - pad.b) * v) / vMax;
  const lines = ids
    .map((p, i) => {
      const pts = h.map((s) => `${x(s.tick).toFixed(1)},${y(s.players[p]?.[m.key] ?? 0).toFixed(1)}`).join(' ');
      // The viewer's line is solid, the opponent's dashed: readable without colour.
      return `<polyline points="${pts}" fill="none" stroke="${teamColor(game, p)}" stroke-width="2" ${i === 0 ? '' : 'stroke-dasharray="5 3"'}/>`;
    })
    .join('');
  const vLabel = vMax >= 1000 ? `${(vMax / 1000).toFixed(1)}k` : String(vMax);
  return `<figure class="chart"><figcaption>${m.title}</figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${m.title} over time">
    <line x1="${pad.l}" y1="${H - pad.b}" x2="${W - pad.r}" y2="${H - pad.b}" class="axis"/><line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${H - pad.b}" class="axis"/>
    <text x="${pad.l - 4}" y="${pad.t + 8}" text-anchor="end">${vLabel}</text><text x="${pad.l - 4}" y="${H - pad.b}" text-anchor="end">0</text>
    <text x="${W - pad.r}" y="${H - 3}" text-anchor="end">${fmtMin(tMax)}</text>${lines}</svg></figure>`;
}

/** "3 Guards, 2 Archers" from per-type counts, biggest first. */
function byType(counts: Partial<Record<UnitType, number>>): string {
  const parts = (Object.entries(counts) as Array<[UnitType, number]>).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!parts.length) return '–';
  return parts
    .slice(0, 4)
    .map(([t, n]) => `${n} ${CONFIG.units[t].name}${n > 1 ? 's' : ''}`)
    .join(', ');
}

export function summaryHtml(game: Game, viewer: number, names: Record<number, string>): string {
  const players = game.state.players.filter((p) => !p.neutral);
  const ids = [viewer, ...players.map((p) => p.id).filter((id) => id !== viewer)];
  const minutes = Math.max(1 / 60, game.state.tick / TICK_RATE / 60);
  const peak = (p: number, k: keyof HistoryPoint) => Math.max(0, ...game.state.history.map((s) => s.players[p]?.[k] ?? 0));
  const rows: Array<[string, (id: number) => string]> = [
    ['Gold gathered (per minute)', (id) => `${game.player(id).goldGathered} (${Math.round(game.player(id).goldGathered / minutes)})`],
    ['Wood gathered', (id) => String(game.player(id).woodGathered)],
    ['Bounty from kills', (id) => String(game.player(id).stats.bounty)],
    ['Most workers / largest army', (id) => `${peak(id, 'workers')} / ${peak(id, 'army')}`],
    ['Units trained', (id) => `${game.player(id).stats.unitsTrained}`],
    ['Units lost', (id) => `${game.player(id).stats.unitsLost}: ${byType(game.player(id).stats.lost)}`],
    ['Enemies destroyed', (id) => String(game.player(id).stats.kills)],
    ['Buildings built / lost', (id) => `${game.player(id).stats.buildingsBuilt} / ${game.player(id).stats.buildingsLost}`],
    ['Camps cleared', (id) => String(game.player(id).stats.campsCleared)],
    ['Upgrades researched', (id) => String(Object.values(game.player(id).research).filter(Boolean).length)],
    ['Heroes', (id) => game.player(id).heroes.map((h) => `${CONFIG.units[h.type].name} Lv ${h.level}`).join(', ') || '–'],
  ];
  const head = ids.map((id) => `<th style="color:${teamColor(game, id)}">${names[id] ?? `Player ${id + 1}`}</th>`).join('');
  const legend = ids
    .map((id, i) => `<span><i style="border-color:${teamColor(game, id)};border-top-style:${i === 0 ? 'solid' : 'dashed'}"></i>${names[id] ?? `Player ${id + 1}`}</span>`)
    .join('');
  return `<div class="charts">${CHARTS.map((m) => chart(game, ids, m)).join('')}</div>
    <div class="legend">${legend}</div>
    <table class="stats"><tr><th></th>${head}</tr>${rows.map(([k, f]) => `<tr><td>${k}</td>${ids.map((id) => `<td>${f(id)}</td>`).join('')}</tr>`).join('')}</table>`;
}
