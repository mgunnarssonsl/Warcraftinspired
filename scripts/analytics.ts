// Balance analytics (not part of `npm test`):
//
//   npm run analytics                       36 matches, Normal and Hard
//   npm run analytics -- --matches 90 --levels hard --out docs/balance-report.md
//
// Plays computer-vs-computer matches (random maps, factions, styles and
// seats; the same difficulty on both sides, so the comparison is fair) and
// reports what decided them, from the simulation's own events:
//   - win rates by faction, map, seat and style, and how long matches last;
//   - per unit type: how many were trained and lost, the damage they dealt
//     and took, kills, and damage dealt per 100 resources spent (cost-efficiency);
//   - when players reached tier II and III and took a second base;
//   - gold gathered by minute, per faction.
// Writes a Markdown report (and the raw numbers as JSON beside it).

import { writeFileSync } from 'node:fs';
import { ComputerPlayer, type Difficulty } from '../src/ai/computer';
import { STYLES, type StyleId } from '../src/ai/profile';
import { CONFIG, type UnitType } from '../src/sim/config';
import { FACTION, isHall, isWorker, type FactionId } from '../src/sim/factions';
import { Game } from '../src/sim/game';
import { MAPS } from '../src/sim/maps';
import { hash2 } from '../src/sim/rng';

