// Canvas 2D renderer. Reads game state (never mutates it) and draws the world
// with interpolation between simulation ticks, plus feedback effects driven
// by simulation events.

import type { ClientState } from '../input/client';
import { CONFIG } from '../sim/config';
import type { Game } from '../sim/game';
import { hash2 } from '../sim/rng';
import type { Building, GameEvent, ResourceNode, Unit } from '../sim/types';
import { TERRAIN } from '../sim/types';
import { makeKeepSprite, makeMineSprite, makeTreeSprites, renderTerrain } from './art';
import { Camera, TILE } from './camera';

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  t0: number;
}
interface Marker {
  x: number;
  y: number;
  color: string;
  t0: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t0: number;
  life: number;
  color: string;
}
interface Ping {
  x: number;
  y: number;
  t0: number;
  color: string;
}

const GOLD_COLOR = '#ffd84a';
const WOOD_COLOR = '#d9b07a';
const SKIN = '#e2b88c';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private terrain: HTMLCanvasElement;
  private trees = makeTreeSprites();
  private mineSprites = [0, 0.35, 0.7].map((d) => makeMineSprite(d));
  private keeps = new Map<string, HTMLCanvasElement>();
  private floats: FloatText[] = [];
  private markers: Marker[] = [];
  private particles: Particle[] = [];
  private flashes = new Map<number, number>(); // entity id -> time
  private shakes = new Map<string, number>(); // "x,y" -> time of last chop
  pings: Ping[] = [];
  private miniBase: HTMLCanvasElement | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.terrain = renderTerrain(game.state.map, game.state.seed);
  }

  private keep(color: string): HTMLCanvasElement {
    let k = this.keeps.get(color);
    if (!k) this.keeps.set(color, (k = makeKeepSprite(color)));
    return k;
  }

  // ---- feedback hooks --------------------------------------------------------

  handleEvents(events: GameEvent[], now: number, viewer: number): void {
    for (const e of events) {
      if (e.type === 'deliver' && e.player === viewer) {
        this.floats.push({
          x: e.x,
          y: e.y,
          text: `+${e.amount}`,
          color: e.res === 'gold' ? GOLD_COLOR : WOOD_COLOR,
          t0: now,
        });
      } else if (e.type === 'chop') {
        this.shakes.set(`${e.x},${e.y}`, now);
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          this.particles.push({
            x: e.x,
            y: e.y - 0.3,
            vx: Math.cos(a) * 1.2,
            vy: -1.5 - Math.random(),
            t0: now,
            life: 0.5,
            color: '#c8a070',
          });
        }
      } else if (e.type === 'treeFelled') {
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          this.particles.push({
            x: e.x,
            y: e.y - 0.4,
            vx: Math.cos(a) * 2,
            vy: Math.sin(a) * 2 - 1,
            t0: now,
            life: 0.7,
            color: i % 2 ? '#2e6b3a' : '#7a5a35',
          });
        }
      } else if (e.type === 'mineDepleted' && e.player === viewer) {
        this.pings.push({ x: e.x, y: e.y, t0: now, color: '#ffcf40' });
        for (let i = 0; i < 16; i++) {
          const a = Math.random() * Math.PI * 2;
          this.particles.push({
            x: e.x,
            y: e.y,
            vx: Math.cos(a) * 3,
            vy: Math.sin(a) * 2 - 1,
            t0: now,
            life: 1.0,
            color: '#8a7c68',
          });
        }
      }
    }
  }

  addMarker(x: number, y: number, color: string, now: number): void {
    this.markers.push({ x, y, color, t0: now });
  }

  flashEntity(id: number, now: number): void {
    this.flashes.set(id, now);
  }

  // ---- main draw -----------------------------------------------------------------

  draw(cam: Camera, client: ClientState, alpha: number, now: number): void {
    const { ctx, canvas, game } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#10140e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const z = cam.zoom;
    ctx.setTransform(z, 0, 0, z, -cam.x * z, -cam.y * z);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.terrain, 0, 0);

    const vis = cam.visibleTiles(3);
    const inView = (x: number, y: number) => x >= vis.x0 && x <= vis.x1 && y >= vis.y0 && y <= vis.y1;
    const selected = new Set(client.selected);

    // Ground decals: selection circles under everything.
    for (const id of client.selected) {
      const e = game.get(id);
      if (!e) continue;
      if (e.kind === 'unit') {
        if (e.hidden) continue;
        const p = lerpPos(e, alpha);
        this.selectionEllipse(p.x, p.y + 0.12, 0.42, 0.24, e.owner === client.player ? '#5dff6a' : '#ff5a4a');
      } else {
        const own = e.owner === client.player;
        const col = e.kind === 'resource' ? '#ffe36a' : own ? '#5dff6a' : '#ff5a4a';
        this.selectionEllipse(e.x, e.y + e.h * 0.12, e.w * 0.62, e.h * 0.45, col);
      }
    }
    this.drawMarkers(now);

    // Depth-sorted world objects.
    type D = { y: number; draw: () => void };
    const list: D[] = [];
    for (const e of Object.values(game.state.entities)) {
      if (e.kind === 'unit') {
        if (e.hidden) continue;
        const p = lerpPos(e, alpha);
        if (!inView(p.x, p.y)) continue;
        list.push({ y: p.y, draw: () => this.drawUnit(e, p.x, p.y, now, game.player(e.owner).color, client) });
      } else if (e.kind === 'resource') {
        if (!inView(e.x, e.y) && e.type === 'tree') continue;
        if (e.type === 'tree') list.push({ y: e.y + 0.3, draw: () => this.drawTree(e, now, selected.has(e.id) || client.hoverId === e.id) });
        else list.push({ y: e.ty + e.h - 0.2, draw: () => this.drawMine(e, now, client) });
      } else {
        list.push({ y: e.ty + e.h - 0.2, draw: () => this.drawBuilding(e, client) });
      }
    }
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();

    // Overlays: health bars for selected, carried resources, effects.
    for (const id of client.selected) {
      const e = game.get(id);
      if (!e || (e.kind === 'unit' && e.hidden)) continue;
      if (e.kind === 'unit') {
        const p = lerpPos(e, alpha);
        this.bar(p.x, p.y - 0.95, 0.8, e.hp / e.maxHp, '#4cd964');
      } else if (e.kind === 'building') {
        this.bar(e.x, e.ty - 1.6, 2.4, e.hp / e.maxHp, '#4cd964');
      } else if (e.type === 'goldmine') {
        this.bar(e.x, e.ty - 0.9, 2.0, e.amount / e.maxAmount, GOLD_COLOR);
      } else {
        this.bar(e.x, e.ty - 0.9, 0.8, e.amount / e.maxAmount, WOOD_COLOR);
      }
    }
    this.drawParticles(now);
    this.drawFloats(now);
    if (client.debug) this.drawDebug(cam, client);

    // Screen-space: drag box.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (client.drag) {
      const { x0, y0, x1, y1 } = client.drag;
      ctx.strokeStyle = '#5dff6a';
      ctx.lineWidth = 1.5;
      ctx.fillStyle = 'rgba(93,255,106,0.08)';
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  }

  private selectionEllipse(x: number, y: number, rx: number, ry: number, color: string): void {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x * TILE, y * TILE, rx * TILE, ry * TILE, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  private bar(cx: number, y: number, w: number, frac: number, color: string): void {
    const ctx = this.ctx;
    const px = (cx - w / 2) * TILE;
    const py = y * TILE;
    const pw = w * TILE;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(px - 1, py - 1, pw + 2, 6);
    ctx.fillStyle = color;
    ctx.fillRect(px, py, pw * Math.max(0, Math.min(1, frac)), 4);
  }

  private drawTree(t: ResourceNode, now: number, highlight: boolean): void {
    const ctx = this.ctx;
    const v = Math.floor(hash2(t.tx, t.ty, 77) * this.trees.length);
    const spr = this.trees[v];
    const shakeT = this.shakes.get(`${t.x},${t.y}`);
    let dx = 0;
    if (shakeT !== undefined && now - shakeT < 0.25) dx = Math.sin((now - shakeT) * 60) * 1.5;
    const s = 0.75 + 0.25 * (t.amount / t.maxAmount);
    const w = spr.width * s;
    const h = spr.height * s;
    const bx = t.x * TILE + dx;
    const by = (t.ty + 1) * TILE - 4;
    ctx.drawImage(spr, bx - w / 2, by - h * (52 / 60), w, h);
    if (highlight || this.flashActive(t.id, now)) {
      ctx.strokeStyle = 'rgba(255,230,120,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(bx, by - 14 * s, 12 * s, 20 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private flashActive(id: number, now: number): boolean {
    const t = this.flashes.get(id);
    return t !== undefined && now - t < 0.6 && Math.floor((now - t) * 8) % 2 === 0;
  }

  private drawMine(m: ResourceNode, now: number, client: ClientState): void {
    const ctx = this.ctx;
    const frac = m.amount / m.maxAmount;
    const spr = this.mineSprites[frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2];
    ctx.drawImage(spr, m.tx * TILE - 8, m.ty * TILE - 20);
    // Occupancy pips: how many workers are inside out of the slot limit.
    let inside = 0;
    for (const u of this.game.units()) {
      const o = u.order;
      if (u.hidden && o?.type === 'gather' && o.nodeId === m.id) inside++;
    }
    const slots = CONFIG.resources.goldmine.maxMiners;
    const ex = m.x * TILE;
    const ey = (m.ty + m.h) * TILE - 10;
    for (let i = 0; i < slots; i++) {
      ctx.fillStyle = i < inside ? GOLD_COLOR : 'rgba(0,0,0,0.5)';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ex - 6 + i * 12, ey - 44, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (inside > 0) {
      // Lantern glow and dust at the entrance while occupied.
      const flick = 0.5 + 0.5 * Math.sin(now * 9 + m.id);
      ctx.fillStyle = `rgba(255,200,90,${0.25 + 0.2 * flick})`;
      ctx.beginPath();
      ctx.ellipse(ex, ey - 10, 10, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (client.hoverId === m.id || this.flashActive(m.id, now)) {
      ctx.strokeStyle = 'rgba(255,230,120,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(m.x * TILE, m.y * TILE + 6, m.w * TILE * 0.6, m.h * TILE * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawBuilding(b: Building, client: ClientState): void {
    const ctx = this.ctx;
    const spr = this.keep(this.game.player(b.owner).color);
    ctx.drawImage(spr, b.tx * TILE - 10, b.ty * TILE - 56);
    if (client.hoverId === b.id) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.tx * TILE, b.ty * TILE, b.w * TILE, b.h * TILE);
    }
  }

  private drawUnit(u: Unit, x: number, y: number, now: number, color: string, client: ClientState): void {
    const ctx = this.ctx;
    const px = x * TILE;
    const py = y * TILE;
    const moving = u.move?.state === 'moving' && (u.x !== u.px || u.y !== u.py);
    const working = u.order?.type === 'gather' && u.order.phase === 'working';
    const dir = Math.cos(u.facing) >= 0 ? 1 : -1;
    const bob = moving ? Math.abs(Math.sin(now * 12 + u.id)) * 2 : 0;
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(px, py + 4, 8, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Legs
    ctx.strokeStyle = '#4a3a2a';
    ctx.lineWidth = 2.5;
    const step = moving ? Math.sin(now * 12 + u.id) * 3 : 0;
    ctx.beginPath();
    ctx.moveTo(px - 2, py - 2);
    ctx.lineTo(px - 2 + step, py + 3);
    ctx.moveTo(px + 2, py - 2);
    ctx.lineTo(px + 2 - step, py + 3);
    ctx.stroke();
    const by = py - 7 - bob;
    // Tool behind body: pick for gold, axe otherwise.
    const isGold = u.order?.type === 'gather' && u.order.res === 'gold';
    let swing = 0.6;
    if (working) swing = -0.4 + Math.abs(Math.sin(now * 10 + u.id)) * 1.8;
    ctx.save();
    ctx.translate(px + dir * 5, by);
    ctx.scale(dir, 1);
    ctx.rotate(-swing);
    ctx.strokeStyle = '#7a5733';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(0, -11);
    ctx.stroke();
    ctx.fillStyle = '#b9bcc2';
    ctx.beginPath();
    if (isGold) {
      ctx.moveTo(-5, -10);
      ctx.quadraticCurveTo(0, -14, 5, -10);
      ctx.lineTo(0, -12);
      ctx.closePath();
    } else {
      ctx.rect(0, -12, 4, 5);
    }
    ctx.fill();
    ctx.restore();
    // Body (tunic in team color)
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(px, by, 6, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#5b4126';
    ctx.fillRect(px - 6, by + 1, 12, 2);
    // Head
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(px + dir * 1, by - 8, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8a6a3a';
    ctx.beginPath();
    ctx.arc(px + dir * 1, by - 9.5, 4, Math.PI, 0);
    ctx.fill();
    // Cargo carried on the back.
    if (u.carry.amount > 0) {
      const cx = px - dir * 6;
      const cy = by - 4;
      if (u.carry.res === 'gold') {
        ctx.fillStyle = '#8a6a3a';
        ctx.beginPath();
        ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = GOLD_COLOR;
        ctx.beginPath();
        ctx.arc(cx, cy - 2.5, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#7a5a10';
        ctx.stroke();
      } else {
        const n = Math.ceil((u.carry.amount / 10) * 3);
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = i % 2 ? '#8a5f34' : '#a0703f';
          ctx.fillRect(cx - 6, cy - 2 - i * 3, 11, 3);
          ctx.fillStyle = '#e0c49a';
          ctx.fillRect(cx + 4, cy - 2 - i * 3, 2, 3);
        }
      }
    }
    if (client.hoverId === u.id && !client.selected.includes(u.id)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(px, py + 4, 11, 5.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawMarkers(now: number): void {
    const ctx = this.ctx;
    this.markers = this.markers.filter((m) => now - m.t0 < 0.6);
    for (const m of this.markers) {
      const t = (now - m.t0) / 0.6;
      ctx.strokeStyle = m.color;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(m.x * TILE, m.y * TILE, 14 * (1 - t * 0.6), 7 * (1 - t * 0.6), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(m.x * TILE - 4, m.y * TILE);
      ctx.lineTo(m.x * TILE + 4, m.y * TILE);
      ctx.moveTo(m.x * TILE, m.y * TILE - 3);
      ctx.lineTo(m.x * TILE, m.y * TILE + 3);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawParticles(now: number): void {
    const ctx = this.ctx;
    this.particles = this.particles.filter((p) => now - p.t0 < p.life);
    for (const p of this.particles) {
      const t = now - p.t0;
      ctx.globalAlpha = 1 - t / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect((p.x + p.vx * t) * TILE - 1.5, (p.y + p.vy * t + 3 * t * t) * TILE - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  private drawFloats(now: number): void {
    const ctx = this.ctx;
    this.floats = this.floats.filter((f) => now - f.t0 < 1.3);
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      const t = (now - f.t0) / 1.3;
      ctx.globalAlpha = 1 - t * t;
      const x = f.x * TILE;
      const y = f.y * TILE - t * 28;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  private drawDebug(cam: Camera, client: ClientState): void {
    const ctx = this.ctx;
    const nav = this.game.nav;
    const v = cam.visibleTiles(0);
    ctx.fillStyle = 'rgba(255,0,0,0.18)';
    for (let y = Math.max(0, v.y0); y <= Math.min(nav.h - 1, v.y1); y++)
      for (let x = Math.max(0, v.x0); x <= Math.min(nav.w - 1, v.x1); x++)
        if (!nav.passable(x, y)) ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    for (const id of client.selected) {
      const u = this.game.unit(id);
      if (!u?.move) continue;
      ctx.beginPath();
      ctx.moveTo(u.x * TILE, u.y * TILE);
      for (const p of u.move.path) ctx.lineTo(p.x * TILE, p.y * TILE);
      ctx.stroke();
    }
  }

  // ---- minimap ---------------------------------------------------------------

  drawMinimap(mini: HTMLCanvasElement, cam: Camera, client: ClientState, now: number): void {
    const ctx = mini.getContext('2d')!;
    const { width: W, height: H, terrain } = this.game.state.map;
    const sx = mini.width / W;
    const sy = mini.height / H;
    if (!this.miniBase) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const b = c.getContext('2d')!;
      for (let i = 0; i < W * H; i++) {
        const t = terrain[i];
        b.fillStyle =
          t === TERRAIN.water ? '#2c5878' : t === TERRAIN.rock ? '#5e574e' : t === TERRAIN.dirt ? '#7d6644' : '#4b6e36';
        b.fillRect(i % W, Math.floor(i / W), 1, 1);
      }
      this.miniBase = c;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.miniBase, 0, 0, mini.width, mini.height);
    for (const e of Object.values(this.game.state.entities)) {
      if (e.kind === 'resource') {
        if (e.type === 'tree') {
          ctx.fillStyle = '#1f4526';
          ctx.fillRect(e.tx * sx, e.ty * sy, Math.ceil(sx), Math.ceil(sy));
        } else {
          ctx.fillStyle = GOLD_COLOR;
          ctx.fillRect(e.tx * sx, e.ty * sy, e.w * sx, e.h * sy);
        }
      } else if (e.kind === 'building') {
        ctx.fillStyle = this.game.player(e.owner).color;
        ctx.fillRect(e.tx * sx - 1, e.ty * sy - 1, e.w * sx + 2, e.h * sy + 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(e.tx * sx - 1, e.ty * sy - 1, e.w * sx + 2, e.h * sy + 2);
      } else if (!e.hidden) {
        ctx.fillStyle = client.selected.includes(e.id) ? '#ffffff' : this.game.player(e.owner).color;
        ctx.fillRect(e.x * sx - 1.5, e.y * sy - 1.5, 3, 3);
      }
    }
    // Camera frustum
    const a = cam.toWorld(0, 0);
    const b = cam.toWorld(cam.viewW, cam.viewH);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(a.x * sx, a.y * sy, (b.x - a.x) * sx, (b.y - a.y) * sy);
    // Alert pings
    this.pings = this.pings.filter((p) => now - p.t0 < 3);
    for (const p of this.pings) {
      const t = ((now - p.t0) % 1) / 1;
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

function lerpPos(u: Unit, alpha: number): { x: number; y: number } {
  return { x: u.px + (u.x - u.px) * alpha, y: u.py + (u.y - u.py) * alpha };
}
