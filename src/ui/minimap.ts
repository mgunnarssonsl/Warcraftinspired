// Top-down minimap: terrain, resources, buildings, units, the camera's view
// trapezoid (projected from the 3D camera) and alert pings.

import type { ClientState } from '../input/client';
import type { CameraRig } from '../render3d/cameraRig';
import type { Game } from '../sim/game';
import type { GameEvent } from '../sim/types';
import { TERRAIN } from '../sim/types';

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
    for (const e of Object.values(this.game.state.entities)) {
      if (e.kind === 'resource') {
        ctx.fillStyle = e.type === 'tree' ? '#1f4526' : '#ffd84a';
        ctx.fillRect(e.tx * sx, e.ty * sy, Math.max(1, e.w * sx), Math.max(1, e.h * sy));
      } else if (e.kind === 'building') {
        ctx.fillStyle = this.game.player(e.owner).color;
        ctx.fillRect(e.tx * sx - 1, e.ty * sy - 1, e.w * sx + 2, e.h * sy + 2);
        ctx.strokeStyle = e.progress < 1 ? '#f0b030' : '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(e.tx * sx - 1, e.ty * sy - 1, e.w * sx + 2, e.h * sy + 2);
      } else if (!e.hidden) {
        ctx.fillStyle = client.selected.includes(e.id) ? '#ffffff' : this.game.player(e.owner).color;
        ctx.fillRect(e.x * sx - 1.5, e.y * sy - 1.5, 3, 3);
      }
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
