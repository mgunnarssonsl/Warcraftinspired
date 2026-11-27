// Sound playback, synthesized with WebAudio (original and asset-free).
// Every cue is a short recipe of tones and filtered noise; cues.ts decides
// which play and in which category. Placed cues fade with distance from the
// camera and pan left or right, so a fight off to one side is heard there.
// The same cue is rate-limited and only so many sounds play at once, so a
// big battle stays a texture rather than a roar and alerts still cut
// through. The browser starts audio only after a user gesture.

import type { GameEvent } from '../sim/types';
import { CUE_CATEGORY, eventCues, spatial, type Category, type Cue, type CueContext } from './cues';

type Tone = { f: number; t?: number; d: number; type?: OscillatorType; gain?: number; to?: number };
type Noise = { t?: number; d: number; gain?: number; lp?: number; hp?: number };
type Recipe = { tones?: Tone[]; noise?: Noise[]; gap: number };

const R = (tones: Tone[] = [], noise: Noise[] = [], gap = 0.25): Recipe => ({ tones, noise, gap });
const arp = (fs: number[], step: number, last: number, type: OscillatorType = 'triangle', gain = 0.35): Tone[] =>
  fs.map((f, i) => ({ f, t: i * step, d: i === fs.length - 1 ? last : step * 1.1, type, gain }));

