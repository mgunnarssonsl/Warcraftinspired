import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ComputerPlayer } from '../src/ai/computer';
import { datan2, dcos, dsin, len } from '../src/sim/dmath';
import { Game } from '../src/sim/game';
import { stateHash } from '../src/sim/hash';

describe('deterministic maths', () => {
  it('matches the engine functions to within 1e-14', () => {
    for (let i = -2000; i <= 2000; i++) {
      const x = i * 0.0137 + (i % 7) * 1e-3;
      expect(Math.abs(dsin(x) - Math.sin(x))).toBeLessThan(1e-14);
      expect(Math.abs(dcos(x) - Math.cos(x))).toBeLessThan(1e-14);
      const y = (i % 23) - 11.5;
      expect(Math.abs(datan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-14);
      expect(Math.abs(len(x, y) - Math.hypot(x, y))).toBeLessThan(1e-12);
    }
    expect([datan2(0, 0), datan2(1, 0), datan2(-1, 0), datan2(0, -1)]).toEqual([0, Math.PI / 2, -Math.PI / 2, Math.PI]);
  });

  it('the simulation and the computer opponent use no engine-dependent maths', () => {
    // Math.hypot, sin, cos, atan2, exp, pow, random...: each engine may round
    // them differently, and online players would drift apart.
    const banned = /Math\.(hypot|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|random)\s*\(|[\w)\]]\s*\*\*\s*[\w(]/;
    const offenders: string[] = [];
    for (const dir of ['src/sim', 'src/ai']) {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.ts') || f === 'dmath.ts') continue;
        readFileSync(`${dir}/${f}`, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            const code = line.replace(/\/\/.*$/, '');
            if (banned.test(code)) offenders.push(`${dir}/${f}:${i + 1}: ${line.trim()}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('state hash', () => {
  it('two runs of the same match agree tick by tick; any change shows', () => {
    const run = () => {
      const g = Game.create(9, 'highland', ['wild', 'crown']);
      const ais = [new ComputerPlayer(0, 'hard'), new ComputerPlayer(1, 'normal')];
      const hashes: string[] = [];
      for (let t = 0; t < 20 * 240; t++) {
        g.step();
        for (const a of ais) a.update(g);
        if (t % 200 === 0) hashes.push(stateHash(g));
      }
      return { g, hashes };
    };
    const a = run();
    const b = run();
    expect(a.hashes).toEqual(b.hashes);
    const before = stateHash(b.g);
    b.g.units()[3].hp -= 1e-9; // the smallest drift
    expect(stateHash(b.g)).not.toBe(before);
  }, 60_000);
});