const args = process.argv.slice(2);
const arg = (name: string, d: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const MATCHES = Number(arg('matches', '36'));
const LEVELS = arg('levels', 'normal,hard').split(',') as Difficulty[];
const OUT = arg('out', 'analytics-report.md');
const MAX_TICKS = 20 * 60 * 30;

interface UnitStats {
  trained: number;
  lost: number;
  damageDealt: number;
  damageTaken: number;
  kills: number;
  /** Health restored to allies (healers, healing abilities). */
  healing: number;
}

interface PlayerResult {
  faction: FactionId;
  style: StyleId;
  seat: number;
  tier2: number | null;
  tier3: number | null;
  secondBase: number | null;
  goldAt: Record<number, number>;
  peakArmy: number;
}

interface MatchResult {
  map: string;
  level: Difficulty;
  ticks: number;
  winner: number | null;
  players: PlayerResult[];
}

const unitStats = new Map<string, UnitStats>();
const stat = (t: string) => {
  let s = unitStats.get(t);
  if (!s) unitStats.set(t, (s = { trained: 0, lost: 0, damageDealt: 0, damageTaken: 0, kills: 0, healing: 0 }));
  return s;
};

function play(n: number): MatchResult {
  const pick = <T>(xs: readonly T[], k: number) => xs[Math.floor(hash2(n, k, 4242) * xs.length)];
  const map = pick(MAPS, 1).id;
  const level = pick(LEVELS, 2);
  const factions = [pick(['crown', 'wild'] as FactionId[], 3), pick(['crown', 'wild'] as FactionId[], 4)];
  const styles = [pick(STYLES, 5), pick(STYLES, 6)];
  const g = Game.create(1000 + n, map, factions);
  const ais = [0, 1].map((p) => new ComputerPlayer(p, level, styles[p]));
  const players: PlayerResult[] = [0, 1].map((p) => ({ faction: factions[p], style: styles[p], seat: p, tier2: null, tier3: null, secondBase: null, goldAt: {}, peakArmy: 0 }));
  // Who is who: unit and building types by id (attackers can die in the tick they hit).
  const typeOf = new Map<number, { type: string; owner: number }>();
  const lastHitBy = new Map<number, string>();
  const remember = () => {
    for (const u of g.units()) typeOf.set(u.id, { type: u.type, owner: u.owner });
    for (const b of g.buildings()) typeOf.set(b.id, { type: b.type, owner: b.owner });
  };
  remember();
  const contender = (owner: number) => owner === 0 || owner === 1;
  // A defeated player's units are removed (with death events): those are not battle losses.
  const defeated = new Set<number>();
  for (let t = 0; t < MAX_TICKS && !g.state.outcome; t++) {
    g.step();
    for (const a of ais) a.update(g);
    if (t % 20 === 0) remember();
    for (const e of g.drainEvents()) {
      if (e.type === 'unitTrained') {
        const u = g.unit(e.id);
        if (u) {
          typeOf.set(u.id, { type: u.type, owner: u.owner });
          stat(u.type).trained++;
        }
      } else if (e.type === 'hit') {
        const att = typeOf.get(e.attacker) ?? (g.get(e.attacker) as { type: string; owner: number } | undefined);
        const vic = typeOf.get(e.id) ?? (g.get(e.id) as { type: string; owner: number } | undefined);
        // Fights between the players only (camp clearing would skew the picture).
        if (!att || !vic || !contender(att.owner) || !contender(vic.owner)) continue;
        stat(att.type).damageDealt += e.damage;
        if (vic.type in CONFIG.units) stat(vic.type).damageTaken += e.damage;
        lastHitBy.set(e.id, att.type);
      } else if (e.type === 'heal') {
        const src = typeOf.get(e.source) ?? (g.get(e.source) as { type: string; owner: number } | undefined);
        if (src && contender(src.owner)) stat(src.type).healing += e.amount;
      } else if (e.type === 'playerDefeated') {
        defeated.add(e.player);
      } else if (e.type === 'death' && contender(e.owner) && !defeated.has(e.owner)) {
        stat(e.unit).lost++;
        const killer = lastHitBy.get(e.id);
        if (killer) stat(killer).kills++;
      } else if (e.type === 'researchComplete') {
        const p = players[e.player];
        if (!p) continue;
        const [t2, t3] = FACTION[p.faction].tiers;
        if (e.research === t2) p.tier2 = g.state.tick;
        if (e.research === t3) p.tier3 = g.state.tick;
      } else if (e.type === 'buildingComplete') {
        const b = g.building(e.id);
        const p = players[e.player];
        if (b && p && isHall(b.type) && p.secondBase === null && g.state.tick > 20) p.secondBase = g.state.tick;
      }
    }
    if (t % 1200 === 0) {
      for (const p of players) {
        p.goldAt[t / 1200] = g.player(p.seat).goldGathered;
        p.peakArmy = Math.max(p.peakArmy, g.units().filter((u) => u.owner === p.seat && !isWorker(u.type)).length);
      }
    }
  }
  return { map, level, ticks: g.state.tick, winner: g.state.outcome?.winner ?? null, players };
}

// ---- run --------------------------------------------------------------------------

const results: MatchResult[] = [];
const t0 = Date.now();
for (let n = 0; n < MATCHES; n++) {
  results.push(play(n));
  if ((n + 1) % 6 === 0) console.log(`${n + 1}/${MATCHES} matches (${Math.round((Date.now() - t0) / 1000)} s)`);
}

// ---- report -----------------------------------------------------------------------

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '–');
const mmss = (ticks: number | null) => (ticks === null ? '–' : `${Math.floor(ticks / 1200)}:${String(Math.floor(ticks / 20) % 60).padStart(2, '0')}`);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const table = (head: string[], rows: Array<Array<string | number>>) =>
  [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

/** Wins and games for anything a player can be grouped by (mirror matches count as no information). */
function rate(key: (p: PlayerResult, m: MatchResult) => string): Array<[string, number, number]> {
  const acc = new Map<string, { w: number; g: number }>();
  for (const m of results) {
    if (m.winner === null) continue;
    const [a, b] = m.players;
    if (key(a, m) === key(b, m)) continue;
    for (const p of m.players) {
      const k = key(p, m);
      const r = acc.get(k) ?? { w: 0, g: 0 };
      r.g++;
      if (m.winner === p.seat) r.w++;
      acc.set(k, r);
    }
  }
  return [...acc].map(([k, r]) => [k, r.w, r.g] as [string, number, number]).sort((x, y) => y[1] / y[2] - x[1] / x[2]);
}

const decided = results.filter((m) => m.winner !== null);
const lengths = decided.map((m) => m.ticks);
const unitRows = [...unitStats]
  .filter(([t, s]) => t in CONFIG.units && s.trained > 0 && !isWorker(t as UnitType))
  .map(([t, s]) => {
    const c = CONFIG.units[t as UnitType].cost;
    const spent = s.trained * (c.gold + c.wood);
    return { t, s, spent, eff: spent ? (100 * s.damageDealt) / spent : 0, heal: spent ? (100 * s.healing) / spent : 0 };
  })
  .sort((a, b) => b.eff - a.eff);
const avg = (xs: Array<number | null>) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};
const byFaction = (f: FactionId) => results.flatMap((m) => m.players.filter((p) => p.faction === f));