/** The recipes. Gap: the shortest time between two plays of the same cue. */
const RECIPES: Record<Cue, Recipe> = {
  click: R([{ f: 1200, d: 0.03, type: 'triangle', gain: 0.18 }], [], 0.04),
  error: R([{ f: 196, d: 0.1, type: 'square', gain: 0.12 }, { f: 147, t: 0.09, d: 0.14, type: 'square', gain: 0.12 }], [], 0.3),
  select: R([{ f: 523, d: 0.06, gain: 0.22 }, { f: 659, t: 0.05, d: 0.08, gain: 0.22 }], [], 0.12),
  selectSoldier: R([{ f: 330, d: 0.06, type: 'square', gain: 0.1 }, { f: 440, t: 0.05, d: 0.08, type: 'square', gain: 0.1 }], [], 0.12),
  selectHero: R(arp([392, 523, 659], 0.05, 0.14, 'triangle', 0.25), [], 0.15),
  orderMove: R([{ f: 700, d: 0.05, gain: 0.16, to: 900 }], [], 0.08),
  orderAttack: R([{ f: 300, d: 0.07, type: 'sawtooth', gain: 0.1, to: 220 }], [{ d: 0.05, gain: 0.08, hp: 2000 }], 0.08),
  orderWork: R([{ f: 600, d: 0.05, gain: 0.14 }, { f: 520, t: 0.05, d: 0.05, gain: 0.14 }], [], 0.08),

  swing: R([], [{ d: 0.09, gain: 0.12, lp: 2400, hp: 600 }], 0.07),
  clash: R([{ f: 1850, d: 0.12, type: 'square', gain: 0.05 }, { f: 2630, d: 0.09, type: 'square', gain: 0.04 }], [{ d: 0.05, gain: 0.2, hp: 1800 }], 0.06),
  bowShot: R([{ f: 260, d: 0.12, type: 'triangle', gain: 0.18, to: 140 }], [{ d: 0.04, gain: 0.06, hp: 3000 }], 0.07),
  arrowHit: R([], [{ d: 0.05, gain: 0.18, lp: 1400 }], 0.06),
  spellShot: R([{ f: 900, d: 0.18, type: 'sine', gain: 0.12, to: 1600 }], [], 0.1),
  siegeLaunch: R([{ f: 90, d: 0.25, type: 'sine', gain: 0.35, to: 55 }], [{ d: 0.15, gain: 0.12, lp: 600 }], 0.2),
  boom: R([{ f: 70, d: 0.4, type: 'sine', gain: 0.45, to: 38 }], [{ d: 0.35, gain: 0.35, lp: 900 }], 0.15),
  thud: R([{ f: 110, d: 0.1, type: 'sine', gain: 0.3, to: 70 }], [{ d: 0.06, gain: 0.12, lp: 700 }], 0.08),
  death: R([{ f: 280, d: 0.3, type: 'sawtooth', gain: 0.09, to: 110 }], [], 0.12),
  collapse: R([{ f: 60, d: 0.9, type: 'sine', gain: 0.4, to: 30 }], [{ d: 1.0, gain: 0.4, lp: 500 }], 0.5),
  spell: R([{ f: 520, d: 0.35, type: 'sine', gain: 0.18, to: 1040 }, { f: 780, t: 0.05, d: 0.3, type: 'sine', gain: 0.12, to: 1560 }], [], 0.2),
  heal: R(arp([784, 988, 1175], 0.06, 0.22, 'sine', 0.16), [], 0.4),
  musket: R([{ f: 120, d: 0.22, type: 'sine', gain: 0.4, to: 45 }], [{ d: 0.28, gain: 0.45, lp: 2600 }, { d: 0.08, gain: 0.3, hp: 2000 }], 0.12),
  aimClick: R([{ f: 2200, d: 0.03, type: 'square', gain: 0.05 }, { f: 1500, t: 0.06, d: 0.03, type: 'square', gain: 0.05 }], [], 0.12),
  growl: R([{ f: 85, d: 0.45, type: 'sawtooth', gain: 0.14, to: 60 }, { f: 120, d: 0.4, type: 'sawtooth', gain: 0.06, to: 90 }], [{ d: 0.4, gain: 0.08, lp: 500 }], 0.3),
  shimmer: R(arp([660, 880, 1175, 1568], 0.05, 0.35, 'sine', 0.12), [], 0.3),
  horn: R([{ f: 196, d: 0.45, type: 'sawtooth', gain: 0.12 }, { f: 294, t: 0.05, d: 0.4, type: 'sawtooth', gain: 0.08 }], [], 0.5),

  chop: R([{ f: 180, d: 0.06, type: 'triangle', gain: 0.25, to: 120 }], [{ d: 0.05, gain: 0.15, lp: 1200 }], 0.15),
  treeFall: R([{ f: 140, d: 0.5, type: 'sawtooth', gain: 0.06, to: 60 }], [{ d: 0.6, gain: 0.2, lp: 2500, hp: 300 }], 0.4),
  goldDrop: R([{ f: 1568, d: 0.08, gain: 0.12 }, { f: 2093, t: 0.06, d: 0.12, gain: 0.1 }], [], 0.18),
  woodDrop: R([{ f: 150, d: 0.08, type: 'triangle', gain: 0.25 }, { f: 120, t: 0.07, d: 0.08, type: 'triangle', gain: 0.2 }], [], 0.18),
  pick: R([{ f: 2400, d: 0.04, type: 'square', gain: 0.04 }], [{ d: 0.03, gain: 0.1, hp: 2500 }], 0.25),
  hammer: R([{ f: 820, d: 0.05, type: 'square', gain: 0.05 }], [{ d: 0.04, gain: 0.14, lp: 3000, hp: 500 }], 0.22),
  built: R(arp([392, 523, 659, 784], 0.09, 0.3), [], 0.4),
  trained: R([{ f: 523, d: 0.07, gain: 0.3 }, { f: 784, t: 0.07, d: 0.14, gain: 0.3 }], [], 0.25),
  research: R(arp([440, 554, 659, 880], 0.08, 0.35, 'sine', 0.3), [], 0.4),
  levelUp: R(arp([523, 659, 784, 1047], 0.09, 0.4, 'square', 0.14), [], 0.5),
  rankUp: R(arp([587, 784, 988], 0.08, 0.35, 'triangle', 0.18), [], 0.5),
  pickup: R([{ f: 988, d: 0.06, gain: 0.2 }, { f: 1319, t: 0.05, d: 0.1, gain: 0.2 }], [], 0.2),
  coin: R([{ f: 1760, d: 0.05, gain: 0.15 }, { f: 2349, t: 0.04, d: 0.12, gain: 0.12 }, { f: 1760, t: 0.12, d: 0.1, gain: 0.1 }], [], 0.2),

  alertBase: R([{ f: 220, d: 0.32, type: 'sawtooth', gain: 0.16 }, { f: 165, t: 0.34, d: 0.45, type: 'sawtooth', gain: 0.16 }], [{ d: 0.3, gain: 0.08, lp: 400 }], 3),
  alertArmy: R([{ f: 98, d: 0.18, type: 'sine', gain: 0.5 }, { f: 98, t: 0.22, d: 0.18, type: 'sine', gain: 0.5 }, { f: 131, t: 0.44, d: 0.3, type: 'sine', gain: 0.45 }], [], 3),
  sighting: R([{ f: 988, d: 0.1, gain: 0.22 }, { f: 1319, t: 0.1, d: 0.18, gain: 0.22 }], [], 1),
  heroFallen: R(arp([392, 311, 262], 0.18, 0.6, 'sawtooth', 0.1), [], 1),
  mineGone: R([{ f: 330, d: 0.2, type: 'triangle', gain: 0.25 }, { f: 247, t: 0.2, d: 0.3, type: 'triangle', gain: 0.25 }], [{ d: 0.4, gain: 0.15, lp: 600 }], 1),
  popBlocked: R([{ f: 262, d: 0.12, type: 'square', gain: 0.1 }, { f: 262, t: 0.18, d: 0.12, type: 'square', gain: 0.1 }], [], 4),
  victory: R(arp([523, 659, 784, 1047, 1319], 0.15, 0.9), [], 2),
  defeat: R(arp([392, 349, 311, 262], 0.22, 1.0), [], 2),
  campCleared: R(arp([659, 880, 1109], 0.07, 0.3, 'triangle', 0.25), [], 0.5),
};

