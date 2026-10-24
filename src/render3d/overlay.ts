// Screen-space overlay drawn on a 2D canvas above the WebGL view: health and
// progress bars, mine occupancy pips, floating delivery numbers and the
// selection box. Positions come from projecting 3D points through the camera.

import type { ClientState } from '../input/client';
import { CONFIG } from '../sim/config';
import type { Game } from '../sim/game';
import type { GameEvent, Order, QueuedOrder, Unit } from '../sim/types';
import type { CameraRig } from './cameraRig';

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  t0: number;
}

const GOLD = '#ffd84a';
const WOOD = '#d9b07a';

export class Overlay {
  private ctx: CanvasRenderingContext2D;
  private floats: FloatText[] = [];
  /** Fog-of-war filter supplied by the 3D view. */
  perceived: (e: import('../sim/types').Entity) => boolean = () => true;

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
    private rig: CameraRig,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number): void {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  handleEvents(events: GameEvent[], now: number, viewer: number): void {
    for (const e of events) {
      if (e.type === 'deliver' && e.player === viewer) {
        this.floats.push({ x: e.x, y: e.y + 0.5, text: `+${e.amount}`, color: e.res === 'gold' ? GOLD : WOOD, t0: now });
      } else if (e.type === 'bounty' && e.player === viewer) {
        this.floats.push({ x: e.x, y: e.y, text: `+${e.amount}`, color: GOLD, t0: now });
      } else if (e.type === 'levelUp' && e.player === viewer) {
        this.floats.push({ x: e.x, y: e.y, text: `Level ${e.level}!`, color: '#ffe9a8', t0: now });
      }
    }
  }

  private bar(x: number, y: number, h: number, w: number, frac: number, color: string, label?: string): void {
    const p = this.rig.project(x, y, h);
    if (!p.visible) return;
    const ctx = this.ctx;
    const px = Math.round(p.x - w / 2);
    const py = Math.round(p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(px - 1, py - 1, w + 2, 7);
    ctx.fillStyle = color;
    ctx.fillRect(px, py, Math.round(w * Math.max(0, Math.min(1, frac))), 5);
    if (label) {
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(label, p.x, py - 4);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, p.x, py - 4);
    }
  }

  private marker(x: number, y: number, h: number, text: string, color: string): void {
    const p = this.rig.project(x, y, h);
    if (!p.visible) return;
    const ctx = this.ctx;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(text, p.x, p.y);
    ctx.fillStyle = color;
    ctx.fillText(text, p.x, p.y);
  }

  /** Where an order (current or queued) leads, and the line color for it. */
  private orderPoint(o: Order | QueuedOrder): { x: number; y: number; color: string } | null {
    switch (o.type) {
      case 'move':
        return { x: o.x, y: o.y, color: '#7dff8a' };
      case 'attackMove':
        return { x: o.x, y: o.y, color: '#ff6a5a' };
      case 'attack': {
        const t = this.game.get(o.targetId);
        return t && this.perceived(t) ? { x: t.x, y: t.y, color: '#ff6a5a' } : null;
      }
      case 'gather': {
        const n = o.nodeId >= 0 ? this.game.resource(o.nodeId) : undefined;
        return n ? { x: n.x, y: n.y, color: '#ffd84a' } : null;
      }
      case 'build': {
        const size = CONFIG.buildings[o.buildingType].size;
        return { x: o.tx + size / 2, y: o.ty + size / 2, color: '#ffd84a' };
      }
      default:
        return null;
    }
  }

  /**
   * Shift-queued waypoints of the selected own units, and the rally line of a
   * selected production building, as dashed lines on the ground.
   */
  private drawPlans(client: ClientState, alpha: number): void {
    const { ctx } = this;
    const line = (pts: Array<{ x: number; y: number; color: string }>) => {
      for (let i = 1; i < pts.length; i++) {
        const a = this.rig.project(pts[i - 1].x, pts[i - 1].y, 0.05);
        const b = this.rig.project(pts[i].x, pts[i].y, 0.05);
        ctx.strokeStyle = pts[i].color;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.fillStyle = pts[i].color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.globalAlpha = 0.85;
    for (const id of client.selected) {
      const e = this.game.get(id);
      if (!e || e.owner !== client.player) continue;
      if (e.kind === 'unit') {
        const u = e as Unit;
        if (!u.orderQueue.length) continue;
        const pts = [{ x: u.px + (u.x - u.px) * alpha, y: u.py + (u.y - u.py) * alpha, color: '' }];
        for (const o of [...(u.order ? [u.order] : []), ...u.orderQueue]) {
          const p = this.orderPoint(o);
          if (p) pts.push(p);
        }
        line(pts);
      } else if (e.kind === 'building' && e.rally && client.selected.length === 1) {
        line([{ x: e.x, y: e.y, color: '' }, { x: e.rally.x, y: e.rally.y, color: '#ffffff' }]);
      }
    }
    ctx.restore();
  }

  draw(client: ClientState, alpha: number, now: number): void {
    const { ctx, canvas, game } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const selected = new Set(client.selected);
    this.drawPlans(client, alpha);

    for (const e of Object.values(game.state.entities)) {
      if (!this.perceived(e)) continue;
      if (e.kind === 'unit') {
        if (e.hidden) continue;
        const x = e.px + (e.x - e.px) * alpha;
        const y = e.py + (e.y - e.py) * alpha;
        if (e.stun > 0) this.marker(x, y, 1.75, '✦ ✦', '#ffe36a');
        if (e.hero) {
          // Heroes always show health, mana and level.
          const head = e.type === 'hero' ? 1.7 : 1.25;
          this.bar(x, y, head, 40, e.hp / e.maxHp, hpColor(e.hp / e.maxHp), `Lv ${e.hero.level}`);
          this.bar(x, y, head - 0.12, 40, e.hero.mana / e.hero.maxMana, '#5a8cff');
          continue;
        }
        // Selected or wounded units show health, so fights stay readable.
        if (!selected.has(e.id) && e.hp >= e.maxHp) continue;
        this.bar(x, y, 1.25, 30, e.hp / e.maxHp, hpColor(e.hp / e.maxHp));
      } else if (e.kind === 'building') {
        const top = e.w * 0.75 + 0.6;
        if (e.progress < 1 && e.owner === client.player) {
          this.bar(e.x, e.y, top * (0.3 + 0.7 * e.progress), 60, e.progress, '#f0b030', `${Math.floor(e.progress * 100)}%`);
        } else if (selected.has(e.id) || e.hp < e.maxHp) {
          this.bar(e.x, e.y, top, 70, e.hp / e.maxHp, hpColor(e.hp / e.maxHp));
        }
        const q = e.queue[0];
        if (q && e.owner === client.player) {
          // Training progress just above the roof; red label when waiting for population.
          const name = q.research ? CONFIG.research[q.research].name : CONFIG.units[q.unit!].name;
          const label = q.started ? (q.revive ? `Reviving ${name}` : name) : 'Need Farms';
          this.bar(e.x, e.y, top + 0.55, 50, q.progress, q.started ? '#6ab0ff' : '#ff5a4a', label);
        }
      } else if (e.type === 'goldmine') {
        // Occupancy pips: workers inside out of the slot limit.
        const p = this.rig.project(e.x, e.y + 1.2, 1.25);
        if (p.visible && p.x > -20 && p.x < canvas.width + 20) {
          let inside = 0;
          for (const u of game.units()) if (u.hidden && u.order?.type === 'gather' && u.order.nodeId === e.id) inside++;
          const slots = CONFIG.resources.goldmine.maxMiners;
          for (let i = 0; i < slots; i++) {
            ctx.beginPath();
            ctx.arc(p.x - ((slots - 1) * 12) / 2 + i * 12, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = i < inside ? GOLD : 'rgba(0,0,0,0.55)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.9)';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
        if (selected.has(e.id)) this.bar(e.x, e.y, 2.3, 70, e.amount / e.maxAmount, GOLD);
      } else if (selected.has(e.id)) {
        this.bar(e.x, e.y, 2.2, 30, e.amount / e.maxAmount, WOOD);
      }
    }

    this.floats = this.floats.filter((f) => now - f.t0 < 1.3);
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      const t = (now - f.t0) / 1.3;
      const p = this.rig.project(f.x, f.y, 2.6 + t * 1.2);
      if (!p.visible) continue;
      ctx.globalAlpha = 1 - t * t;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(f.text, p.x, p.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    if (client.drag) {
      const { x0, y0, x1, y1 } = client.drag;
      ctx.strokeStyle = '#5dff6a';
      ctx.lineWidth = 1.5;
      ctx.fillStyle = 'rgba(93,255,106,0.08)';
      const x = Math.min(x0, x1);
      const y = Math.min(y0, y1);
      ctx.fillRect(x, y, Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeRect(x, y, Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  }
}

function hpColor(f: number): string {
  return f > 0.6 ? '#4cd964' : f > 0.3 ? '#f0c030' : '#ff4a3a';
}