const report = `# Ironvale balance report

${MATCHES} computer-vs-computer matches (${LEVELS.join(' and ')}, the same difficulty on both sides), random maps, factions, styles and seats. ${decided.length} were decided; median length ${mmss(median(lengths))}, the middle half between ${mmss(lengths.sort((a, b) => a - b)[Math.floor(lengths.length / 4)] ?? 0)} and ${mmss(lengths[Math.floor((lengths.length * 3) / 4)] ?? 0)}.

Generated by \`npm run analytics\` (scripts/analytics.ts). Computer players are a stand-in for people: these numbers show how the rules play out under consistent decision-making, not how a person will fare.

## Win rates

Mirror pairings (both players the same faction, or the same style) are left out of that table: they say nothing about the difference.

${table(['Faction', 'Won', 'Played', 'Rate'], rate((p) => FACTION[p.faction].name).map(([k, w, g]) => [k, w, g, pct(w, g)]))}

${table(['Style', 'Won', 'Played', 'Rate'], rate((p) => CONFIG.ai.styles[p.style].name).map(([k, w, g]) => [k, w, g, pct(w, g)]))}

${table(['Seat', 'Won', 'Played', 'Rate'], rate((p) => `Player ${p.seat + 1}`).map(([k, w, g]) => [k, w, g, pct(w, g)]))}

${table(['Map', 'Matches', 'Decided', 'Median length'], MAPS.map((m) => {
  const ms = results.filter((r) => r.map === m.id);
  return [m.name, ms.length, ms.filter((r) => r.winner !== null).length, mmss(median(ms.filter((r) => r.winner !== null).map((r) => r.ticks)))];
}))}

## Units

Fights between the players only (camp clearing left out). *Per 100* is damage dealt, or health restored, per 100 resources (gold + wood) spent training that type: cost-efficiency. Heroes count their training cost only once, though they fight all match. Healing counts healer units; heroes' healing abilities and the Thornwild's regrowth are not included.

${table(['Unit', 'Trained', 'Lost', 'Kills', 'Damage dealt', 'Damage taken', 'Healing', 'Damage per 100', 'Healing per 100'], unitRows.map(({ t, s, eff, heal }) => [CONFIG.units[t as UnitType].name, s.trained, s.lost, s.kills, Math.round(s.damageDealt), Math.round(s.damageTaken), Math.round(s.healing), Math.round(eff), Math.round(heal)]))}

## Development

${table(['Faction', 'Tier II (avg)', 'Tier III (avg)', 'Second base (avg)', 'Gold by 5:00', 'by 10:00', 'by 15:00', 'Peak army (avg)'], (['crown', 'wild'] as FactionId[]).map((f) => {
  const ps = byFaction(f);
  return [FACTION[f].name, mmss(avg(ps.map((p) => p.tier2))), mmss(avg(ps.map((p) => p.tier3))), mmss(avg(ps.map((p) => p.secondBase))), avg(ps.map((p) => p.goldAt[5] ?? null)) ?? '–', avg(ps.map((p) => p.goldAt[10] ?? null)) ?? '–', avg(ps.map((p) => p.goldAt[15] ?? null)) ?? '–', avg(ps.map((p) => p.peakArmy)) ?? '–'];
}))}
`;

writeFileSync(OUT, report);
writeFileSync(OUT.replace(/\.md$/, '.json'), JSON.stringify({ results, units: Object.fromEntries(unitStats) }, null, 1));
console.log(`\nWrote ${OUT} (${Math.round((Date.now() - t0) / 1000)} s)\n`);
console.log(report);