/** At most this many cues sound at once; alerts and interface may always play. */
const MAX_VOICES = 14;

export type Volumes = { master: number; muted: boolean } & Record<Category, number>;

export class Sound {
  private ctx: AudioContext | null = null;
  private last = new Map<Cue, number>();
  private voices: number[] = [];
  private ambience: { gain: GainNode } | null = null;
  private nextBird = 0;
  private nextWork = { hammer: 0, pick: 0 };
  volumes: Volumes = { master: 0.7, interface: 0.6, combat: 0.7, economy: 0.7, alerts: 1, ambience: 0.4, muted: false };
  /** Where the camera is, for placed sounds. */
  listener = { x: 0, y: 0, reach: 30 };

  constructor() {
    // Audio may only start after a user gesture.
    const unlock = () => {
      this.ensure();
      void this.ctx?.resume();
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

  private level(cat: Category): number {
    const v = this.volumes;
    return v.muted ? 0 : v.master * v[cat];
  }

  /** Play a cue, placed on the map if it has a position. */
  play(cue: Cue, at: { x?: number; y?: number } = {}): void {
    const cat = CUE_CATEGORY[cue];
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const { gain: dist, pan } = spatial(cue, at, this.listener);
    const level = this.level(cat) * dist;
    if (level <= 0.01) return;
    const now = ctx.currentTime;
    const recipe = RECIPES[cue];
    if (now - (this.last.get(cue) ?? -99) < recipe.gap) return;
    this.voices = this.voices.filter((end) => end > now);
    if (this.voices.length >= MAX_VOICES && cat !== 'alerts' && cat !== 'interface') return;
    this.last.set(cue, now);
    const out = ctx.createGain();
    out.gain.value = level;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    out.connect(panner).connect(ctx.destination);
    let end = now;
    for (const n of recipe.tones ?? []) {
      const t = now + (n.t ?? 0);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = n.type ?? 'sine';
      o.frequency.setValueAtTime(n.f, t);
      if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, t + n.d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(n.gain ?? 0.3, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + n.d);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + n.d + 0.05);
      end = Math.max(end, t + n.d);
    }
    for (const n of recipe.noise ?? []) {
      const t = now + (n.t ?? 0);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(n.d);
      let node: AudioNode = src;
      if (n.lp) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = n.lp;
        node = node.connect(f);
      }
      if (n.hp) {
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = n.hp;
        node = node.connect(f);
      }
      const g = ctx.createGain();
      g.gain.value = n.gain ?? 0.2;
      node.connect(g).connect(out);
      src.start(t);
      end = Math.max(end, t + n.d);
    }
    this.voices.push(end);
  }

