// Top-down minimap: terrain, resources, buildings, units, the camera's view
// trapezoid (projected from the 3D camera) and alert pings.

import { teamColor } from './view';
import type { ClientState } from '../input/client';
import type { CameraRig } from '../render3d/cameraRig';
import type { Game } from '../sim/game';
import type { GameEvent } from '../sim/types';
import { TERRAIN } from '../sim/types';
import { CONFIG } from '../sim/config';

/** Camp markers by level: easy yellow, medium orange, hard red. */
const CAMP_COLORS: Record<number, string> = { 1: '#f0d060', 2: '#f09a40', 3: '#e0503a' };

interface Ping {
  x: number;
  y: number;
  t0: number;
  color: string;
}

export class Minimap {
  private base: HTMLCanvasElement | null = null;
  pings: Ping[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
  ) {}

  handleEvents(events: GameEvent[], now: number, viewer: number): void {
    for (const e of events) {
      if (e.type === 'mineDepleted' && e.player === viewer) this.pings.push({ x: e.x, y: e.y, t0: now, color: '#ffcf40' });
      if (e.type === 'buildingComplete' && e.player === viewer) this.pings.push({ x: e.x, y: e.y, t0: now, color: '#7dff8a' });
    }
  }

  ping(x: number, y: number, color: string, now: number): void {
    this.pings.push({ x, y, t0: now, color });
  }

  /** Latest alert location, for the "jump to alert" key. */
  lastAlert(): { x: number; y: number } | null {
    return this.pings.length ? this.pings[this.pings.length - 1] : null;
  }

  /** Canvas pixel -> map tile coordinates. */
  toMap(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const { width, height } = this.game.state.map;
    return { x: ((clientX - r.left) / r.width) * width, y: ((clientY - r.top) / r.height) * height };
  }

  private fogCanvas: HTMLCanvasElement | null = null;

  draw(rig: CameraRig, client: ClientState, now: number): void {
    const ctx = this.canvas.getContext('2d')!;
    const { width: W, height: H, terrain } = this.game.state.map;
    const sx = this.canvas.width / W;
    const sy = this.canvas.height / H;
    if (!this.base) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const b = c.getContext('2d')!;
      for (let i = 0; i < W * H; i++) {
        const t = terrain[i];
        b.fillStyle =
          t === TERRAIN.water ? '#2c5878' : t === TERRAIN.rock ? '#6e665b' : t === TERRAIN.dirt ? '#7d6644' : '#4b6e36';
        b.fillRect(i % W, Math.floor(i / W), 1, 1);
      }
      this.base = c;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, 0, 0, this.canvas.width, this.canvas.height);
    const vision = this.game.vision;
    const me = client.player;
    const neutral = (owner: number) => !!this.game.state.players[owner]?.neutral;
    const seen = (e: import('../sim/types').Entity) =>
      client.revealAll || e.owner === me || e.kind === 'resource' || (e.kind === 'building' && neutral(e.owner)) || vision.canSee(me, e);
    // Enemy buildings out of view: outlines where they were last seen.
    if (!client.revealAll) {
      ctx.lineWidth = 1;
      for (const m of vision.remembered(me)) {
        const b = this.game.building(m.id);
        if (b && vision.canSee(me, b)) continue;
        ctx.strokeStyle = teamColor(this.game, m.owner);
        ctx.strokeRect(m.tx * sx - 0.5, m.ty * sy - 0.5, m.w * sx + 1, m.h * sy + 1);
      }
    }
    for (const e of Object.values(this.game.state.entities)) {
      if (!seen(e)) continue;
      if (e.kind === 'resource') {
        ctx.fillStyle = e.type === 'tree' ? '#1f4526' : e.miners > CONFIG.resources.goldmine.maxMiners ? '#ffe9a8' : '#ffd84a';
        const pad = e.type === 'goldmine' && e.miners > CONFIG.resources.goldmine.maxMiners ? 1 : 0; // rich mines read bigger
        ctx.fillRect(e.tx * sx - pad, e.ty * sy - pad, Math.max(1, e.w * sx) + 2 * pad, Math.max(1, e.h * sy) + 2 * pad);
      } else if (e.kind === 'building') {
        ctx.fillStyle = teamColor(this.game, e.owner);
        ctx.fillRect(e.tx * sx - 1, e.ty * sy - 1, e.w * sx + 2, e.h * sy + 2);
        ctx.strokeStyle = e.progress < 1 ? '#f0b030' : '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(e.tx * sx - 1, e.ty * sy - 1, e.w * sx + 2, e.h * sy + 2);
      } else if (!e.hidden) {
        // Shape as well as colour tells sides apart: your units are squares,
        // enemies diamonds, neutral camp guards circles.
        ctx.fillStyle = client.selected.includes(e.id) ? '#ffffff' : teamColor(this.game, e.owner);
        const x = e.x * sx;
        const y = e.y * sy;
        if (e.owner === me) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        else if (neutral(e.owner)) {
          ctx.beginPath();
          ctx.arc(x, y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(x, y - 2.4);
          ctx.lineTo(x + 2.4, y);
          ctx.lineTo(x, y + 2.4);
          ctx.lineTo(x - 2.4, y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    // Fog: black where never explored, dimmed where not currently visible.
    if (!client.revealAll) {
      if (!this.fogCanvas) {
        this.fogCanvas = document.createElement('canvas');
        this.fogCanvas.width = W;
        this.fogCanvas.height = H;
      }
      const fctx = this.fogCanvas.getContext('2d')!;
      const img = fctx.createImageData(W, H);
      const vis = vision.grid(me);
      const exp = this.game.state.explored[me] ?? [];
      for (let i = 0; i < W * H; i++) img.data[i * 4 + 3] = vis[i] ? 0 : exp[i] ? 110 : 235;
      fctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.fogCanvas, 0, 0, this.canvas.width, this.canvas.height);
    }
    // Camps you have found, marked with their level until you see them cleared.
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of this.game.state.camps) {
      const known = client.revealAll ? !c.cleared : vision.isExplored(me, Math.floor(c.x), Math.floor(c.y)) && !(c.seenClear & (1 << me));
      if (!known) continue;
      ctx.fillStyle = CAMP_COLORS[c.level] ?? '#c0392b';
      ctx.beginPath();
      ctx.arc(c.x * sx, c.y * sy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a140c';
      ctx.fillText(String(c.level), c.x * sx, c.y * sy + 0.5);
    }
    // Camera view: the ground trapezoid under the screen corners.
    const corners = [
      rig.screenToGround(0, 0),
      rig.screenToGround(rig.viewW, 0),
      rig.screenToGround(rig.viewW, rig.viewH),
      rig.screenToGround(0, rig.viewH),
    ];
    if (corners.every((c) => c)) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      corners.forEach((c, i) => (i ? ctx.lineTo(c!.x * sx, c!.y * sy) : ctx.moveTo(c!.x * sx, c!.y * sy)));
      ctx.closePath();
      ctx.stroke();
    }
    this.pings = this.pings.filter((p) => now - p.t0 < 3);
    for (const p of this.pings) {
      const t = (now - p.t0) % 1;
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x * sx, p.y * sy, 3 + t * 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}
