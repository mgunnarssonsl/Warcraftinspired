// Sound cues, synthesized with WebAudio (no audio files: original recorded
// sound is Phase G). Each cue is a short envelope of one or two tones or a
// burst of noise. Volumes come from the settings: master x (effects or
// alerts). The browser only starts audio after a user gesture, so the
// context is created on the first click or key press.

import type { GameEvent } from '../sim/types';

export type Cue =
  | 'click'
  | 'error'
  | 'alert'
  | 'built'
  | 'trained'
  | 'research'
  | 'levelUp'
  | 'hit'
  | 'death'
  | 'sighting'
  | 'victory'
  | 'defeat';

/** Alerts (being attacked, sightings, the result) follow the alerts volume; the rest the effects volume. */
const ALERTS = new Set<Cue>(['alert', 'sighting', 'victory', 'defeat']);

type Note = { f: number; t: number; d: number; type?: OscillatorType; gain?: number; slide?: number };

const CUES: Record<Cue, { notes?: Note[]; noise?: { d: number; gain: number; filter: number } }> = {
  click: { notes: [{ f: 880, t: 0, d: 0.04, type: 'triangle', gain: 0.25 }] },
  error: { notes: [{ f: 220, t: 0, d: 0.12, type: 'square', gain: 0.18 }, { f: 165, t: 0.1, d: 0.16, type: 'square', gain: 0.18 }] },
  alert: { notes: [{ f: 660, t: 0, d: 0.12, type: 'sawtooth', gain: 0.22 }, { f: 520, t: 0.14, d: 0.12, type: 'sawtooth', gain: 0.22 }, { f: 660, t: 0.28, d: 0.16, type: 'sawtooth', gain: 0.22 }] },
  built: { notes: [{ f: 392, t: 0, d: 0.12, type: 'triangle' }, { f: 523, t: 0.1, d: 0.12, type: 'triangle' }, { f: 659, t: 0.2, d: 0.25, type: 'triangle' }] },
  trained: { notes: [{ f: 523, t: 0, d: 0.08, type: 'triangle', gain: 0.5 }, { f: 784, t: 0.07, d: 0.14, type: 'triangle', gain: 0.5 }] },
  research: { notes: [{ f: 440, t: 0, d: 0.1, type: 'sine' }, { f: 554, t: 0.09, d: 0.1, type: 'sine' }, { f: 659, t: 0.18, d: 0.1, type: 'sine' }, { f: 880, t: 0.27, d: 0.3, type: 'sine' }] },
  levelUp: { notes: [{ f: 523, t: 0, d: 0.1, type: 'square', gain: 0.25 }, { f: 659, t: 0.1, d: 0.1, type: 'square', gain: 0.25 }, { f: 784, t: 0.2, d: 0.1, type: 'square', gain: 0.25 }, { f: 1047, t: 0.3, d: 0.35, type: 'square', gain: 0.25 }] },
  hit: { noise: { d: 0.06, gain: 0.25, filter: 1800 } },
  death: { notes: [{ f: 300, t: 0, d: 0.35, type: 'sawtooth', gain: 0.18, slide: 90 }] },
  sighting: { notes: [{ f: 988, t: 0, d: 0.1, type: 'sine', gain: 0.35 }, { f: 1319, t: 0.1, d: 0.18, type: 'sine', gain: 0.35 }] },
  victory: { notes: [523, 659, 784, 1047].map((f, i) => ({ f, t: i * 0.16, d: i === 3 ? 0.7 : 0.18, type: 'triangle' as OscillatorType })) },
  defeat: { notes: [392, 349, 311, 262].map((f, i) => ({ f, t: i * 0.22, d: i === 3 ? 0.8 : 0.24, type: 'triangle' as OscillatorType })) },
};

export class Sound {
  private ctx: AudioContext | null = null;
  private last = new Map<Cue, number>();
  volumes = { master: 0.7, effects: 0.8, alerts: 1, muted: false };

  constructor() {
    // Audio may only start after a user gesture.
    const unlock = () => {
      this.ensure();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this.ctx = Ctx ? new Ctx() : null;
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  /** Play a cue; the same cue is limited to a few times a second so fights don't roar. */
  play(cue: Cue): void {
    const v = this.volumes;
    const level = v.muted ? 0 : v.master * (ALERTS.has(cue) ? v.alerts : v.effects);
    if (level <= 0) return;
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'suspended') return;
    const now = ctx.currentTime;
    const gap = cue === 'hit' ? 0.09 : 0.25;
    if (now - (this.last.get(cue) ?? -1) < gap) return;
    this.last.set(cue, now);
    const def = CUES[cue];
    const out = ctx.createGain();
    out.gain.value = level * 0.5;
    out.connect(ctx.destination);
    for (const n of def.notes ?? []) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = n.type ?? 'sine';
      o.frequency.setValueAtTime(n.f, now + n.t);
      if (n.slide) o.frequency.exponentialRampToValueAtTime(n.slide, now + n.t + n.d);
      const peak = n.gain ?? 0.4;
      g.gain.setValueAtTime(0.0001, now + n.t);
      g.gain.exponentialRampToValueAtTime(peak, now + n.t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
      o.connect(g).connect(out);
      o.start(now + n.t);
      o.stop(now + n.t + n.d + 0.05);
    }
    if (def.noise) {
      const len = Math.ceil(ctx.sampleRate * def.noise.d);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = def.noise.filter;
      const g = ctx.createGain();
      g.gain.value = def.noise.gain;
      src.connect(f).connect(g).connect(out);
      src.start(now);
    }
  }

  /** Cues for this viewer from the simulation's events. */
  handleEvents(events: GameEvent[], viewer: number): void {
    for (const e of events) {
      switch (e.type) {
        case 'buildingComplete':
          if (e.player === viewer) this.play('built');
          break;
        case 'unitTrained':
          if (e.player === viewer) this.play('trained');
          break;
        case 'researchComplete':
          if (e.player === viewer) this.play('research');
          break;
        case 'levelUp':
          if (e.player === viewer) this.play('levelUp');
          break;
        case 'hit':
          if (e.owner === viewer || e.attackerOwner === viewer) this.play('hit');
          break;
        case 'death':
          if (e.owner === viewer) this.play('death');
          break;
        case 'cantBuild':
        case 'cantTrain':
        case 'cantCast':
        case 'cantItem':
          if (e.player === viewer) this.play('error');
          break;
        case 'matchOver':
          this.play(e.winner === viewer ? 'victory' : 'defeat');
          break;
      }
    }
  }
}