  private noise = new Map<number, AudioBuffer>();
  /** Decaying white noise, cached by length. */
  private noiseBuffer(d: number): AudioBuffer {
    const ctx = this.ctx!;
    const key = Math.round(d * 100);
    let buf = this.noise.get(key);
    if (!buf) {
      const len = Math.max(1, Math.ceil(ctx.sampleRate * d));
      buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let seed = 12345 + key;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        data[i] = ((seed / 0x7fffffff) * 2 - 1) * (1 - i / len) ** 2;
      }
      this.noise.set(key, buf);
    }
    return buf;
  }

  /** Cues for this viewer from the simulation's events. */
  handleEvents(events: GameEvent[], ctx: CueContext): void {
    for (const h of eventCues(events, ctx)) this.play(h.cue, h);
  }

  /**
   * Per frame: the steady sounds of the scene near the camera. Hammering
   * while something is being built, a pick now and then while a mine is
   * worked, and a quiet bed of wind with the odd bird.
   */
  tick(scene: { building: Array<{ x: number; y: number }>; mining: Array<{ x: number; y: number }> }): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    this.updateAmbience();
    const near = (list: Array<{ x: number; y: number }>) =>
      list.reduce<{ x: number; y: number } | null>((best, p) => {
        const d = Math.hypot(p.x - this.listener.x, p.y - this.listener.y);
        return !best || d < Math.hypot(best.x - this.listener.x, best.y - this.listener.y) ? p : best;
      }, null);
    const b = near(scene.building);
    if (b && now >= this.nextWork.hammer) {
      this.play('hammer', b);
      this.nextWork.hammer = now + 0.45 + Math.random() * 0.25;
    }
    const m = near(scene.mining);
    if (m && now >= this.nextWork.pick) {
      this.play('pick', m);
      this.nextWork.pick = now + 0.9 + Math.random() * 0.8;
    }
  }

  private updateAmbience(): void {
    const ctx = this.ctx!;
    const level = this.level('ambience') * 0.12;
    if (!this.ambience) {
      // Wind: looping low-passed noise with a slow swell.
      const src = ctx.createBufferSource();
      const len = ctx.sampleRate * 4;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let seed = 777;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        data[i] = (seed / 0x7fffffff) * 2 - 1;
      }
      src.buffer = buf;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.07;
      lfoGain.gain.value = 160;
      lfo.connect(lfoGain).connect(lp.frequency);
      const gain = ctx.createGain();
      gain.gain.value = level;
      src.connect(lp).connect(gain).connect(ctx.destination);
      src.start();
      lfo.start();
      this.ambience = { gain };
    }
    this.ambience.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.3);
    // The odd bird call.
    const now = ctx.currentTime;
    if (level > 0 && now >= this.nextBird) {
      this.nextBird = now + 6 + Math.random() * 10;
      const out = ctx.createGain();
      out.gain.value = this.level('ambience') * 0.25;
      out.connect(ctx.destination);
      const base = 2200 + Math.random() * 1200;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
        const t = now + i * 0.13;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(base, t);
        o.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.07);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.1);
      }
    }
  }
}
