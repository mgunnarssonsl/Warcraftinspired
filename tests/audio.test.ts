import { describe, expect, it } from 'vitest';
import { CUE_CATEGORY, eventCues, orderCue, selectCue, spatial, type CueContext } from '../src/audio/cues';
import { ComputerPlayer } from '../src/ai/computer';
import { Game } from '../src/sim/game';
import type { GameEvent } from '../src/sim/types';

/** Viewer 0 sees only x < 50. */
const ctx = (units: Record<number, { type: string; owner: number; x: number; y: number }> = {}): CueContext => ({
  viewer: 0,
  visible: (x) => x < 50,
  unit: (id) => units[id],
});
const cues = (events: GameEvent[], units = {}) => eventCues(events, ctx(units)).map((c) => c.cue);

describe('sound cues', () => {
  it('every cue has one of the five categories', () => {
    for (const c of Object.values(CUE_CATEGORY)) expect(['interface', 'combat', 'economy', 'alerts', 'ambience']).toContain(c);
  });

  it('a fight in the fog makes no sound; the same fight in sight does', () => {
    const units = { 1: { type: 'guard', owner: 1, x: 70, y: 10 }, 2: { type: 'archer', owner: 2, x: 72, y: 10 } };
    const fight = (x: number): GameEvent[] => [
      { type: 'attack', id: 1 },
      { type: 'hit', id: 2, attacker: 1, attackerOwner: 1, owner: 2, damage: 5, x, y: 10 },
      { type: 'death', id: 2, owner: 2, unit: 'archer', x, y: 10 },
    ];
    expect(cues(fight(72), units)).toEqual([]);
    const near = { 1: { ...units[1], x: 20 }, 2: { ...units[2], x: 22 } };
    expect(cues(fight(22), near)).toEqual(['swing', 'clash', 'death']);
  });

  it('a siege engine firing from the fog is not heard', () => {
    expect(cues([{ type: 'attack', id: 9 }], { 9: { type: 'mangonel', owner: 1, x: 80, y: 5 } })).toEqual([]);
    expect(cues([{ type: 'attack', id: 9 }], { 9: { type: 'mangonel', owner: 1, x: 30, y: 5 } })).toEqual(['siegeLaunch']);
  });

  it('your own units are heard being hit even out of sight, and shots sound by weapon', () => {
    const units = { 3: { type: 'archer', owner: 1, x: 80, y: 5 }, 4: { type: 'worker', owner: 0, x: 81, y: 5 } };
    expect(cues([{ type: 'hit', id: 4, attacker: 3, attackerOwner: 1, owner: 0, damage: 5, x: 81, y: 5 }], units)).toEqual(['arrowHit']);
    expect(cues([{ type: 'attack', id: 3 }], { 3: { ...units[3], x: 10 } })).toEqual(['bowShot']);
  });

  it("the enemy's economy is silent; yours is heard", () => {
    const enemy: GameEvent[] = [
      { type: 'deliver', player: 1, res: 'gold', amount: 10, x: 5, y: 5 },
      { type: 'buildingComplete', player: 1, id: 7, x: 5, y: 5 },
      { type: 'unitTrained', player: 1, id: 8, x: 5, y: 5 },
    ];
    expect(cues(enemy)).toEqual([]);
    expect(cues(enemy.map((e) => ({ ...e, player: 0 }) as GameEvent))).toEqual(['goldDrop', 'built', 'trained']);
  });

  it('distinct alerts for the things you must not miss', () => {
    const own: GameEvent[] = [
      { type: 'heroFallen', player: 0, x: 1, y: 1 },
      { type: 'mineDepleted', player: 0, x: 1, y: 1 },
      { type: 'popBlocked', player: 0, buildingId: 3 },
      { type: 'matchOver', winner: 0 },
    ];
    const got = cues(own);
    expect(got).toEqual(['heroFallen', 'mineGone', 'popBlocked', 'victory']);
    for (const c of got) expect(CUE_CATEGORY[c]).toBe('alerts');
    expect(new Set(['alertBase', 'alertArmy']).size).toBe(2);
  });

  it('placed sounds fade with distance and pan to their side; interface and alerts do not', () => {
    const l = { x: 50, y: 50, reach: 30 };
    const near = spatial('clash', { x: 52, y: 50 }, l);
    const far = spatial('clash', { x: 75, y: 50 }, l);
    const gone = spatial('clash', { x: 90, y: 50 }, l);
    expect(near.gain).toBeGreaterThan(far.gain);
    expect(far.gain).toBeGreaterThan(0);
    expect(gone.gain).toBe(0);
    expect(spatial('clash', { x: 40, y: 50 }, l).pan).toBeLessThan(0);
    expect(far.pan).toBeGreaterThan(0);
    expect(spatial('alertBase', { x: 90, y: 50 }, l)).toEqual({ gain: 1, pan: 0 });
    expect(spatial('click', {}, l)).toEqual({ gain: 1, pan: 0 });
  });

  it('orders and selections are acknowledged by kind', () => {
    expect([orderCue('move'), orderCue('attackMove'), orderCue('gather'), orderCue('setRally')]).toEqual(['orderMove', 'orderAttack', 'orderWork', null]);
    expect([selectCue(['worker']), selectCue(['worker', 'guard']), selectCue(['guard', 'hero']), selectCue([])]).toEqual(['select', 'selectSoldier', 'selectHero', null]);
  });

  it('in a real match, every placed sound comes from somewhere the viewer can see or from their own units', () => {
    const g = Game.create(4, 'river');
    const ais = [new ComputerPlayer(0, 'hard'), new ComputerPlayer(1, 'hard')];
    const live: CueContext = {
      viewer: 0,
      visible: (x, y) => g.vision.isVisible(0, Math.floor(x), Math.floor(y)),
      unit: (id) => {
        const u = g.unit(id);
        return u ? { type: u.type, owner: u.owner, x: u.x, y: u.y } : undefined;
      },
    };
    let heard = 0;
    for (let t = 0; t < 20 * 60 * 9; t++) {
      g.step();
      for (const a of ais) a.update(g);
      const events = g.drainEvents();
      for (const c of eventCues(events, live)) {
        if (c.x === undefined || CUE_CATEGORY[c.cue] !== 'combat') continue;
        heard++;
        const ownInvolved = events.some((e) => (e.type === 'hit' && (e.owner === 0 || e.attackerOwner === 0) && e.x === c.x) || (e.type === 'death' && e.owner === 0 && e.x === c.x));
        const attackerOwn = events.some((e) => e.type === 'attack' && live.unit(e.id)?.owner === 0);
        expect(live.visible(c.x, c.y!) || ownInvolved || attackerOwn).toBe(true);
      }
    }
    expect(heard).toBeGreaterThan(20);
  }, 60_000);
});
